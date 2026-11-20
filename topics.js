// 주제 분류: "AI 엔지니어링·에이전트 활용" (배우고 따라 해 볼 만한 개발·활용 글)
// 규칙 기반(AI 호출 없음). ① 엔지니어링 고유 용어는 단독으로 인정 ② "agent/에이전트"는 제목에 만들기·활용 맥락 단어가 같이 있을 때만 인정
const STRONG = new RegExp([
  '\\bMCP\\b', 'model context protocol', '\\bRAG\\b', 'retrieval[- ]augmented', 'prompt(?:ing)? engineering', 'context engineering', 'harness engineering', '\\bagent harness\\b',
  'claude code', '\\bcodex cli\\b', 'cursor rules', '\\bsub-?agents?\\b', 'agent skills?', 'tool[- ]use', 'function calling', 'agentic (?:coding|workflow|engineering|system|pattern)',
  'vibe[- ]?coding', 'fine-?tuning', '\\bLoRA\\b', '\\bevals?\\b', 'llm ops', 'llmops', 'langchain', 'langgraph', 'llamaindex', 'vector (?:db|database|search)', 'embeddings?',
  'agent sdk', 'ai engineer', 'guardrails?', 'prompt caching', 'structured output', 'inference (?:optimi|engine|serving)', 'quantiz',
  '프롬프트', '컨텍스트 엔지니어링', '하네스', '바이브 ?코딩', '파인 ?튜닝', '임베딩', '벡터 ?(?:DB|검색)', '서브 ?에이전트', '에이전트 (?:스킬|개발|구축|설계|활용|워크플로)', 'AI 엔지니어', '클로드 ?코드', '평가 ?(?:지표|셋)', '툴 ?콜링', '도구 ?호출'
].join('|'), 'i');
const AGENT = /\bagents?\b|agentic|에이전트/i;
const HOWTO = /\b(build|building|how to|how-to|tips?|tricks?|guide|tutorial|workflow|patterns?|best practices?|lessons?|cookbook|playbook)\b|만드는 ?법|구축기|활용법|팁|패턴|워크플로|가이드|튜토리얼|잘 ?쓰|사용법|노하우|쓰는 법/i;

function isEngineering(it) {
  const head = `${it.title || ''} ${it.titleKo || ''}`;
  const t = head; // 제목 기준(본문 요약까지 보면 일반 뉴스가 많이 섞임)
  if (STRONG.test(t)) return true;
  return AGENT.test(head) && HOWTO.test(head);
}

module.exports = { isEngineering };
