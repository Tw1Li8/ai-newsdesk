'use strict';
// AI 뉴스데스크 프런트엔드. 외부 콘텐츠는 전부 textContent 로만 렌더링합니다(XSS 방지).
const $ = (s) => document.querySelector(s);
const h = (tag, props = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'text') e.textContent = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(c));
  return e;
};
const safeUrl = (u) => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : '#'; } catch { return '#'; } };
const api = (p, opt) => (window.__staticApi ? window.__staticApi(p, opt) : fetch(p, opt).then((r) => r.json()));
const post = (p, b) => api(p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
const store = { get: (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };

const CATS = [['industry', '업계 판도'], ['corp', '기업 성과'], ['creations', 'AI 결과물·사례'], ['community', '커뮤니티·SNS'], ['video', '영상'], ['research', '연구·논문']];
const CAT_NAME = { ...Object.fromEntries(CATS), eng: 'AI 엔지니어링·에이전트 활용' };
const state = { view: 'board', cat: null, topic: '', fav: {}, learnOnly: false, lang: 'all', days: 7, q: '', showOrig: store.get('orig', '1') === '1', board: {}, list: { items: [], total: 0 }, shown: 60, nav: [], sort: 'rank', top: [], counts: {}, all: 0, h24: 0, study: {} };

// ───── 번역 표시 헬퍼
const isTr = (it) => it.lang === 'en' && it.titleKo && it.titleKo !== it.title;
const titleOf = (it) => (isTr(it) ? it.titleKo : it.title);
const summaryOf = (it) => (it.lang === 'en' && it.summaryKo ? it.summaryKo : it.summary);
function displayUrl(u) {
  try { const x = new URL(u);
    if (x.host === 'news.google.com') return '구글뉴스 링크 (클릭 시 기사 원문으로 이동)'; const path = (x.pathname + x.search).replace(/\/$/, ''); const s = x.host.replace(/^www\./, '') + path; return s.length > 48 ? s.slice(0, 46) + '…' : s; } catch { return u; }
}

// ───── "배울 점" 규칙 (AI 호출 없이 제목·요약 패턴으로 추정)
const LEARN = [
  [/tutorial|guide|how to|how-to|step-by-step|walkthrough|튜토리얼|가이드|방법|활용법|따라|꿀팁|입문/i, '실습형: 글을 따라 직접 결과물을 한 번 만들어 보기'],
  [/open[- ]?source|open[- ]?weights|github|hugging ?face|오픈소스|오픈 ?웨이트|공개했/i, '직접 설치·실행해 보고 README와 라이선스 확인하기'],
  [/paper|arxiv|study|benchmark|논문|벤치마크|연구진/i, '핵심 아이디어·실험 설정·한계를 3줄로 요약해 보기'],
  [/case study|lessons|postmortem|how .{1,40} built|사례|도입|적용|후기|회고/i, '우리 상황에 적용할 포인트 1가지 뽑기'],
  [/introduc|launch|release|announce|unveil|출시|공개|발표|신모델|업데이트|new model/i, '이전 모델·경쟁사와 성능·가격·한계를 비교표로 정리하기'],
  [/prompt|workflow|agent|mcp|프롬프트|워크플로|에이전트|자동화/i, '프롬프트·워크플로 패턴을 내 작업에 한 번 시험해 보기'],
  [/video|image|music|art|영상|이미지|음악|웹툰|디자인|작품/i, '사용된 도구와 제작 과정을 파악해 비슷하게 만들어 보기'],
];
function learnTips(it) {
  const t = it.title + ' ' + (it.summary || '');
  const tips = LEARN.filter(([re]) => re.test(t)).map((x) => x[1]);
  if (it.cat === 'research' && !tips.length) tips.push(LEARN[2][1]);
  if (it.cat === 'video') tips.push('영상 보며 핵심 노트 3줄 남기기');
  return [...new Set(tips)].slice(0, 3);
}

const TRENDS = ['OpenAI', 'ChatGPT', 'GPT-5', 'Claude', 'Anthropic', 'Gemini', 'Google', 'Meta', 'Llama', 'xAI', 'Grok', 'Mistral', 'DeepSeek', 'Qwen', 'Nvidia', 'Sora', 'Veo', 'Midjourney', 'Stable Diffusion', 'Runway', 'Kling', 'Suno', 'Perplexity', 'Copilot', 'Cursor', 'Agent', 'MCP', 'Robot', 'Apple', 'Microsoft', 'Amazon', 'Samsung', '삼성', '네이버', '카카오', 'LG', '에이전트', '로봇', '반도체', '규제', '저작권', '오픈소스', '웹툰', '딥페이크', '피지컬 AI', '소버린'];
function trendKeywords(items) {
  const cut = Date.now() - 3 * 864e5; const c = {};
  for (const it of items) {
    if (it.published < cut) continue;
    const t = (it.title + ' ' + it.summary).toLowerCase();
    for (const k of TRENDS) if (t.includes(k.toLowerCase())) c[k] = (c[k] || 0) + 1;
  }
  return Object.entries(c).filter((x) => x[1] >= 2).sort((a, b) => b[1] - a[1]).slice(0, 16);
}

const ago = (t) => {
  const m = Math.max(0, (Date.now() - t) / 60000);
  if (m < 1) return '방금'; if (m < 60) return Math.floor(m) + '분 전'; if (m < 1440) return Math.floor(m / 60) + '시간 전';
  if (m < 43200) return Math.floor(m / 1440) + '일 전'; return new Date(t).toLocaleDateString('ko-KR');
};
const dayLabel = (t) => {
  const d = new Date(t), n = new Date();
  const diff = Math.round((new Date(n.getFullYear(), n.getMonth(), n.getDate()) - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 864e5);
  return diff === 0 ? '오늘' : diff === 1 ? '어제' : d.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });
};
function toast(msg) { const t = h('div', { class: 'toast', text: msg }); document.body.append(t); setTimeout(() => t.remove(), 2400); }

// ───── 데이터 로딩
const qs = (o) => new URLSearchParams(o).toString();
async function loadFav() { const s = await api('/api/fav'); state.fav = Object.fromEntries(s.fav.map((e) => [e.id, e])); }
async function loadStudy() { const s = await api('/api/study'); state.study = Object.fromEntries(s.study.map((e) => [e.id, e])); }
async function load() {
  const base = { lang: state.lang, days: state.days, q: state.q };
  await Promise.all([loadStudy(), loadFav()]);
  if (state.view === 'board') {
    const [topRes, ...res] = await Promise.all([api('/api/items?' + qs({ ...base, cat: 'all', limit: 30, sort: 'rank' })), ...CATS.map(([k]) => api('/api/items?' + qs({ ...base, cat: k, limit: 40, sort: 'rank' })))]);
    state.top = topRes.items;
    CATS.forEach(([k], i) => { state.board[k] = res[i].items; });
    state.counts = res[0].counts; state.all = res[0].all;
    state.board.eng = (await api('/api/items?' + qs({ ...base, cat: 'all', limit: 40, sort: 'rank', topic: 'eng' }))).items;
    state.h24 = (await api('/api/items?' + qs({ lang: state.lang, days: 1, limit: 1 }))).total;
  } else if (state.view === 'list') {
    const d = await api('/api/items?' + qs({ ...base, cat: state.cat || 'all', limit: 600, sort: state.sort, topic: state.topic }));
    state.list = d; state.counts = d.counts; state.all = d.all;
  }
  render();
}
async function loadTicker() {
  const d = await api('/api/items?days=1&limit=16');
  const box = $('#ticker'); box.replaceChildren();
  if (!d.items.length) { box.append(h('span', { text: '  수집된 속보가 없습니다. “지금 업데이트”를 눌러 주세요.' })); return; }
  const run = h('div', { class: 'run' });
  for (const it of d.items) run.append(h('a', { href: safeUrl(it.url), onclick: openIt(it) }, h('b', { text: it.source }), titleOf(it)));
  box.append(run);
}

// ───── 카드 (보드/리스트 공용)
async function toggleFav(it, btn) {
  if (state.fav[it.id]) { await api('/api/fav/' + encodeURIComponent(it.id), { method: 'DELETE' }); delete state.fav[it.id]; toast('찜 목록에서 뺐습니다'); }
  else { const r = await post('/api/fav', { id: it.id }); if (r.entry) { state.fav[it.id] = r.entry; toast('♥ 찜했습니다 — 업데이트돼도 “찜한 글”에서 다시 볼 수 있어요'); } else { toast(r.error || '찜하지 못했습니다'); return; } }
  if (btn) { btn.classList.toggle('on', !!state.fav[it.id]); btn.textContent = state.fav[it.id] ? '♥' : '♡'; }
  renderTabs();
}
async function toggleStudy(it, btn) {
  if (state.study[it.id]) { await api('/api/study/' + encodeURIComponent(it.id), { method: 'DELETE' }); delete state.study[it.id]; toast('스터디 보드에서 뺐습니다'); }
  else { const r = await post('/api/study', { id: it.id }); if (r.entry) { state.study[it.id] = r.entry; toast('스터디 보드에 담았습니다'); } }
  btn.classList.toggle('on', !!state.study[it.id]); btn.textContent = state.study[it.id] ? '★' : '☆';
  renderTabs();
}
const openIt = (it) => (e) => { if (e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1) return; e.preventDefault(); openDetail(it); };
const hue = (s) => { let x = 0; for (const c of s) x = (x * 31 + c.charCodeAt(0)) % 360; return x; };
const CAT_ICON = { eng: '🛠', industry: '🏢', corp: '🚀', creations: '🎨', community: '💬', video: '▶', research: '🔬' };
function media(it, rank) {
  const hv = hue(it.source);
  const tile = h('div', { class: 'tile', style: `--h:${hv}` }, h('span', { class: 'ic', text: CAT_ICON[it.cat] || '•' }), h('b', { text: it.source }));
  const box = h('a', { class: 'im', href: safeUrl(it.url), onclick: openIt(it), tabindex: '-1', 'aria-hidden': 'true' }, tile);
  if (it.image) {
    const img = h('img', { src: safeUrl(it.image), alt: '', loading: 'lazy', referrerpolicy: 'no-referrer', onerror: (e) => e.target.remove() });
    box.append(img);
  }
  if (rank) box.append(h('span', { class: 'rk', text: rank }));
  if ((it.cov || 1) > 1) box.append(h('span', { class: 'cv', text: `🔥 ${it.cov}개 매체 보도` }));
  return box;
}
function meta(it) {
  const fresh = Date.now() - it.published < 3 * 3600e3;
  return h('div', { class: 'mt' },
    fresh ? h('span', { class: 'tag new', text: 'NEW' }) : null,
    h('b', { text: it.source }), h('span', { text: ago(it.published) }),
    h('span', { class: 'tag', text: it.lang === 'ko' ? '국내' : isTr(it) ? '해외·번역' : '해외' }));
}
function actions(it) {
  const copy = async () => { try { await navigator.clipboard.writeText(it.url); toast('원문 주소를 복사했습니다'); } catch { toast('복사 실패'); } };
  return h('div', { class: 'ac' },
    h('a', { class: 'src', href: safeUrl(it.url), target: '_blank', rel: 'noopener noreferrer', title: it.url, text: '원문 ↗ ' + displayUrl(it.url) }),
    h('button', { class: 'mini', title: '원문 주소 복사', onclick: copy }, '⧉'),
    h('button', { class: 'mini heart' + (state.fav[it.id] ? ' on' : ''), title: '찜하기', onclick: (e) => toggleFav(it, e.currentTarget) }, state.fav[it.id] ? '♥' : '♡'),
    h('button', { class: 'mini' + (state.study[it.id] ? ' on' : ''), title: '스터디 보드에 담기', onclick: (e) => toggleStudy(it, e.currentTarget) }, state.study[it.id] ? '★' : '☆'));
}
function card(it, { rank = 0, summary = false } = {}) {
  state.nav.push(it);
  let sm = summary ? summaryOf(it) : '';
  const norm = (s) => (s || '').replace(/[\s#\W]+/g, '').toLowerCase();
  if (sm && norm(sm).startsWith(norm(titleOf(it)).slice(0, 24))) sm = ''; // 제목과 같은 내용의 요약은 숨김
  const tips = summary ? learnTips(it) : [];
  return h('article', { class: 'cd' }, media(it, rank),
    h('div', { class: 'bd' },
      h('a', { class: 'ti', href: safeUrl(it.url), onclick: openIt(it), text: titleOf(it) }),
      state.showOrig && isTr(it) ? h('div', { class: 'og', text: it.title }) : null,
      sm ? h('div', { class: 'sm', text: sm }) : null,
      tips.length ? h('div', { class: 'learn', text: '📘 ' + tips[0] }) : null,
      meta(it), actions(it)));
}
function hero(items) {
  const [main, ...side] = items;
  state.nav.push(main);
  const big = h('article', { class: 'hero-main' }, media(main, 1),
    h('div', { class: 'bd' }, h('a', { class: 'ti', href: safeUrl(main.url), onclick: openIt(main), text: titleOf(main) }),
      state.showOrig && isTr(main) ? h('div', { class: 'og', text: main.title }) : null,
      main.summary ? h('div', { class: 'sm', text: summaryOf(main) }) : null, meta(main), actions(main)));
  return h('section', { class: 'hero' }, big, h('div', { class: 'hero-side' }, side.map((it, i) => card(it, { rank: i + 2 }))));
}

// ───── 화면: 한눈에 보기 — 이미지 + 제목 위주의 큰 카드를 중요도 순으로
function gcard(it, { big = false, rank = 0, lede = false } = {}) {
  state.nav.push(it);
  const saved = !!state.study[it.id];
  const fresh = Date.now() - it.published < 3 * 3600e3;
  const img = h('a', { class: 'gi', href: safeUrl(it.url), onclick: openIt(it), tabindex: '-1', 'aria-hidden': 'true' },
    h('div', { class: 'tile', style: `--h:${hue(it.source)}` }, h('span', { class: 'ic', text: CAT_ICON[it.cat] || '•' }), h('b', { text: it.source })));
  if (it.image) img.append(h('img', { src: safeUrl(it.image), alt: '', loading: 'lazy', referrerpolicy: 'no-referrer', onerror: (e) => e.target.remove() }));
  if (rank) img.append(h('span', { class: 'rk', text: rank }));
  const star = h('button', { class: 'gs' + (saved ? ' on' : ''), title: '스터디 보드에 담기', onclick: (e) => { e.stopPropagation(); toggleStudy(it, e.currentTarget); } }, saved ? '★' : '☆');
  const sm = lede ? summaryOf(it) : '';
  const heart = h('button', { class: 'gh' + (state.fav[it.id] ? ' on' : ''), title: '찜하기 (나중에 다시 보기)', onclick: (e) => { e.stopPropagation(); toggleFav(it, e.currentTarget); } }, state.fav[it.id] ? '♥' : '♡');
  return h('article', { class: 'gc' + (big ? ' big' : '') },
    h('div', { class: 'gm' }, img, star, heart),
    h('h3', { class: 'gt' }, h('a', { href: safeUrl(it.url), onclick: openIt(it), text: titleOf(it) })),
    state.showOrig && isTr(it) ? h('div', { class: 'go1', text: it.title }) : null,
    sm && sm.slice(0, 20) !== titleOf(it).slice(0, 20) ? h('p', { class: 'gl', text: sm }) : null,
    h('div', { class: 'gf' },
      fresh ? h('span', { class: 'tag new', text: 'NEW' }) : null,
      h('b', { text: it.source }), h('span', { text: ago(it.published) }),
      (it.cov || 1) > 1 ? h('span', { class: 'hot', text: `🔥 ${it.cov}개 매체` }) : null));
}
function gsection(key, items) {
  const sec = h('section', { class: 'gsec ' + key }, h('header', {}, h('h2', { text: `${CAT_ICON[key]} ${CAT_NAME[key]}` }), h('button', { onclick: () => key === 'eng' ? go('list', null, false, 'eng') : go('list', key) }, '더보기 →')));
  if (!items.length) sec.append(h('div', { class: 'empty', text: '해당 기간에 항목이 없습니다' }));
  else sec.append(h('div', { class: 'gg' }, items.map((it) => gcard(it))));
  return sec;
}
function renderBoard() {
  const main = $('#main'); main.replaceChildren(); state.nav = [];
  if (!state.all) { main.append(h('div', { class: 'empty', text: '아직 수집된 항목이 없습니다. 우측 상단 “지금 업데이트”를 눌러 주세요.' })); return; }
  const all = CATS.flatMap(([k]) => state.board[k] || []);
  const trends = trendKeywords(all).slice(0, 12);
  if (trends.length) main.append(h('div', { class: 'trend' }, h('span', { text: '🔥 지금 뜨는' }), trends.map(([k, n]) => h('button', { class: 'chip', onclick: () => { $('#q').value = k; state.q = k; go('list', null); } }, k, h('small', { text: n })))));

  // 주요 뉴스: 첫 카드는 크게(2x2), 나머지는 일반 카드
  const top = state.top || [];
  const lead = top.slice(0, 4).find((x) => x.image) || top[0];
  const used = new Set();
  if (lead) {
    used.add(lead.id);
    const rest = top.filter((x) => x !== lead).slice(0, 8); // 큰 카드(4칸) + 8장 = 3줄이 꽉 참
    rest.forEach((x) => used.add(x.id));
    const grid = h('div', { class: 'gg' }, gcard(lead, { big: true, rank: 1 }), rest.map((it, i) => gcard(it, { rank: i + 2 })));
    main.append(h('section', { class: 'gsec front' }, h('header', {}, h('h2', { text: '⭐ 주요 뉴스' }), h('small', { text: '중요도 순 · 업데이트 ' }), h('small', { id: 'upd', text: '—' })), grid));
    api('/api/status').then((s) => { const e = $('#upd'); if (e && s.updatedAt) e.textContent = ago(s.updatedAt); });
  }
  const engItems = (state.board.eng || []).filter((x) => !used.has(x.id)).slice(0, 8); engItems.forEach((x) => used.add(x.id));
  main.append(gsection('eng', engItems));
  for (const [k] of CATS) main.append(gsection(k, (state.board[k] || []).filter((x) => !used.has(x.id)).slice(0, k === 'video' || k === 'research' ? 4 : 8)));
}

// ───── 화면: 리스트 (카드 그리드)
function renderList() {
  const main = $('#main'); main.replaceChildren(); state.nav = [];
  let items = state.list.items;
  if (state.learnOnly) items = items.filter((it) => learnTips(it).length);
  const bar = h('div', { class: 'bar' }, h('span', { class: 'meta', text: `${items.length}건${state.q ? ` — “${state.q}” 검색` : ''}` }),
    h('div', { class: 'seg' }, [['rank', '중요도순'], ['new', '최신순']].map(([v, l]) => h('button', { class: state.sort === v ? 'on' : '', onclick: () => { state.sort = v; load(); } }, l))));
  main.append(bar);
  if (!items.length) { main.append(h('div', { class: 'empty', text: state.all ? '조건에 맞는 항목이 없습니다. 기간·언어·검색어를 바꿔 보세요.' : '아직 수집된 항목이 없습니다. “지금 업데이트”를 눌러 주세요.' })); return; }
  const grid = h('div', { class: 'gg' });
  items.slice(0, state.shown).forEach((it) => grid.append(gcard(it, { lede: true })));
  main.append(grid);
  if (items.length > state.shown) main.append(h('button', { class: 'more', onclick: () => { state.shown += 60; renderList(); } }, `더 보기 (${state.shown}/${items.length})`));
}


// ───── 기사 보기: 앱 안에서 기사처럼 읽고, 원문 링크는 맨 아래에 둡니다
let detailTok = 0;
function closeDetail() { const m = $('#modal'); if (m) m.remove(); document.body.style.overflow = ''; detailTok++; }
function openDetail(it) {
  closeDetail();
  const tok = ++detailTok;
  const idx = state.nav.indexOf(it);
  const nav = (d) => { const n = state.nav[idx + d]; if (n) openDetail(n); };
  const body = h('div', { class: 'abody' });
  const fig = h('figure', { class: 'afig' });
  const setImage = (src) => {
    if (!src || fig.firstChild) return;
    fig.append(h('img', { src: safeUrl(src), alt: '', referrerpolicy: 'no-referrer', onerror: () => fig.replaceChildren() }), h('figcaption', { text: '사진: ' + it.source + ' (원문 기사 대표 이미지)' }));
  };
  setImage(it.image);
  // 먼저 피드 요약을 바로 보여주고, 본문 핵심이 준비되면 교체
  const first = summaryOf(it);
  if (first) body.append(h('p', { class: 'alede', text: first }), h('div', { class: 'loading', text: '⏳ 원문에서 핵심 내용을 더 불러오는 중…' }));
  else body.append(h('div', { class: 'loading', text: '⏳ 원문에서 핵심 내용을 불러오는 중…' }));
  const copy = async () => { try { await navigator.clipboard.writeText(it.url); toast('원문 주소를 복사했습니다'); } catch { toast('복사 실패'); } };
  const starLabel = () => (state.study[it.id] ? '★ 스터디에 담김' : '☆ 스터디에 담기');
  const starBtn = h('button', { class: state.study[it.id] ? 'on' : '', onclick: async (e) => { const b = e.currentTarget; await toggleStudy(it, b); b.textContent = starLabel(); b.classList.toggle('on', !!state.study[it.id]); } }, starLabel());
  const favLabel = () => (state.fav[it.id] ? '♥ 찜함' : '♡ 찜하기');
  const favBtn = h('button', { class: 'heart' + (state.fav[it.id] ? ' on' : ''), onclick: async (e) => { const b = e.currentTarget; await toggleFav(it, null); b.textContent = favLabel(); b.classList.toggle('on', !!state.fav[it.id]); } }, favLabel());
  const modal = h('div', { id: 'modal', class: 'modal', onclick: (e) => { if (e.target.id === 'modal') closeDetail(); } },
    h('div', { class: 'dp', role: 'dialog', 'aria-modal': 'true', 'aria-label': titleOf(it) },
      h('div', { class: 'dbar' },
        h('span', { class: 'meta', text: (idx >= 0 ? (idx + 1) + ' / ' + state.nav.length + ' · ' : '') + 'AI 뉴스데스크' }),
        h('span', { class: 'grow' }),
        h('button', { disabled: idx <= 0, onclick: () => nav(-1), title: '이전 (←)' }, '◀'),
        h('button', { disabled: idx < 0 || idx >= state.nav.length - 1, onclick: () => nav(1), title: '다음 (→)' }, '▶'),
        h('button', { onclick: closeDetail, title: '닫기 (Esc)' }, '✕')),
      h('article', { class: 'dbody article' },
        h('div', { class: 'kk big' }, h('span', { class: 'cat ' + it.cat, text: CAT_NAME[it.cat] || '' }), h('b', { text: it.source }),
          (it.cov || 1) > 1 ? h('span', { class: 'tag hot', text: '🔥 ' + it.cov + '개 매체 보도' }) : null),
        h('h1', { class: 'ah', text: titleOf(it) }),
        isTr(it) ? h('div', { class: 'adeck', text: it.title }) : null,
        h('div', { class: 'aby' }, h('span', { text: new Date(it.published).toLocaleString('ko-KR', { dateStyle: 'long', timeStyle: 'short' }) }), h('span', { text: '(' + ago(it.published) + ')' }),
          h('span', { class: 'tag', text: it.lang === 'ko' ? '국내 보도' : isTr(it) ? '해외 보도 · 한글 번역' : '해외 보도' })),
        fig, body,
        h('div', { class: 'row2' }, favBtn, starBtn, h('button', { onclick: copy }, '⧉ 주소 복사'))),
      h('footer', { class: 'dfoot' },
        h('div', { class: 'meta', text: '이 화면은 원문에서 핵심 문장을 자동 선별한 요약입니다. 전체 기사는 원문에서 확인하세요.' }),
        h('a', { class: 'go', href: safeUrl(it.url), target: '_blank', rel: 'noopener noreferrer' }, '원문 기사 전체 읽기 ↗'),
        h('div', { class: 'url', text: it.url }))));
  modal._key = (e) => { if (e.key === 'Escape') closeDetail(); else if (e.key === 'ArrowLeft') nav(-1); else if (e.key === 'ArrowRight') nav(1); };
  document.body.append(modal); document.body.style.overflow = 'hidden';
  const tnorm = (s) => (s || '').replace(/[\s\W]+/g, '').toLowerCase().slice(0, 18);
  api('/api/digest?id=' + encodeURIComponent(it.id)).then((d) => {
    if (tok !== detailTok) return;
    setImage(d.image);
    const pts = (d.points || []).filter((p) => tnorm(p) !== tnorm(titleOf(it)));
    body.replaceChildren();
    if (pts.length) {
      body.append(h('p', { class: 'alede', text: pts[0] }), ...pts.slice(1).map((p) => h('p', { class: 'ap', text: p })));
    } else if (first) body.append(h('p', { class: 'alede', text: first }));
    else body.append(h('div', { class: 'meta', text: '가져올 수 있는 본문이 없습니다. 아래 원문 링크에서 확인하세요.' }));
    if (d.via) body.append(h('div', { class: 'note', text: 'ℹ️ 같은 소식을 다룬 [' + d.via + '] 기사에서 핵심을 추렸습니다.' }));
    if (d.note && !pts.length) body.append(h('div', { class: 'note', text: 'ℹ️ ' + d.note }));
    if (d.related && d.related.length) body.append(h('div', { class: 'rel' }, h('h3', { class: 'dh', text: '📰 같은 소식을 다룬 다른 매체' }),
      h('ul', {}, d.related.map((r) => h('li', {}, h('a', { href: safeUrl(r.url), target: '_blank', rel: 'noopener noreferrer', text: r.title }), h('span', { class: 'meta', text: ' — ' + r.source }))))));
    if (d.pointsOrig && d.pointsOrig.length) body.append(h('details', { class: 'orig' }, h('summary', { text: '영문 원문 문장 보기' }), d.pointsOrig.map((p) => h('p', { class: 'ap og', text: p }))));
  }).catch(() => { if (tok === detailTok) { body.querySelector('.loading')?.remove(); body.append(h('div', { class: 'note', text: '핵심 내용을 불러오지 못했습니다. 아래 원문 링크를 이용해 주세요.' })); } });
}
document.addEventListener('keydown', (e) => { const m = $('#modal'); if (m) m._key(e); });


// ───── 화면: 찜한 글 (업데이트로 목록에서 밀려나도 보관됨 · 백업/복원 가능)
function renderFav() {
  const main = $('#main'); main.replaceChildren(); state.nav = [];
  const list = Object.values(state.fav).sort((a, b) => b.savedAt - a.savedAt);
  const exportFav = async () => {
    const d = await api('/api/fav'); const blob = new Blob([JSON.stringify({ app: 'ai-newsdesk', fav: d.fav }, null, 1)], { type: 'application/json' });
    const a = h('a', { href: URL.createObjectURL(blob), download: 'newsdesk-favorites-' + new Date().toISOString().slice(0, 10) + '.json' }); document.body.append(a); a.click(); a.remove();
  };
  const file = h('input', { type: 'file', accept: 'application/json,.json', hidden: true, onchange: async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { const j = JSON.parse(await f.text()); const r = await post('/api/fav/import', { fav: j.fav }); toast(r.added + '건을 가져왔습니다'); await loadFav(); renderTabs(); renderFav(); } catch { toast('가져오기 실패: 올바른 백업 파일이 아닙니다'); }
  } });
  main.append(h('div', { class: 'bar' }, h('span', { class: 'meta', text: list.length + '건 · 찜한 글은 업데이트돼도 그대로 남습니다' }),
    h('div', { class: 'seg' }, h('button', { onclick: exportFav }, '⬇ 백업 저장'), h('button', { onclick: () => file.click() }, '⬆ 가져오기'), file)));
  if (!list.length) { main.append(h('div', { class: 'empty', text: '아직 찜한 글이 없습니다. 카드 오른쪽 위의 ♡ 를 눌러 담아 보세요. (스터디 보드는 ★ — 공부할 글 관리용)' })); return; }
  const grid = h('div', { class: 'gg' });
  list.forEach((e) => grid.append(gcard(e.item, { lede: true })));
  main.append(grid);
  if (window.__staticSite) main.append(h('p', { class: 'meta', text: '※ 이 사이트의 찜 목록은 지금 쓰는 브라우저에 저장됩니다. 다른 기기에서 보려면 “백업 저장” → 그 기기에서 “가져오기”.' }));
}

// ───── 화면: 스터디
function renderStudy() {
  const main = $('#main'); main.replaceChildren();
  const list = Object.values(state.study).sort((a, b) => b.addedAt - a.addedAt);
  if (!list.length) { main.append(h('div', { class: 'empty', text: '아직 담은 글이 없습니다. 기사 줄의 ☆ 를 눌러 담아 보세요.' })); return; }
  const kan = h('div', { class: 'kan' });
  for (const [st, label] of [['todo', '📥 읽을 것'], ['doing', '📖 학습 중'], ['done', '✅ 완료']]) {
    const col = h('div', {}, h('h3', { text: `${label} (${list.filter((e) => e.status === st).length})` }));
    for (const e of list.filter((x) => x.status === st)) col.append(studyCard(e));
    kan.append(col);
  }
  main.append(kan);
}
function studyCard(e) {
  const it = e.item; const tips = learnTips(it);
  const saved = h('span', { class: 'saved' });
  let t; const persist = (patch) => { clearTimeout(t); t = setTimeout(async () => { await post('/api/study', { id: e.id, ...patch }); saved.textContent = '저장됨 ✓'; setTimeout(() => (saved.textContent = ''), 1500); }, 500); };
  const move = (st) => h('button', { onclick: async () => { await post('/api/study', { id: e.id, status: st }); e.status = st; renderStudy(); } }, { todo: '← 읽을 것', doing: '학습 중', done: '완료 ✓' }[st]);
  return h('div', { class: 'sc' },
    h('div', { class: 'meta' }, h('b', { text: it.source }), ' · ', ago(it.published), saved),
    h('a', { class: 'ti', href: safeUrl(it.url), onclick: openIt(it), text: titleOf(it) }),
    isTr(it) ? h('div', { class: 'og', text: it.title }) : null,
    h('a', { class: 'src meta', href: safeUrl(it.url), target: '_blank', rel: 'noopener noreferrer', text: '원문 ↗ ' + displayUrl(it.url) }),
    tips.length ? h('ul', {}, tips.map((x) => h('li', { text: x }))) : null,
    h('textarea', { placeholder: '배운 점·메모를 적어 두세요', oninput: (ev) => { e.note = ev.target.value; persist({ note: e.note }); } }, e.note || ''),
    h('input', { type: 'text', placeholder: '태그 (쉼표로 구분)', value: (e.tags || []).join(', '), oninput: (ev) => persist({ tags: ev.target.value.split(',').map((s) => s.trim()).filter(Boolean) }) }),
    h('div', { class: 'row' }, ['todo', 'doing', 'done'].filter((s) => s !== e.status).map(move),
      h('button', { onclick: async () => { await api('/api/study/' + encodeURIComponent(e.id), { method: 'DELETE' }); delete state.study[e.id]; renderTabs(); renderStudy(); } }, '삭제')));
}

// ───── 화면: 소스·설정
async function renderSources() {
  const main = $('#main'); main.replaceChildren(h('div', { class: 'empty', text: '불러오는 중…' }));
  const d = await api('/api/sources');
  main.replaceChildren();
  const cat = h('select', {}, CATS.map(([k, l]) => h('option', { value: k, text: l })));
  const lang = h('select', {}, h('option', { value: 'ko', text: '한국어' }), h('option', { value: 'en', text: 'English (자동 번역)' }));
  const url = h('input', { type: 'url', placeholder: 'RSS/Atom 주소 (예: https://example.com/feed.xml)' });
  const name = h('input', { type: 'text', placeholder: '이름 (선택)' });
  const msg = h('span', { class: 'meta' });
  const interval = h('select', { onchange: async (e) => { await post('/api/sources', { action: 'interval', intervalMin: +e.target.value }); toast('자동 업데이트 주기를 저장했습니다'); } },
    [[0, '끔'], [15, '15분'], [30, '30분'], [60, '1시간'], [180, '3시간'], [720, '12시간']].map(([v, l]) => h('option', { value: v, text: l, selected: v === d.intervalMin })));
  main.append(
    h('div', { class: 'panel' }, h('h4', { text: '자동 업데이트 주기' }), h('div', { class: 'addf' }, interval, h('span', { class: 'meta', text: '서버가 켜져 있는 동안 이 주기로 수집과 번역을 다시 실행합니다.' }))),
    h('div', { class: 'panel' }, h('h4', { text: '소스 추가 (RSS/Atom)' }),
      h('div', { class: 'addf' }, url, name, cat, lang, h('button', { class: 'primary', onclick: async () => {
        msg.textContent = '확인 중…'; const r = await post('/api/sources', { action: 'add', url: url.value, name: name.value, cat: cat.value, lang: lang.value });
        if (r.error) { msg.textContent = r.error; return; } toast('소스를 추가했습니다. 업데이트하면 반영됩니다'); renderSources();
      } }, '추가'), msg)),
    h('div', { class: 'panel' }, h('h4', { text: `소스 ${d.sources.length}개 — X·페이스북은 구글뉴스 검색(경유), Mastodon·HN 은 직접 수집. 인스타그램·쓰레드는 공개 피드가 없어 수집 불가` }),
      h('div', { class: 'tablewrap' }, h('table', {}, h('thead', {}, h('tr', {}, ['사용', '이름', '분류', '언어', '마지막 수집', ''].map((x) => h('th', { text: x })))),
        h('tbody', {}, d.sources.map((s) => h('tr', {},
          h('td', {}, h('input', { type: 'checkbox', checked: s.enabled, onchange: async (e) => { await post('/api/sources', { action: 'toggle', id: s.id, enabled: e.target.checked }); } })),
          h('td', {}, h('a', { class: 'src', href: safeUrl(s.url), target: '_blank', rel: 'noopener noreferrer', text: s.name })),
          h('td', { text: CAT_NAME[s.cat] || s.cat }), h('td', { text: s.lang === 'ko' ? '국내' : '해외' }),
          h('td', {}, s.last ? (s.last.ok ? h('span', { class: 'ok', text: `OK · ${s.last.count}건 (+${s.last.added})` }) : h('span', { class: 'err', text: '실패 · ' + s.last.error })) : h('span', { class: 'meta', text: '—' })),
          h('td', {}, s.builtin ? null : h('button', { onclick: async () => { await post('/api/sources', { action: 'remove', id: s.id }); renderSources(); } }, '삭제')))))))));
}

// ───── 탭/라우팅
function go(view, cat, learn = false, topic = '') { state.view = view; state.cat = cat; state.learnOnly = learn; state.topic = topic; state.shown = 60; if (view !== 'list' && view !== 'board') { render(); return; } load(); }
function renderTabs() {
  const tabs = $('#tabs'); tabs.replaceChildren();
  const v = state.view, list = v === 'list', plain = list && !state.learnOnly && !state.topic;
  const nFav = Object.keys(state.fav).length, nStudy = Object.keys(state.study).length;
  const home = () => { $('#q').value = ''; state.q = ''; go('board', null); };
  // [이름, 개수, 선택 여부, 누르면, 하위 보기]. 겹치는 화면은 한 탭의 하위 보기로 묶습니다.
  const groups = [
    ['📺 전체', null, v === 'board' || (plain && !state.cat), home, [
      ['한눈에 보기', null, v === 'board', home],
      ['전체 목록', state.all || 0, plain && !state.cat, () => go('list', null)]]],
    ...CATS.map(([k, l]) => [l, state.counts[k] || 0, plain && state.cat === k, () => go('list', k)]),
    ['📘 배우기', null, list && (state.learnOnly || state.topic === 'eng'), () => go('list', null, false, 'eng'), [
      ['🛠 AI 엔지니어링·에이전트', state.counts.eng || 0, list && state.topic === 'eng', () => go('list', null, false, 'eng')],
      ['배울 거리', null, list && state.learnOnly, () => go('list', null, true)]]],
    ['🗂 보관함', nFav + nStudy, v === 'fav' || v === 'study', () => go('fav'), [
      ['♥ 찜한 글', nFav, v === 'fav', () => go('fav')],
      ['★ 스터디 보드', nStudy, v === 'study', () => go('study')]]],
  ];
  if (!window.__staticSite) groups.push(['⚙ 소스·설정', null, v === 'sources', () => go('sources')]);
  const button = ([label, n, on, fn]) => h('button', { class: on ? 'on' : '', onclick: fn }, label, n != null ? h('span', { class: 'n', text: n }) : null);
  for (const g of groups) tabs.append(button(g));
  const old = $('#subtabs'); if (old) old.remove();
  const subs = groups.find((g) => g[2] && g[4]);
  if (subs) tabs.after(h('div', { id: 'subtabs', class: 'subtabs' }, h('div', { class: 'seg' }, subs[4].map(button))));
}
function render() {
  renderTabs();
  ({ board: renderBoard, list: renderList, fav: renderFav, study: renderStudy, sources: renderSources })[state.view]();
}

// ───── 업데이트
async function refresh() { $('#refresh').disabled = true; $('#refresh').textContent = '수집 중…'; await post('/api/refresh', {}); poll(); }
async function poll() {
  const bar = $('#progress'); bar.hidden = false;
  for (;;) {
    const s = await api('/api/status');
    const tr = s.phase === 'translate', im = s.phase === 'images';
    const pct = (tr || im) ? (s.ttotal ? (s.tdone / s.ttotal) * 100 : 0) : (s.total ? (s.done / s.total) * 100 : 0);
    bar.firstElementChild.style.width = pct + '%';
    bar.lastElementChild.textContent = s.running ? (im ? `기사 대표 이미지 가져오는 중 ${s.tdone}/${s.ttotal}` : tr ? `해외 기사 한글 번역 중 ${s.tdone}/${s.ttotal}` : `소스 수집 중 ${s.done}/${s.total}`)
      : `완료 — 새 항목 ${s.added}건, 번역 ${s.translated || 0}건, 이미지 ${s.images || 0}장, 소스 성공 ${s.results.filter((r) => r.ok).length}/${s.total}`;
    $('#refresh').disabled = s.running; $('#refresh').textContent = s.running ? (im ? '이미지 수집…' : tr ? '번역 중…' : '수집 중…') : '⟳ 지금 업데이트';
    if (!s.running) break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  await Promise.all([load(), loadTicker()]);
  setTimeout(() => { $('#progress').hidden = true; }, 6000);
}

// ───── 초기화
let qt;
$('#q').addEventListener('input', (e) => { clearTimeout(qt); qt = setTimeout(() => { state.q = e.target.value.trim(); if (state.q) { state.view = 'list'; state.cat = null; state.topic = ''; state.learnOnly = false; } else if (state.view === 'list' && !state.cat) state.view = 'board'; state.shown = 60; load(); }, 300); });
$('#lang').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; state.lang = b.dataset.v; document.querySelectorAll('#lang button').forEach((x) => x.classList.toggle('on', x === b)); load(); });
$('#days').addEventListener('change', (e) => { state.days = +e.target.value; load(); });
$('#orig').checked = state.showOrig;
$('#orig').addEventListener('change', (e) => { state.showOrig = e.target.checked; store.set('orig', e.target.checked ? '1' : '0'); render(); });
$('#refresh').addEventListener('click', refresh);
$('#theme').addEventListener('click', () => { const cur = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); const nx = cur === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = nx; store.set('theme', nx); });
const savedTheme = store.get('theme', ''); if (savedTheme) document.documentElement.dataset.theme = savedTheme;
const tick = () => { $('#clock').textContent = new Date().toLocaleString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' }); };
tick(); setInterval(tick, 20000);
api('/api/status').then((s) => { if (s.running) { $('#refresh').disabled = true; poll(); } });
load().then(loadTicker);
setInterval(() => { if (state.view === 'board' || state.view === 'list') { load(); loadTicker(); } }, 5 * 60000);
