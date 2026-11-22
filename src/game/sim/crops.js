/** 작물 정의: 씨앗가, 기본 판매가, 성장 시간(초), 해금 레벨, 수확량 */
export const CROPS = {
  carrot:     { name: '당근',   emoji: '🥕', seedPrice: 12, basePrice: 30,  growTime: 60,  unlockLevel: 1, yield: 2 },
  cabbage:    { name: '양배추', emoji: '🥬', seedPrice: 18, basePrice: 48,  growTime: 90,  unlockLevel: 2, yield: 2 },
  tomato:     { name: '토마토', emoji: '🍅', seedPrice: 25, basePrice: 42,  growTime: 110, unlockLevel: 2, yield: 3, regrow: 2, regrowYield: 2 }, // 수확 후 다시 열림 (추가 2번, 다시 열린 건 2개씩)
  strawberry: { name: '딸기',   emoji: '🍓', seedPrice: 40, basePrice: 65,  growTime: 150, unlockLevel: 3, yield: 3, regrow: 3, regrowYield: 2 }, // 다시 열린 건 2개씩
  corn:       { name: '옥수수', emoji: '🌽', seedPrice: 30, basePrice: 75,  growTime: 180, unlockLevel: 4, yield: 3 },
};

/** 목장 생산물 */
export const PRODUCTS = {
  egg:  { name: '달걀', emoji: '🥚', basePrice: 30, from: 'chicken', time: 60 },
  milk: { name: '우유', emoji: '🥛', basePrice: 60, from: 'cow',     time: 120 },
  wool: { name: '양털', emoji: '🧶', basePrice: 80, from: 'sheep',   time: 180 },
  honey: { name: '꿀', emoji: '🍯', basePrice: 85, from: 'bee',     time: 150 },
};

export const FEED_PRICE = 15;
export const ANIMALS = { cow: { name: '젖소', emoji: '🐄' }, sheep: { name: '양', emoji: '🐑' }, chicken: { name: '닭', emoji: '🐔' } };

/** 한 번 수확할 때 기본 개수: 처음은 yield, 다시 열린 수확은 regrowYield (없으면 yield). 다시 열리는 작물이 다른 작물을 압도하지 않게 */
export const harvestYield = (c, first = true) => (first || c.regrowYield == null ? c.yield : c.regrowYield);
/** 심어서 다 거둘 때까지 기본 개수 합 (첫 수확 + 다시 열린 수확) */
export const totalYield = (c) => c.yield + (c.regrow || 0) * harvestYield(c, false);
