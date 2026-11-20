// AI Newsdesk — 로컬 서버. 실행: node ai-newsdesk/server.js  → http://localhost:4577
const http = require('http');
const fs = require('fs');
const path = require('path');
const { collectAll, collectOne } = require('./collector');
const DEFAULT_SOURCES = require('./sources');
const { translateItems } = require('./translate');
const { computeRanks, scoreOf, tokens } = require('./rank');
const { enrichImages } = require('./enrich');
const { buildDigest } = require('./digest');
const { isEngineering } = require('./topics');

const PORT = +process.env.PORT || 4577;
// 기본은 이 PC에서만(127.0.0.1). HOST=0.0.0.0 으로 켜면 같은 네트워크의 폰·다른 PC에서도 접속 가능 (npm run lan)
const HOST = process.env.HOST || '127.0.0.1';
const DATA = path.join(__dirname, 'data');
const PUB = path.join(__dirname, 'public');
fs.mkdirSync(DATA, { recursive: true });

const file = (n) => path.join(DATA, n);
function load(n, d) { try { return JSON.parse(fs.readFileSync(file(n), 'utf8')); } catch { return d; } }
function save(n, v) { const tmp = file(n) + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(v)); fs.renameSync(tmp, file(n)); }

let store = load('items.json', { items: {}, updatedAt: 0 });
let study = load('study.json', {});
let fav = load('fav.json', {}); // 찜한 글: 기사 스냅샷(+요약)을 따로 보관해 업데이트로 목록에서 밀려나도 다시 볼 수 있음
let config = Object.assign({ intervalMin: 30, disabled: [], custom: [] }, load('config.json', {}));
let status = { running: false, done: 0, total: 0, startedAt: 0, finishedAt: store.updatedAt || 0, results: [], added: 0 };

const allSources = () => [...DEFAULT_SOURCES.map((s) => ({ ...s, builtin: true })), ...config.custom.map((s) => ({ ...s, custom: true }))];
const activeSources = () => allSources().filter((s) => !config.disabled.includes(s.id));

async function refresh() {
  if (status.running) return false;
  const list = activeSources();
  status = { running: true, phase: 'collect', tdone: 0, ttotal: 0, translated: 0, done: 0, total: list.length, startedAt: Date.now(), finishedAt: 0, results: [], added: 0 };
  (async () => {
    try {
      const r = await collectAll(list, store, (done, total, results) => { status.done = done; status.results = results; });
      status.added = r.added; status.results = r.results;
      status.phase = 'translate';
      const t = await translateItems(store, { onProgress: (d, n) => { status.tdone = d; status.ttotal = n; } });
      status.translated = t.ok; status.translateFail = t.fail;
      computeRanks(store);
      status.phase = 'images';
      const im = await enrichImages(store, { onProgress: (d, n) => { status.tdone = d; status.ttotal = n; } });
      status.images = im.got;
      store.updatedAt = Date.now();
      save('items.json', store);
    } catch (e) { status.error = String(e.message); }
    status.running = false; status.finishedAt = Date.now();
    console.log(`[refresh] 번역 ${status.translated}건 (실패 ${status.translateFail || 0}), +${status.added} 건, 소스 ${status.results.filter((x) => x.ok).length}/${status.total} 성공`);
  })();
  return true;
}

const inflight = new Map();
let saveT = null;
let timer = null;
function schedule() {
  clearInterval(timer);
  if (config.intervalMin > 0) timer = setInterval(refresh, config.intervalMin * 60000);
}

const json = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); };
function body(req) {
  return new Promise((ok, no) => {
    let b = ''; req.on('data', (c) => { b += c; if (b.length > 1e6) { req.destroy(); no(new Error('too big')); } });
    req.on('end', () => { try { ok(b ? JSON.parse(b) : {}); } catch (e) { no(e); } });
  });
}
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json' };

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  const p = u.pathname;
  try {
    // 로컬 전용: 다른 사이트가 이 API 를 호출하지 못하게 Origin 검사
    // (같은 주소에서 연 화면의 요청, 즉 Origin 호스트가 Host 헤더와 같은 경우만 허용 — 같은 네트워크의 다른 기기에서 연 화면도 포함)
    if (req.method !== 'GET' && req.headers.origin && req.headers.origin.replace(/^https?:\/\//, '') !== req.headers.host) return json(res, 403, { error: 'forbidden' });

    if (p === '/api/items') {
      const cat = u.searchParams.get('cat') || 'all', lang = u.searchParams.get('lang') || 'all', q = (u.searchParams.get('q') || '').toLowerCase().trim();
      const sort = u.searchParams.get('sort') || 'rank', dedupe = u.searchParams.get('dedupe') !== '0';
      const src = u.searchParams.get('source'), days = +u.searchParams.get('days') || 0, limit = Math.min(+u.searchParams.get('limit') || 300, 1000);
      const cutoff = days ? Date.now() - days * 864e5 : 0;
      // 탭 숫자와 목록 건수가 일치하도록, 카테고리를 뺀 나머지 필터(언어·기간·검색·중복제거)를 동일하게 적용해 센다
      const base = Object.values(store.items).filter((i) => (lang === 'all' || i.lang === lang) && (!src || i.sourceId === src) && i.published >= cutoff && (!dedupe || !i.dupOf)
        && (!q || (i.title + ' ' + i.summary + ' ' + (i.titleKo || '') + ' ' + (i.summaryKo || '') + ' ' + i.source).toLowerCase().includes(q)));
      const topic = u.searchParams.get('topic') || '';
      let list = base.filter((i) => (cat === 'all' || i.cat === cat) && (topic !== 'eng' || isEngineering(i)));
      const now = Date.now();
      list.forEach((i) => { i.rank = Math.round(scoreOf(i, now) * 100) / 100; });
      list.sort(sort === 'new' ? (a, b) => b.published - a.published : (a, b) => b.rank - a.rank);
      const counts = {}; for (const i of base) counts[i.cat] = (counts[i.cat] || 0) + 1;
      counts.eng = base.filter(isEngineering).length;
      return json(res, 200, { total: list.length, counts, all: base.length, updatedAt: store.updatedAt,
        items: list.slice(0, limit).map(({ nurl, ntitle, digest, ...rest }) => rest) });
    }
    if (p === '/api/digest') {
      const id = u.searchParams.get('id') || ''; const it = store.items[id] || (study[id] && study[id].item) || (fav[id] && fav[id].item);
      if (!it) return json(res, 404, { error: '항목 없음' });
      if (it.digest && it.digest.v === 4 && Date.now() - it.digest.at < 7 * 864e5) return json(res, 200, it.digest);
      const job = async () => {
        const key = it.dupOf || it.id;
        const sibs = Object.values(store.items).filter((i) => i.id !== it.id && (i.dupOf === key || i.id === key)).sort((a, b) => scoreOf(b) - scoreOf(a));
        let d = null, via = null;
        if (/news\.google\.com/.test(it.url)) { // 구글뉴스 경유: 같은 이야기를 직접 링크로 보도한 다른 매체 기사로 요약
          for (const sb of sibs.filter((x) => !/news\.google\.com|mastodon/.test(x.url)).slice(0, 3)) {
            const t = await buildDigest(sb);
            if (t.from === 'article' && t.points.length) { d = t; via = sb.source; break; }
          }
        }
        if (!d && /news\.google\.com/.test(it.url)) { // 묶이지 않았어도 제목이 매우 비슷한 직접 링크 기사 탐색
          const A = tokens(it);
          const cands = Object.values(store.items).filter((x) => x.id !== it.id && !/news\.google\.com|mastodon/.test(x.url) && Math.abs(x.published - it.published) < 3 * 864e5)
            .map((x) => { const B = tokens(x); let n = 0; for (const w of A) if (B.has(w)) n++; return { x, n, j: n / Math.max(1, A.size + B.size - n) }; })
            .filter((c) => c.n >= 3 && c.j >= 0.25).sort((a, b) => b.j - a.j).slice(0, 2);
          for (const c of cands) { const t = await buildDigest(c.x); if (t.from === 'article' && t.points.length) { d = t; via = c.x.source; break; } }
        }
        if (!d) d = await buildDigest(it);
        if (via) { d.via = via; d.note = ''; }
        d.related = sibs.slice(0, 6).map((x) => ({ source: x.source, title: x.titleKo || x.title, url: x.url }));
        d.v = 4;
        return d;
      };
      const d = await (inflight.get(id) || inflight.set(id, job().finally(() => inflight.delete(id))).get(id));
      if (store.items[id]) { store.items[id].digest = d; if (!store.items[id].image && d.image) store.items[id].image = d.image; clearTimeout(saveT); saveT = setTimeout(() => save('items.json', store), 3000); }
      return json(res, 200, d);
    }
    if (p === '/api/status') return json(res, 200, { ...status, updatedAt: store.updatedAt, intervalMin: config.intervalMin });
    if (p === '/api/refresh' && req.method === 'POST') return json(res, 200, { started: await refresh() });
    if (p === '/api/sources' && req.method === 'GET') {
      const last = Object.fromEntries(status.results.map((r) => [r.id, r]));
      return json(res, 200, { sources: allSources().map((s) => ({ id: s.id, name: s.name, url: s.url, cat: s.cat, lang: s.lang, type: s.type, builtin: !!s.builtin, enabled: !config.disabled.includes(s.id), last: last[s.id] || null })), intervalMin: config.intervalMin });
    }
    if (p === '/api/sources' && req.method === 'POST') {
      const b = await body(req);
      if (b.action === 'toggle') { config.disabled = b.enabled ? config.disabled.filter((x) => x !== b.id) : [...new Set([...config.disabled, b.id])]; }
      else if (b.action === 'add') {
        let url; try { url = new URL(b.url); if (!/^https?:$/.test(url.protocol)) throw 0; } catch { return json(res, 400, { error: '올바른 http(s) 주소가 아닙니다' }); }
        const id = 'c-' + Math.random().toString(36).slice(2, 8);
        const s = { id, name: String(b.name || url.host).slice(0, 60), url: url.href, cat: ['industry', 'creations', 'community', 'video', 'research'].includes(b.cat) ? b.cat : 'industry', lang: b.lang === 'en' ? 'en' : 'ko', type: 'rss' };
        const probe = await collectOne(s);
        if (!probe.ok) return json(res, 400, { error: '이 주소에서 피드를 읽지 못했습니다: ' + probe.error });
        config.custom.push(s);
      } else if (b.action === 'remove') { config.custom = config.custom.filter((s) => s.id !== b.id); }
      else if (b.action === 'interval') { config.intervalMin = Math.max(0, Math.min(1440, +b.intervalMin || 0)); schedule(); }
      save('config.json', config);
      return json(res, 200, { ok: true });
    }
    if (p === '/api/fav' && req.method === 'GET') return json(res, 200, { fav: Object.values(fav).sort((a, b) => b.savedAt - a.savedAt).map((e) => ({ id: e.id, savedAt: e.savedAt, item: (({ nurl, ntitle, digest, ...r }) => r)(e.item) })) });
    if (p === '/api/fav' && req.method === 'POST') {
      const b = await body(req); const id = String(b.id || ''); if (!id) return json(res, 400, { error: 'id 필요' });
      if (!fav[id]) {
        const it = store.items[id] || (study[id] && study[id].item); if (!it) return json(res, 404, { error: '항목 없음' });
        fav[id] = { id, savedAt: Date.now(), item: { ...it } };
      }
      save('fav.json', fav); return json(res, 200, { ok: true, entry: { id, savedAt: fav[id].savedAt, item: (({ nurl, ntitle, digest, ...r }) => r)(fav[id].item) } });
    }
    if (p === '/api/fav/import' && req.method === 'POST') { // 백업 파일 가져오기(병합)
      const b = await body(req); let n = 0;
      for (const e of (Array.isArray(b.fav) ? b.fav : []).slice(0, 5000)) {
        if (!e || typeof e.id !== 'string' || !e.item || typeof e.item.url !== 'string' || fav[e.id]) continue;
        fav[e.id] = { id: e.id, savedAt: +e.savedAt || Date.now(), item: e.item }; n++;
      }
      save('fav.json', fav); return json(res, 200, { ok: true, added: n });
    }
    if (p.startsWith('/api/fav/') && req.method === 'DELETE') { delete fav[decodeURIComponent(p.slice(9))]; save('fav.json', fav); return json(res, 200, { ok: true }); }
    if (p === '/api/study' && req.method === 'GET') return json(res, 200, { study: Object.values(study).sort((a, b) => b.addedAt - a.addedAt) });
    if (p === '/api/study' && req.method === 'POST') {
      const b = await body(req); const id = String(b.id || '');
      if (!id) return json(res, 400, { error: 'id 필요' });
      const cur = study[id] || {};
      if (!cur.id) {
        const it = store.items[id] || b.item; if (!it) return json(res, 404, { error: '항목 없음' });
        const { nurl, ntitle, ...clean } = it;
        Object.assign(cur, { id, item: clean, addedAt: Date.now(), status: 'todo', note: '', tags: [] });
      }
      if (['todo', 'doing', 'done'].includes(b.status)) cur.status = b.status;
      if (typeof b.note === 'string') cur.note = b.note.slice(0, 5000);
      if (Array.isArray(b.tags)) cur.tags = b.tags.map((t) => String(t).slice(0, 24)).slice(0, 10);
      study[id] = cur; save('study.json', study);
      return json(res, 200, { ok: true, entry: cur });
    }
    if (p.startsWith('/api/study/') && req.method === 'DELETE') { delete study[decodeURIComponent(p.slice(11))]; save('study.json', study); return json(res, 200, { ok: true }); }

    if (p === '/favicon.ico') { res.writeHead(204); return res.end(); }
    // 정적 파일
    const rel = p === '/' ? 'index.html' : p.slice(1);
    const fp = path.normalize(path.join(PUB, rel));
    if (!fp.startsWith(PUB + path.sep) || !fs.existsSync(fp) || !fs.statSync(fp).isFile()) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    fs.createReadStream(fp).pipe(res);
  } catch (e) { json(res, 500, { error: String(e.message) }); }
});

server.listen(PORT, HOST, () => {
  console.log(`AI Newsdesk → http://localhost:${PORT}`);
  if (HOST !== '127.0.0.1' && HOST !== 'localhost') {
    const ips = Object.values(require('os').networkInterfaces()).flat().filter((n) => n && n.family === 'IPv4' && !n.internal).map((n) => n.address);
    ips.forEach((ip) => console.log(`  다른 기기(폰·태블릿·PC)에서 → http://${ip}:${PORT}`));
    console.log('  ※ 같은 Wi-Fi/네트워크의 누구나 열 수 있습니다(인증 없음). 공용망에서는 사용하지 마세요.');
  }
  schedule();
  { const n0 = Object.keys(store.items).length; store.items = Object.fromEntries(Object.entries(store.items).filter(([, i]) => !/^masto/.test(i.sourceId) && !/^(https?:|www\.)/i.test(i.title))); const n1 = Object.keys(store.items).length; if (n1 !== n0) console.log('[migrate] 저품질 항목 ' + (n0 - n1) + '건 정리'); }
  { const n0 = Object.keys(store.items).length; store.items = Object.fromEntries(Object.entries(store.items).filter(([, i]) => !/news\.google\.com/.test(i.url))); const n1 = Object.keys(store.items).length; if (n1 !== n0) console.log('[migrate] 구글뉴스 경유 항목 ' + (n0 - n1) + '건 정리'); }
  { computeRanks(store); save('items.json', store); }
  if (Date.now() - (store.updatedAt || 0) > 10 * 60000) refresh();
});
