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
export const DECOR_BY_ID = Object.fromEntries(DECOR.map((d) => [d.id, d]));
export const DECOR_CATS = [['garden', '🌷 정원'], ['furniture', '🪑 가구'], ['props', '📦 소품']];

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
