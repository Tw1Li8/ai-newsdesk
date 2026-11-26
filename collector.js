// 수집기: RSS/Atom/JSON/HTML 소스를 병렬로 가져와 정규화·중복제거 후 저장합니다. 외부 의존성 없음(Node 18+).
const { readText } = require('./charset');
const crypto = require('crypto');

const UA = 'Mozilla/5.0 (compatible; AI-Newsdesk/1.0; personal dashboard)';
const MAX_AGE_DAYS = 30;
const MAX_ITEMS = 6000;
const DEFAULT_LIMIT = 60;
const AI_RE = /AI|인공지능|GPT|챗봇|생성형|LLM|딥러닝|로봇|제미나이|클로드|오픈AI|엔비디아/i;

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', middot: '·', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”' };
function decode(s) {
  return String(s || '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => safeChr(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => safeChr(+d))
    .replace(/&([a-z]+);/gi, (m, n) => (ENT[n.toLowerCase()] ?? m));
}
function safeChr(n) { try { return String.fromCodePoint(n); } catch { return ''; } }
function strip(html) {
  return decode(String(html || '').replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}
function tag(block, name) {
  const re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i');
  const m = block.match(re);
  if (!m) return '';
  let v = m[1];
  const c = v.match(/<!\[CDATA\[([\s\S]*?)\]\]>/);
  return c ? c[1] : decode(v);
}
function attr(block, name, a) {
  const m = block.match(new RegExp(`<${name}\\b[^>]*\\s${a}=["']([^"']+)["']`, 'i'));
  return m ? decode(m[1]) : '';
}
function httpUrl(u) {
  try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : ''; } catch { return ''; }
}
function normUrl(u) {
  try {
    const x = new URL(u);
    for (const k of [...x.searchParams.keys()]) if (/^(utm_|fbclid|gclid|ref$|source$)/i.test(k)) x.searchParams.delete(k);
    x.hash = '';
    return (x.host.replace(/^www\./, '') + x.pathname.replace(/\/+$/, '') + x.search).toLowerCase();
  } catch { return u; }
}
const normTitle = (t) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '').slice(0, 80);
const hash = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 12);

function parseFeed(xml, src) {
  const blocks = xml.match(/<(item|entry)[\s>][\s\S]*?<\/\1>/gi) || [];
  const out = [];
  for (const b of blocks) {
    let title = strip(tag(b, 'title'));
    let link = tag(b, 'link').trim();
    if (!/^https?:/i.test(link)) {
      const alt = b.match(/<link\b[^>]*rel=["']alternate["'][^>]*>/i)?.[0] || b.match(/<link\b[^>]*>/i)?.[0] || '';
      link = (alt.match(/href=["']([^"']+)["']/i) || [])[1] || tag(b, 'guid');
      link = decode(link);
    }
    link = httpUrl(link.trim());
    try { const bu = new URL(link); if (/(^|\.)bing\.com$/.test(bu.hostname) && bu.pathname.startsWith('/news/apiclick')) link = httpUrl(bu.searchParams.get('url') || ''); } catch {}
    title = title.replace(/https?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim();
    if (title.replace(/[^\p{L}]/gu, '').length < 8) title = '';
    const rawBody0 = tag(b, 'description');
    if (!title && link) title = strip(rawBody0).slice(0, 110);
    if (!title || !link) continue;
    const rawBody = tag(b, 'content:encoded') || tag(b, 'content') || tag(b, 'description') || tag(b, 'summary') || tag(b, 'media:description');
    let image = attr(b, 'media:thumbnail', 'url') || attr(b, 'media:content', 'url') || '';
    if (!image) { const e = b.match(/<enclosure\b[^>]*type=["']image[^>]*>/i)?.[0]; if (e) image = (e.match(/url=["']([^"']+)["']/i) || [])[1] || ''; }
    if (!image) image = decode((rawBody.match(/<img[^>]+src=["']([^"']+)["']/i) || [])[1] || '');
    if (!image) { const bi = tag(b, 'News:Image'); if (bi) image = bi.replace(/^http:/, 'https:') + (bi.includes('?') ? '&' : '?') + 'w=800&h=450&c=14'; }
    const yt = b.match(/<yt:videoId>([^<]+)</i)?.[1];
    if (yt && !image) image = `https://i.ytimg.com/vi/${yt}/hqdefault.jpg`;
    const d = tag(b, 'pubDate') || tag(b, 'published') || tag(b, 'updated') || tag(b, 'dc:date');
    let t = Date.parse(d);
    if (!Number.isFinite(t)) t = Date.now();
    let srcName = src.name;
    const gsrc = strip(tag(b, 'News:Source')) || strip(tag(b, 'source'));
    if (gsrc && /news\.google\.com|bing\.com\/news/.test(src.url)) {
      srcName = gsrc;
      title = title.replace(new RegExp(`\\s[-–|]\\s${gsrc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`), '');
    }
    out.push({ title, url: link, summary: strip(rawBody).slice(0, 320), image: httpUrl(image), published: t, source: srcName });
  }
  return out;
}

function parseHN(json, src) {
  const j = JSON.parse(json);
  return (j.hits || []).filter((h) => h.title).map((h) => ({
    title: h.title,
    url: httpUrl(h.url) || `https://news.ycombinator.com/item?id=${h.objectID}`,
    summary: `HN ${h.points ?? 0}점 · 댓글 ${h.num_comments ?? 0}개 — https://news.ycombinator.com/item?id=${h.objectID}`,
    image: '', published: Date.parse(h.created_at) || Date.now(), source: src.name, score: h.points || 0,
  }));
}

// 다음 검색 결과 HTML: 마크업이 자주 바뀌므로 '뉴스 링크처럼 보이는 앵커'를 느슨하게 추출 (실패해도 다른 소스에 영향 없음)
function parseHTML(html, src) {
  const out = []; const seen = new Set();
  const re = /<a\b[^>]*href=["'](https?:\/\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    const url = decode(m[1]);
    const title = strip(m[2]).replace(/\s*새 창 (열림|링크)\s*$/, '').trim();
    if (title.length < 18 || title.length > 140) continue;
    if (/search\.(naver|daum)\.net|help\.|policy|about\.|login|javascript:/i.test(url)) continue;
    if (!/[가-힣]/.test(title) || !AI_RE.test(title) || /channelPromotion/.test(url)) continue;
    if (seen.has(url)) continue;
    seen.add(url);
    out.push({ title, url, summary: '', image: '', published: Date.now() - out.length * 180000, source: src.name });
  }
  return out.slice(0, 40);
}

async function fetchText(url, timeoutMs = 20000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctl.signal, redirect: 'follow', headers: { 'User-Agent': UA, Accept: 'application/rss+xml, application/atom+xml, application/xml, application/json, text/html;q=0.8, */*;q=0.5', 'Accept-Language': 'ko,en;q=0.8' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await readText(r);
  } finally { clearTimeout(t); }
}

async function collectOne(src) {
  const t0 = Date.now();
  try {
    const body = await fetchText(src.url);
    let items = src.type === 'hn' ? parseHN(body, src) : src.type === 'html' ? parseHTML(body, src) : parseFeed(body, src);
    items.sort((a, b) => b.published - a.published);
    items = items.slice(0, src.limit || DEFAULT_LIMIT);
    if (!items.length) throw new Error('항목 0개 (피드 형식 변경/차단 가능)');
    return { src, items, ok: true, ms: Date.now() - t0 };
  } catch (e) {
    return { src, items: [], ok: false, error: String(e.name === 'AbortError' ? '시간 초과' : e.message).slice(0, 120), ms: Date.now() - t0 };
  }
}

async function pool(list, n, fn, onDone) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, list.length) }, async () => {
    while (i < list.length) { const r = await fn(list[i++]); onDone && onDone(r); }
  }));
}

// store: { items: {id: item} } — 기존 항목에 새 항목을 병합
async function collectAll(sources, store, onProgress) {
  const results = [];
  const urlSeen = new Map(); const titleSeen = new Map();
  for (const it of Object.values(store.items)) { urlSeen.set(it.nurl, it.id); titleSeen.set(it.ntitle, it.id); }
  let added = 0;
  await pool(sources, 8, collectOne, (r) => {
    let n = 0;
    for (const x of r.items) {
      const nurl = normUrl(x.url), ntitle = normTitle(x.title);
      const dup = urlSeen.get(nurl) || (ntitle.length > 12 ? titleSeen.get(ntitle) : undefined);
      if (dup) { // 같은 기사가 업계 뉴스로 먼저 들어와도 기업 성과 검색에 걸리면 기업 성과로 분류
        const old = store.items[dup]; if (old && old.cat === 'industry' && r.src.cat === 'corp') old.cat = 'corp';
        continue;
      }
      const id = hash(nurl);
      store.items[id] = { id, title: x.title, url: x.url, summary: x.summary, image: x.image, published: Math.min(x.published, Date.now()), source: x.source,
        sourceId: r.src.id, cat: r.src.cat, lang: r.src.lang, score: x.score || 0, seen: Date.now(), nurl, ntitle };
      urlSeen.set(nurl, id); titleSeen.set(ntitle, id); n++; added++;
    }
    results.push({ id: r.src.id, name: r.src.name, ok: r.ok, count: r.items.length, added: n, error: r.error || null, ms: r.ms });
    onProgress && onProgress(results.length, sources.length, results);
  });
  // 오래된 항목 정리
  const cutoff = Date.now() - MAX_AGE_DAYS * 864e5;
  let all = Object.values(store.items).filter((i) => i.published >= cutoff || i.seen >= cutoff);
  if (all.length > MAX_ITEMS) all = all.sort((a, b) => b.published - a.published).slice(0, MAX_ITEMS);
  store.items = Object.fromEntries(all.map((i) => [i.id, i]));
  return { results, added };
}

module.exports = { collectAll, collectOne, parseFeed, decode, strip };
