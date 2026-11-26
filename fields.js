// "기업 성과" 검색어 표: 기업이 AI 로 실제로 만든 결과물을 분야별로 찾습니다.
// 범위를 넓히거나 줄일 때는 이 파일만 고치면 됩니다. [분야 id, 분야 이름, 국내 검색어 목록, 해외 검색어 목록]
// 어떤 검색어가 실패·0건인지는 GitHub Actions 실행 요약에서 확인합니다.
module.exports = [
  ['auto', '자동차·자율주행', ['자동차 자율주행 AI 기술 공개', 'AI 내비게이션 실시간 공개', '현대차 AI 기술'], ['carmaker unveils AI self-driving technology', 'AI navigation real-time car']],
  ['tesla', '테슬라', ['테슬라 AI', '테슬라 자율주행 FSD'], ['Tesla AI', 'Tesla FSD update']],
  ['bigtech', '빅테크 제품', ['구글 애플 AI 신기능 공개', '마이크로소프트 아마존 AI 기술 공개'], ['Google Apple new AI feature launch', 'Microsoft Amazon unveils AI system']],
  ['kr', '국내 대기업', ['삼성 LG AI 기술 개발 성과', 'SK 포스코 한화 AI 성과'], ['Samsung LG AI breakthrough', 'Hyundai SK AI technology']],
  ['cn', '중국·아시아 기업', ['중국 기업 AI 기술 공개', '일본 기업 AI 도입 성과'], ['Chinese company unveils AI', 'Japanese company AI deployment']],
  ['robot', '로봇·휴머노이드', ['휴머노이드 로봇 AI 공개', '산업용 로봇 AI 도입'], ['humanoid robot AI demonstration', 'robotics company AI deployment']],
  ['mfg', '제조·공장', ['제조 공장 AI 도입 성과', '반도체 공정 AI 적용'], ['factory AI deployment results', 'manufacturer AI quality inspection']],
  ['health', '의료·제약', ['AI 신약 개발 성과', 'AI 진단 의료기기 승인'], ['AI drug discovery company results', 'AI medical device approval']],
  ['fin', '금융', ['은행 AI 서비스 도입', '보험 증권 AI 기술'], ['bank deploys AI system', 'fintech AI launch']],
  ['retail', '유통·커머스', ['유통 커머스 AI 도입', '편의점 백화점 AI 서비스'], ['retailer launches AI feature', 'e-commerce AI technology']],
  ['logi', '물류·운송', ['물류 AI 도입 성과', '항공 해운 철도 AI 시스템'], ['logistics company AI system', 'airline shipping rail AI']],
  ['build', '건설·도시', ['건설 AI 기술 적용', '스마트시티 AI 실증'], ['construction company AI technology', 'smart city AI deployment']],
  ['energy', '에너지·환경', ['에너지 전력 AI 기술 적용', '기후 환경 AI 예측 기술'], ['energy grid AI company', 'climate weather AI forecasting breakthrough']],
  ['agri', '농업·식품', ['스마트팜 AI 기술', '식품 기업 AI 도입'], ['agriculture AI technology company', 'food industry AI deployment']],
  ['defense', '국방·우주', ['방산 AI 기술 개발', '위성 우주 AI 기술'], ['defense company AI system unveiled', 'space satellite AI technology']],
  ['telco', '통신·보안', ['통신사 AI 기술 공개', '보안 기업 AI 탐지 기술'], ['telecom operator AI launch', 'cybersecurity company AI detection']],
  ['edu', '교육', ['교육 기업 AI 서비스', '에듀테크 AI 성과'], ['education company AI tool launch']],
  ['media', '게임·미디어', ['게임사 AI 기술 공개', '방송 미디어 AI 제작 도입'], ['game studio AI technology', 'media company AI production']],
  ['law', '법률·업무', ['리걸테크 AI 서비스', '기업 업무 AI 전환 성과'], ['legal tech AI launch', 'company AI productivity results']],
  ['public', '공공·행정', ['지자체 AI 행정 서비스 도입', '공공기관 AI 성과'], ['government agency AI system deployment']],
];
