// 이미지 보강: 이미지가 없는 상위 기사들의 페이지에서 대표 이미지(og:image 등)를 가져옵니다. (링크 미리보기와 같은 방식)
const { readText } = require('./charset');
const { scoreOf } = require('./rank');
const { isPublicUrl } = require('./digest');
const UA = 'Mozilla/5.0 (compatible; AI-Newsdesk/1.0; link preview)';

function pickImage(html, base) {
  const head = html.slice(0, 200000);
  const metas = head.match(/<meta\b[^>]*>/gi) || [];
  for (const key of ['og:image:secure_url', 'og:image', 'twitter:image', 'twitter:image:src']) {
    for (const m of metas) {
      if (!new RegExp(`(?:property|name)=["']${key}["']`, 'i').test(m)) continue;
      const c = m.match(/content=["']([^"']+)["']/i)?.[1];
      if (!c) continue;
      try { const u = new URL(c.replace(/&amp;/g, '&'), base); if (/^https?:$/.test(u.protocol)) return u.href; } catch {}
    }
  }
  return '';
}

async function fetchOg(url) {
  if (!isPublicUrl(url)) return '';
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 9000);
  try {
    const r = await fetch(url, { signal: ctl.signal, redirect: 'follow', headers: { 'User-Agent': UA, Accept: 'text/html' } });
    if (!r.ok || !/html/i.test(r.headers.get('content-type') || '')) return '';
    return pickImage(await readText(r), r.url || url);
  } catch { return ''; } finally { clearTimeout(t); }
}

async function enrichImages(store, { max = 260, onProgress } = {}) {
  const now = Date.now();
  const targets = Object.values(store.items)
    .filter((i) => !i.image && !i.imgTried && !i.dupOf && !/mastodon|^https?:\/\/[^/]*\.(social|online)\//i.test(i.url) && now - i.published < 3 * 864e5)
    .sort((a, b) => scoreOf(b) - scoreOf(a)).slice(0, max);
  let k = 0, got = 0, done = 0;
  const worker = async () => {
    while (k < targets.length) {
      const it = targets[k++];
      const img = await fetchOg(it.url);
      it.imgTried = true;
      if (img) { it.image = img; got++; }
      onProgress && onProgress(++done, targets.length);
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));
  return { tried: targets.length, got };
}

module.exports = { enrichImages };
