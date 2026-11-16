/**
 * 계절 (렌더링 무관, 테스트: tests/season.test.js)
 *  - 게임 7일마다 계절이 바뀜: 봄 → 여름 → 가을 → 겨울 (28일 = 1년)
 *  - 제철 작물: 밭에서 25% 빨리 자라고 10% 비싸게 팔림
 *  - 겨울: 바깥 밭 작물이 천천히 자람(×0.6, 제철 없음) — 스마트팜은 상관없음
 *  - 화면 모습(look): 풀·나무·땅 색, 들꽃 양, 눈 덮임, 떨어지는 꽃잎·낙엽
 *  - 잎 색(leaves): 셰이더가 밝기를 지키며 a/b(나무마다 반반)·red/red2(활엽수 30%) 쪽으로 물들임
 *    amt = [활엽수, 단풍나무(원래 주황: 가을 밖에서는 초록으로), 침엽수, 덤불] 섞는 양, blossom = 봄 꽃송이(과수원·활엽수 일부)
 */
export const DAYS_PER_SEASON = 7;

export const SEASONS = [
  {
    id: 'spring', name: '봄', icon: '🌸', crops: ['strawberry', 'cabbage'], growth: 1,
    desc: '꽃잎이 흩날려요. 딸기·양배추가 제철!',
    look: { grass: [0.26, 0.6, 0.4], grassJitter: 0.04, leaves: { a: 0xa8d86a, b: 0x9ccf5c, red: 0xa8d86a, red2: 0x9ccf5c, amt: [0.25, 0.85, 0.08, 0.15], blossom: 1 }, ground: [1.0, 1.02, 0.98], flowers: 1, snow: 0, fall: 'petal' },
  },
  {
    id: 'summer', name: '여름', icon: '☀️', crops: ['tomato', 'corn'], growth: 1,
    desc: '초록이 짙어지는 계절. 토마토·옥수수가 제철!',
    look: { grass: [0.28, 0.62, 0.31], grassJitter: 0.035, leaves: { a: 0x3f9a35, b: 0x4a9e3a, red: 0x3f9a35, red2: 0x4a9e3a, amt: [0.18, 0.85, 0.05, 0.18], blossom: 0 }, ground: [0.98, 1.02, 0.96], flowers: 0.75, snow: 0, fall: null },
  },
  {
    id: 'autumn', name: '가을', icon: '🍁', crops: ['carrot', 'cabbage'], growth: 1,
    desc: '단풍이 들고 낙엽이 져요. 당근·양배추가 제철!',
    look: { grass: [0.09, 0.6, 0.42], grassJitter: 0.05, leaves: { a: 0xe0802c, b: 0xe8b23a, red: 0xd4372c, red2: 0xc9542a, amt: [0.75, 0, 0, 0.35], blossom: 0 }, ground: [1.1, 0.95, 0.75], flowers: 0.3, snow: 0, fall: 'leaf' },
  },
  {
    id: 'winter', name: '겨울', icon: '❄️', crops: [], growth: 0.6,
    desc: '눈이 소복이 쌓여요. 바깥 밭은 천천히 자라니 스마트팜을 써 보세요',
    look: { grass: [0.2, 0.1, 0.78], grassJitter: 0.03, leaves: { a: 0xc9d2cf, b: 0xbfc8c3, red: 0xc9d2cf, red2: 0xbfc8c3, amt: [0.85, 0.75, 0.1, 0.45], blossom: 0 }, ground: [0.92, 0.95, 1.02], flowers: 0, snow: 0.7, fall: null },
  },
];
export const SEASON = Object.fromEntries(SEASONS.map((s) => [s.id, s]));

/** 날짜(1일부터) → { ...계절, index, dayIn(1~7), year } */
export function seasonOf(day) {
  const d = Math.max(1, Math.floor(day) || 1) - 1;
  const index = Math.floor(d / DAYS_PER_SEASON) % SEASONS.length;
  return { ...SEASONS[index], index, dayIn: (d % DAYS_PER_SEASON) + 1, year: Math.floor(d / (DAYS_PER_SEASON * SEASONS.length)) + 1 };
}

export const isInSeason = (season, crop) => !!season && season.crops.includes(crop);
/** 밭 성장 배율: 제철 ×1.25, 겨울 ×0.6 */
export const growthMult = (season, crop) => (isInSeason(season, crop) ? 1.25 : 1) * (season?.growth ?? 1);
/** 판매가 배율: 제철 작물 ×1.1 */
export const priceMult = (season, crop) => (isInSeason(season, crop) ? 1.1 : 1);
