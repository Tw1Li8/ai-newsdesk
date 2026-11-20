// 기사 핵심 요약: 원문 페이지에서 본문 단락을 뽑아 중요한 문장 몇 개를 고르고(추출 요약), 영어면 한국어로 번역합니다.
// AI 모델을 쓰지 않는 규칙 기반이라 "요약문"이 아니라 "원문에서 고른 핵심 문장"입니다.
const { decode, strip } = require('./collector');
const { translateBatch } = require('./translate');
const { readText } = require('./charset');

const UA = 'Mozilla/5.0 (compatible; AI-Newsdesk/1.0; reader)';
const STOP = new Set('the and for with that this from are was has have will but not you your about into over after more than says said its their they them been were also can could would should which who what when where how why new one all out our his her she him'.split(' '));

// 내부망 주소로의 요청 방지(간단한 SSRF 차단)
function isPublicUrl(u) {
  try {
    const x = new URL(u);
    if (!/^https?:$/.test(x.protocol)) return false;
    const h = x.hostname.toLowerCase();
    if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal') || h === '::1' || h.startsWith('[')) return false;
    if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h)) return false;
    return true;
  } catch { return false; }
}

async function fetchHtml(url) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 12000);
  try {
    const r = await fetch(url, { signal: ctl.signal, redirect: 'follow', headers: { 'User-Agent': UA, Accept: 'text/html', 'Accept-Language': 'ko,en;q=0.8' } });
    if (!r.ok || !/html/i.test(r.headers.get('content-type') || '')) throw new Error('HTTP ' + r.status);
    if (!isPublicUrl(r.url || url)) throw new Error('blocked');
    return (await readText(r)).slice(0, 1500000);
  } finally { clearTimeout(t); }
}

function meta(html, keys) {
  for (const m of html.match(/<meta\b[^>]*>/gi) || []) {
    if (keys.some((k) => new RegExp(`(?:property|name)=["']${k}["']`, 'i').test(m))) {
      const c = m.match(/content=["']([^"']*)["']/i)?.[1]; if (c) return decode(c).trim();
    }
  }
  return '';
}

function paragraphs(html) {
  let body = html.replace(/<(script|style|noscript|nav|header|footer|aside|form|figure|iframe|svg)\b[\s\S]*?<\/\1>/gi, ' ');
  const art = body.match(/<article\b[\s\S]*?<\/article>/i)?.[0] || body.match(/<main\b[\s\S]*?<\/main>/i)?.[0];
  if (art && art.length > 1500) body = art;
  const ps = (body.match(/<p\b[^>]*>[\s\S]*?<\/p>/gi) || []).map(strip).filter((p) => p.length >= 40 && !/^(copyright|©|all rights|subscribe|sign up|구독|저작권|무단 ?전재|기자 *=|ⓒ)/i.test(p));
  return ps;
}

function splitSentences(text) {
  return text.replace(/\s+/g, ' ').split(/(?<=[.!?。])\s+|(?<=다\.)(?=\S)|(?<=[요죠]\.)\s+/).map((s) => s.trim()).filter((s) => s.length >= 30 && s.length <= 320);
}

// 같은 내용/거의 같은 내용의 문장을 앞쪽 하나만 남기고 제거 (단어 겹침 비율 기준)
function dedupeSents(list) {
  const out = [], sigs = [];
  for (const s of list) {
    const toks = new Set(s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').split(' ').filter((w) => w.length >= 2));
    if (!toks.size) continue;
    let dup = false;
    for (const t of sigs) { let n = 0; for (const w of toks) if (t.has(w)) n++; if (n / Math.min(toks.size, t.size) >= 0.7) { dup = true; break; } }
    if (!dup) { out.push(s); sigs.push(toks); }
  }
  return out;
}

function pickKeySentences(sents, n = 5) {
  if (sents.length <= n) return sents;
  const freq = {};
  const words = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').split(' ').filter((w) => w.length >= 2 && !STOP.has(w));
  for (const s of sents) for (const w of new Set(words(s))) freq[w] = (freq[w] || 0) + 1;
  const scored = sents.map((s, i) => {
    const w = words(s); if (!w.length) return { i, s, v: 0 };
    let v = w.reduce((a, x) => a + (freq[x] > 1 ? Math.log(1 + freq[x]) : 0), 0) / Math.sqrt(w.length);
    if (i < 3) v *= 1.5 - i * 0.15; // 리드 문장 가중
    if (/\d/.test(s)) v *= 1.1; // 숫자·수치 포함
    return { i, s, v };
  });
  return scored.sort((a, b) => b.v - a.v).slice(0, n).sort((a, b) => a.i - b.i).map((x) => x.s);
}

async function toKo(list) {
  if (!list.length) return [];
  try { const r = await translateBatch(list); return r.map((x, k) => x || list[k]); } catch { return null; }
}

// item → { points[], pointsOrig[], translated, source:'article'|'feed', image, note }
async function buildDigest(it) {
  const isGoogle = /news\.google\.com/.test(it.url);
  let sents = [], image = '', note = '', from = 'feed';
  if (!isGoogle && isPublicUrl(it.url) && !/mastodon|\.social\//.test(it.url)) {
    try {
      const html = await fetchHtml(it.url);
      const ps = paragraphs(html);
      const desc = meta(html, ['og:description', 'description', 'twitter:description']);
      image = meta(html, ['og:image', 'twitter:image']);
      const text = [desc, ...ps].filter(Boolean).join(' ');
      sents = splitSentences(text);
      if (ps.length >= 2 && sents.length >= 3) from = 'article'; else note = '본문 일부만 가져올 수 있었습니다(유료/동적 페이지일 수 있음).';
    } catch (e) { note = '원문 페이지를 불러오지 못했습니다(' + String(e.message).slice(0, 40) + ').'; }
  } else if (isGoogle) note = '구글뉴스 경유 기사라 본문을 직접 가져올 수 없습니다. 아래 원문 링크에서 전체를 확인하세요.';
  else note = '이 출처는 본문 추출을 지원하지 않아 피드 요약만 보여줍니다.';
  if (sents.length < 2) sents = splitSentences((it.summary || '')).length ? splitSentences(it.summary) : (it.summary ? [it.summary] : []);
  const tn = (s) => (s || '').replace(/[\s\W]+/g, '').toLowerCase().slice(0, 24);
  sents = dedupeSents(sents.filter((s) => tn(s) !== tn(it.title))); // 제목과 같은 문장·중복 문장 제외
  const key = pickKeySentences(sents, 5).map((s) => s.slice(0, 320));
  let points = key, translated = false;
  if (it.lang === 'en' && key.length) { const ko = await toKo(key); if (ko) { points = ko; translated = true; } }
  return { points, pointsOrig: translated ? key : [], translated, from, image, note, at: Date.now() };
}

module.exports = { buildDigest, isPublicUrl };
