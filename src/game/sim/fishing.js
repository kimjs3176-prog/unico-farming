import { ITEMS, itemsOf } from './items.js';

/**
 * 동물의 숲풍 낚시: 찌를 던지면 기다렸다가 '입질'(찌가 쑥 들어감) 순간에 맞춰 당기기
 * 상태: idle → waiting(가짜 입질 nibble 0~2회) → bite(반응 창) → caught | escaped
 */
export const BITE_WINDOW = 0.75; // 초

export class FishingSim {
  constructor(rng = Math.random) { this.rng = rng; this.state = 'idle'; }

  /**
   * 찌 던지기
   * @param ctx.lake 낚시터(호수)면 호수 전용 물고기 등장, ctx.rare 희귀 확률 배수(낚싯대·떡밥), ctx.bait 떡밥: 입질이 빨라짐
   */
  cast({ night = false, raining = false, paddy = false, lake = false, cold = false, rare = 1, bait = false } = {}) {
    this.state = 'waiting';
    this.t = 0;
    this.biteAt = bait ? 1.2 + this.rng() * 2.2 : 2 + this.rng() * 4;
    this.nibbles = Math.floor(this.rng() * (bait ? 2 : 3));
    this.nextNibble = this.biteAt * (0.3 + this.rng() * 0.3);
    this.ctx = { night, raining, paddy, lake, cold, rare };
    this.fish = this.roll();
    return this.fish;
  }

  /** 지금 이 자리에서 나올 수 있는 물고기 */
  pool() {
    const c = this.ctx;
    return itemsOf('fish').filter((k) => {
      const it = ITEMS[k];
      if (it.where === 'lake' && !c.lake) return false; // 호수 전용
      if (c.lake && (k === 'fish_snail' || k === 'fish_loach' || k === 'fish_minnow')) return false; // 얕은 물 생물은 연못·논에서
      if (it.night && !c.night) return false;
      if (k === 'fish_snail') return c.paddy || this.rng() < 0.5;
      return true;
    });
  }

  /** 등장 물고기 추첨: 희귀도 가중치, 밤·비 오는 날·좋은 낚싯대·떡밥은 희귀 확률 증가 */
  roll() {
    const c = this.ctx;
    const pool = this.pool();
    const boost = (c.night ? 1.6 : 1) * (c.raining ? 1.4 : 1) * (c.rare || 1);
    const weights = pool.map((k) => {
      const it = ITEMS[k], r = it.rarity;
      let w = r === 1 ? 10 : r === 2 ? 4 * boost : r === 3 ? 1.2 * boost : 0.25 * boost;
      if (it.legend) w *= 0.5 * (c.rare || 1); // 전설: 좋은 장비일수록 확 늘어남
      if (it.cold) w *= c.cold ? 2.5 : 0.3;
      if (it.rain && c.raining) w *= 2.5;
      return w;
    });
    let x = this.rng() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < pool.length; i++) { x -= weights[i]; if (x <= 0) return pool[i]; }
    return pool[0];
  }

  /** @returns 'nibble' | 'bite' | 'escaped' | null */
  tick(dt) {
    if (this.state === 'waiting') {
      this.t += dt;
      if (this.nibbles > 0 && this.t >= this.nextNibble) { this.nibbles--; this.nextNibble = this.t + 0.6 + this.rng() * 0.8; return 'nibble'; }
      if (this.t >= this.biteAt) { this.state = 'bite'; this.biteT = 0; return 'bite'; }
    } else if (this.state === 'bite') {
      this.biteT += dt;
      if (this.biteT > BITE_WINDOW) { this.state = 'escaped'; return 'escaped'; }
    }
    return null;
  }

  /** 당기기: 입질 중이면 성공 { fish, size } / 너무 빠르면 놓침 */
  reel() {
    if (this.state === 'bite') {
      this.state = 'caught';
      const [a, b] = ITEMS[this.fish].size;
      const size = Math.round((a + (b - a) * Math.pow(this.rng(), 1.6)) * 10) / 10;
      return { ok: true, fish: this.fish, size };
    }
    if (this.state === 'waiting') { this.state = 'escaped'; return { ok: false, early: true }; }
    return { ok: false };
  }

  reset() { this.state = 'idle'; }
}

/** 곤충 등장 추첨 (시간대·날씨) */
export function rollBug(rng = Math.random, { night = false, raining = false } = {}) {
  if (night) return rng() < 0.5 ? 'bug_firefly' : rng() < 0.6 ? 'bug_beetle' : 'bug_dragonfly';
  const pool = itemsOf('bug').filter((k) => k !== 'bug_firefly');
  const w = pool.map((k) => ({ 1: 10, 2: 4, 3: raining ? 0.5 : 1.2 }[ITEMS[k].rarity]));
  let x = rng() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < pool.length; i++) { x -= w[i]; if (x <= 0) return pool[i]; }
  return pool[0];
}
