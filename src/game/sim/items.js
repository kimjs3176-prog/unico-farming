/**
 * 새 아이템 카테고리 (논농사·낚시·채집 요소)
 * - 쌀: 벼(탈곡 전) → 쌀(등급 ★1~★5)
 * - 물고기 / 곤충 / 과일: 낚시·채집·나무 흔들기, 도감 등록
 */
export const RICE_GRADE_MULT = [0, 0.8, 1.0, 1.3, 1.65, 2.1];

export const ITEMS = {
  rice_seed: { name: '볍씨', emoji: '🌾', price: 30, cat: 'seed' },
  pet_treat: { name: '강아지 간식', emoji: '🦴', price: 15, cat: 'seed' }, // 장터에서 사는 소모품 (도감·선물 제외)
  bait: { name: '떡밥', emoji: '🪱', price: 20, cat: 'seed' }, // 낚시 가게 소모품: 입질이 빨라지고 희귀한 물고기가 잘 옴
  paddy: { name: '벼(탈곡 전)', emoji: '🌾', price: 40, cat: 'rice' },
  rice_1: { name: '쌀 ★', emoji: '🍚', price: 50, cat: 'rice' },
  rice_2: { name: '쌀 ★★', emoji: '🍚', price: 50, cat: 'rice' },
  rice_3: { name: '쌀 ★★★', emoji: '🍚', price: 50, cat: 'rice' },
  rice_4: { name: '쌀 ★★★★', emoji: '🍚', price: 50, cat: 'rice' },
  rice_5: { name: '쌀 ★★★★★', emoji: '🍚', price: 50, cat: 'rice' },
  // 물고기 (rarity: 1 흔함 ~ 4 매우 희귀, size cm 범위)
  fish_crucian: { name: '붕어', emoji: '🐟', price: 30, cat: 'fish', rarity: 1, size: [12, 30] },
  fish_loach: { name: '미꾸라지', emoji: '🐟', price: 25, cat: 'fish', rarity: 1, size: [8, 18], seasons: ['autumn'] },
  fish_minnow: { name: '송사리', emoji: '🐟', price: 15, cat: 'fish', rarity: 1, size: [3, 5] },
  fish_carp: { name: '잉어', emoji: '🐠', price: 70, cat: 'fish', rarity: 2, size: [30, 80] },
  fish_catfish: { name: '메기', emoji: '🐡', price: 120, cat: 'fish', rarity: 3, size: [40, 100], seasons: ['summer'] },
  fish_snail: { name: '우렁이', emoji: '🐌', price: 45, cat: 'fish', rarity: 2, size: [3, 7] },
  fish_goldfish: { name: '황금 잉어', emoji: '🐠', price: 400, cat: 'fish', rarity: 4, size: [40, 90] },
  // 연못·논에만 사는 작은 물고기 (where 'pond': 낚시터 호수에서는 안 나옴)
  fish_bitterling: { name: '각시붕어', emoji: '🐟', price: 20, cat: 'fish', rarity: 1, size: [4, 8], where: 'pond', seasons: ['spring'] },
  fish_palechub: { name: '피라미', emoji: '🐟', price: 22, cat: 'fish', rarity: 1, size: [8, 15], where: 'pond', seasons: ['spring', 'summer'] },
  fish_dace: { name: '버들치', emoji: '🐟', price: 24, cat: 'fish', rarity: 1, size: [6, 12], where: 'pond', seasons: ['spring'] },
  fish_shrimp: { name: '민물새우', emoji: '🦐', price: 18, cat: 'fish', rarity: 1, size: [2, 4], where: 'pond', seasons: ['autumn'] },
  fish_crayfish: { name: '가재', emoji: '🦞', price: 55, cat: 'fish', rarity: 2, size: [5, 12], where: 'pond', rain: true, seasons: ['summer'] },
  fish_kchub: { name: '갈겨니', emoji: '🐟', price: 60, cat: 'fish', rarity: 2, size: [10, 20], where: 'pond', seasons: ['summer'] },
  fish_softshell: { name: '자라', emoji: '🐢', price: 260, cat: 'fish', rarity: 3, size: [15, 35], where: 'pond', night: true, seasons: ['summer'] },
  // 낚시터(호수)에서만: where 'lake', night 밤에만, cold 추운 날에 잘 잡힘, rain 비 오는 날 잘 잡힘
  fish_smelt: { name: '빙어', emoji: '🐟', price: 35, cat: 'fish', rarity: 1, size: [8, 15], where: 'lake', cold: true, seasons: ['winter'] },
  fish_trout: { name: '송어', emoji: '🐟', price: 90, cat: 'fish', rarity: 2, size: [25, 60], where: 'lake', seasons: ['autumn', 'winter'] },
  fish_mandarin: { name: '쏘가리', emoji: '🐟', price: 110, cat: 'fish', rarity: 2, size: [20, 50], where: 'lake', seasons: ['summer'] },
  fish_masu: { name: '산천어', emoji: '🐟', price: 150, cat: 'fish', rarity: 3, size: [20, 40], where: 'lake', rain: true, seasons: ['winter'] },
  fish_snakehead: { name: '가물치', emoji: '🐟', price: 160, cat: 'fish', rarity: 3, size: [50, 100], where: 'lake', seasons: ['summer'] },
  fish_eel: { name: '뱀장어', emoji: '🐍', price: 180, cat: 'fish', rarity: 3, size: [40, 90], where: 'lake', night: true, seasons: ['summer'] },
  fish_sturgeon: { name: '철갑상어', emoji: '🦈', price: 900, cat: 'fish', rarity: 4, size: [100, 200], where: 'lake', legend: true },
  fish_perch: { name: '꺽지', emoji: '🐟', price: 50, cat: 'fish', rarity: 1, size: [12, 25], where: 'lake' },
  fish_skygazer: { name: '강준치', emoji: '🐟', price: 95, cat: 'fish', rarity: 2, size: [30, 80], where: 'lake', seasons: ['spring'] },
  fish_nuchi: { name: '누치', emoji: '🐟', price: 45, cat: 'fish', rarity: 1, size: [25, 50], where: 'lake', seasons: ['spring'] },
  fish_bullhead: { name: '동자개', emoji: '🐟', price: 120, cat: 'fish', rarity: 2, size: [12, 30], where: 'lake', night: true, seasons: ['autumn'] },
  fish_lenok: { name: '열목어', emoji: '🐟', price: 220, cat: 'fish', rarity: 3, size: [30, 70], where: 'lake', cold: true, seasons: ['winter'] },
  fish_minimandarin: { name: '쏘가리 치어', emoji: '🐟', price: 40, cat: 'fish', rarity: 1, size: [6, 12], where: 'lake' },
  fish_goldmandarin: { name: '황쏘가리', emoji: '🐠', price: 650, cat: 'fish', rarity: 4, size: [25, 50], where: 'lake' },
  // 밭농사 재료·가공품 (장독대)
  compost: { name: '퇴비', emoji: '🟫', price: 35, cat: 'seed' }, // 밭에 주면 빨리 자라고 품질↑ (퇴비통에서 만들거나 장터에서 구매)
  weed: { name: '잡초', emoji: '🌿', price: 2, cat: 'seed' }, // 김매기에서 나옴 → 퇴비통 재료
  goods_carrotjuice: { name: '당근 주스', emoji: '🥤', price: 170, cat: 'goods' },
  goods_kimchi: { name: '양배추 김치', emoji: '🌶️', price: 230, cat: 'goods' },
  goods_juice: { name: '토마토 주스', emoji: '🧃', price: 190, cat: 'goods' },
  goods_jam: { name: '딸기잼', emoji: '🫙', price: 290, cat: 'goods' },
  goods_corntea: { name: '옥수수수염차', emoji: '🍵', price: 320, cat: 'goods' },
  goods_honeyjam: { name: '딸기 꿀절임', emoji: '🍯', price: 330, cat: 'goods' },
  // 목장: 하트 4개 이상인 동물이 가끔 주는 특별한 생산물 + 치즈 공방 가공품
  egg_gold: { name: '황금 달걀', emoji: '🥚', price: 160, cat: 'ranch' },
  milk_gold: { name: '특급 우유', emoji: '🍼', price: 230, cat: 'ranch' },
  wool_gold: { name: '고급 양털', emoji: '🧶', price: 280, cat: 'ranch' },
  goods_cheese: { name: '치즈', emoji: '🧀', price: 190, cat: 'goods' },
  goods_yarn: { name: '털실', emoji: '🧵', price: 230, cat: 'goods' },
  goods_castella: { name: '카스텔라', emoji: '🍰', price: 260, cat: 'goods' },
  goods_yogurt: { name: '딸기 요거트', emoji: '🍨', price: 175, cat: 'goods' },
  goods_butter: { name: '버터', emoji: '🧈', price: 280, cat: 'goods' },
  goods_scarf: { name: '털목도리', emoji: '🧣', price: 620, cat: 'goods' },
  // 물속 보물 (호수에서 잠수)
  clam: { name: '민물조개', emoji: '🐚', price: 45, cat: 'treasure' },
  pearl: { name: '민물 진주', emoji: '⚪', price: 350, cat: 'treasure' },
  // 곤충
  bug_butterfly: { name: '배추흰나비', emoji: '🦋', price: 20, cat: 'bug', rarity: 1, seasons: ['spring', 'summer'] },
  bug_swallowtail: { name: '호랑나비', emoji: '🦋', price: 60, cat: 'bug', rarity: 2, seasons: ['summer'], strict: true },
  bug_dragonfly: { name: '고추잠자리', emoji: '🪰', price: 45, cat: 'bug', rarity: 2, seasons: ['autumn'], strict: true },
  bug_ladybug: { name: '무당벌레', emoji: '🐞', price: 35, cat: 'bug', rarity: 1, seasons: ['spring', 'summer'] },
  bug_beetle: { name: '장수풍뎅이', emoji: '🪲', price: 150, cat: 'bug', rarity: 3, seasons: ['summer'] },
  bug_firefly: { name: '반딧불이', emoji: '✨', price: 200, cat: 'bug', rarity: 4, seasons: ['summer'], strict: true },
  // color: 3D 판 곤충 점 색 · ground: 땅에서 기어 다님 · night: 밤에만
  bug_yellowbutterfly: { name: '노랑나비', emoji: '🦋', price: 30, cat: 'bug', rarity: 1, color: 0xf6e36a, seasons: ['spring'] },
  bug_cicada: { name: '참매미', emoji: '🪰', price: 40, cat: 'bug', rarity: 1, color: 0x6a5a3a, seasons: ['summer'], strict: true },
  bug_honeybee: { name: '꿀벌', emoji: '🐝', price: 30, cat: 'bug', rarity: 1, color: 0xf2b233, seasons: ['spring', 'summer'] },
  bug_grasshopper: { name: '벼메뚜기', emoji: '🦗', price: 35, cat: 'bug', rarity: 1, color: 0x7cc04a, ground: true, seasons: ['summer', 'autumn'] },
  bug_damselfly: { name: '실잠자리', emoji: '🪰', price: 55, cat: 'bug', rarity: 2, color: 0x36b9a4, seasons: ['summer'] },
  bug_mantis: { name: '사마귀', emoji: '🦗', price: 70, cat: 'bug', rarity: 2, color: 0x4e9846, ground: true, seasons: ['autumn'] },
  bug_jewel: { name: '비단벌레', emoji: '🪲', price: 240, cat: 'bug', rarity: 3, color: 0x2fd18a, seasons: ['summer'] },
  bug_moth: { name: '나방', emoji: '🦋', price: 25, cat: 'bug', rarity: 1, color: 0xc2a88a, night: true },
  bug_cricket: { name: '왕귀뚜라미', emoji: '🦗', price: 50, cat: 'bug', rarity: 2, color: 0x5a3a22, ground: true, night: true, seasons: ['autumn'], strict: true },
  bug_stag: { name: '사슴벌레', emoji: '🪲', price: 260, cat: 'bug', rarity: 3, color: 0x3a2116, ground: true, night: true, seasons: ['summer'] },
  // 과일 (나무 흔들기)
  fruit_apple: { name: '사과', emoji: '🍎', price: 40, cat: 'fruit', seasons: ['autumn'] },
  fruit_peach: { name: '복숭아', emoji: '🍑', price: 50, cat: 'fruit', seasons: ['summer'] },
  fruit_pear: { name: '배', emoji: '🍐', price: 45, cat: 'fruit', seasons: ['autumn'] },
  fruit_persimmon: { name: '감', emoji: '🟠', price: 55, cat: 'fruit', seasons: ['autumn', 'winter'] },
  // 계절 축제 (sim/festival.js): 축제 음식은 주민이 축제마다 한 번 나눠 줌 (팔기·선물 가능), 엽전은 축제 장터에서만 씀 (팔기 목록 제외)
  fest_hwajeon: { name: '진달래 화전', emoji: '🌸', price: 90, cat: 'goods' },
  fest_surichwi: { name: '수리취떡', emoji: '🟢', price: 90, cat: 'goods' },
  fest_songpyeon: { name: '송편', emoji: '🥟', price: 90, cat: 'goods' },
  fest_patjuk: { name: '동지 팥죽', emoji: '🥣', price: 90, cat: 'goods' },
  fest_token: { name: '축제 엽전', emoji: '🏮', price: 0, cat: 'seed' },
};

export const CATEGORY_NAMES = { ranch: '특별 생산물', goods: '가공품', treasure: '물속 보물', fish: '물고기', bug: '곤충', fruit: '과일', rice: '쌀', seed: '씨앗' };

export const itemsOf = (cat) => Object.keys(ITEMS).filter((k) => ITEMS[k].cat === cat);

/**
 * 제철 (seasons 가 있는 곤충·물고기·과일): 계절을 주면 제철 ×3, 철 지난 것 ×0.25,
 * strict 는 제철이 아니면 아예 안 나옴 (반딧불이·매미·호랑나비는 여름, 고추잠자리·귀뚜라미는 가을만)
 */
export const SEASON_IN = 3, SEASON_OUT = 0.25;
/** 이 계절에 제철인가 (seasons 가 없으면 사철) */
export const inSeason = (id, season) => !season || !ITEMS[id]?.seasons || ITEMS[id].seasons.includes(season);
/** 한 계절에만 나는가 (도감 '이 계절에만' 표시) */
export const seasonOnly = (id) => ITEMS[id]?.seasons?.length === 1;
/** 추첨 무게 배수: 계절이 없으면 1 (도트 판·예전 호출 그대로), strict 는 철 지나면 0 */
export function seasonWeight(id, season) {
  const it = ITEMS[id];
  if (!season || !it?.seasons) return 1;
  if (it.seasons.includes(season)) return SEASON_IN;
  return it.strict ? 0 : SEASON_OUT;
}

/** 과일나무 상태: ripe 제철 · blossom 봄꽃 · green 풋열매 · bare 빈 가지 (3D 판 나무 모습) */
export function treeStage(fruit, season) {
  if (inSeason(fruit, season)) return 'ripe';
  if (season === 'spring') return 'blossom';
  if (season === 'summer') return 'green';
  return 'bare';
}
