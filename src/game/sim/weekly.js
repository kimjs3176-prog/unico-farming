// 이번 계절 도전: 계절(7일)마다 3개 (밭 · 목장 · 자연/마을에서 하나씩). 모두에게 같은 씨앗으로 뽑음 (three 없음, 테스트: tests/weekly.test.js)
// 계절 마지막 날(7일째, 축제 날)까지. 다음 계절이 되면 다 하고 안 받은 보상은 자동으로 받음 (놓쳐도 아쉽지 않게)
import { seasonOf, DAYS_PER_SEASON } from './season.js';
import { CROPS } from './crops.js';
import { DECOR_BY_ID } from './decor.js';

/** 한 번 일어날 때마다 1씩 오르는 이벤트만 (누적값·최댓값 이벤트는 쓰지 않음) */
export const COUNTED = ['harvest', 'order', 'star3', 'fish', 'lakefish', 'bug', 'shake', 'feed', 'collect', 'animalcare', 'process', 'rprocess', 'honey', 'weed', 'shoo', 'petfeed', 'thresh', 'fightwin', 'dive', 'tractor', 'smartfarm', 'fert'];

/** 레벨에 따른 목표 배율 (레벨 1 = 1) */
export const GOAL_PER_LEVEL = 0.08;
/** 3개를 다 하면 주는 꾸미기 (차례대로) · 도장 4개마다 주는 귀한 선물 */
export const SET_DECOR = ['flowerbed', 'lamp', 'planter', 'bench', 'berrybush', 'birch', 'maple', 'tree'];
export const RARE_GIFTS = [{ costume: 'beekeeper' }, { decor: 'well' }, { costume: 'chef' }, { decor: 'scarecrow' }];
export const STAMP_EVERY = 4;

/**
 * 도전 틀: id, cat, event, base(레벨 1 목표), icon, text(n), gate(ctx) — ctx: { level, has(questId) }
 * filter: { night } 밤에만 · key: 특정 작물
 */
export const TEMPLATES = [
  // 밭
  { id: 'harvest', cat: 'farm', event: 'harvest', base: 24, icon: '🧺', text: (n) => `작물 ${n}개 수확하기`, gate: () => true },
  { id: 'harvest_key', cat: 'farm', event: 'harvest', base: 12, icon: '🌱', keyed: true, text: (n, k) => `${CROPS[k].emoji} ${CROPS[k].name} ${n}개 수확하기`, gate: () => true },
  { id: 'star3', cat: 'farm', event: 'star3', base: 3, icon: '⭐', text: (n) => `⭐⭐⭐ 특상품 ${n}번 수확하기`, gate: (c) => c.has('star3') },
  { id: 'fert', cat: 'farm', event: 'fert', base: 5, icon: '🟫', text: (n) => `밭에 퇴비 ${n}번 주기`, gate: (c) => c.has('fert3') },
  { id: 'weed', cat: 'farm', event: 'weed', base: 4, icon: '🌿', text: (n) => `잡초 ${n}번 매기`, gate: (c) => c.has('weed2') },
  { id: 'process', cat: 'farm', event: 'process', base: 3, icon: '🏺', text: (n) => `장독대 가공품 ${n}개 만들기`, gate: (c) => c.has('process2') },
  { id: 'order', cat: 'farm', event: 'order', base: 4, icon: '📦', text: (n) => `주문 ${n}건 납품하기`, gate: (c) => c.has('order3') },
  { id: 'thresh', cat: 'farm', event: 'thresh', base: 2, icon: '🌾', text: (n) => `벼 ${n}번 탈곡하기`, gate: (c) => c.has('riceharv') },
  { id: 'tractor', cat: 'farm', event: 'tractor', base: 3, icon: '🚜', text: (n) => `트랙터로 밭갈이 ${n}번`, gate: (c) => c.has('tractor1') },
  { id: 'smartfarm', cat: 'farm', event: 'smartfarm', base: 2, icon: '🌡️', text: (n) => `스마트팜 점검 ${n}번`, gate: (c) => c.has('smart1') },
  // 목장
  { id: 'feed', cat: 'ranch', event: 'feed', base: 8, icon: '🌾', text: (n) => `목장 동물에게 사료 ${n}번 주기`, gate: () => true },
  { id: 'collect', cat: 'ranch', event: 'collect', base: 10, icon: '🥚', text: (n) => `달걀·우유·양털 ${n}개 모으기`, gate: () => true },
  { id: 'animalcare', cat: 'ranch', event: 'animalcare', base: 6, icon: '🪮', text: (n) => `목장 동물 ${n}번 빗질·쓰다듬기`, gate: (c) => c.has('care5') },
  { id: 'rprocess', cat: 'ranch', event: 'rprocess', base: 2, icon: '🧀', text: (n) => `치즈·털실 가공품 ${n}개 만들기`, gate: (c) => c.has('rprocess2') },
  { id: 'honey', cat: 'ranch', event: 'honey', base: 3, icon: '🍯', text: (n) => `벌통에서 꿀 ${n}번 거두기`, gate: (c) => c.has('honey3') },
  { id: 'petfeed', cat: 'ranch', event: 'petfeed', base: 4, icon: '🐕', text: (n) => `반려견에게 간식 ${n}번 주기`, gate: (c) => c.has('petfeed3') },
  { id: 'shoo', cat: 'ranch', event: 'shoo', base: 4, icon: '🐦‍⬛', text: (n) => `까마귀·여우를 ${n}번 쫓아내기`, gate: (c) => c.has('shoo5') },
  // 자연·마을
  { id: 'fish', cat: 'nature', event: 'fish', base: 6, icon: '🎣', text: (n) => `물고기 ${n}마리 낚기`, gate: () => true },
  { id: 'fish_night', cat: 'nature', event: 'fish', base: 3, icon: '🌙', night: true, text: (n) => `밤에 물고기 ${n}마리 낚기`, gate: (c) => c.has('fish1') },
  { id: 'lakefish', cat: 'nature', event: 'lakefish', base: 4, icon: '🛶', text: (n) => `낚시터에서 ${n}마리 낚기`, gate: (c) => c.has('lake1') },
  { id: 'bug', cat: 'nature', event: 'bug', base: 5, icon: '🦋', text: (n) => `곤충 ${n}마리 잡기`, gate: () => true },
  { id: 'shake', cat: 'nature', event: 'shake', base: 6, icon: '🍎', text: (n) => `과일 나무 ${n}번 흔들기`, gate: () => true },
  { id: 'fightwin', cat: 'nature', event: 'fightwin', base: 2, icon: '💪', text: (n) => `힘겨루기로 큰 물고기 ${n}마리`, gate: (c) => c.has('fight3') },
  { id: 'dive', cat: 'nature', event: 'dive', base: 3, icon: '🤿', text: (n) => `호수에서 잠수 보물 ${n}번 찾기`, gate: (c) => c.has('dive3') },
];
export const CATS = ['farm', 'ranch', 'nature'];
const BY_ID = Object.fromEntries(TEMPLATES.map((t) => [t.id, t]));

/** 기간 열쇠: '해-계절번호' */
export const periodKey = (day) => { const s = seasonOf(day); return `${s.year}-${s.index}`; };
/** 계절 마지막 날(축제 날)까지 남은 날 (0 = 오늘 마감) */
export const daysLeft = (day) => DAYS_PER_SEASON - seasonOf(day).dayIn;

/** 문자열 → 32비트 씨앗 */
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0 || 1; }
/** xorshift32 (모두에게 같은 순서) */
export function xorshift(seed) { let x = seed >>> 0 || 1; return () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; }; }

/** 레벨에 맞춘 목표 (약 20~30분) */
export const goalFor = (base, level) => Math.max(1, Math.round(base * (1 + GOAL_PER_LEVEL * (Math.max(1, level) - 1))));

/** 보상: 코인·경험치·소모품 하나 (계절 씨앗 꾸러미·떡밥·퇴비 돌아가며) */
export function rewardFor(cat, level, season, i) {
  const lv = Math.max(1, level);
  const money = 80 + 20 * lv, xp = 40 + 8 * lv;
  const kinds = ['seed', 'bait', 'compost'];
  const kind = kinds[(CATS.indexOf(cat) + i) % kinds.length];
  if (kind === 'seed') {
    const pool = (season?.crops || []).filter((k) => CROPS[k] && CROPS[k].unlockLevel <= lv);
    const crop = pool[0] || 'carrot';
    return { money, xp, item: { seed: crop, n: 4, icon: CROPS[crop].emoji, name: `${CROPS[crop].name} 씨앗 4개` } };
  }
  if (kind === 'bait') return { money, xp, item: { id: 'bait', n: 3, icon: '🪱', name: '떡밥 3개' } };
  return { money, xp, item: { id: 'compost', n: 2, icon: '🟫', name: '퇴비 2개' } };
}

/**
 * 기간의 도전 3개 뽑기 (같은 열쇠·같은 해금이면 누구나 같음)
 * ctx: { level, has(questId) }, season: seasonOf(day)
 */
export function pickChallenges(key, ctx, season) {
  const rng = xorshift(hashStr(`unico-season-${key}`));
  const level = ctx.level || 1;
  const out = [];
  for (const cat of CATS) {
    const pool = TEMPLATES.filter((t) => t.cat === cat);
    // 섞기 (해금과 무관하게 같은 순서) → 해금된 첫 틀
    const order = pool.map((t) => ({ t, r: rng() })).sort((a, b) => a.r - b.r).map((x) => x.t);
    const t = order.find((x) => x.gate(ctx)) || pool[0];
    let k = null;
    if (t.keyed) {
      const crops = Object.keys(CROPS).filter((c) => CROPS[c].unlockLevel <= level);
      const fit = crops.filter((c) => season?.crops?.includes(c));
      const list = fit.length ? fit : crops;
      k = list[Math.floor(rng() * list.length)] || 'carrot';
    }
    out.push({ tid: t.id, key: k, goal: goalFor(t.base, level), n: 0, claimed: false });
  }
  return out;
}

/** 도전 한 칸 → 보여 줄 정보 */
export function describe(c) {
  const t = BY_ID[c.tid];
  if (!t) return null;
  return { id: c.tid, cat: t.cat, icon: t.icon, title: t.text(c.goal, c.key), count: Math.min(c.goal, c.n), goal: c.goal, complete: c.n >= c.goal, claimed: !!c.claimed };
}

export class SeasonChallenges {
  constructor() {
    this.key = null;    // 기간 열쇠
    this.list = [];     // [{ tid, key, goal, n, claimed }]
    this.bonus = false; // 세 개를 모두 받아 꾸미기를 받았나
    this.stamps = 0;    // 평생 '도전 도장' 수
    this.level = 1;     // 뽑을 때 레벨 (보상 크기)
    this.season = null; // 뽑을 때 계절 (보상 씨앗)
  }

  /**
   * 날짜에 맞춰 기간 갱신. 바뀌면 지난 기간의 다 하고 안 받은 보상 목록을 돌려줌 ({ rewards, bonus })
   * ctx: { level, has(questId) }
   */
  sync(day, ctx) {
    const key = periodKey(day);
    if (key === this.key && this.list.length) return null;
    let left = null;
    if (this.key && this.list.length) {
      const rewards = [];
      this.list.forEach((c, i) => { if (!c.claimed && c.n >= c.goal) rewards.push(this.claim(i)); });
      left = { rewards: rewards.filter(Boolean), bonus: rewards.find((r) => r?.bonus)?.bonus || null };
      if (!left.rewards.length) left = null;
    }
    const season = seasonOf(day);
    this.key = key;
    this.level = Math.max(1, ctx?.level || 1);
    this.season = { id: season.id, crops: season.crops };
    this.list = pickChallenges(key, ctx || { level: 1, has: () => false }, season);
    this.bonus = false;
    return left;
  }

  /** 이벤트 보고 (opt: { night, key }) → 이번에 다 된 칸 번호 목록 */
  report(event, amount = 1, opt = {}) {
    if (!COUNTED.includes(event)) return [];
    const done = [];
    this.list.forEach((c, i) => {
      const t = BY_ID[c.tid];
      if (!t || t.event !== event || c.claimed || c.n >= c.goal) return;
      if (t.night && !opt.night) return;
      if (t.keyed && opt.key !== c.key) return;
      const a = Math.max(0, Math.floor(Number(amount) || 0));
      if (!a) return;
      c.n = Math.min(c.goal, c.n + a);
      if (c.n >= c.goal) done.push(i);
    });
    return done;
  }

  /** 보상 받기 (한 번만): { money, xp, item, bonus? } — bonus: { decor, stamp, rare? } */
  claim(i) {
    const c = this.list[i];
    if (!c || c.claimed || c.n < c.goal) return null;
    c.claimed = true;
    const t = BY_ID[c.tid];
    const r = { ...rewardFor(t.cat, this.level, this.season, i), title: t.text(c.goal, c.key) };
    if (!this.bonus && this.list.every((x) => x.claimed)) {
      this.bonus = true;
      this.stamps++;
      const seed = this.key ? hashStr(this.key) : 0;
      const decor = SET_DECOR[seed % SET_DECOR.length];
      r.bonus = { decor: DECOR_BY_ID[decor] ? decor : 'flowerbed', stamp: this.stamps };
      if (this.stamps % STAMP_EVERY === 0) r.bonus.rare = RARE_GIFTS[(this.stamps / STAMP_EVERY - 1) % RARE_GIFTS.length];
    }
    return r;
  }

  /** 보여 줄 목록 */
  view() { return this.list.map(describe).filter(Boolean); }
  /** 받을 수 있는 도전 수 */
  get claimable() { return this.list.filter((c) => !c.claimed && c.n >= c.goal).length; }
  /** 따라갈 도전: 받을 것 → 아직 하는 것 중 가장 많이 한 것 (번호 포함) */
  tracked() {
    const v = this.view().map((x, i) => ({ ...x, i }));
    return v.find((x) => x.complete && !x.claimed) || v.filter((x) => !x.complete).sort((a, b) => b.count / b.goal - a.count / a.goal)[0] || null;
  }

  toJSON() { return { key: this.key, list: this.list, bonus: this.bonus, stamps: this.stamps, level: this.level, season: this.season }; }
  load(d) {
    if (!d || typeof d !== 'object') return;
    this.key = typeof d.key === 'string' ? d.key : null;
    this.list = (Array.isArray(d.list) ? d.list : []).filter((c) => c && BY_ID[c.tid] && (!BY_ID[c.tid].keyed || CROPS[c.key])).slice(0, 3)
      .map((c) => ({ tid: c.tid, key: c.key ?? null, goal: Math.max(1, c.goal | 0), n: Math.max(0, c.n | 0), claimed: !!c.claimed }));
    if (this.list.length !== 3) { this.list = []; this.key = null; }
    this.bonus = !!d.bonus;
    this.stamps = Math.max(0, d.stamps | 0);
    this.level = Math.max(1, d.level | 0);
    this.season = d.season && Array.isArray(d.season.crops) ? { id: String(d.season.id), crops: d.season.crops.filter((k) => CROPS[k]) } : null;
  }
}
