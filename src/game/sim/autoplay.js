import { CROPS, FEED_PRICE } from './crops.js';
import { ITEMS } from './items.js';

/**
 * 오토플레이 계획 (렌더링 무관, 테스트: tests/autoplay.test.js)
 *  - 할 일 후보(밭·동물·장터)를 모아 '급한 정도 × 8 + 거리'가 가장 작은 것을 고름
 *    → 급한 일이 먼저지만, 바로 옆의 덜 급한 일을 하러 맵 반대편까지 갔다 오지는 않음
 *  - 장터: 가방이 차거나, 씨앗·사료가 모자라 일이 막혔을 때만 감 (살 돈이 있거나 팔 것이 있을 때)
 *  - 밭·목장 말고도 여러 콘텐츠(extra): 까마귀·여우 쫓기, 주민 부탁, 논농사, 꿀, 과일 나무, 보물 상자, 강아지, 곤충, 전망대 첫 방문
 */
export const PRIORITY = {
  shoo: 0, harvest: 0, collect: 1, water: 2, rice_harvest: 2, rice_water: 2, rice_drain: 2,
  weed: 3, rice_weed: 3, deliver: 3, petfind: 3, feed: 4, honey: 4, trough: 4, rice_plant: 4,
  plant: 5, shake: 5, chest: 5, rice_till: 5, rice_flood: 5, fert: 6, lookout: 6, till: 6,
  petdog: 7, brush: 8, bug: 8, pet: 9, market: 10,
};
export const TIER_W = 8;          // 급한 정도 한 단계 = 거리 8칸
export const SELL_AT = 24;        // 작물·생산물이 이만큼 모이면 팔러 감
export const RESERVE = 30;        // 장 볼 때 남겨 두는 돈
export const MAX_BUY = 10;        // 한 번에 사는 씨앗·사료 최대 수
export const RECENT_W = 4;        // 최근에 같은 콘텐츠를 한 번 할 때마다 붙는 거리 (한 가지만 계속하지 않게)

/** 할 일의 콘텐츠 묶음: 밭 / 목장 / 논 / 꿀 … (최근에 많이 한 묶음은 조금 뒤로) */
export function categoryOf(t) {
  if (t.kind === 'plot') return 'field';
  if (t.kind === 'animal') return 'ranch';
  return String(t.type).split('_')[0];
}

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
  out.rice = 0;
  const crop = bestUnlockedAffordable(s.level, money);
  if (sNeed > 0 && crop) {
    const n = Math.min(sNeed, Math.floor(money / CROPS[crop].seedPrice));
    if (n > 0) { out.seeds = { crop, n }; cost += n * CROPS[crop].seedPrice; money -= n * CROPS[crop].seedPrice; }
  }
  // 볍씨: 모낼 논(빈 논·물 댄 논) 수만큼
  const rNeed = Math.min(MAX_BUY, Math.max(0, (s.riceFree || 0) - (s.riceSeeds || 0)));
  const rn = Math.max(0, Math.min(rNeed, Math.floor(money / ITEMS.rice_seed.price)));
  if (rn > 0) { out.rice = rn; cost += rn * ITEMS.rice_seed.price; }
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
 *   shop: shopList 결과(팔고 난 돈 기준), skip: Set(키) — 잠시 건너뛸 대상,
 *   extra: [{ type, key, x, z, tier? }] — 그 밖의 콘텐츠 할 일 (type 은 PRIORITY 키),
 *   riceBlocked: 볍씨가 없어 모내기를 못 하는 논이 있음,
 *   recent: [카테고리] — 최근에 한 일 (categoryOf)
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
  for (const t of s.extra || []) if (PRIORITY[t.type] !== undefined) add(t);
  if (s.riceBlocked) blocked = true;
  const buys = s.shop && (s.shop.feed > 0 || s.shop.seeds || s.shop.rice > 0);
  const full = (s.sellCount || 0) >= SELL_AT;
  if (s.market && (full || (blocked && buys))) {
    // 가방이 찼거나 할 일이 없으면 최우선, 씨앗·사료 때문에 막혔으면 심기와 같은 급 (밭만 잔뜩 갈아 두지 않게)
    const tier = full || !cands.length ? PRIORITY.collect : blocked ? PRIORITY.plant : PRIORITY.market;
    add({ kind: 'market', type: 'market', key: 'market', x: s.market.x, z: s.market.z, tier });
  }
  if (!cands.length) return null;
  const pos = s.pos || { x: 0, z: 0 };
  const recent = {};
  for (const c of s.recent || []) recent[c] = (recent[c] || 0) + 1;
  const score = (t) => (t.tier ?? PRIORITY[t.type]) * TIER_W + Math.hypot(t.x - pos.x, t.z - pos.z)
    + (t.type === 'shoo' ? 0 : (recent[categoryOf(t)] || 0) * RECENT_W);
  let best = cands[0], bs = score(best);
  for (const t of cands) { const v = score(t); if (v < bs) { bs = v; best = t; } }
  return best;
}

/** 작업 이름 (상태 표시) */
export const TASK_LABEL = {
  harvest: '🧺 수확', collect: '🥚 생산물 거두기', water: '💧 물 주기', weed: '🌿 김매기', feed: '🌾 사료 주기',
  plant: '🌱 씨앗 심기', fert: '🟫 퇴비 주기', till: '⛏️ 밭 갈기', brush: '🪮 빗질', pet: '💕 쓰다듬기', market: '🛒 장터에서 사고팔기',
  shoo: '👋 불청객 쫓기', deliver: '📝 주민 부탁 들어주기', petfind: '🐕 강아지가 찾은 것 받기', honey: '🍯 꿀 거두기', trough: '🌾 여물통 채우기',
  shake: '🍎 과일 나무 흔들기', chest: '🎁 보물 상자 열기', lookout: '🔭 전망대 구경', petdog: '🐕 강아지 쓰다듬기', bug: '🦋 곤충 잡기',
  rice_till: '🌾 논 갈기', rice_flood: '🌾 논에 물 대기', rice_plant: '🌾 모내기', rice_water: '🌾 논 물 대기', rice_drain: '🌾 논 물 빼기',
  rice_weed: '🌾 논 김매기', rice_harvest: '🌾 벼 베기',
};
