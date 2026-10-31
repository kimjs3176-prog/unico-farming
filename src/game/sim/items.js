/**
 * 새 아이템 카테고리 (사쿠나히메·동물의 숲 요소)
 * - 쌀: 벼(탈곡 전) → 쌀(등급 ★1~★5)
 * - 물고기 / 곤충 / 과일: 낚시·채집·나무 흔들기, 도감 등록
 */
export const RICE_GRADE_MULT = [0, 0.8, 1.0, 1.3, 1.65, 2.1];

export const ITEMS = {
  rice_seed: { name: '볍씨', emoji: '🌾', price: 30, cat: 'seed' },
  paddy: { name: '벼(탈곡 전)', emoji: '🌾', price: 40, cat: 'rice' },
  rice_1: { name: '쌀 ★', emoji: '🍚', price: 50, cat: 'rice' },
  rice_2: { name: '쌀 ★★', emoji: '🍚', price: 50, cat: 'rice' },
  rice_3: { name: '쌀 ★★★', emoji: '🍚', price: 50, cat: 'rice' },
  rice_4: { name: '쌀 ★★★★', emoji: '🍚', price: 50, cat: 'rice' },
  rice_5: { name: '쌀 ★★★★★', emoji: '🍚', price: 50, cat: 'rice' },
  // 물고기 (rarity: 1 흔함 ~ 4 매우 희귀, size cm 범위)
  fish_crucian: { name: '붕어', emoji: '🐟', price: 30, cat: 'fish', rarity: 1, size: [12, 30] },
  fish_loach: { name: '미꾸라지', emoji: '🐟', price: 25, cat: 'fish', rarity: 1, size: [8, 18] },
  fish_minnow: { name: '송사리', emoji: '🐟', price: 15, cat: 'fish', rarity: 1, size: [3, 5] },
  fish_carp: { name: '잉어', emoji: '🐠', price: 70, cat: 'fish', rarity: 2, size: [30, 80] },
  fish_catfish: { name: '메기', emoji: '🐡', price: 120, cat: 'fish', rarity: 3, size: [40, 100] },
  fish_snail: { name: '우렁이', emoji: '🐌', price: 45, cat: 'fish', rarity: 2, size: [3, 7] },
  fish_goldfish: { name: '황금 잉어', emoji: '🐠', price: 400, cat: 'fish', rarity: 4, size: [40, 90] },
  // 곤충
  bug_butterfly: { name: '배추흰나비', emoji: '🦋', price: 20, cat: 'bug', rarity: 1 },
  bug_swallowtail: { name: '호랑나비', emoji: '🦋', price: 60, cat: 'bug', rarity: 2 },
  bug_dragonfly: { name: '고추잠자리', emoji: '🪰', price: 45, cat: 'bug', rarity: 2 },
  bug_ladybug: { name: '무당벌레', emoji: '🐞', price: 35, cat: 'bug', rarity: 1 },
  bug_beetle: { name: '장수풍뎅이', emoji: '🪲', price: 150, cat: 'bug', rarity: 3 },
  bug_firefly: { name: '반딧불이', emoji: '✨', price: 200, cat: 'bug', rarity: 4 },
  // 과일 (나무 흔들기)
  fruit_apple: { name: '사과', emoji: '🍎', price: 40, cat: 'fruit' },
  fruit_peach: { name: '복숭아', emoji: '🍑', price: 50, cat: 'fruit' },
  fruit_pear: { name: '배', emoji: '🍐', price: 45, cat: 'fruit' },
  fruit_persimmon: { name: '감', emoji: '🟠', price: 55, cat: 'fruit' },
};

export const CATEGORY_NAMES = { fish: '물고기', bug: '곤충', fruit: '과일', rice: '쌀', seed: '씨앗' };

export const itemsOf = (cat) => Object.keys(ITEMS).filter((k) => ITEMS[k].cat === cat);
