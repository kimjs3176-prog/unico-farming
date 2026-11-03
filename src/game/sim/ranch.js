import { PRODUCTS } from './crops.js';

/**
 * 목장 동물 (렌더링 무관, 테스트: tests/sim.test.js · tests/ranch.test.js)
 *  - 사료를 주면 일정 시간 뒤 생산물 (자동 급이기 여물통에 사료가 있으면 알아서 먹음)
 *  - 애정도(0~100, 하트 5개): 하루 한 번 쓰다듬기·빗질, 사료 주기로 오르고 하루 종일 돌보지 않으면 내려감
 *    하트가 많을수록 생산이 빠르고, 하트 3개부터 생산물 2개, 하트 4개부터 가끔 특별한 생산물(황금 달걀 등)
 *  - 새끼 가축(송아지·어린 양·병아리)을 들이면 시간이 지나 어른이 됨. 축사 크기만큼만 키울 수 있음
 *  - 목장 숙련도: 수확·돌보기·가공으로 오름
 */
export const GROW_TIME = 240;          // 새끼 → 어른 (초)
export const RANCH_LEVELS = [0, 40, 120, 260, 480, 800, 1250];
/** 특별한 생산물 (ITEMS) */
export const GOLD_OF = { egg: 'egg_gold', milk: 'milk_gold', wool: 'wool_gold' };
/** 가축 상점: 새끼 가격 */
export const ANIMAL_PRICES = { cow: 900, sheep: 650, chicken: 220 };
/** 축사 단계별 수용 수: big = 소+양, small = 닭 */
export const BARN = [{ big: 6, small: 6, price: 0 }, { big: 9, small: 9, price: 1500 }, { big: 12, small: 12, price: 3500 }];
export const TROUGH_MAX = 20;
const NAMES = {
  cow: ['얼룩이', '음메', '바둑이', '초코', '우유', '방울', '누렁이', '구름', '콩떡', '모카', '점박이', '뭉치'],
  sheep: ['몽실이', '솜사탕', '뭉게', '양순이', '보송', '푸딩', '마시멜로', '둥실', '포근이', '하양', '구름빵', '뽀송'],
  chicken: ['꼬꼬', '삐약이', '콕콕', '노랑이', '꼬순이', '병아', '달걀이', '깃털', '포포', '꼬미', '짹짹', '모이'],
};

export class RanchSim {
  constructor(animals, rng = Math.random) {
    this.rng = rng;
    this.nextId = 0;
    this.animals = [];
    for (const a of animals) this._add(a.type, { baby: false });
    this.barn = 0;      // 축사 단계
    this.trough = 0;    // 자동 급이기 여물통 사료
    this.xp = 0;        // 목장 숙련도
  }

  _add(type, { baby = false, name } = {}) {
    const used = new Set(this.animals.map((a) => a.name));
    const pool = NAMES[type] || ['동물'];
    const nm = name || pool.find((n) => !used.has(n)) || `${pool[0]}${this.animals.length + 1}`;
    const a = { id: this.nextId++, type, name: nm, fedTimer: 0, product: null, happiness: 0.5, aff: 10, lastPet: 0, lastBrush: 0, lastFed: 0, age: baby ? 0 : GROW_TIME };
    this.animals.push(a);
    return a;
  }

  productOf(type) { return Object.keys(PRODUCTS).find((k) => PRODUCTS[k].from === type); }
  hearts(a) { return Math.min(5, Math.floor(a.aff / 20)); }
  isBaby(a) { return a.age < GROW_TIME; }
  growth(a) { return Math.min(1, a.age / GROW_TIME); }
  get level() { let lv = 1; for (let i = 1; i < RANCH_LEVELS.length; i++) if (this.xp >= RANCH_LEVELS[i]) lv = i + 1; return lv; }
  get nextXp() { return RANCH_LEVELS[Math.min(this.level, RANCH_LEVELS.length - 1)]; }

  /** 축사 남은 자리 */
  room(type) {
    const cap = BARN[this.barn];
    const small = type === 'chicken';
    const n = this.animals.filter((a) => (a.type === 'chicken') === small).length;
    return (small ? cap.small : cap.big) - n;
  }

  /** 새끼 가축 들이기 (돈은 호출 쪽에서) */
  buy(type) { if (!ANIMAL_PRICES[type] || this.room(type) <= 0) return null; return this._add(type, { baby: true }); }
  upgradeBarn() { if (this.barn >= BARN.length - 1) return false; this.barn++; return true; }
  rename(a, name) { const n = String(name || '').trim().slice(0, 8); if (!n) return false; a.name = n; return true; }

  _gain(a, n) { const before = this.hearts(a); a.aff = Math.max(0, Math.min(100, a.aff + n)); return this.hearts(a) > before; }

  actionFor(a, day = 0) {
    if (this.isBaby(a)) return a.lastPet === day ? { type: 'wait', label: `아기 ${Math.floor(this.growth(a) * 100)}% 자람` } : { type: 'pet', label: '아기 쓰다듬기' };
    if (a.product) return { type: 'collect', label: `${PRODUCTS[a.product].name} 수확` };
    if (a.fedTimer <= 0) return { type: 'feed', label: '사료 주기' };
    if (a.lastBrush !== day) return { type: 'brush', label: '빗질해 주기' };
    if (a.lastPet !== day) return { type: 'pet', label: '쓰다듬기' };
    return { type: 'wait', label: `생산 중 ${Math.ceil(a.fedTimer)}초` };
  }

  feed(a, day = 0) {
    if (this.isBaby(a) || a.product || a.fedTimer > 0) return false;
    a.fedTimer = PRODUCTS[this.productOf(a.type)].time;
    a.happiness = Math.min(1, a.happiness + 0.2);
    a.lastFed = day;
    this._gain(a, 2);
    return true;
  }

  /** 쓰다듬기: 하루 한 번 애정 +6 (아기는 +8, 빨리 자람) */
  pet(a, day = 0) {
    if (a.lastPet === day) return null;
    a.lastPet = day;
    const baby = this.isBaby(a);
    if (baby) a.age = Math.min(GROW_TIME, a.age + 20);
    this.xp += 2;
    return { heartUp: this._gain(a, baby ? 8 : 6), hearts: this.hearts(a) };
  }

  /** 빗질: 하루 한 번 애정 +8, 생산 남은 시간 25% 단축 */
  brush(a, day = 0) {
    if (a.lastBrush === day || this.isBaby(a)) return null;
    a.lastBrush = day;
    if (a.fedTimer > 0) a.fedTimer *= 0.75;
    this.xp += 3;
    return { heartUp: this._gain(a, 8), hearts: this.hearts(a) };
  }

  /** (호환) 생산물 이름만 꺼내기 */
  collect(a) { const r = this.harvest(a); return r ? r.product : null; }

  /**
   * 생산물 수확: 하트 3개부터 2개, 하트 4개부터 가끔 특별한 생산물
   * @returns { product, amount, gold: 특별 생산물 id|null, xp, levelUp }
   */
  harvest(a) {
    if (!a.product) return null;
    const p = a.product, h = this.hearts(a);
    a.product = null;
    const amount = h >= 3 ? 2 : 1;
    const gold = h >= 4 && GOLD_OF[p] && this.rng() < 0.15 + (h - 4) * 0.15 ? GOLD_OF[p] : null;
    const lv = this.level;
    const xp = 4 + amount * 2 + (gold ? 10 : 0);
    this.xp += xp;
    return { product: p, amount, gold, xp, levelUp: this.level > lv ? this.level : 0 };
  }

  /** 여물통에 사료 채우기 → 넣은 개수 */
  fillTrough(n) { const k = Math.max(0, Math.min(n, TROUGH_MAX - this.trough)); this.trough += k; return k; }

  /**
   * @returns 생산물이 준비된 동물 목록 (자동 급이·자람은 각각 this.lastAutoFed / this.lastGrown 에)
   */
  tick(dt, day = 0) {
    const ready = [];
    this.lastAutoFed = [];
    this.lastGrown = [];
    for (const a of this.animals) {
      if (this.isBaby(a)) {
        a.age += dt;
        if (!this.isBaby(a)) this.lastGrown.push(a);
        continue;
      }
      // 자동 급이기: 배고픈 어른 동물은 여물통 사료를 먹음
      if (!a.product && a.fedTimer <= 0 && this.trough > 0) { this.trough--; this.feed(a, day); this.lastAutoFed.push(a); }
      if (a.fedTimer > 0) {
        a.fedTimer -= dt * (1 + this.hearts(a) * 0.08); // 행복할수록 빨리
        if (a.fedTimer <= 0) { a.fedTimer = 0; a.product = this.productOf(a.type); ready.push(a); }
      }
      a.happiness = Math.max(0, a.happiness - dt / 600);
    }
    return ready;
  }

  /** 새 날: 어제 아무도 돌봐 주지 않은(사료·쓰다듬기·빗질 모두 없음) 동물은 애정이 조금 줄어듦 */
  newDay(day) {
    for (const a of this.animals) if (Math.max(a.lastFed, a.lastPet, a.lastBrush) < day - 1) a.aff = Math.max(0, a.aff - 6);
  }

  toJSON() {
    return { animals: this.animals.map(({ type, name, fedTimer, product, happiness, aff, lastPet, lastBrush, lastFed, age }) => ({ type, name, fedTimer, product, happiness, aff, lastPet, lastBrush, lastFed, age })), barn: this.barn, trough: this.trough, xp: this.xp };
  }

  /** 저장 불러오기: 예전 저장(종류 없음)은 순서대로 덮어쓰고, 새로 들인 동물은 추가 */
  load(d) {
    if (!d) return;
    d.animals?.forEach((s, i) => {
      if (!this.animals[i]) { if (!s.type) return; this._add(s.type, { name: s.name }); }
      const a = this.animals[i];
      if (s.type && s.type !== a.type) a.type = s.type;
      Object.assign(a, { ...s, type: a.type, name: s.name || a.name, aff: s.aff ?? a.aff, age: s.age ?? GROW_TIME });
    });
    this.barn = Math.min(BARN.length - 1, d.barn || 0);
    this.trough = d.trough || 0;
    this.xp = d.xp || 0;
  }
}
