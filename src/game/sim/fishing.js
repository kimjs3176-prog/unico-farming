import { ITEMS, itemsOf } from './items.js';

/**
 * 동물의 숲풍 낚시: 찌를 던지면 기다렸다가 '입질'(찌가 쑥 들어감) 순간에 맞춰 당기기
 * 상태: idle → waiting(가짜 입질 nibble 0~2회) → bite(반응 창) → caught | escaped
 */
export const BITE_WINDOW = 0.75; // 초

export class FishingSim {
  constructor(rng = Math.random) { this.rng = rng; this.state = 'idle'; }

  cast({ night = false, raining = false, paddy = false } = {}) {
    this.state = 'waiting';
    this.t = 0;
    this.biteAt = 2 + this.rng() * 4;
    this.nibbles = Math.floor(this.rng() * 3);
    this.nextNibble = this.biteAt * (0.3 + this.rng() * 0.3);
    this.ctx = { night, raining, paddy };
    this.fish = this.roll();
    return this.fish;
  }

  /** 등장 물고기 추첨: 희귀도 가중치, 밤·비 오는 날은 희귀 확률 증가 */
  roll() {
    const pool = itemsOf('fish').filter((k) => (k === 'fish_snail' ? this.ctx.paddy || this.rng() < 0.5 : true));
    const boost = (this.ctx.night ? 1.6 : 1) * (this.ctx.raining ? 1.4 : 1);
    const weights = pool.map((k) => { const r = ITEMS[k].rarity; return r === 1 ? 10 : r === 2 ? 4 * boost : r === 3 ? 1.2 * boost : 0.25 * boost; });
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
