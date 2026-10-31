import { PRODUCTS } from './crops.js';

/** 목장 동물: 사료를 주면 일정 시간 후 생산물 */
export class RanchSim {
  constructor(animals) {
    // animals: [{type}]
    this.animals = animals.map((a, i) => ({ id: i, type: a.type, fedTimer: 0, product: null, happiness: 0.5 }));
  }

  productOf(type) { return Object.keys(PRODUCTS).find((k) => PRODUCTS[k].from === type); }

  actionFor(a) {
    if (a.product) return { type: 'collect', label: `${PRODUCTS[a.product].name} 수확` };
    if (a.fedTimer > 0) return { type: 'wait', label: `생산 중 ${Math.ceil(a.fedTimer)}초` };
    return { type: 'feed', label: '사료 주기' };
  }

  feed(a) {
    if (a.product || a.fedTimer > 0) return false;
    a.fedTimer = PRODUCTS[this.productOf(a.type)].time;
    a.happiness = Math.min(1, a.happiness + 0.2);
    return true;
  }

  collect(a) {
    if (!a.product) return null;
    const p = a.product;
    a.product = null;
    return p;
  }

  tick(dt) {
    const ready = [];
    for (const a of this.animals) {
      if (a.fedTimer > 0) {
        a.fedTimer -= dt;
        if (a.fedTimer <= 0) { a.fedTimer = 0; a.product = this.productOf(a.type); ready.push(a); }
      }
      a.happiness = Math.max(0, a.happiness - dt / 600);
    }
    return ready;
  }

  toJSON() { return { animals: this.animals.map((a) => ({ fedTimer: a.fedTimer, product: a.product, happiness: a.happiness })) }; }
  load(d) { d?.animals?.forEach((s, i) => { if (this.animals[i]) Object.assign(this.animals[i], s); }); }
}
