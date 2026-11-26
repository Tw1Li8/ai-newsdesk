// 중요도 점수 = 출처 신뢰도 + 주제 가중치 + 여러 매체 동시 보도(클러스터) + 커뮤니티 반응 + 최신성(조회 시 계산) + 이미지 보너스(조회 시)
const AI_RE = /\bAI\b|A\.I|GPT|LLM|인공지능|생성형|챗봇|딥러닝|machine learning|agent|에이전트|robot|로봇|엔비디아|nvidia|claude|gemini|openai|anthropic|diffusion|copilot|midjourney|sora|llama|모델|chatbot|neural|자율주행|self-driving|autonomous|휴머노이드|humanoid|\bFSD\b|데이터센터|반도체/i;
const EVENT_RE = /규제|법안|소송|투자|인수|상장|출시|공개|launch|release|acquire|lawsuit|regulation|funding|billion|ipo|조\s?원|억\s?달러/i;
const TOPIC_RE = /openai|anthropic|claude|gemini|gpt-?\d|chatgpt|nvidia|엔비디아|deepseek|llama|meta ai|grok|xai|sora|veo|midjourney|copilot|삼성|네이버|카카오|하이퍼클로바|오픈AI|제미나이|클로드|규제|법안|소송|투자|인수|출시|공개|launch|release|acquire|lawsuit|regulation|funding|billion|조\s?원|억\s?달러|테슬라|tesla|현대차|자율주행|self-driving|휴머노이드|humanoid|\bFSD\b/i;

function authority(it) {
  const id = it.sourceId;
  const table = { openai: 3.5, gblog: 3, deepmind: 3, hf: 2.5, nvidia: 2.5, tc: 3, verge: 3, mit: 3, ars: 3, bair: 2, aitimes: 2.5, 'zdnet-kr': 2.5, geeknews: 2.5, ph: 2, hn: 2, 'hn-show': 1.5, 'naver-news': 2.2, 'daum-news': 2.2, 'arxiv-ai': 1, 'arxiv-cl': 1, 'gn-x': 0.5 };
  if (table[id] != null) return table[id];
  if (id.startsWith('masto')) return 0.2;
  if (id.startsWith('yt-')) return 2;
  if (id.startsWith('gn') || id.startsWith('naver-corp')) return 2;
  return 1.5; // 사용자 추가 소스
}

const STOP = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'from', 'are', 'was', 'has', 'have', 'will', 'new', 'how', 'why', 'what', 'its', 'but', 'not', 'you', 'your', 'about', 'into', 'over', 'after', 'more', 'than', 'says', 'could', 'would']);
function tokens(it) {
  // 한글 조사/어미 때문에 같은 단어가 갈라지는 것을 줄이기 위해: 라틴·숫자는 그 부분만, 한글은 앞 2글자만 사용. 원제와 번역 제목 모두 사용.
  const norm = (w) => { const m = w.match(/^[a-z0-9.$%]+/); if (m) return m[0]; return w.length > 2 ? w.slice(0, 2) : w; };
  const src = it.title + ' ' + (it.titleKo || '');
  const t = src.toLowerCase().replace(/[^\p{L}\p{N}.$%]+/gu, ' ').split(' ').map(norm).filter((w) => w.length >= 2 && !STOP.has(w));
  return new Set(t);
}

function computeRanks(store, days = 4) {
  const cut = Date.now() - days * 864e5;
  const items = Object.values(store.items);
  const recent = items.filter((i) => i.published >= cut);
  const tok = new Map(recent.map((i) => [i.id, tokens(i)]));
  // union-find 로 같은 이야기 묶기
  const parent = new Map(recent.map((i) => [i.id, i.id]));
  const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
  for (let a = 0; a < recent.length; a++) {
    const A = tok.get(recent[a].id); if (A.size < 3) continue;
    for (let b = a + 1; b < recent.length; b++) {
      if (recent[a].source === recent[b].source) continue;
      const B = tok.get(recent[b].id); if (B.size < 3) continue;
      let inter = 0; for (const w of A) if (B.has(w)) inter++;
      if (inter >= 3 && inter / (A.size + B.size - inter) >= 0.4) parent.set(find(recent[a].id), find(recent[b].id));
    }
  }
  const groups = new Map();
  for (const i of recent) { const r = find(i.id); (groups.get(r) || groups.set(r, []).get(r)).push(i); }
  for (const i of items) { i.cov = 1; i.dupOf = null; }
  for (const g of groups.values()) {
    const srcs = new Set(g.map((x) => x.source));
    for (const x of g) x.cov = srcs.size;
  }
  for (const i of items) {
    const text = i.title + ' ' + (i.summary || '');
    let base = authority(i);
    if (TOPIC_RE.test(text)) base += 1.8;
    if (EVENT_RE.test(text)) base += 0.8;
    if (!AI_RE.test(text)) base -= 2.5;
    base += 3 * Math.log2(i.cov || 1);
    if (i.score) base += Math.min(3, Math.log10(1 + i.score)); // HN 점수
    i.base = Math.round(base * 100) / 100;
  }
  // 같은 이야기 중 대표(점수 최고)만 남기고 나머지는 dupOf 표시
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    g.sort((a, b) => (b.base + (b.image ? 1 : 0) + (b.lang === 'ko' ? 0.3 : 0)) - (a.base + (a.image ? 1 : 0) + (a.lang === 'ko' ? 0.3 : 0)));
    for (const x of g.slice(1)) x.dupOf = g[0].id;
  }
}

// 조회 시점 점수
function scoreOf(it, now = Date.now()) {
  const ageH = Math.max(0, (now - it.published) / 3600e3);
  return (it.base ?? 1) + 4.5 * Math.pow(0.5, ageH / 20) + (it.image ? 0.6 : 0);
}

module.exports = { computeRanks, scoreOf, tokens };
