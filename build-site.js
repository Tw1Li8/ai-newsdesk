// 정적 사이트 빌드: 수집 → 번역 → 순위 → 이미지 → 상위 기사 요약 미리 생성 → site/ 폴더에 HTML+JSON 출력
// GitHub Actions(.github/workflows/site.yml)가 주기적으로 실행해 GitHub Pages 로 배포합니다.
// 사용법: node build-site.js            (수집 포함 전체 빌드)
//         node build-site.js --no-collect  (기존 data/items.json 으로 화면만 다시 생성 — 로컬 점검용)
const fs = require('fs');
const path = require('path');
const { collectAll } = require('./collector');
const SOURCES = require('./sources');
const { translateItems } = require('./translate');
const { computeRanks, scoreOf } = require('./rank');
const { enrichImages } = require('./enrich');
const { buildDigest } = require('./digest');
const { isEngineering } = require('./topics');

const ROOT = __dirname;
const DATA = path.join(ROOT, 'data');
const OUT = path.join(ROOT, 'site');
const NO_COLLECT = process.argv.includes('--no-collect');
const DAYS = 14;          // 사이트에 싣는 기간
const DIGEST_MAX = 120;   // 미리 요약을 만들어 둘 상위 기사 수

fs.mkdirSync(DATA, { recursive: true });
let store; try { store = JSON.parse(fs.readFileSync(path.join(DATA, 'items.json'), 'utf8')); } catch { store = { items: {}, updatedAt: 0 }; }
const log = (...a) => console.log('[site]', ...a);

async function pool(list, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < list.length) { const x = list[i++]; try { await fn(x); } catch (e) { log('실패:', String(e.message).slice(0, 80)); } } }));
}

(async () => {
  if (!NO_COLLECT) {
    log('수집 시작, 소스', SOURCES.length);
    const r = await collectAll(SOURCES, store, () => {});
    log(`수집 완료 +${r.added}건, 소스 성공 ${r.results.filter((x) => x.ok).length}/${r.results.length}`);
    const t = await translateItems(store, {});
    log(`번역 ${t.ok}건 (실패 ${t.fail})`);
    computeRanks(store);
    const im = await enrichImages(store, {});
    log('이미지', im.got, '장');
    store.updatedAt = Date.now();
    fs.writeFileSync(path.join(DATA, 'items.json'), JSON.stringify(store)); // CI 캐시용
  } else computeRanks(store);

  const now = Date.now(), cutoff = now - DAYS * 864e5;
  const all = Object.values(store.items).filter((i) => i.published >= cutoff && !/news\.google\.com/.test(i.url));
  all.forEach((i) => { i.rank = Math.round(scoreOf(i, now) * 100) / 100; });
  const keep = new Set(all.map((i) => i.id));

  // 미리 요약할 기사: 전체 상위 + 카테고리별 상위 + 엔지니어링 상위 (대표 기사만)
  const reps = all.filter((i) => !i.dupOf).sort((a, b) => b.rank - a.rank);
  const pick = new Map();
  const add = (list, n) => list.slice(0, n).forEach((i) => pick.set(i.id, i));
  add(reps, 50);
  for (const c of ['industry', 'creations', 'community', 'video', 'research']) add(reps.filter((i) => i.cat === c), 12);
  add(reps.filter(isEngineering), 25);
  const targets = [...pick.values()].slice(0, DIGEST_MAX);

  let digests = {};
  const dpath = path.join(DATA, 'digests.json');
  try { digests = JSON.parse(fs.readFileSync(dpath, 'utf8')); } catch {}
  const todo = targets.filter((i) => !digests[i.id] || digests[i.id].v !== 4 || /�/.test(JSON.stringify(digests[i.id])));
  log(`요약 생성 ${todo.length}건 (캐시 재사용 ${targets.length - todo.length}건)`);
  await pool(todo, 6, async (it) => {
    const d = await buildDigest(it);
    const key = it.dupOf || it.id;
    d.related = all.filter((x) => x.id !== it.id && (x.dupOf === key || x.id === key)).sort((a, b) => b.rank - a.rank).slice(0, 6)
      .map((x) => ({ source: x.source, title: x.titleKo || x.title, url: x.url }));
    d.v = 4;
    if (!it.image && d.image) it.image = d.image;
    digests[it.id] = d;
  });
  for (const id of Object.keys(digests)) if (!keep.has(id)) delete digests[id];
  fs.writeFileSync(dpath, JSON.stringify(digests));

  const items = all.map((i) => ({
    id: i.id, title: i.title, titleKo: i.titleKo || '', summary: (i.summary || '').slice(0, 300), summaryKo: (i.summaryKo || '').slice(0, 300),
    url: i.url, source: i.source, sourceId: i.sourceId, cat: i.cat, lang: i.lang, published: i.published, image: i.image || '',
    rank: i.rank, cov: i.cov || 1, dupOf: i.dupOf || '', eng: isEngineering(i),
  }));

  // 출력
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  for (const f of fs.readdirSync(path.join(ROOT, 'public'))) fs.copyFileSync(path.join(ROOT, 'public', f), path.join(OUT, f));
  fs.copyFileSync(path.join(ROOT, 'site-src', 'static-api.js'), path.join(OUT, 'static-api.js'));
  let html = fs.readFileSync(path.join(OUT, 'index.html'), 'utf8');
  html = html.replace(/<script[^>]*src="app\.js"[^>]*><\/script>/, '<script src="static-api.js"></script>\n  $&')
    .replace('<head>', '<head>\n<link rel="icon" href="data:,">')
    .replace('<button id="refresh"', '<button id="refresh" hidden style="display:none"');
  if (!html.includes('static-api.js')) throw new Error('index.html 에서 app.js 스크립트 태그를 찾지 못했습니다');
  fs.writeFileSync(path.join(OUT, 'index.html'), html);
  const used = new Set(items.map((x) => x.id));
  const outDigests = Object.fromEntries(Object.entries(digests).filter(([id]) => used.has(id)));
  fs.writeFileSync(path.join(OUT, 'data.json'), JSON.stringify({ updatedAt: store.updatedAt || now, items }));
  fs.writeFileSync(path.join(OUT, 'digests.json'), JSON.stringify(outDigests));
  fs.writeFileSync(path.join(OUT, '.nojekyll'), '');
  const kb = (f) => Math.round(fs.statSync(path.join(OUT, f)).size / 1024);
  log(`완료: 항목 ${items.length}건, 요약 ${Object.keys(outDigests).length}건 · data.json ${kb('data.json')}KB, digests.json ${kb('digests.json')}KB`);
})().catch((e) => { console.error(e); process.exit(1); });
