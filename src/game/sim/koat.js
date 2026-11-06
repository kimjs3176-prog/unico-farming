/**
 * KOAT(한국농업기술진흥원) 체험관 — 본부별 기능을 게임으로 체험
 * 조직·업무 출처: koat.or.kr 조직도(/koat/department.do), 부서소개(/koat/depart_intro.do),
 *               주요사업(/business/business.do, venture.do, seed.do, digital.do, environment.do) — 2026-11 확인
 * 렌더링과 분리된 순수 로직 (tests/koat.test.js)
 */

export const PASS_SCORE = 60;

export const DIVISIONS = [
  {
    id: 'tech', name: '기술사업본부', emoji: '💡', color: 0xf2a33a,
    teams: ['사업지원팀(치유농업지원센터)', '기술거래이전팀', '기술창출평가팀', '글로벌사업팀'],
    summary: '농식품 특허 창출부터 기술이전·사업화 지원, 치유농업, 농기자재 해외 수출까지 기술 사업화 전 과정을 지원해요.',
    // 체험: 외부 특허 체험 페이지로 연결 (처음 누르면 체험 완료로 스탬프). 이전 '기술이전 매칭'(makeMatchRound)은 규칙·테스트만 남김
    game: { type: 'link', title: '특허체험하기', how: '농식품 특허가 어떻게 만들어지고 쓰이는지 직접 체험해 보세요. 새 창에서 특허 체험 페이지가 열려요.', url: 'https://atipsum.lovable.app' },
  },
  {
    id: 'venture', name: '벤처창업본부', emoji: '🚀', color: 0xe35d5d,
    teams: ['창업육성팀(농식품벤처창업센터 6개소)', 'AX혁신성장팀', '그린바이오산업팀', '그린바이오벤처팀'],
    summary: '농식품 벤처·창업 기업에 기술·자금·판로를 원스톱으로 지원하고, 그린바이오 창업 생태계를 조성해요.',
    game: { type: 'stages', title: '창업 성장 레이스', how: '예비창업 → 창업 → 성장 단계마다 알맞은 지원을 골라 스타트업을 키워 보세요.' },
  },
  {
    id: 'seed', name: '종자사업본부', emoji: '🌾', color: 0xd9b44a,
    teams: ['종자사업팀(종자종합처리센터)', '종묘사업팀', '종자산업진흥팀'],
    summary: '유망 신품종을 빠르게 보급하고, 종자 정선·검사로 품질을 관리하며 종자산업을 육성해요.',
    game: { type: 'sort', title: '종자 정선·품질검사', how: '제한 시간 안에 불량 종자(깨진 것·병든 것·이물질)만 골라내세요. 좋은 종자를 버리면 감점!' },
  },
  {
    id: 'smart', name: '스마트농업본부', emoji: '📡', color: 0x30b6aa,
    teams: ['스마트농업전략팀', '스마트농업육성팀', '스마트농업확산팀(스마트팜실증센터)'],
    summary: 'AI·데이터 기반 스마트농업을 확산하고, 전문인력 양성·표준화, 김제·상주 스마트팜 실증단지를 운영해요.',
    game: { type: 'smartfarm', title: '스마트팜 실증 테스트', how: '실증단지 온실의 온도·습도·CO₂ 를 30초 동안 적정 범위로 유지하세요.' },
  },
  {
    id: 'machine', name: '농기계검정본부', emoji: '🚜', color: 0x5ea33f,
    teams: ['농기계검정팀', 'ICT신뢰성평가팀'],
    summary: '농업기계 검정과 시험평가, 자율주행 농기계 성능시험, 농기자재 검·인증과 신뢰성 평가를 맡아요.',
    game: { type: 'inspect', title: '트랙터 안전 검정', how: '측정값을 기준과 비교해 항목마다 적합/부적합을 판정하세요. 안전한 농기계만 현장에 나갈 수 있어요.' },
  },
  {
    id: 'env', name: '농업환경분석본부', emoji: '🌍', color: 0x4a90d9,
    teams: ['농업자원분석팀', '농생명분석팀', '기후변화대응팀'],
    summary: '토양·용수·잔류농약과 농생명자원을 분석하고, 농업 온실가스 감축사업과 저탄소 농축산물 인증을 운영해요.',
    game: { type: 'carbon', title: '저탄소 농축산물 인증', how: '온실가스를 줄이는 영농 방법만 골라 인증 심사를 통과하세요.' },
  },
];
export const divisionById = (id) => DIVISIONS.find((d) => d.id === id);

const shuffle = (arr, rng) => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// ---------------------------------------------------------------- 기술사업: 기술이전 매칭
const TECH_POOL = [
  { tech: '🐝 꿀벌 질병 조기진단 센서', buyer: '양봉 스마트기기 스타트업' },
  { tech: '🍚 쌀가루 글루텐프리 제빵 기술', buyer: '쌀 가공식품 기업' },
  { tech: '🍓 딸기 신품종(통상실시권)', buyer: '딸기 육묘·재배 영농조합' },
  { tech: '🐛 천적곤충 대량사육 기술', buyer: '친환경 방제 자재 회사' },
  { tech: '🥬 김치 저염 발효 유산균', buyer: '김치 제조 기업' },
  { tech: '🤖 과수 수확 로봇팔 특허', buyer: '농업 로봇 제조사' },
  { tech: '🌿 치유농업 프로그램 모델', buyer: '치유농장 운영 농가' },
  { tech: '🐄 한우 사료 효율 개선 첨가제', buyer: '축산 사료 회사' },
];

export function makeMatchRound(rng = Math.random, n = 4) {
  const pairs = shuffle(TECH_POOL, rng).slice(0, n);
  return { techs: pairs.map((p) => p.tech), buyers: shuffle(pairs.map((p) => p.buyer), rng), answer: Object.fromEntries(pairs.map((p) => [p.tech, p.buyer])) };
}
/** answers: { tech: buyer } */
export function scoreMatch(round, answers) {
  const ok = round.techs.filter((t) => answers[t] === round.answer[t]).length;
  return Math.round((ok / round.techs.length) * 100);
}

// ---------------------------------------------------------------- 벤처창업: 단계별 지원 고르기
export const VENTURE_STAGES = [
  { stage: '예비창업', situation: '“스마트팜 상추로 샐러드 구독을 하고 싶어요!” 아이디어만 있는 예비 창업자', options: ['유망 아이디어 발굴·창업 교육', '해외 수출 박람회 참가', '대규모 공장 증설 자금'], answer: 0, why: '아이디어 단계에서는 사업 모델을 다듬는 발굴·교육이 먼저예요.' },
  { stage: '창업', situation: '법인을 세웠지만 농촌 현장과 사업 경험이 부족한 초기 기업', options: ['농촌 현장 창업보육·전문가 멘토링', '상장(IPO) 컨설팅', '기술 특허 무효 심판'], answer: 0, why: '초기 기업은 현장 보육과 멘토링으로 시행착오를 줄여요.' },
  { stage: '성장', situation: '제품은 좋은데 팔 곳과 투자금이 부족한 성장 단계 기업', options: ['판로개척·투자유치 지원', '아이디어 경진대회 재참가', '창업 교육 다시 듣기'], answer: 0, why: '성장 단계에는 판로와 투자 연결이 필요해요.' },
  { stage: '그린바이오', situation: '미생물·곤충 등 생명소재로 신제품을 만드는 바이오 벤처', options: ['그린바이오 상용화·벤처캠퍼스 입주 지원', '트랙터 구입 보조', '논 물대기 컨설팅'], answer: 0, why: '그린바이오 벤처캠퍼스에서 실증·상용화를 도와요.' },
];
export function makeStagesRound(rng = Math.random) {
  return VENTURE_STAGES.map((s) => { const order = shuffle([0, 1, 2], rng); return { ...s, options: order.map((i) => s.options[i]), answer: order.indexOf(s.answer) }; });
}
export function scoreStages(round, picks) {
  return Math.round((round.filter((s, i) => picks[i] === s.answer).length / round.length) * 100);
}

// ---------------------------------------------------------------- 종자사업: 정선·품질검사
export const SEED_KINDS = {
  good: { emoji: '🌰', label: '좋은 종자', bad: false },
  cracked: { emoji: '💔', label: '깨진 종자', bad: true },
  diseased: { emoji: '🦠', label: '병든 종자', bad: true },
  stone: { emoji: '🪨', label: '돌·이물질', bad: true },
  weed: { emoji: '🌱', label: '잡초 씨', bad: true },
};
export function makeSortRound(rng = Math.random, n = 20, badRatio = 0.35) {
  const bads = ['cracked', 'diseased', 'stone', 'weed'];
  const items = Array.from({ length: n }, (_, i) => ({ id: i, kind: rng() < badRatio ? bads[Math.floor(rng() * bads.length)] : 'good' }));
  if (!items.some((x) => SEED_KINDS[x.kind].bad)) items[0].kind = 'cracked';
  return { items, time: 15 };
}
/** picked: Set(id) — 골라낸 것. 불량을 골라내면 +, 좋은 종자를 버리면 − */
export function scoreSort(round, picked) {
  const bad = round.items.filter((x) => SEED_KINDS[x.kind].bad);
  const hit = bad.filter((x) => picked.has(x.id)).length;
  const wrong = round.items.filter((x) => !SEED_KINDS[x.kind].bad && picked.has(x.id)).length;
  return Math.max(0, Math.round(((hit - wrong) / bad.length) * 100));
}

// ---------------------------------------------------------------- 농기계검정: 안전 검정
const INSPECT_ITEMS = [
  { name: '제동 정지거리', unit: 'm', std: '≤ 5.0', ok: (v) => v <= 5.0, gen: (r) => (r() < 0.5 ? 3.6 + r() * 1.3 : 5.3 + r() * 1.5) },
  { name: '전조등 밝기', unit: 'cd', std: '≥ 15,000', ok: (v) => v >= 15000, gen: (r) => Math.round(r() < 0.5 ? 16000 + r() * 6000 : 9000 + r() * 5000) },
  { name: '전복보호구조(ROPS) 변형', unit: 'mm', std: '≤ 30', ok: (v) => v <= 30, gen: (r) => Math.round(r() < 0.5 ? 8 + r() * 20 : 34 + r() * 30) },
  { name: '운전석 소음', unit: 'dB', std: '≤ 86', ok: (v) => v <= 86, gen: (r) => Math.round(r() < 0.5 ? 74 + r() * 10 : 88 + r() * 8) },
  { name: 'PTO 축 보호덮개', unit: '', std: '장착', ok: (v) => v === '장착', gen: (r) => (r() < 0.6 ? '장착' : '미장착') },
  { name: '자율주행 경로 오차', unit: 'cm', std: '≤ 5', ok: (v) => v <= 5, gen: (r) => Math.round((r() < 0.5 ? 1 + r() * 3.5 : 6 + r() * 8) * 10) / 10 },
];
export function makeInspectRound(rng = Math.random, n = 5) {
  return shuffle(INSPECT_ITEMS, rng).slice(0, n).map((it) => { const v = it.gen(rng); return { name: it.name, unit: it.unit, std: it.std, value: v, pass: it.ok(v) }; });
}
/** verdicts: [true(적합)/false(부적합)] */
export function scoreInspect(round, verdicts) {
  return Math.round((round.filter((it, i) => verdicts[i] === it.pass).length / round.length) * 100);
}

// ---------------------------------------------------------------- 농업환경분석: 저탄소 인증
export const CARBON_CARDS = [
  { text: '논 물 중간 물떼기·얕게 걸러대기', good: true, why: '논에서 나오는 메탄을 줄여요 (논농사에서 익혔죠!)' },
  { text: '토양 검정 후 비료 적정량 시비', good: true, why: '과다 질소비료의 아산화질소 배출을 줄여요' },
  { text: '바이오차(숯) 토양 투입', good: true, why: '탄소를 땅속에 오래 저장해요' },
  { text: '가축분뇨 에너지화·퇴비화', good: true, why: '분뇨에서 나오는 메탄을 줄여요' },
  { text: '난방기 대신 지열·태양광 활용', good: true, why: '화석연료 사용을 줄여요' },
  { text: '잔재물(볏짚) 노지 소각', good: false, why: '온실가스와 미세먼지를 늘려요' },
  { text: '질소비료 2배 살포', good: false, why: '아산화질소 배출이 크게 늘어요' },
  { text: '논에 물을 늘 깊게 가둬 두기', good: false, why: '메탄이 많이 나와요' },
  { text: '노후 경유 양수기 공회전', good: false, why: '연료 낭비와 배출이 늘어요' },
];
export function makeCarbonRound(rng = Math.random, n = 8) {
  const goods = shuffle(CARBON_CARDS.filter((c) => c.good), rng).slice(0, Math.ceil(n / 2));
  const bads = shuffle(CARBON_CARDS.filter((c) => !c.good), rng).slice(0, Math.floor(n / 2));
  return shuffle([...goods, ...bads], rng);
}
/** chosen: Set(index) — 감축 방법이라고 고른 카드 */
export function scoreCarbon(round, chosen) {
  const correct = round.filter((c, i) => chosen.has(i) === c.good).length;
  return Math.round((correct / round.length) * 100);
}

// ---------------------------------------------------------------- 공통 점수 (빠르게 하나씩 판단하는 체험)
/**
 * results: [{ ok: 맞혔나, left: 남은 시간 비율 0..1 }]
 * 정확도 85점 + 맞힌 문제를 빨리 풀수록 최대 15점
 */
export function scoreRun(results) {
  if (!results.length) return 0;
  const ok = results.filter((r) => r.ok);
  const speed = ok.length ? ok.reduce((a, r) => a + Math.max(0, Math.min(1, r.left)), 0) / results.length : 0;
  return Math.min(100, Math.round((ok.length / results.length) * 85 + speed * 15));
}

/** 종자 컨베이어: 불량을 골라낸 수(hit), 좋은 종자를 버린 수(wrong), 지나간 불량 전체(total) */
export function scoreConveyor(hit, wrong, total) {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round(((hit - wrong * 0.7) / total) * 100)));
}

/** 컨베이어에 흘려보낼 종자 순서 (불량 35%) */
export function makeConveyor(rng = Math.random, n = 34) {
  const bads = ['cracked', 'diseased', 'stone', 'weed'];
  return Array.from({ length: n }, (_, i) => ({ id: i, kind: rng() < 0.38 ? bads[Math.floor(rng() * bads.length)] : 'good' }));
}

// ---------------------------------------------------------------- 스탬프 투어
export const TOUR_REWARD = { money: 1000, xp: 300, title: 'KOAT 명예 연구원' };

export class StampBook {
  constructor() { this.stamps = {}; this.best = {}; this.rewarded = false; }
  /** 체험 결과 기록. 통과(60점 이상)하면 스탬프 */
  record(id, score) {
    this.best[id] = Math.max(this.best[id] || 0, score);
    const newStamp = score >= PASS_SCORE && !this.stamps[id];
    if (score >= PASS_SCORE) this.stamps[id] = true;
    return { newStamp, passed: score >= PASS_SCORE };
  }
  get count() { return Object.keys(this.stamps).length; }
  get complete() { return this.count === DIVISIONS.length; }
  claim() {
    if (!this.complete || this.rewarded) return null;
    this.rewarded = true;
    return TOUR_REWARD;
  }
  toJSON() { return { stamps: this.stamps, best: this.best, rewarded: this.rewarded }; }
  load(d) { if (d) { this.stamps = d.stamps || {}; this.best = d.best || {}; this.rewarded = !!d.rewarded; } }
}
