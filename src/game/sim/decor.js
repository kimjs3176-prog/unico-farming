/**
 * 농장 꾸미기 (렌더링 무관, 테스트: tests/decor.test.js)
 *  - 꾸미기 소품을 코인으로 사서 원하는 자리에 놓고, 돌려 놓고, 다시 치울 수 있음 (치운 건 보관함으로 → 다시 놓을 때 무료)
 *  - 모델은 게임에 이미 있는 것(직접 만든 모델 · Quaternius · KayKit, 모두 CC0/자체 제작)
 *  - 놓을 수 없는 곳(물·밭·논·목장·트랙터 마당·주민 자리·문 앞·다른 물건 위·흙길 위의 큰 물건)은 화면 쪽에서 world 로 확인
 */
export const DECOR_MAX = 60;

// id, 이름, 아이콘, 가격, 해금 레벨, 모델, 크기, 충돌 반지름(0 = 밟고 지나감), 분류
export const DECOR = [
  ['flowerbed', '꽃밭', '🌷', 60, 1, 'flowers', 1.0, 0, 'garden'],
  ['planter', '화분 상자', '🪴', 80, 1, 'planter', 1.0, 0.45, 'garden'],
  ['bush', '덤불', '🌳', 50, 1, 'bush_1', 1.0, 0.5, 'garden'],
  ['berrybush', '산딸기 덤불', '🫐', 90, 2, 'berrybush_1', 1.0, 0.5, 'garden'],
  ['tree', '둥근 나무', '🌲', 250, 2, 'tree_1', 0.9, 0.6, 'garden'],
  ['birch', '자작나무', '🌿', 260, 3, 'birch_1', 0.9, 0.6, 'garden'],
  ['maple', '단풍나무', '🍁', 300, 3, 'autumn_1', 0.9, 0.6, 'garden'],
  ['mossrock', '이끼 바위', '🪨', 70, 1, 'mossrock_1', 0.9, 0.5, 'garden'],
  ['stump', '그루터기', '🪵', 40, 1, 'stump', 1.0, 0.4, 'garden'],
  ['bench', '벤치', '🪑', 120, 1, 'bench', 1.0, 0.7, 'furniture'],
  ['lamp', '가로등', '💡', 150, 1, 'lamp', 1.0, 0.3, 'furniture'],
  ['fence', '울타리 한 칸', '🚧', 30, 1, 'fence', 1.0, 0.5, 'furniture'],
  ['scarecrow', '허수아비', '🎃', 200, 2, 'scarecrow', 1.0, 0.4, 'furniture'],
  ['well', '우물', '🪣', 600, 4, 'well', 0.8, 1.1, 'furniture'],
  ['barrel', '나무통', '🛢️', 50, 1, 'k_barrel', 4.5, 0.4, 'props'],
  ['crate', '나무 상자', '📦', 40, 1, 'k_crate_A_big', 4.5, 0.5, 'props'],
  ['sack', '곡식 자루', '🌾', 40, 1, 'k_sack', 4.5, 0.35, 'props'],
  ['bucket', '물 양동이', '🪣', 30, 1, 'k_bucket_water', 4.5, 0, 'props'],
  ['hay', '건초 더미', '🌾', 70, 1, 'hay_bale', 1.0, 0.6, 'props'],
  ['cart', '외바퀴 수레', '🛒', 140, 2, 'wheelbarrow', 1.0, 0.6, 'props'],
].map(([id, name, icon, price, lv, model, scale, r, cat]) => ({ id, name, icon, price, lv, model, scale, r, cat }));

/**
 * ✨ 특별 소품 (Lv5~8, 800~5,000): 오래 모은 코인을 쓰는 곳. 이미 있는 CC0 모델 + 색 바꾼 판(tint)
 *  tint: { color, mode, mats? } — 'green' 은 잎(초록빛 재질)만, 'all' 은 어두운 재질을 뺀 모두, 'mats' 는 이름을 적은 재질만
 *  (decor_view._model 이 (모델, 색)마다 재질을 한 번만 복제해 씀)
 *  limited: 오늘의 특별 상품(sim/shelf.js)에서만 사서 보관함으로 → 꾸미기 창에는 보관함에 있을 때만 보임
 */
const GOLD = { color: 0xf2c14e, mode: 'all' };
const tintOf = (color, ...mats) => ({ color, mode: 'mats', mats });
export const DECOR_PREMIUM = [
  ['skybench', '하늘색 벤치', '🪑', 800, 5, 'bench', 1.0, 0.7, tintOf(0x8fd3f5, 'wood')],
  ['postbox', '빨간 우체통', '📮', 800, 5, 'mailbox', 1.0, 0.3],
  ['goldlamp', '금빛 가로등', '🏮', 900, 5, 'lamp', 1.0, 0.3, tintOf(0xe0b040, 'lamp_iron')],
  ['cherry', '벚나무', '🌸', 1200, 5, 'tree_2', 0.95, 0.6, { color: 0xf7a8c4, mode: 'green' }],
  ['willow', '버드나무', '🌳', 1500, 5, 'willow_1', 1.1, 0.6],
  ['hive', '꿀벌 통', '🐝', 1000, 6, 'beehive', 1.0, 0.5],
  ['bluepine', '푸른 전나무', '🌲', 1100, 6, 'pine_2', 1.0, 0.6, { color: 0x6fa8c8, mode: 'green' }],
  ['fruittree', '과일나무', '🍎', 2000, 6, 'fruit_tree', 1.0, 0.5],
  ['minisilo', '작은 사일로', '🏛️', 2500, 7, 'silo_single', 0.45, 0.55],
  ['minicoop', '장식 닭장', '🐔', 3000, 7, 'coop', 0.6, 0.8],
  ['goldwell', '금빛 우물', '⛲', 4000, 8, 'well', 0.8, 1.1, tintOf(0xf2c14e, 'barn_red', 'wood')],
  ['miniwindmill', '정원 풍차', '🌬️', 5000, 8, 'windmill', 0.45, 0.8],
].map(([id, name, icon, price, lv, model, scale, r, tint]) => ({ id, name, icon, price, lv, model, scale, r, cat: 'special', ...(tint ? { tint } : {}) }));
/** 오늘의 특별 상품에만 나오는 색 바꾼 소품 */
export const DECOR_LIMITED = [
  ['bench_pink', '분홍 벤치', '🪑', 900, 3, 'bench', 1.0, 0.7, tintOf(0xf5a3c0, 'wood')],
  ['lamp_mint', '민트 가로등', '💡', 1000, 3, 'lamp', 1.0, 0.3, tintOf(0x5fc9ad, 'lamp_iron')],
  ['planter_gold', '금빛 화분 상자', '🪴', 1200, 4, 'planter', 1.0, 0.45, tintOf(0xf2c14e, 'wood')],
  ['scarecrow_pink', '분홍 옷 허수아비', '🎃', 1400, 4, 'scarecrow', 1.0, 0.4, tintOf(0xf3a5c8, 'shirt', 'shirt2')],
  ['maple_red', '새빨간 단풍나무', '🍁', 1800, 5, 'autumn_1', 0.9, 0.6, { color: 0xe0452f, mode: 'all' }],
  ['birch_gold', '황금 자작나무', '🌿', 2200, 6, 'birch_1', 0.9, 0.6, { color: 0xf2c14e, mode: 'green' }],
].map(([id, name, icon, price, lv, model, scale, r, tint]) => ({ id, name, icon, price, lv, model, scale, r, cat: 'special', tint, limited: true }));
/** 꾸미기 창·불러오기에 쓰는 전체 목록 (DECOR 는 기본 20개 그대로 — 레벨 해금 카드 sim/unlocks.js 가 읽음) */
export const DECOR_ALL = [...DECOR, ...DECOR_PREMIUM, ...DECOR_LIMITED];
export const DECOR_BY_ID = Object.fromEntries(DECOR_ALL.map((d) => [d.id, d]));
export const DECOR_CATS = [['garden', '🌷 정원'], ['furniture', '🪑 가구'], ['props', '📦 소품'], ['special', '✨ 특별']];

/**
 * 소품 더하기 (계절 축제 소품 등, 다른 모듈이 불러오기 전에 등록) → 더한 정의, 잘못되면 null
 * def: { id, name, icon, price, lv, model, scale?, r?, cat?, tint?, limited? } — cat 이 새것이면 catLabel 로 탭을 더함
 */
export function registerDecor(def) {
  if (!def || typeof def.id !== 'string' || !/^[a-z0-9_]{2,32}$/.test(def.id) || DECOR_BY_ID[def.id]) return null;
  if (typeof def.name !== 'string' || !def.name || typeof def.model !== 'string' || !def.model) return null;
  const price = Math.max(0, Math.round(+def.price || 0)), lv = Math.max(1, Math.round(+def.lv || 1));
  const d = { id: def.id, name: def.name, icon: def.icon || '🎁', price, lv, model: def.model, scale: +def.scale > 0 ? +def.scale : 1, r: Math.max(0, +def.r || 0), cat: def.cat || 'special' };
  if (def.tint && Number.isFinite(+def.tint.color)) d.tint = Array.isArray(def.tint.mats) ? { color: +def.tint.color, mode: 'mats', mats: def.tint.mats.map(String) } : { color: +def.tint.color, mode: def.tint.mode === 'green' ? 'green' : 'all' };
  if (def.limited) d.limited = true;
  if (!DECOR_CATS.some(([c]) => c === d.cat)) DECOR_CATS.push([d.cat, def.catLabel || d.cat]);
  DECOR.push(d);
  DECOR_ALL.push(d);
  DECOR_BY_ID[d.id] = d;
  return d;
}

const ROTS = 8; // 45도씩 돌림

export class DecorSim {
  constructor() {
    this.placed = [];   // { id, x, z, rot(0~7) }
    this.stored = {};   // 치워 둔 것 { id: 개수 }
    this.spent = 0;
  }

  get count() { return this.placed.length; }
  storedOf(id) { return this.stored[id] || 0; }

  /** 놓을 수 없는 이유 (돈·레벨·개수, 자리 검사는 화면 쪽) */
  whyNot(id, { money = 0, level = 99 } = {}) {
    const d = DECOR_BY_ID[id];
    if (!d) return '없는 소품이에요';
    if (this.placed.length >= DECOR_MAX) return `꾸미기는 ${DECOR_MAX}개까지 놓을 수 있어요`;
    if (this.storedOf(id) > 0) return null; // 보관함에 있으면 무료
    if (d.limited) return '오늘의 특별 상품에서만 살 수 있어요';
    if (level < d.lv) return `Lv.${d.lv}부터 놓을 수 있어요`;
    if (money < d.price) return `코인이 ${d.price - money} 모자라요`;
    return null;
  }

  /** 놓기 → 든 비용 (보관함 것이면 0), 못 놓으면 -1 */
  place(id, x, z, rot, ctx) {
    if (this.whyNot(id, ctx)) return -1;
    if (!Number.isFinite(x) || !Number.isFinite(z)) return -1;
    let cost = 0;
    if (this.storedOf(id) > 0) this.stored[id]--;
    else { cost = DECOR_BY_ID[id].price; this.spent += cost; }
    this.placed.push({ id, x: round(x), z: round(z), rot: ((rot | 0) % ROTS + ROTS) % ROTS });
    return cost;
  }

  /** 오늘의 특별 상품처럼 사서 보관함에 넣기 → 든 비용 (못 사면 0). 놓을 때는 무료 */
  whyNotBuy(id, { money = 0, level = 99 } = {}) {
    const d = DECOR_BY_ID[id];
    if (!d) return '없는 소품이에요';
    if (this.storedOf(id) >= 99) return '보관함이 가득 찼어요';
    if (level < d.lv) return `Lv.${d.lv}부터 살 수 있어요`;
    if (money < d.price) return `코인이 ${d.price - money} 모자라요`;
    return null;
  }
  buyToStore(id, ctx) {
    if (this.whyNotBuy(id, ctx)) return 0;
    this.stored[id] = this.storedOf(id) + 1;
    this.spent += DECOR_BY_ID[id].price;
    return DECOR_BY_ID[id].price;
  }

  /** 치우기 (보관함으로) */
  pickUp(i) {
    const p = this.placed[i];
    if (!p) return null;
    this.placed.splice(i, 1);
    this.stored[p.id] = this.storedOf(p.id) + 1;
    return p;
  }

  /** 옮기기: 치운 뒤 바로 새 자리에 (돈 안 듦) */
  move(i, x, z, rot) {
    const p = this.pickUp(i);
    if (!p) return false;
    return this.place(p.id, x, z, rot ?? p.rot, { money: 0, level: 99 }) === 0;
  }

  /** (x,z) 에서 가장 가까운 놓인 소품 번호 (maxD 안, 없으면 -1) */
  nearest(x, z, maxD = 1.6) {
    let best = -1, bd = maxD;
    this.placed.forEach((p, i) => { const d = Math.hypot(p.x - x, p.z - z); if (d < bd) { bd = d; best = i; } });
    return best;
  }

  toJSON() { return { placed: this.placed, stored: this.stored, spent: this.spent }; }
  load(d) {
    if (!d) return;
    this.placed = (Array.isArray(d.placed) ? d.placed : [])
      .filter((p) => p && DECOR_BY_ID[p.id] && Number.isFinite(+p.x) && Number.isFinite(+p.z) && Math.abs(p.x) < 60 && Math.abs(p.z) < 60)
      .slice(0, DECOR_MAX)
      .map((p) => ({ id: p.id, x: round(+p.x), z: round(+p.z), rot: ((p.rot | 0) % ROTS + ROTS) % ROTS }));
    this.stored = {};
    for (const [k, v] of Object.entries(d.stored || {})) if (DECOR_BY_ID[k] && (v | 0) > 0) this.stored[k] = Math.min(99, v | 0);
    this.spent = Math.max(0, d.spent | 0);
  }
}

const round = (v) => Math.round(v * 100) / 100;

/** 보호 구역(사각형 [x0,z0,x1,z1] · 원 {x,z,r}) 밖인가 — 소품 반지름 r 만큼 여유 */
export function outsideZones(x, z, r, zones) {
  for (const zn of zones) {
    if (Array.isArray(zn)) { const [x0, z0, x1, z1] = zn; if (x > x0 - r && x < x1 + r && z > z0 - r && z < z1 + r) return false; }
    else if (Math.hypot(x - zn.x, z - zn.z) < zn.r + r) return false;
  }
  return true;
}

/** 놓을 자리: 앞쪽 거리만큼, 0.5m 격자에 맞춤 */
export function snapAhead(x, z, facing, dist = 2.2, grid = 0.5) {
  const sx = x + Math.sin(facing) * dist, sz = z + Math.cos(facing) * dist;
  return { x: Math.round(sx / grid) * grid, z: Math.round(sz / grid) * grid };
}
