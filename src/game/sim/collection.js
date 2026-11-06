import { ITEMS, itemsOf } from './items.js';

/** 도감: 처음 잡은 날, 개수, 최대 크기. 카테고리 완성 보상 */
export const BOOK_CATS = ['fish', 'bug', 'fruit'];
export const COMPLETE_REWARD = { fish: 2500, bug: 1200, fruit: 300 }; // 종류가 늘어난 만큼 완성 보상도 ↑

export class Collection {
  constructor() { this.entries = {}; this.rewarded = {}; }

  /** @returns { isNew, isRecord } */
  add(id, { size = null, day = 1 } = {}) {
    if (!ITEMS[id]) return { isNew: false };
    const e = this.entries[id];
    if (!e) { this.entries[id] = { count: 1, best: size, day }; return { isNew: true, isRecord: false }; }
    e.count++;
    const isRecord = size !== null && (e.best === null || size > e.best);
    if (isRecord) e.best = size;
    return { isNew: false, isRecord };
  }

  has(id) { return !!this.entries[id]; }
  progress(cat) { const all = itemsOf(cat); return { got: all.filter((k) => this.entries[k]).length, total: all.length }; }

  /** 새로 완성된 카테고리 보상 수령 */
  claimCompletions() {
    const out = [];
    for (const c of BOOK_CATS) {
      const { got, total } = this.progress(c);
      if (got === total && !this.rewarded[c]) { this.rewarded[c] = true; out.push({ cat: c, money: COMPLETE_REWARD[c] }); }
    }
    return out;
  }

  toJSON() { return { entries: this.entries, rewarded: this.rewarded }; }
  load(d) { if (d) { this.entries = d.entries || {}; this.rewarded = d.rewarded || {}; } }
}
