export const SAVE_KEY = 'unico-farm-save-v1';
const KEY = SAVE_KEY;
/** 마지막으로 깨끗하게 불러온 기록 (부팅마다 한 번 · 치명 오류 저장 직전) */
export const BAK_KEY = `${KEY}.bak`;
/** 읽지 못한 기록 원본 (처음 것은 그대로 두고, 그다음 것은 BROKEN_KEY2 에 덮어씀) — 새 농장이 덮어써도 남게 */
export const BROKEN_KEY = `${KEY}.broken`;
export const BROKEN_KEY2 = `${KEY}.broken2`;
let blocked = false; // 초기화(clearSave)·읽기 전용(새 버전 기록·다른 창) 뒤 저장 막음: 떠날 때 저장(숨김·pagehide)이 지운 농장을 되살리거나 덮어쓰지 않게
let lastError = null; // 마지막 저장 실패 까닭: 'quota' | 'denied' | 'state' | 'other'
let warned = false;
const isObj = (d) => !!d && typeof d === 'object' && !Array.isArray(d);

/** 저장 실패 까닭 나누기 (저장 공간 부족 · 저장소 막힘 · 그 밖) */
function kindOf(e) {
  const n = e?.name || '';
  if (n === 'QuotaExceededError' || n === 'NS_ERROR_DOM_QUOTA_REACHED' || e?.code === 22 || e?.code === 1014) return 'quota';
  if (n === 'SecurityError') return 'denied';
  return 'other';
}
function warnOnce(...a) { if (!warned) { warned = true; console.warn('저장 실패:', ...a); } }

/** 이상한 상태(위치·코인이 숫자가 아님)는 저장하지 않음 — 오류 난 프레임의 반쯤 바뀐 상태가 좋은 기록을 덮지 않게 */
function sane(d) {
  const p = d.player, m = d.economy?.money;
  return !!p && Number.isFinite(p.x) && Number.isFinite(p.z) && (m === undefined || Number.isFinite(m));
}

/**
 * 지금 상태 저장 → 성공하면 true
 * @param opt.crash 치명 오류 직전 저장: 지금 기록을 먼저 .bak 으로 옮겨 둠
 */
export function saveGame(game, opt = {}) {
  if (blocked) return false;
  try {
    const data = {
      v: SAVE_VERSION, at: Date.now(), name: game.playerName,
      farm: game.farm.sim.toJSON(), economy: game.economy.toJSON(), quests: game.quests.toJSON(), ranch: game.ranch.toJSON(),
      rice: game.rice.toJSON(), nature: game.nature.toJSON(), villagers: game.villagers.toJSON(), collection: game.collection.toJSON(), koat: game.koat.toJSON(),
      world: { time: game.world.time, day: game.world.day },
      player: game.home?.inside ? { ...game.home.outPos } : { x: game.player.position.x, z: game.player.position.z }, // 집 안이면 문 앞으로 저장
      flags: game.flags || {},
      explore: game.explore?.toJSON(),
      bees: game.bees?.toJSON(),
      angling: game.angling?.toJSON(),
      farmcraft: game.farmcraft?.toJSON(),
      town: game.town?.toJSON(),
      home: game.home?.toJSON(),
      costume: game.costume?.toJSON(),
      social: game.social?.toJSON(),
      decor: game.decor?.toJSON(),
      pet: game.pet?.ok ? game.pet.toJSON() : undefined,
    };
    if (!sane(data)) { lastError = 'state'; warnOnce('위치·코인 값이 숫자가 아니어서 건너뜀'); return false; }
    const json = JSON.stringify(data);
    if (opt.crash) {
      // 지금 기록이 읽을 수 있을 때만 백업으로 (못 읽은 기록이 좋은 백업을 덮지 않게)
      try { const cur = localStorage.getItem(KEY); if (cur && isObj(JSON.parse(cur))) localStorage.setItem(BAK_KEY, cur); } catch { /* 백업 없이 저장 */ }
    }
    localStorage.setItem(KEY, json);
    lastError = null;
    return true;
  } catch (e) {
    lastError = kindOf(e);
    warnOnce(e);
    return false;
  }
}

/** 저장이 막혀 있는지 (초기화 뒤·읽기 전용) — 실패와 구별 */
export function saveBlocked() { return blocked; }
/** 마지막 저장 실패 까닭 (성공하면 null) */
export function lastSaveError() { return lastError; }
/** 읽기 전용: 새 버전으로 저장된 기록·다른 창에서 플레이 중일 때 이 창은 저장하지 않음 */
export function setReadOnly(on = true) { blocked = !!on; }

const SAVE_VERSION = 1;
/** 저장 포맷이 바뀌면 여기에 v(n-1) → v(n) 변환을 추가 (vendored skill `save-systems` 의 버전/마이그레이션 패턴) */
const MIGRATIONS = {
  // 2: (d) => ({ ...d, v: 2 }),
};

export function migrate(data) {
  if (!data) return null;
  let d = data;
  for (let v = d.v || 1; v < SAVE_VERSION; v++) d = MIGRATIONS[v + 1] ? MIGRATIONS[v + 1](d) : { ...d, v: v + 1 };
  return d;
}

/**
 * 저장 기록 읽기 → { status, data, raw }
 *  - ok: 읽음 · empty: 없음(처음) · broken: 있는데 못 읽음 · newer: 이 판보다 새 버전으로 저장됨
 */
export function loadSaveInfo() {
  let raw;
  try { raw = localStorage.getItem(KEY); } catch { return { status: 'empty', data: null, raw: null }; }
  if (raw == null || raw === '') return { status: 'empty', data: null, raw: null };
  let d;
  try { d = JSON.parse(raw); } catch { return { status: 'broken', data: null, raw }; }
  if (!isObj(d)) return { status: 'broken', data: null, raw };
  if ((Number(d.v) || 1) > SAVE_VERSION) return { status: 'newer', data: d, raw };
  try { return { status: 'ok', data: migrate(d), raw }; } catch { return { status: 'broken', data: null, raw }; }
}

/** 예전 함수: 읽은 기록 (없거나 못 읽으면 null) */
export function loadSave() {
  const i = loadSaveInfo();
  return i.status === 'ok' || i.status === 'newer' ? i.data : null;
}

/** .bak 기록 (읽을 수 있을 때만) → { data, raw, at } */
export function loadBackup() {
  try {
    const raw = localStorage.getItem(BAK_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (!isObj(d) || (Number(d.v) || 1) > SAVE_VERSION) return null;
    return { data: migrate(d), raw, at: Number(d.at) || 0 };
  } catch { return null; }
}

/** 깨끗하게 불러온 기록을 .bak 으로 (저장 공간이 모자라면 조용히 건너뜀) */
export function backupSave(raw) {
  try { if (raw) localStorage.setItem(BAK_KEY, raw); return true; } catch { return false; }
}

/** 읽지 못한 원본 보관 → 보관돼 있으면 true (false 면 덮어쓰면 안 됨) */
export function keepBroken(raw) {
  if (!raw) return true;
  try {
    const first = localStorage.getItem(BROKEN_KEY);
    if (first === raw || localStorage.getItem(BROKEN_KEY2) === raw) return true;
    localStorage.setItem(first ? BROKEN_KEY2 : BROKEN_KEY, raw);
    return true;
  } catch { return false; }
}

/** 초기화: 기록과 백업을 지움 (읽지 못한 원본 보관본은 남김) */
export function clearSave() {
  blocked = true;
  try { localStorage.removeItem(KEY); localStorage.removeItem(BAK_KEY); } catch {}
}
