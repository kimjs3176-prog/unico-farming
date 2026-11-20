import { ITEMS, itemsOf, seasonWeight } from './items.js';

/** 추운 날 물고기(빙어·열목어) 배수: 추운 날 ×2.5, 아니면 ×0.3 — 겨울엔 날씨가 포근해도 추운 날로 침 */
const COLD_ON = 2.5, COLD_OFF = 0.3;
/** 날 수 있는 곤충 (겨울엔 희귀한 것만) */
const isFlying = (k) => !ITEMS[k].ground && k !== 'bug_ladybug' && k !== 'bug_beetle';
const WINTER_FLY_RARITY = 3;

/**
 * 낚시: 찌를 던지면 기다렸다가 '입질'(찌가 쑥 들어감) 순간에 맞춰 당기기
 * 상태: idle → waiting(가짜 입질 nibble 0~2회) → bite(반응 창) → caught | escaped
 */
export const BITE_WINDOW = 0.75; // 초

export class FishingSim {
  constructor(rng = Math.random) { this.rng = rng; this.state = 'idle'; }

  /**
   * 찌 던지기
   * @param ctx.lake 낚시터(호수)면 호수 전용 물고기 등장, ctx.rare 희귀 확률 배수(낚싯대·떡밥), ctx.bait 떡밥: 입질이 빨라짐
   * @param ctx.season 계절 id (주면 제철 ×3·철 지남 ×0.25, 안 주면 예전 그대로 — 도트 판)
   */
  cast({ night = false, raining = false, paddy = false, lake = false, cold = false, rare = 1, bait = false, season } = {}) {
    this.state = 'waiting';
    this.t = 0;
    this.biteAt = bait ? 1.2 + this.rng() * 2.2 : 2 + this.rng() * 4;
    this.nibbles = Math.floor(this.rng() * (bait ? 2 : 3));
    this.nextNibble = this.biteAt * (0.3 + this.rng() * 0.3);
    this.ctx = { night, raining, paddy, lake, cold, rare, season };
    this.fish = this.roll();
    return this.fish;
  }

  /** 지금 이 자리에서 나올 수 있는 물고기 */
  pool() {
    const c = this.ctx;
    return itemsOf('fish').filter((k) => {
      const it = ITEMS[k];
      if (it.where === 'lake' && !c.lake) return false; // 호수 전용
      if (it.where === 'pond' && c.lake) return false; // 연못·논 전용 (작은 물고기·가재·자라)
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
      if (it.cold) w *= c.cold || c.season === 'winter' ? COLD_ON : COLD_OFF;
      if (it.rain && c.raining) w *= 2.5;
      if (c.season) w *= seasonWeight(k, c.season); // 제철 ×3 (빙어·열목어는 겨울에 추운 날 배수 위에 ×3)
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

/**
 * 곤충 등장 추첨 (시간대·날씨, season 을 주면 계절도)
 * season 이 없으면 예전과 똑같이 (도트 판 bugs.js). 있으면 제철 ×3·철 지남 ×0.25, 반딧불이·매미·호랑나비는 여름만,
 * 고추잠자리·귀뚜라미는 가을만, 겨울엔 나는 곤충은 희귀한 것(★3 이상)만
 */
export function rollBug(rng = Math.random, { night = false, raining = false, season } = {}) {
  if (season) return rollSeasonBug(rng, night, raining, season);
  if (night) {
    if (rng() < 0.4) return 'bug_firefly';
    // 밤: 장수풍뎅이·고추잠자리 + 밤에만 나오는 곤충(나방·귀뚜라미·사슴벌레)
    const np = ['bug_beetle', 'bug_dragonfly', ...itemsOf('bug').filter((k) => ITEMS[k].night)];
    const nw = np.map((k) => ({ 1: 10, 2: 5, 3: 2 }[ITEMS[k].rarity] || 1));
    let y = rng() * nw.reduce((a, b) => a + b, 0);
    for (let i = 0; i < np.length; i++) { y -= nw[i]; if (y <= 0) return np[i]; }
    return np[0];
  }
  const pool = itemsOf('bug').filter((k) => k !== 'bug_firefly' && !ITEMS[k].night);
  const w = pool.map((k) => ({ 1: 10, 2: 4, 3: raining ? 0.5 : 1.2 }[ITEMS[k].rarity]));
  let x = rng() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < pool.length; i++) { x -= w[i]; if (x <= 0) return pool[i]; }
  return pool[0];
}

/** 반딧불이가 밤에 나올 확률 (여름) */
const FIREFLY_NIGHT = 0.4;

/** 계절 곤충 추첨 (rollBug 가 season 이 있을 때) */
function rollSeasonBug(rng, night, raining, season) {
  const ok = (k) => seasonWeight(k, season) > 0 && (season !== 'winter' || !isFlying(k) || ITEMS[k].rarity >= WINTER_FLY_RARITY);
  if (night && ok('bug_firefly') && rng() < FIREFLY_NIGHT) return 'bug_firefly';
  const pool = night
    ? ['bug_beetle', 'bug_dragonfly', ...itemsOf('bug').filter((k) => ITEMS[k].night)].filter(ok)
    : itemsOf('bug').filter((k) => k !== 'bug_firefly' && !ITEMS[k].night && ok(k));
  if (!pool.length) return null;
  const base = (r) => (night ? { 1: 10, 2: 5, 3: 2 }[r] || 1 : { 1: 10, 2: 4, 3: raining ? 0.5 : 1.2 }[r] || 0.5);
  const w = pool.map((k) => base(ITEMS[k].rarity) * seasonWeight(k, season));
  let x = rng() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < pool.length; i++) { x -= w[i]; if (x <= 0) return pool[i]; }
  return pool[0];
}
