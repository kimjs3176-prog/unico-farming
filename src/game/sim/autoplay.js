import { CROPS, FEED_PRICE } from './crops.js';

/**
 * 오토플레이 계획 (렌더링 무관, 테스트: tests/autoplay.test.js)
 *  - 할 일 후보(밭·동물·장터)를 모아 '급한 정도 × 8 + 거리'가 가장 작은 것을 고름
 *    → 급한 일이 먼저지만, 바로 옆의 덜 급한 일을 하러 맵 반대편까지 갔다 오지는 않음
 *  - 장터: 가방이 차거나, 씨앗·사료가 모자라 일이 막혔을 때만 감 (살 돈이 있거나 팔 것이 있을 때)
 */
export const PRIORITY = { harvest: 0, collect: 1, water: 2, weed: 3, feed: 4, plant: 5, fert: 6, till: 7, brush: 8, pet: 9, market: 10 };
export const TIER_W = 8;          // 급한 정도 한 단계 = 거리 8칸
export const SELL_AT = 24;        // 작물·생산물이 이만큼 모이면 팔러 감
export const RESERVE = 30;        // 장 볼 때 남겨 두는 돈
export const MAX_BUY = 10;        // 한 번에 사는 씨앗·사료 최대 수

/** 작물의 초당 이익 (다시 열리는 작물은 여러 번 수확) */
export function cropValue(id) {
  const c = CROPS[id], n = 1 + (c.regrow || 0);
  return ((c.basePrice * c.yield) * n - c.seedPrice) / (c.growTime * (1 + (c.regrow || 0) * 0.5));
}

/** 가진 씨앗 중 가장 이익이 큰 것 */
export function bestSeed(seeds) {
  let best = null;
  for (const [k, n] of Object.entries(seeds || {})) if (n > 0 && CROPS[k] && (!best || cropValue(k) > cropValue(best))) best = k;
  return best;
}

/** 해금된 씨앗 중 가장 이익이 큰 것 */
export function bestUnlocked(level) {
  let best = null;
  for (const k of Object.keys(CROPS)) if (CROPS[k].unlockLevel <= level && (!best || cropValue(k) > cropValue(best))) best = k;
  return best;
}

/**
 * 장보기 목록
 * @param s { money, level, seedsOwned, plotsFree: 심을 수 있는(빈·갈아 둔) 밭 수, feed, hungry: 배고픈 동물 수 }
 * @returns { seeds: { crop, n } | null, feed: n, cost }
 */
export function shopList(s) {
  let money = s.money - RESERVE, cost = 0;
  const out = { seeds: null, feed: 0, cost: 0 };
  // 사료가 먼저 (동물은 사료가 없으면 아무것도 못 만듦)
  const fNeed = Math.min(MAX_BUY, Math.max(0, s.hungry - s.feed));
  const fn = Math.max(0, Math.min(fNeed, Math.floor(money / FEED_PRICE)));
  if (fn > 0) { out.feed = fn; money -= fn * FEED_PRICE; cost += fn * FEED_PRICE; }
  const sNeed = Math.min(MAX_BUY, Math.max(0, s.plotsFree - s.seedsOwned));
  const crop = bestUnlockedAffordable(s.level, money);
  if (sNeed > 0 && crop) {
    const n = Math.min(sNeed, Math.floor(money / CROPS[crop].seedPrice));
    if (n > 0) { out.seeds = { crop, n }; cost += n * CROPS[crop].seedPrice; }
  }
  out.cost = cost;
  return out;
}

/** 해금됐고 한 개라도 살 수 있는 씨앗 중 이익이 가장 큰 것 */
function bestUnlockedAffordable(level, money) {
  let best = null;
  for (const k of Object.keys(CROPS)) {
    const c = CROPS[k];
    if (c.unlockLevel <= level && c.seedPrice <= money && (!best || cropValue(k) > cropValue(best))) best = k;
  }
  return best;
}

/**
 * 다음 할 일 고르기
 * @param s {
 *   pos: {x,z},
 *   plots: [{ i, x, z, type }]  (FarmSim.actionFor 의 type),
 *   animals: [{ id, x, z, type, sleeping }] (RanchSim.actionFor 의 type),
 *   feed: 가진 사료, market: {x,z},
 *   sellCount: 팔 수 있는 작물·생산물 수,
 *   shop: shopList 결과(팔고 난 돈 기준), skip: Set(키) — 잠시 건너뛸 대상
 * }
 * @returns { kind: 'plot'|'animal'|'market', type, key, x, z, i?, id? } | null
 */
export function chooseTask(s) {
  const cands = [];
  const skip = s.skip || new Set();
  const add = (t) => { if (!skip.has(t.key)) cands.push(t); };
  let blocked = false; // 씨앗·사료가 없어 못 하는 일이 있음
  for (const p of s.plots || []) {
    if (p.type === 'need_seed') { blocked = true; continue; }
    if (PRIORITY[p.type] === undefined || p.type === 'market') continue;
    add({ kind: 'plot', type: p.type, key: `plot:${p.i}`, i: p.i, x: p.x, z: p.z });
  }
  for (const a of s.animals || []) {
    if (a.sleeping && a.type !== 'collect') continue; // 밤에는 깨우지 않음 (수확만)
    if (a.type === 'feed' && s.feed <= 0) { blocked = true; continue; }
    if (PRIORITY[a.type] === undefined || a.type === 'market') continue;
    add({ kind: 'animal', type: a.type, key: `animal:${a.id}`, id: a.id, x: a.x, z: a.z });
  }
  const buys = s.shop && (s.shop.feed > 0 || s.shop.seeds);
  const full = (s.sellCount || 0) >= SELL_AT;
  if (s.market && (full || (blocked && buys))) {
    // 가방이 찼거나 할 일이 없으면 최우선, 씨앗·사료 때문에 막혔으면 심기와 같은 급 (밭만 잔뜩 갈아 두지 않게)
    const tier = full || !cands.length ? PRIORITY.collect : blocked ? PRIORITY.plant : PRIORITY.market;
    add({ kind: 'market', type: 'market', key: 'market', x: s.market.x, z: s.market.z, tier });
  }
  if (!cands.length) return null;
  const pos = s.pos || { x: 0, z: 0 };
  const score = (t) => (t.tier ?? PRIORITY[t.type]) * TIER_W + Math.hypot(t.x - pos.x, t.z - pos.z);
  let best = cands[0], bs = score(best);
  for (const t of cands) { const v = score(t); if (v < bs) { bs = v; best = t; } }
  return best;
}

/** 작업 이름 (상태 표시) */
export const TASK_LABEL = {
  harvest: '🧺 수확', collect: '🥚 생산물 거두기', water: '💧 물 주기', weed: '🌿 김매기', feed: '🌾 사료 주기',
  plant: '🌱 씨앗 심기', fert: '🟫 퇴비 주기', till: '⛏️ 밭 갈기', brush: '🪮 빗질', pet: '💕 쓰다듬기', market: '🛒 장터에서 사고팔기',
};
