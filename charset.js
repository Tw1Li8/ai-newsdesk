// 응답 본문을 올바른 문자 인코딩으로 읽기: 한국 언론사 상당수가 EUC-KR(CP949)이라 r.text()(항상 UTF-8)로 읽으면 글자가 깨진다.
// 우선순위: ① Content-Type 헤더의 charset ② 본문 앞부분의 <meta charset> / <?xml encoding> ③ UTF-8로 읽어 깨짐(U+FFFD)이 많으면 EUC-KR 재시도
function pickCharset(contentType, head) {
  const h = /charset\s*=\s*["']?([\w-]+)/i.exec(contentType || '');
  if (h) return h[1];
  const m = /<meta[^>]+charset\s*=\s*["']?([\w-]+)/i.exec(head) || /<\?xml[^>]+encoding\s*=\s*["']([\w-]+)["']/i.exec(head);
  return m ? m[1] : '';
}
function decodeWith(buf, label) {
  try { return new TextDecoder(label || 'utf-8').decode(buf); } catch { return null; }
}
async function readText(res) {
  const buf = new Uint8Array(await res.arrayBuffer());
  const head = Buffer.from(buf.subarray(0, 4096)).toString('latin1');
  const label = pickCharset(res.headers.get('content-type'), head).toLowerCase();
  if (label && !/^utf-?8$/.test(label)) { const s = decodeWith(buf, label); if (s != null) return s; }
  const s = decodeWith(buf, 'utf-8');
  if (label) return s;
  const bad = (s.match(/�/g) || []).length;
  if (bad > 3) { const k = decodeWith(buf, 'euc-kr'); if (k != null && (k.match(/�/g) || []).length < bad) return k; }
  return s;
}
module.exports = { readText };
