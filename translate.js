// 외국어 → 한국어 번역 (키 불필요한 공개 번역 엔드포인트, 실패 시 항목은 원문 그대로 표시)
// 주의: 번역 시 기사 제목/요약(공개 뉴스 텍스트)만 외부 번역 서비스로 전송됩니다.
// 품질 보정: ① 원문 언어 자동 감지(독일어·일본어 등도 처리) ② AI 기업/제품명은 번역되지 않게 보호("Anthropic"→"인류" 같은 오역 방지)
const ENDPOINT = 'https://translate.googleapis.com/translate_a/t?client=dict-chrome-ex&sl=auto&tl=ko';
const UA = 'Mozilla/5.0 (compatible; AI-Newsdesk/1.0)';
const TR_VERSION = 3; // 번역 로직을 바꾸면 올려서 기존 번역을 다시 처리

const BRANDS = ['Stable Diffusion', 'Hugging Face', 'Anthropic', 'OpenAI', 'ChatGPT', 'Claude', 'Gemini', 'DeepMind', 'Google', 'Meta', 'Llama', 'Nvidia', 'NVIDIA', 'Mistral', 'DeepSeek', 'xAI', 'Grok',
  'Midjourney', 'Sora', 'Veo', 'Runway', 'Kling', 'Suno', 'Udio', 'Perplexity', 'Copilot', 'Cursor', 'Windsurf', 'Codex', 'Opus', 'Sonnet', 'Haiku', 'Microsoft', 'Apple', 'Amazon',
  'Samsung', 'Qwen', 'Snapchat', 'Snap', 'Tesla', 'Waymo', 'SpaceX', 'Intel', 'AMD', 'TSMC', 'Oracle', 'Salesforce', 'Alibaba', 'Baidu', 'Tencent', 'Huawei', 'Adobe', 'Figma', 'Notion', 'Cohere', 'Groq', 'Cerebras', 'Anysphere', 'Replit', 'Lovable', 'Manus', 'Kimi', 'Moonshot', 'ByteDance', 'TikTok', 'Instagram', 'WhatsApp', 'YouTube', 'GitHub', 'LinkedIn', 'Reddit', 'Mastodon'];
const BRAND_RE = new RegExp('(?<![A-Za-z0-9])(' + [...BRANDS].sort((a, b) => b.length - a.length).map((b) => b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')(?![A-Za-z0-9])', 'g');

// 모델 이름·등급명 보호: "Gemini 4 Neon", "Claude Opus 5.5", "GPT-6.2 Astra" 처럼 제품명 뒤에 붙는 버전·등급은 한 덩어리로 두고,
// "carbon-level", "Hydrogen model" 처럼 코드네임 뒤에 level/model/tier 등이 붙으면 그 단어를 번역하지 않는다.
const CODENAMES = ['carbon', 'hydrogen', 'helium', 'lithium', 'boron', 'nitrogen', 'oxygen', 'fluorine', 'neon', 'sodium', 'magnesium', 'aluminum', 'silicon', 'phosphorus', 'sulfur', 'argon', 'titanium',
  'cobalt', 'nickel', 'copper', 'zinc', 'xenon', 'krypton', 'radon', 'iridium', 'osmium', 'platinum', 'mercury', 'uranium', 'ruby', 'emerald', 'sapphire', 'opal', 'onyx', 'obsidian', 'jade', 'amber', 'indigo',
  'aurora', 'nova', 'orion', 'atlas', 'astra', 'luna', 'sol', 'apollo', 'titan', 'phoenix', 'falcon', 'spark', 'ember', 'flash', 'lightning', 'thunder', 'quasar', 'nebula', 'vega', 'lyra', 'zenith', 'summit'];
const MODEL_WORDS = [...CODENAMES, 'opus', 'sonnet', 'haiku', 'pro', 'ultra', 'nano', 'mini', 'lite', 'turbo', 'max', 'plus', 'scout', 'maverick', 'behemoth', 'code', 'thinking', 'instant', 'preview', 'fast', 'air', 'flex', 'omni', 'mix'];
const BRAND_ALT = [...BRANDS].sort((a, b) => b.length - a.length).map((b) => b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
const EXT = `(?:[A-Za-z]*\\d[A-Za-z0-9.]*|(?:${MODEL_WORDS.map((w) => w[0].toUpperCase() + w.slice(1)).join('|')}))`;
const RUN_RE = new RegExp(`(?<![A-Za-z0-9])((?:${BRAND_ALT}|GPT|Llama|Qwen|Grok|Gemma|Phi|Mixtral|Flux|o\\d)(?:-[A-Za-z0-9.]+)?)((?:[\\s-]+${EXT}(?![A-Za-z]))+)`, 'g');
const CODE_RE = new RegExp(`(?<![A-Za-z0-9])(${CODENAMES.join('|')})(?=-(?:level|class|tier|grade|series)\\b|\\s+(?:model|models|tier|edition|series|variant|version|release|family|class)\\b)`, 'gi');

function protect(text) {
  const dyn = [];
  const hold = (s) => { dyn.push(s); return 'Y' + (dyn.length - 1) + 'Y'; };
  let t = text.replace(RUN_RE, (m, head, rest) => { const base = head.match(/^[A-Za-z]+$/) && KO[head] ? KO[head] : head; return hold(base + rest); });
  t = t.replace(CODE_RE, (m) => hold(m));
  t = t.replace(BRAND_RE, (m) => 'X' + BRANDS.indexOf(m) + 'X');
  return { text: t, dyn };
}
// 한국 독자에게 익숙한 표기가 있는 이름은 한글로, 나머지는 원문 그대로 복원. 한글로 바꾼 경우 뒤따르는 조사(은/는 등)를 받침에 맞게 교정.
const KO = { Anthropic: '앤트로픽', OpenAI: '오픈AI', ChatGPT: '챗GPT', Claude: '클로드', Gemini: '제미나이', Google: '구글', DeepMind: '딥마인드', Meta: '메타', Nvidia: '엔비디아', NVIDIA: '엔비디아',
  Microsoft: '마이크로소프트', Apple: '애플', Amazon: '아마존', Samsung: '삼성', Tesla: '테슬라', Intel: '인텔', Alibaba: '알리바바', Baidu: '바이두', Tencent: '텐센트', Huawei: '화웨이', Mistral: '미스트랄', DeepSeek: '딥시크', Perplexity: '퍼플렉시티' };
const PARTICLES = { '은': ['은', '는'], '는': ['은', '는'], '이': ['이', '가'], '가': ['이', '가'], '을': ['을', '를'], '를': ['을', '를'], '과': ['과', '와'], '와': ['과', '와'] };
function restore(text, dyn = []) {
  text = text.replace(/Y\s?(\d+)\s?Y/g, (m, n) => dyn[+n] ?? m);
  return text.replace(/X(\d+)X(으로|[은는이가을를과와로])?/g, (m, n, p) => {
    const b = BRANDS[+n]; if (b == null) return m;
    const name = KO[b] || b;
    if (!p || !KO[b]) return name + (p || '');
    const code = name.charCodeAt(name.length - 1) - 0xAC00;
    const hangul = code >= 0 && code < 11172;
    if (!hangul) return name + p; // 끝이 영문(예: 오픈AI)이면 그대로
    const hasBatchim = code % 28 !== 0;
    if (p === '으로' || p === '로') return name + (hasBatchim && code % 28 !== 8 ? '으로' : '로');
    const pair = PARTICLES[p]; return pair ? name + (hasBatchim ? pair[0] : pair[1]) : name + p;
  });
}

async function translateBatch(texts) {
  const prot = texts.map(protect);
  const qs = prot.map((p) => 'q=' + encodeURIComponent(p.text)).join('&');
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 20000);
  try {
    const r = await fetch(ENDPOINT + '&' + qs, { headers: { 'User-Agent': UA }, signal: ctl.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    if (!Array.isArray(j) || j.length !== texts.length) throw new Error('응답 형식 불일치');
    return j.map((x, k) => { const s = Array.isArray(x) ? x[0] : x; return typeof s === 'string' ? restore(s, prot[k].dyn) : s; });
  } finally { clearTimeout(timer); }
}

// 길이(인코딩 후)를 제한해 묶음으로 나눔
function chunk(entries, maxChars = 3500, maxN = 12) {
  const out = []; let cur = [], len = 0;
  for (const e of entries) {
    const l = encodeURIComponent(e.text).length + 3;
    if (cur.length && (len + l > maxChars || cur.length >= maxN)) { out.push(cur); cur = []; len = 0; }
    cur.push(e); len += l;
  }
  if (cur.length) out.push(cur);
  return out;
}

// 영어(해외) 항목의 titleKo/summaryKo 를 채웁니다. 이전 버전 번역은 다시 번역합니다.
async function translateItems(store, { days = 7, max = 1600, onProgress } = {}) {
  const cutoff = Date.now() - days * 864e5;
  const stale = (i) => i.trv !== TR_VERSION || !i.titleKo || (i.summary && !i.summaryKo);
  const targets = Object.values(store.items).filter((i) => i.lang === 'en' && i.published >= cutoff && stale(i))
    .sort((a, b) => b.published - a.published).slice(0, max);
  const jobs = [];
  for (const it of targets) {
    jobs.push({ it, field: 'titleKo', text: it.title.slice(0, 300) });
    if (it.summary) jobs.push({ it, field: 'summaryKo', text: it.summary.slice(0, 240) });
  }
  const batches = chunk(jobs);
  let done = 0, ok = 0, fail = 0, i = 0;
  const worker = async () => {
    while (i < batches.length) {
      const b = batches[i++];
      try {
        const res = await translateBatch(b.map((x) => x.text));
        b.forEach((x, k) => { if (res[k] && typeof res[k] === 'string') { x.it[x.field] = res[k]; ok++; } });
      } catch { fail += b.length; }
      done++; onProgress && onProgress(done, batches.length);
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  for (const it of targets) if (it.titleKo && (!it.summary || it.summaryKo)) it.trv = TR_VERSION;
  return { ok, fail, batches: batches.length };
}

module.exports = { translateItems, translateBatch };
