import { CROPS, PRODUCTS, FEED_PRICE } from './crops.js';
import { ITEMS, RICE_GRADE_MULT } from './items.js';

/** 수확 축제: 이 날짜마다, 이 배수 */
export const FESTIVAL_EVERY = 7, FESTIVAL_MULT = 1.3;

/** 간단한 농산물 경제: 시세 랜덤워크 + 수요 이벤트, 인벤토리, 구매/판매 */
export class Economy {
  constructor(rng = Math.random) {
    this.rng = rng;
    this.money = 150;
    this.inventory = { seeds: { carrot: 3 }, crops: {}, products: {}, feed: 2, items: { rice_seed: 2 } };
    this.prices = {};
    this.event = null; // { item, mult, name }
    for (const k of Object.keys(CROPS)) this.prices[k] = { mult: 1, trend: 0 };
    for (const k of Object.keys(PRODUCTS)) this.prices[k] = { mult: 1, trend: 0 };
    this.stats = { earned: 0, spent: 0, sold: 0 };
    this.sellMult = 1; // 마을 건물 (직판장) 판매가 배수
    this.festival = null; // 7일마다 열리는 수확 축제 { name, mult }
    this.bonus = () => 1; // 코스튬 혜택 배율 (main 에서 연결)
    this.seasonMult = () => 1; // 제철 작물 판매가 배율 (main 에서 연결)
  }

  basePrice(item) {
    if (CROPS[item] || PRODUCTS[item]) return (CROPS[item] || PRODUCTS[item]).basePrice;
    const it = ITEMS[item];
    if (!it) return 0;
    if (item.startsWith('rice_') && item !== 'rice_seed') return Math.round(it.price * RICE_GRADE_MULT[+item.slice(5)]);
    return it.price;
  }

  /** 아이템이 들어있는 가방 칸 */
  bagOf(item) { return CROPS[item] ? this.inventory.crops : PRODUCTS[item] ? this.inventory.products : this.inventory.items; }
  count(item) { return this.bagOf(item)[item] || 0; }

  sellPrice(item) {
    const p = this.prices[item];
    if (!p) return Math.max(1, Math.round(this.basePrice(item) * (ITEMS[item]?.cat === 'seed' ? 0.5 : this.sellMult)));
    const ev = this.event?.item === item ? this.event.mult : 1;
    const fest = this.festival?.mult || 1; // 축제 날: 작물·생산물 모두
    const perk = CROPS[item] ? this.bonus('sell_crop') * this.seasonMult(item) : 1; // 코스튬 혜택 (농부 멜빵바지) · 제철 작물
    return Math.max(1, Math.round(this.basePrice(item) * p.mult * ev * fest * this.sellMult * perk));
  }

  seedPrice(crop) { return CROPS[crop].seedPrice; }

  /** 축제 날인가 (7일차·14일차…) */
  static isFestival(day) { return day > 0 && day % FESTIVAL_EVERY === 0; }

  /** 새 날: 시세 변동 (±18%, 0.55~1.7 범위) + 30% 확률 수요 이벤트, 7일마다 수확 축제(작물·생산물 1.3배) */
  newDay(day = 0) {
    this.festival = Economy.isFestival(day) ? { name: `🎉 유니코 수확 축제! 오늘은 모든 농산물·생산물 ${FESTIVAL_MULT}배`, mult: FESTIVAL_MULT } : null;
    for (const [k, p] of Object.entries(this.prices)) {
      const prev = p.mult;
      p.mult = Math.min(1.7, Math.max(0.55, p.mult * (1 + (this.rng() - 0.5) * 0.36)));
      p.trend = Math.sign(p.mult - prev);
    }
    this.event = null;
    if (this.rng() < 0.3) {
      const items = [...Object.keys(CROPS), ...Object.keys(PRODUCTS)];
      const item = items[Math.floor(this.rng() * items.length)];
      const name = (CROPS[item] || PRODUCTS[item]).name;
      this.event = { item, mult: 2, name: `${name} 수요 급증! 오늘 2배 가격` };
    }
    return this.event;
  }

  buySeed(crop, n = 1) {
    const cost = this.seedPrice(crop) * n;
    if (this.money < cost) return false;
    this.money -= cost;
    this.stats.spent += cost;
    this.inventory.seeds[crop] = (this.inventory.seeds[crop] || 0) + n;
    return true;
  }

  buyFeed(n = 1) {
    const cost = FEED_PRICE * n;
    if (this.money < cost) return false;
    this.money -= cost;
    this.stats.spent += cost;
    this.inventory.feed += n;
    return true;
  }

  useSeed(crop) {
    if (!this.inventory.seeds[crop]) return false;
    this.inventory.seeds[crop]--;
    return true;
  }

  /** 볍씨 등 ITEMS 구매 */
  buyItem(id, n = 1) {
    const cost = ITEMS[id].price * n;
    if (this.money < cost) return false;
    this.money -= cost;
    this.stats.spent += cost;
    this.addItem(id, n);
    return true;
  }

  addItem(id, n = 1) { this.inventory.items[id] = (this.inventory.items[id] || 0) + n; }
  useItem(id, n = 1) {
    if ((this.inventory.items[id] || 0) < n) return false;
    this.inventory.items[id] -= n;
    return true;
  }
  /** 선물/부탁용: 어느 칸이든 n개 꺼내기 */
  take(item, n = 1) {
    const bag = this.bagOf(item);
    if ((bag[item] || 0) < n) return false;
    bag[item] -= n;
    return true;
  }

  useFeed() {
    if (this.inventory.feed <= 0) return false;
    this.inventory.feed--;
    return true;
  }

  addCrop(crop, n) { this.inventory.crops[crop] = (this.inventory.crops[crop] || 0) + n; }
  addProduct(p, n = 1) { this.inventory.products[p] = (this.inventory.products[p] || 0) + n; }

  /** 작물/생산물 판매, 판매액 반환 */
  sell(item, n = 1) {
    const bag = this.bagOf(item);
    const have = bag[item] || 0;
    n = Math.min(n, have);
    if (n <= 0) return 0;
    const total = this.sellPrice(item) * n;
    bag[item] = have - n;
    this.money += total;
    this.stats.earned += total;
    this.stats.sold += n;
    return total;
  }

  sellAll() {
    let total = 0;
    for (const k of Object.keys(this.inventory.crops)) total += this.sell(k, this.inventory.crops[k]);
    for (const k of Object.keys(this.inventory.products)) total += this.sell(k, this.inventory.products[k]);
    for (const k of Object.keys(this.inventory.items)) if (ITEMS[k]?.cat !== 'seed' && k !== 'paddy') total += this.sell(k, this.inventory.items[k]);
    return total;
  }

  earn(n) { this.money += n; this.stats.earned += n; }

  toJSON() { return { money: this.money, inventory: this.inventory, prices: this.prices, event: this.event, festival: this.festival, stats: this.stats }; }
  load(d) {
    if (!d) return;
    this.money = d.money ?? this.money;
    this.inventory = { seeds: {}, crops: {}, products: {}, feed: 0, items: {}, ...d.inventory };
    if (d.prices) for (const k of Object.keys(this.prices)) if (d.prices[k]) this.prices[k] = d.prices[k];
    this.event = d.event || null;
    this.festival = d.festival || null;
    this.stats = { ...this.stats, ...d.stats };
  }
}
