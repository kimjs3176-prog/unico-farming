/**
 * 반려견 키우기 규칙 (렌더링과 분리, tests/pet.test.js)
 *  배부름(0~100): 시간이 지나면 줄어듦 (게임 하루 ≈ 6분에 약 100)
 *  애정(0~100, 하트 0~5): 쓰다듬기(쿨타임)·간식으로 오르고, 많이 배고프면 조금씩 줄어듦
 *  재주: 하트 1 앉아, 2 빙글, 3 점프, 4 손!, 5 춤추기 / 하트 3 이상이고 배부르면 가끔 땅을 파서 보물을 찾아 옴
 */
export const TRICKS = [
  { id: 'sit', name: '앉아', emoji: '🐕', hearts: 1 },
  { id: 'spin', name: '빙글빙글', emoji: '🌀', hearts: 2 },
  { id: 'jump', name: '점프', emoji: '⤴️', hearts: 3 },
  { id: 'paw', name: '손!', emoji: '🐾', hearts: 4 },
  { id: 'dance', name: '춤추기', emoji: '🎵', hearts: 5 },
];
/** 재주 길이(초) */
export const TRICK_TIME = { sit: 2.2, spin: 1.1, jump: 1.2, paw: 2.0, dance: 2.6 };
const HUNGER_PER_SEC = 100 / 360;
const PET_COOLDOWN = 20;

export class PetSim {
  constructor() {
    this.name = '콩이';
    this.hunger = 80;
    this.affection = 10;
    this.petCool = 0;
    this.digTimer = 120;
    this.found = null; // 땅 파서 찾은 것 (주워 가기 전)
  }

  get hearts() { return Math.min(5, Math.floor(this.affection / 20)); }
  get mood() { return this.hunger < 25 ? 'hungry' : this.affection >= 60 ? 'happy' : 'calm'; }
  unlocked(id) { return this.hearts >= (TRICKS.find((t) => t.id === id)?.hearts ?? 99); }

  /** @returns 'dig' 이면 이번 틱에 땅 파기 시작 */
  tick(dt) {
    this.hunger = Math.max(0, this.hunger - dt * HUNGER_PER_SEC);
    if (this.petCool > 0) this.petCool -= dt;
    if (this.hunger < 15) this.affection = Math.max(0, this.affection - dt * 0.02);
    if (this.hearts >= 3 && this.hunger >= 40 && !this.found) {
      this.digTimer -= dt;
      if (this.digTimer <= 0) { this.digTimer = 90 + Math.random() * 60; return 'dig'; }
    }
    return null;
  }

  /** 쓰다듬기: 쿨타임 동안은 애정이 오르지 않음 */
  pet() {
    if (this.petCool > 0) return 0;
    this.petCool = PET_COOLDOWN;
    const gain = this.hunger < 25 ? 2 : 5;
    this.affection = Math.min(100, this.affection + gain);
    return gain;
  }

  /** 먹이기: treat(간식) 은 배부름 +45·애정 +8, 작물은 +25·+4 */
  feed(kind = 'treat') {
    if (this.hunger >= 98) return null;
    const [h, a] = kind === 'treat' ? [45, 8] : [25, 4];
    this.hunger = Math.min(100, this.hunger + h);
    this.affection = Math.min(100, this.affection + a);
    return { hunger: h, affection: a };
  }

  /** 땅 파기 결과 (rnd 주입 가능) */
  dig(rnd = Math.random) {
    const r = rnd();
    this.found = r < 0.45 ? { type: 'coin', n: 30 + Math.floor(rnd() * 8) * 10 } : r < 0.8 ? { type: 'seed' } : { type: 'item' };
    return this.found;
  }

  take() { const f = this.found; this.found = null; return f; }

  toJSON() { return { name: this.name, hunger: this.hunger, affection: this.affection, digTimer: this.digTimer }; }
  load(s) { if (!s) return; Object.assign(this, { name: s.name || this.name, hunger: s.hunger ?? this.hunger, affection: s.affection ?? this.affection, digTimer: s.digTimer ?? this.digTimer }); }
}
