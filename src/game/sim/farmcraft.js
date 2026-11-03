import { CROPS, PRODUCTS } from './crops.js';
import { ITEMS } from './items.js';

/**
 * 밭농사 확장 규칙 (렌더링 무관, 테스트: tests/farmcraft.test.js)
 *  - 퇴비통: 잡초·작물을 넣으면 시간이 지나 퇴비가 됨
 *  - 장독대 가공: 작물 → 김치·잼·주스 같은 가공품 (값이 더 비쌈, 6차 산업)
 *  - 로컬푸드 직매장 주문서: 날마다 바뀌는 납품 주문 3건
 */

// ---------------------------------------------------------------- 퇴비
export const COMPOST_PER = 3;     // 재료 3개 = 퇴비 1개
export const COMPOST_TIME = 40;   // 퇴비 1개 숙성 시간(초)
export const COMPOST_MAX = 12;    // 한 번에 넣을 수 있는 재료

export class Composter {
  constructor() { this.mats = 0; this.t = 0; this.ready = 0; }
  /** 재료 넣기 → 실제로 넣은 개수 */
  add(n) { const k = Math.max(0, Math.min(n, COMPOST_MAX - this.mats)); this.mats += k; return k; }
  get brewing() { return this.mats >= COMPOST_PER; }
  /** 남은 숙성 비율 0..1 */
  get progress() { return this.brewing ? this.t / COMPOST_TIME : 0; }
  tick(dt) {
    if (!this.brewing) { this.t = 0; return 0; }
    this.t += dt;
    let made = 0;
    while (this.t >= COMPOST_TIME && this.mats >= COMPOST_PER) { this.t -= COMPOST_TIME; this.mats -= COMPOST_PER; this.ready++; made++; }
    return made;
  }
  take() { const n = this.ready; this.ready = 0; return n; }
  toJSON() { return { mats: this.mats, t: this.t, ready: this.ready }; }
  load(d) { if (d) Object.assign(this, { mats: d.mats | 0, t: +d.t || 0, ready: d.ready | 0 }); }
}

// ---------------------------------------------------------------- 가공 (장독대)
/** 가공 레시피: 재료 → 가공품(ITEMS), 시간(초), 필요 밭농사 레벨 */
export const RECIPES = {
  goods_carrotjuice: { input: { carrot: 4 }, time: 60, level: 1 },
  goods_kimchi: { input: { cabbage: 3 }, time: 120, level: 1 },
  goods_juice: { input: { tomato: 3 }, time: 80, level: 2 },
  goods_jam: { input: { strawberry: 3 }, time: 100, level: 3 },
  goods_corntea: { input: { corn: 3 }, time: 140, level: 4 },
  goods_honeyjam: { input: { strawberry: 2, honey: 1 }, time: 120, level: 5 },
};
export const JAR_PRICES = [0, 0, 500, 1200]; // 장독 1·2개는 기본, 3·4번째 구매
export const MAX_JARS = 4;

/** 목장 가공소(치즈 공방) 레시피: 목장 숙련도로 해금 */
export const RANCH_RECIPES = {
  goods_cheese: { input: { milk: 2 }, time: 100, level: 1 },
  goods_yarn: { input: { wool: 2 }, time: 90, level: 1 },
  goods_castella: { input: { egg: 3, honey: 1 }, time: 120, level: 2 },
  goods_yogurt: { input: { milk: 1, strawberry: 1 }, time: 70, level: 2 },
  goods_butter: { input: { milk: 3 }, time: 130, level: 3 },
  goods_scarf: { input: { goods_yarn: 2 }, time: 150, level: 4 },
};
export const WORKSHOP_PRICES = [0, 0, 700, 1600];

/** 숙성 슬롯 가공기 (장독대·치즈 공방 공통) */
export class Processor {
  constructor({ recipes = RECIPES, prices = JAR_PRICES, jars = 2 } = {}) {
    this.recipes = recipes; this.prices = prices;
    this.jars = jars; this.slots = Array.from({ length: MAX_JARS }, () => null);
  }
  /** 재료가 충분한가 (economy.count) — 장독대 레시피 기준 (호환) */
  static canMake(id, count, recipes = RECIPES) { return Object.entries(recipes[id].input).every(([k, n]) => count(k) >= n); }
  canMake(id, count) { return Processor.canMake(id, count, this.recipes); }
  freeSlot() { for (let i = 0; i < this.jars; i++) if (!this.slots[i]) return i; return -1; }
  /** 담그기 (재료는 호출 쪽에서 차감) */
  start(i, id) { if (i < 0 || i >= this.jars || this.slots[i]) return false; this.slots[i] = { id, t: 0 }; return true; }
  tick(dt) {
    const done = [];
    this.slots.forEach((s, i) => { if (s && s.t < this.recipes[s.id].time) { s.t += dt; if (s.t >= this.recipes[s.id].time) done.push(i); } });
    return done;
  }
  isDone(i) { const s = this.slots[i]; return !!s && s.t >= this.recipes[s.id].time; }
  /** 다 된 가공품 꺼내기 → 아이템 id */
  collect(i) { if (!this.isDone(i)) return null; const id = this.slots[i].id; this.slots[i] = null; return id; }
  buyJar() { if (this.jars >= MAX_JARS) return false; this.jars++; return true; }
  get nextJarPrice() { return this.jars < MAX_JARS ? this.prices[this.jars] : null; }
  toJSON() { return { jars: this.jars, slots: this.slots }; }
  load(d) { if (!d) return; this.jars = Math.min(MAX_JARS, d.jars || 2); (d.slots || []).forEach((s, i) => { if (i < MAX_JARS) this.slots[i] = s && this.recipes[s.id] ? s : null; }); }
}

// ---------------------------------------------------------------- 주문서
const nameOf = (k) => (CROPS[k] || PRODUCTS[k] || ITEMS[k])?.name || k;
const priceOf = (k) => (CROPS[k] || PRODUCTS[k])?.basePrice ?? ITEMS[k]?.price ?? 0;
export const ORDER_ALL_BONUS = 150;

/**
 * 오늘의 주문 3건 (날짜·레벨로 정해짐 → 다시 열어도 같은 주문)
 * @param farmLevel 밭농사 레벨(가공품 주문은 만들 수 있는 것만)
 */
export function dailyOrders(day, playerLevel = 1, farmLevel = 1) {
  let h = ((day + 17) * 2654435761) >>> 0;
  const rnd = () => { h ^= h << 13; h >>>= 0; h ^= h >>> 17; h ^= h << 5; h >>>= 0; return h / 4294967296; };
  const crops = Object.keys(CROPS).filter((k) => CROPS[k].unlockLevel <= playerLevel);
  const goods = Object.keys(RECIPES).filter((k) => RECIPES[k].level <= farmLevel && Object.keys(RECIPES[k].input).every((c) => !CROPS[c] || CROPS[c].unlockLevel <= playerLevel));
  const kinds = [
    () => { const k = crops[Math.floor(rnd() * crops.length)]; return { item: k, n: 4 + Math.floor(rnd() * 5) }; },
    () => { const k = ['egg', 'milk', 'egg', 'honey'][Math.floor(rnd() * 4)]; return { item: k, n: 2 + Math.floor(rnd() * 3) }; },
    () => (goods.length ? { item: goods[Math.floor(rnd() * goods.length)], n: 1 + Math.floor(rnd() * 2) } : { item: crops[0], n: 6 }),
  ];
  const shops = ['🏫 학교 급식실', '🍽️ 마을 식당', '🏪 로컬푸드 직매장', '🏥 요양원', '🎪 주말 장터', '☕ 농장 카페'];
  const out = [];
  for (let i = 0; i < 3; i++) {
    let o = kinds[i]();
    if (out.some((x) => x.item === o.item)) o = { item: crops[(crops.indexOf(o.item) + 1) % crops.length] || crops[0], n: o.n + 2 };
    const reward = Math.round((priceOf(o.item) * o.n * 1.5 + 40) / 10) * 10;
    out.push({ ...o, name: nameOf(o.item), reward, from: shops[Math.floor(rnd() * shops.length)], xp: 10 + o.n * 3 });
  }
  return out;
}

export class Orders {
  constructor() { this.day = 0; this.done = [false, false, false]; this.bonus = false; this.count = 0; }
  /** 오늘 주문 (날이 바뀌면 진행 초기화) */
  today(day, playerLevel, farmLevel) {
    if (this.day !== day) { this.day = day; this.done = [false, false, false]; this.bonus = false; }
    return dailyOrders(day, playerLevel, farmLevel).map((o, i) => ({ ...o, done: this.done[i] }));
  }
  /** 납품: take(item, n) 가 true 면 완료. @returns { reward, xp, allBonus } | null */
  deliver(i, day, playerLevel, farmLevel, take) {
    const list = this.today(day, playerLevel, farmLevel), o = list[i];
    if (!o || o.done || !take(o.item, o.n)) return null;
    this.done[i] = true;
    this.count++;
    let allBonus = 0;
    if (!this.bonus && this.done.every(Boolean)) { this.bonus = true; allBonus = ORDER_ALL_BONUS; }
    return { reward: o.reward, xp: o.xp, allBonus };
  }
  toJSON() { return { day: this.day, done: this.done, bonus: this.bonus, count: this.count }; }
  load(d) { if (d) Object.assign(this, { day: d.day | 0, done: d.done || [false, false, false], bonus: !!d.bonus, count: d.count | 0 }); }
}
