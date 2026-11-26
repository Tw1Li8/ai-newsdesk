// 기본 소스 목록. cat: industry(업계 판도) / corp(기업 성과) / creations(AI 결과물·사례) / community / video / research
// lang: ko | en. type: rss | hn | html. 사용자 추가 소스는 data/config.json 에 저장됩니다.
// 뉴스 검색 피드(Bing News RSS): 링크에 실제 기사 주소가 들어 있고 요약·대표 이미지도 함께 옵니다.
const gn = (q, lang = 'ko') =>
  `https://www.bing.com/news/search?q=${encodeURIComponent(q)}&format=rss&${lang === 'ko' ? 'setmkt=ko-KR&setlang=ko' : 'setmkt=en-US&setlang=en-US'}`;

const FIELDS = require('./fields');

const S = (id, name, url, cat, lang, extra = {}) => ({ id, name, url, cat, lang, type: 'rss', ...extra });

module.exports = [
  // ── 업계 판도: 해외 뉴스/공식 블로그
  S('openai', 'OpenAI News', 'https://openai.com/news/rss.xml', 'industry', 'en'),
  S('gblog', 'Google AI Blog', 'https://blog.google/technology/ai/rss/', 'industry', 'en'),
  S('deepmind', 'Google DeepMind', 'https://deepmind.google/blog/rss.xml', 'industry', 'en'),
  S('hf', 'Hugging Face Blog', 'https://huggingface.co/blog/feed.xml', 'industry', 'en'),
  S('nvidia', 'NVIDIA Blog', 'https://blogs.nvidia.com/feed/', 'industry', 'en'),
  S('tc', 'TechCrunch AI', 'https://techcrunch.com/category/artificial-intelligence/feed/', 'industry', 'en'),
  S('verge', 'The Verge AI', 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml', 'industry', 'en'),
  S('mit', 'MIT Tech Review AI', 'https://www.technologyreview.com/topic/artificial-intelligence/feed', 'industry', 'en'),
  S('ars', 'Ars Technica AI', 'https://arstechnica.com/ai/feed/', 'industry', 'en'),
  // ── 뉴스 검색 피드 (실제 기사 주소·이미지 제공)
  S('gn-anthropic', '뉴스: Anthropic·Claude', gn('Anthropic Claude', 'en'), 'industry', 'en'),
  S('gn-openai', '뉴스: OpenAI', gn('OpenAI', 'en'), 'industry', 'en'),
  S('gn-gemini', '뉴스: Google Gemini', gn('Google Gemini', 'en'), 'industry', 'en'),
  S('gn-meta', '뉴스: Meta AI', gn('Meta AI Llama', 'en'), 'industry', 'en'),
  S('gn-nvidia', '뉴스: Nvidia·AI 반도체', gn('Nvidia AI chips', 'en'), 'industry', 'en'),
  S('gn-xai', '뉴스: xAI·DeepSeek', gn('xAI Grok DeepSeek', 'en'), 'industry', 'en'),
  S('gn-reg', '뉴스: AI 규제·소송', gn('AI regulation lawsuit', 'en'), 'industry', 'en'),
  S('gn-fund', '뉴스: AI 투자·스타트업', gn('AI startup funding', 'en'), 'industry', 'en'),
  S('gn-dc', '뉴스: AI 데이터센터', gn('AI data center', 'en'), 'industry', 'en'),
  S('gn-ko-ai', '뉴스(KR): 인공지능', gn('인공지능', 'ko'), 'industry', 'ko'),
  S('gn-ko-gen', '뉴스(KR): 생성형AI', gn('생성형AI', 'ko'), 'industry', 'ko'),
  S('gn-ko-openai', '뉴스(KR): 오픈AI·챗GPT', gn('오픈AI 챗GPT', 'ko'), 'industry', 'ko'),
  S('gn-ko-gemini', '뉴스(KR): 제미나이·구글', gn('제미나이 구글 AI', 'ko'), 'industry', 'ko'),
  S('gn-ko-claude', '뉴스(KR): 클로드·앤스로픽', gn('클로드 앤스로픽', 'ko'), 'industry', 'ko'),
  S('gn-ko-nv', '뉴스(KR): 엔비디아·반도체', gn('엔비디아 AI 반도체', 'ko'), 'industry', 'ko'),
  S('gn-ko-sec', '뉴스(KR): 삼성·SK·LG AI', gn('삼성전자 AI', 'ko'), 'industry', 'ko'),
  S('gn-ko-naver', '뉴스(KR): 네이버·카카오 AI', gn('네이버 카카오 AI', 'ko'), 'industry', 'ko'),
  S('gn-ko-reg', '뉴스(KR): AI 규제·정책', gn('AI 규제 정책', 'ko'), 'industry', 'ko'),
  S('gn-art', '뉴스: AI 아트·이미지', gn('AI generated art', 'en'), 'creations', 'en'),
  S('gn-video', '뉴스: AI 영상 생성', gn('AI video generator', 'en'), 'creations', 'en'),
  S('gn-sora', '뉴스: Sora·Veo', gn('Sora Veo video', 'en'), 'creations', 'en'),
  S('gn-mj', '뉴스: Midjourney', gn('Midjourney', 'en'), 'creations', 'en'),
  S('gn-music', '뉴스: AI 음악', gn('AI music Suno', 'en'), 'creations', 'en'),
  S('gn-code', '뉴스: AI 코딩·에이전트', gn('AI coding agent', 'en'), 'creations', 'en'),
  S('gn-film', '뉴스: AI 영화·광고', gn('AI film advertising', 'en'), 'creations', 'en'),
  S('gn-ko-video', '뉴스(KR): AI 영상 제작', gn('AI 영상 제작', 'ko'), 'creations', 'ko'),
  S('gn-ko-webtoon', '뉴스(KR): AI 웹툰·콘텐츠', gn('AI 웹툰 콘텐츠', 'ko'), 'creations', 'ko'),
  S('gn-ko-case', '뉴스(KR): AI 활용 사례', gn('AI 활용 사례', 'ko'), 'creations', 'ko'),
  S('gn-ko-launch', '뉴스(KR): AI 서비스 출시', gn('AI 서비스 출시', 'ko'), 'creations', 'ko'),
  S('gn-ko-ad', '뉴스(KR): AI 광고·마케팅', gn('AI 광고 마케팅', 'ko'), 'creations', 'ko'),
  S('gn-x', 'X(트위터) 화제 AI', gn('site:x.com AI', 'en'), 'community', 'en'),
  S('gn-fb', '페이스북 화제 AI', gn('site:facebook.com AI', 'en'), 'community', 'en'),
  S('gn-reddit', 'Reddit 화제 AI', gn('site:reddit.com AI', 'en'), 'community', 'en'),
  S('gn-threads', '쓰레드 화제 AI', gn('site:threads.net AI', 'en'), 'community', 'en'),
  S('gn-insta', '인스타그램 화제 AI', gn('site:instagram.com AI', 'en'), 'community', 'en'),
  S('gn-ko-sns', '뉴스(KR): SNS 화제 AI', gn('AI 화제 SNS', 'ko'), 'community', 'ko'),

  // ── 기업 성과: 검색어는 fields.js 에서 관리
  ...FIELDS.flatMap(([id, name, ko, en]) => [
    ...ko.map((q, n) => S(`gn-ko-corp-${id}-${n + 1}`, `뉴스(KR): ${name} ${n + 1}`, gn(q, 'ko'), 'corp', 'ko', { field: name })),
    ...en.map((q, n) => S(`gn-corp-${id}-${n + 1}`, `뉴스: ${name} ${n + 1}`, gn(q, 'en'), 'corp', 'en', { field: name })),
  ]),

  // ── 업계 판도: 한국 (네이버·다음 배포 기사는 구글뉴스 경유로도 수집)
  S('aitimes', 'AI타임스', 'https://www.aitimes.com/rss/allArticle.xml', 'industry', 'ko'),
  S('zdnet-kr', 'ZDNet Korea', 'https://feeds.feedburner.com/zdkorea', 'industry', 'ko'),
  { id: 'naver-news', name: '네이버 뉴스 검색', type: 'html', cat: 'industry', lang: 'ko', htmlKind: 'naver',
    url: 'https://search.naver.com/search.naver?where=news&sort=1&query=' + encodeURIComponent('인공지능 AI') },
  { id: 'daum-news', name: '다음 뉴스 검색', type: 'html', cat: 'industry', lang: 'ko', htmlKind: 'daum',
    url: 'https://search.daum.net/search?w=news&sort=recency&q=' + encodeURIComponent('인공지능 AI') },
  S('geeknews', 'GeekNews', 'https://news.hada.io/rss/news', 'industry', 'ko'),

  // ── AI 결과물·사례 (분야 무관)
  { id: 'hn-show', name: 'Show HN (AI)', type: 'hn', cat: 'creations', lang: 'en',
    url: 'https://hn.algolia.com/api/v1/search_by_date?query=AI&tags=show_hn&hitsPerPage=40' },
  S('ph', 'Product Hunt AI', 'https://www.producthunt.com/feed?category=artificial-intelligence', 'creations', 'en'),

  // ── 커뮤니티 / 소셜 (공개 RSS·API 로 접근 가능한 경로만)
  { id: 'hn', name: 'Hacker News (AI)', type: 'hn', cat: 'community', lang: 'en',
    url: 'https://hn.algolia.com/api/v1/search_by_date?query=AI%20OR%20LLM%20OR%20GPT&tags=story&numericFilters=points%3E20&hitsPerPage=50' },

  // ── 영상(YouTube 채널 RSS)
  S('yt-2min', 'YouTube: Two Minute Papers', 'https://www.youtube.com/feeds/videos.xml?channel_id=UCbfYPyITQ-7l4upoX8nvctg', 'video', 'en'),
  S('yt-fireship', 'YouTube: Fireship', 'https://www.youtube.com/feeds/videos.xml?channel_id=UCsBjURrPoezykLs9EqgamOA', 'video', 'en'),
  S('yt-aiexp', 'YouTube: AI Explained', 'https://www.youtube.com/feeds/videos.xml?channel_id=UCNJ1Ymd5yFuUPtn21xtRbbw', 'video', 'en'),
  S('yt-yannic', 'YouTube: Yannic Kilcher', 'https://www.youtube.com/feeds/videos.xml?channel_id=UCZHmQk67mSJgfCCTn7xBfew', 'video', 'en'),

  // ── 연구
  S('arxiv-ai', 'arXiv cs.AI', 'https://rss.arxiv.org/rss/cs.AI', 'research', 'en', { limit: 30 }),
  S('arxiv-cl', 'arXiv cs.CL', 'https://rss.arxiv.org/rss/cs.CL', 'research', 'en', { limit: 30 }),
  S('bair', 'Berkeley AI Research', 'https://bair.berkeley.edu/blog/feed.xml', 'research', 'en'),
];
