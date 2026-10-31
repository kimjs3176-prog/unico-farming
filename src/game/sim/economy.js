import { CROPS, PRODUCTS, FEED_PRICE } from './crops.js';

/** 간단한 농산물 경제: 시세 랜덤워크 + 수요 이벤트, 인벤토리, 구매/판매 */
export class Economy {
  constructor(rng = Math.random) {
    this.rng = rng;
    this.money = 150;
    this.inventory = { seeds: { carrot: 3 }, crops: {}, products: {}, feed: 2 };
    this.prices = {};
    this.event = null; // { item, mult, name }
    for (const k of Object.keys(CROPS)) this.prices[k] = { mult: 1, trend: 0 };
    for (const k of Object.keys(PRODUCTS)) this.prices[k] = { mult: 1, trend: 0 };
    this.stats = { earned: 0, spent: 0, sold: 0 };
  }

  basePrice(item) { return (CROPS[item] || PRODUCTS[item]).basePrice; }

  sellPrice(item) {
    const p = this.prices[item];
    const ev = this.event?.item === item ? this.event.mult : 1;
    return Math.max(1, Math.round(this.basePrice(item) * p.mult * ev));
  }

  seedPrice(crop) { return CROPS[crop].seedPrice; }

  /** 새 날: 시세 변동 (±18%, 0.55~1.7 범위) + 30% 확률 수요 이벤트 */
  newDay() {
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

  useFeed() {
    if (this.inventory.feed <= 0) return false;
    this.inventory.feed--;
    return true;
  }

  addCrop(crop, n) { this.inventory.crops[crop] = (this.inventory.crops[crop] || 0) + n; }
  addProduct(p, n = 1) { this.inventory.products[p] = (this.inventory.products[p] || 0) + n; }

  /** 작물/생산물 판매, 판매액 반환 */
  sell(item, n = 1) {
    const bag = CROPS[item] ? this.inventory.crops : this.inventory.products;
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
    return total;
  }

  earn(n) { this.money += n; this.stats.earned += n; }

  toJSON() { return { money: this.money, inventory: this.inventory, prices: this.prices, event: this.event, stats: this.stats }; }
  load(d) {
    if (!d) return;
    this.money = d.money ?? this.money;
    this.inventory = { seeds: {}, crops: {}, products: {}, feed: 0, ...d.inventory };
    if (d.prices) for (const k of Object.keys(this.prices)) if (d.prices[k]) this.prices[k] = d.prices[k];
    this.event = d.event || null;
    this.stats = { ...this.stats, ...d.stats };
  }
}
