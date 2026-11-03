import { ITEMS, itemsOf } from './items.js';

/**
 * 유니코 낚시터 (호수) 규칙
 * - 낚싯대 3단계: 텐션 허용치·감는 속도·희귀 물고기 확률
 * - 떡밥: 던질 때 1개 소모, 입질이 빨라지고 희귀 확률 ↑
 * - 큰 물고기는 '파이팅': 꾹 눌러 감으면 줄이 팽팽해지고(텐션↑), 놓으면 물고기가 도망가며 줄이 풀림.
 *   텐션이 끝까지 차면 줄이 끊어지고, 줄이 다 풀리면 놓침. 물고기가 몸부림(돌진)칠 때는 잠깐 놓아 주는 게 요령
 * - 오늘의 의뢰: 날마다 바뀌는 목표 물고기(최소 크기)를 낚아 낚시꾼에게 보고
 */
export const RODS = [
  { id: 'bamboo', name: '대나무 낚싯대', emoji: '🎋', price: 0, level: 1, tension: 1.0, reel: 1.0, rare: 1.0, color: 0xc9a35a, desc: '기본 낚싯대' },
  { id: 'carbon', name: '카본 낚싯대', emoji: '🎣', price: 1200, level: 3, tension: 1.25, reel: 1.2, rare: 1.3, color: 0x2f3b4a, desc: '줄이 잘 안 끊어지고 빨리 감겨요' },
  { id: 'gold', name: '황금 낚싯대', emoji: '✨', price: 4000, level: 5, tension: 1.5, reel: 1.4, rare: 1.7, color: 0xf2c84b, desc: '전설의 물고기가 더 자주 와요' },
];

export const BAIT_RARE = 1.35;

/** 크기 비율 (0 = 최소, 1 = 최대) */
export const sizeRatio = (fish, size) => { const [a, b] = ITEMS[fish].size; return Math.max(0, Math.min(1, (size - a) / (b - a))); };

/** 파이팅이 필요한 물고기인지: 희귀도 2 이상이거나 아주 큰 개체 */
export const needsFight = (fish, size) => ITEMS[fish].rarity >= 2 || sizeRatio(fish, size) > 0.7;

/** 감기 파이팅 (순수 로직, 테스트: tests/angling.test.js) */
export class ReelFight {
  /**
   * @param fish 아이템 id, size cm, rod RODS 항목
   */
  constructor(fish, size, rod = RODS[0], rng = Math.random) {
    const it = ITEMS[fish];
    this.rng = rng;
    this.rod = rod;
    // 물고기 힘: 희귀할수록·클수록 셈
    this.power = 0.5 + (it.rarity - 1) * 0.22 + sizeRatio(fish, size) * 0.35 + (it.legend ? 0.25 : 0);
    this.line = 0.55;     // 남은 줄 비율 (0 = 다 감음 → 성공, 1 = 다 풀림 → 놓침)
    this.tension = 0.25;  // 0~1, 1 이면 끊어짐
    this.stamina = 1;     // 물고기 체력 (지칠수록 힘이 약해짐)
    this.surge = 0;       // 몸부림 남은 시간
    this.nextSurge = 1 + rng() * 1.5;
    this.state = 'fight'; // fight | landed | snapped | escaped
    this.t = 0;
  }

  get surging() { return this.surge > 0; }
  /** 지금 물고기가 당기는 힘 (몸부림 중이면 2.4배) */
  get pull() { return this.power * (0.35 + 0.65 * this.stamina) * (this.surging ? 2.4 : 1); }

  /** @returns 이번 프레임에 생긴 일: 'surge' | 'landed' | 'snapped' | 'escaped' | null */
  tick(dt, reeling) {
    if (this.state !== 'fight') return null;
    this.t += dt;
    let ev = null;
    // 몸부림: 1~3초마다 0.5~1.1초
    if (this.surge > 0) this.surge -= dt;
    else if ((this.nextSurge -= dt) <= 0) { this.surge = 0.5 + this.rng() * 0.6 * this.power; this.nextSurge = 1.2 + this.rng() * 1.8; ev = 'surge'; }
    const pull = this.pull, rod = this.rod;
    if (reeling) {
      this.tension += ((0.18 + pull * 0.62) / rod.tension) * dt;
      this.line -= 0.2 * rod.reel * (this.surging ? 0.35 : 1) * dt;
      this.stamina = Math.max(0, this.stamina - 0.07 * dt);
    } else {
      this.tension -= (0.75 - pull * 0.15) * dt;
      this.line += 0.06 * pull * dt;
      this.stamina = Math.max(0, this.stamina - 0.025 * dt);
    }
    this.tension = Math.max(0, this.tension);
    if (this.tension >= 1) { this.state = 'snapped'; return 'snapped'; }
    if (this.line <= 0) { this.state = 'landed'; return 'landed'; }
    if (this.line >= 1) { this.state = 'escaped'; return 'escaped'; }
    return ev;
  }
}

/** 오늘의 의뢰: 날짜로 정해짐 (모든 플레이어 같은 의뢰) */
export function dailyRequest(day) {
  const pool = itemsOf('fish').filter((k) => ITEMS[k].where === 'lake' && ITEMS[k].rarity <= 3 && !ITEMS[k].night).concat(['fish_carp', 'fish_catfish', 'fish_crucian']);
  let h = (day * 2654435761) >>> 0;
  const next = () => { h = (h ^ (h >>> 13)) * 1274126177 >>> 0; return (h >>> 8) / 16777216; };
  const fish = pool[Math.floor(next() * pool.length)];
  const [a, b] = ITEMS[fish].size;
  const min = Math.round(a + (b - a) * (0.35 + next() * 0.25));
  return { day, fish, min, reward: ITEMS[fish].price * 3 + 100, bait: 3 };
}

/** 플레이어의 낚시터 진행 상태 (저장 대상) */
export class Angling {
  constructor() {
    this.rod = 0;        // RODS 인덱스
    this.useBait = true; // 떡밥이 있으면 자동 사용
    this.req = null;     // { day, done(낚음), claimed(보고함) }
    this.fights = 0;     // 파이팅 성공 수
    this.biggest = null; // { fish, size }
  }

  get rodInfo() { return RODS[this.rod]; }
  get nextRod() { return RODS[this.rod + 1] || null; }

  /** 오늘 의뢰 + 진행 상태 */
  today(day) {
    const r = dailyRequest(day);
    if (!this.req || this.req.day !== day) this.req = { day, done: false, claimed: false };
    return { ...r, done: this.req.done, claimed: this.req.claimed };
  }

  /** 잡은 물고기 기록. @returns { request: 의뢰 달성 여부, biggest: 낚시터 최대어 경신 } */
  record(fish, size, day, { fought = false } = {}) {
    const out = { request: false, biggest: false };
    if (fought) this.fights++;
    const r = this.today(day);
    if (!r.done && fish === r.fish && size >= r.min) { this.req.done = true; out.request = true; }
    if (!this.biggest || size * ITEMS[fish].price > this.biggest.size * ITEMS[this.biggest.fish].price) { this.biggest = { fish, size }; out.biggest = true; }
    return out;
  }

  /** 의뢰 보상 받기 */
  claim(day) {
    const r = this.today(day);
    if (!r.done || r.claimed) return null;
    this.req.claimed = true;
    return { money: r.reward, bait: r.bait };
  }

  /** 낚싯대 업그레이드 가능 여부 */
  canUpgrade(money, level) {
    const n = this.nextRod;
    if (!n) return { ok: false, reason: 'max' };
    if (level < n.level) return { ok: false, reason: 'level', need: n.level };
    if (money < n.price) return { ok: false, reason: 'money', need: n.price };
    return { ok: true, price: n.price };
  }

  upgrade() { if (this.nextRod) this.rod++; return this.rodInfo; }

  toJSON() { return { rod: this.rod, useBait: this.useBait, req: this.req, fights: this.fights, biggest: this.biggest }; }
  load(d) { if (!d) return; Object.assign(this, { rod: Math.min(RODS.length - 1, d.rod | 0), useBait: d.useBait !== false, req: d.req || null, fights: d.fights | 0, biggest: d.biggest || null }); }
}
