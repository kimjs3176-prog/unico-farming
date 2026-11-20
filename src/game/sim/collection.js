import { ITEMS, itemsOf } from './items.js';
import { CROPS } from './crops.js';

/** 도감: 처음 잡은 날, 개수, 최대 크기. 카테고리 완성 보상 */
// 도트 판은 BOOK_CATS 로 도감 탭을 만듦 → 이 세 칸은 그대로 (출하 탭은 3D 판만 BOOK_CATS_3D)
export const BOOK_CATS = ['fish', 'bug', 'fruit'];
/** 출하 도감: 작물 · 쌀 ★1~★5 · 가공품 · 특별 생산물 (팔거나 납품하면 채워짐) */
export const SHIP_IDS = [
  ...Object.keys(CROPS),
  'rice_1', 'rice_2', 'rice_3', 'rice_4', 'rice_5',
  ...Object.keys(ITEMS).filter((k) => k.startsWith('goods_')),
  'egg_gold', 'milk_gold', 'wool_gold',
];
const SHIP_SET = new Set(SHIP_IDS);
export const BOOK_CATS_3D = [...BOOK_CATS, 'ship'];
export const COMPLETE_REWARD = { fish: 2500, bug: 1200, fruit: 300, ship: 2000 }; // 종류가 늘어난 만큼 완성 보상도 ↑

/** 이정표: 탭마다 5종을 채울 때마다 작은 선물 (미끼·퇴비 + 꾸미기 소품) */
export const MILESTONE_EVERY = 5;
// 과일(4종)은 5종에 못 미쳐 이정표 없이 완성 보상만
const MILESTONE_ITEM = { fish: 'bait', bug: 'compost', ship: 'compost' };
const MILESTONE_DECOR = {
  fish: ['bucket', 'barrel', 'lamp', 'well', 'bench'],
  bug: ['flowerbed', 'planter', 'berrybush'],
  ship: ['crate', 'sack', 'hay', 'cart', 'scarecrow'],
};

/** 탭에 든 아이템 열쇠 목록 */
export const listOf = (cat) => (cat === 'ship' ? SHIP_IDS : itemsOf(cat));
/** 출하 도감에 드는 열쇠인가 */
export const isShip = (id) => SHIP_SET.has(id);

/** n 번째(5·10·15…) 이정표 선물: 홀수 번째는 소모품, 짝수 번째는 꾸미기 소품 */
export function milestoneReward(cat, at) {
  const i = Math.round(at / MILESTONE_EVERY); // 1, 2, 3…
  const decor = MILESTONE_DECOR[cat] || [];
  if (i % 2 === 0 && decor.length) return { decor: decor[(i / 2 - 1) % decor.length] };
  return { item: { [MILESTONE_ITEM[cat] || 'compost']: 3 + 2 * i } };
}

export class Collection {
  constructor() { this.entries = {}; this.rewarded = {}; }

  /** @returns { isNew, isRecord } */
  add(id, { size = null, day = 1 } = {}) {
    if (!ITEMS[id] && !SHIP_SET.has(id)) return { isNew: false };
    const e = this.entries[id];
    if (!e) { this.entries[id] = { count: 1, best: size, day }; return { isNew: true, isRecord: false }; }
    e.count++;
    const isRecord = size !== null && (e.best === null || size > e.best);
    if (isRecord) e.best = size;
    return { isNew: false, isRecord };
  }

  /** 출하 기록: 팔거나 납품한 개수 (출하 도감 열쇠만) */
  ship(id, n = 1, { day = 1 } = {}) {
    n = Math.floor(n);
    if (!SHIP_SET.has(id) || !(n > 0)) return { isNew: false };
    const e = this.entries[id];
    if (!e) { this.entries[id] = { count: n, best: null, day }; return { isNew: true }; }
    e.count += n;
    return { isNew: false };
  }

  has(id) { return !!this.entries[id]; }
  progress(cat) { const all = listOf(cat); return { got: all.filter((k) => this.entries[k]).length, total: all.length }; }
  /** 자연 도감(물고기·곤충·과일)에 등록한 종 수 — 퀘스트 '도감 N종' 기준 (출하는 빼고) */
  natureCount() { return BOOK_CATS.reduce((a, c) => a + this.progress(c).got, 0); }

  /** 다음 이정표: { at, left } (없으면 null) */
  nextMilestone(cat) {
    const { got, total } = this.progress(cat);
    for (let at = MILESTONE_EVERY; at < total; at += MILESTONE_EVERY) if (!this.rewarded[`${cat}@${at}`]) return { at, left: Math.max(0, at - got) };
    return null;
  }

  /** 새로 지난 이정표 선물 받기 (한 번씩, rewarded['fish@10']) */
  claimMilestones(cats = BOOK_CATS_3D) {
    const out = [];
    for (const c of cats) {
      const { got, total } = this.progress(c);
      for (let at = MILESTONE_EVERY; at <= got && at < total; at += MILESTONE_EVERY) {
        const k = `${c}@${at}`;
        if (this.rewarded[k]) continue;
        this.rewarded[k] = true;
        out.push({ cat: c, at, ...milestoneReward(c, at) });
      }
    }
    return out;
  }

  /** 새로 완성된 카테고리 보상 수령 (기본은 도트 판과 같은 세 탭, 빈 탭은 완성으로 치지 않음) */
  claimCompletions(cats = BOOK_CATS) {
    const out = [];
    for (const c of cats) {
      const { got, total } = this.progress(c);
      if (total > 0 && got === total && !this.rewarded[c]) { this.rewarded[c] = true; out.push({ cat: c, money: COMPLETE_REWARD[c] || 0 }); }
    }
    return out;
  }

  /** 다 채운 탭 (집 트로피 선반) */
  completed(cats = BOOK_CATS_3D) { return cats.filter((c) => { const p = this.progress(c); return p.total > 0 && p.got === p.total; }); }

  toJSON() { return { entries: this.entries, rewarded: this.rewarded }; }
  load(d) { if (d) { this.entries = d.entries || {}; this.rewarded = d.rewarded || {}; } }
}
