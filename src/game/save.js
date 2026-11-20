export const SAVE_KEY = 'unico-farm-save-v1';
const KEY = SAVE_KEY;
/** 마지막으로 깨끗하게 불러온 기록 (부팅마다 한 번 · 치명 오류 저장 직전) */
export const BAK_KEY = `${KEY}.bak`;
/** 읽지 못한 기록 원본 (처음 것은 그대로 두고, 그다음 것은 BROKEN_KEY2 에 덮어씀) — 새 농장이 덮어써도 남게 */
export const BROKEN_KEY = `${KEY}.broken`;
export const BROKEN_KEY2 = `${KEY}.broken2`;
/** 치명 오류로 멈춘 뒤 표시: 다음 부팅이 오류 직전 기록을 .bak 으로 덮지 않게 (정상으로 한동안 놀면 지움) */
export const CRASH_MARK = `${KEY}.crashed`;
/** '여기서 이어 하기' 로 넘겨받은 창의 표시 (다른 창은 이 키가 바뀌면 멈춤) */
export const OWNER_KEY = `${KEY}.owner`;
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
      weekly: game.weekly?.toJSON(),
      pet: game.pet?.ok ? game.pet.toJSON() : undefined,
    };
    if (!sane(data)) { lastError = 'state'; warnOnce('위치·코인 값이 숫자가 아니어서 건너뜀'); return false; }
    const json = JSON.stringify(data);
    if (opt.crash) {
      // 지금 기록이 읽을 수 있을 때만 백업으로 (못 읽은 기록이 좋은 백업을 덮지 않게)
      try { const cur = localStorage.getItem(KEY); if (cur && isObj(JSON.parse(cur))) localStorage.setItem(BAK_KEY, cur); } catch { /* 백업 없이 저장 */ }
    }
    localStorage.setItem(KEY, json);
    if (opt.crash) { try { localStorage.setItem(CRASH_MARK, '1'); } catch { /* 표시 없이 */ } }
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

const SAVE_VERSION = 2; // 미완료 선물·수령 번호를 모르는 옛 클라이언트가 기록을 덮지 않게
/** 저장 포맷이 바뀌면 여기에 v(n-1) → v(n) 변환을 추가 (vendored skill `save-systems` 의 버전/마이그레이션 패턴) */
const MIGRATIONS = {
  2: (d) => ({ ...d, v: 2 }), // 새 SocialSim 필드는 load 에서 기본값으로 채움
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

/** 저장된 마을 별 수 (월드를 만들 때 동상을 정적 묶음에 넣을지 미리 봄, 못 읽으면 0) */
export function peekTownStar() {
  try { const n = loadSave()?.flags?.townStar; return Number.isFinite(n) ? n : 0; } catch { return 0; }
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

/** 지난 접속이 치명 오류로 멈췄는지 */
export function crashMarked() {
  try { return localStorage.getItem(CRASH_MARK) === '1'; } catch { return false; }
}
/** 치명 오류 표시 지우기 (정상으로 놀았을 때) */
export function clearCrashMark() {
  try { localStorage.removeItem(CRASH_MARK); } catch { /* 무시 */ }
}

/** 이 창이 기록을 넘겨받았다고 알림 → 다른 창의 storage 이벤트로 그 창이 멈춤 */
export function claimOwner(id) {
  try { localStorage.setItem(OWNER_KEY, JSON.stringify({ id, t: Date.now() })); return true; } catch { return false; }
}

/** 초기화: 기록과 백업을 지움 (읽지 못한 원본 보관본은 남김) */
export function clearSave() {
  blocked = true;
  try { localStorage.removeItem(KEY); localStorage.removeItem(BAK_KEY); localStorage.removeItem(CRASH_MARK); } catch {}
}

/* ── 농장 옮기기: 농장 코드(UF1.)·파일 내보내기/불러오기 (tests/save_transfer.test.js) ── */
/** 가져온 직후 표시: 첫 부팅 한 번은 .bak 을 새로 쓰지 않음 (옮기기 전 농장을 남겨 둠) */
export const IMPORT_MARK = `${KEY}.imported`;
/** 가져온 직후인가 (읽으면 지움) */
export function takeImportMark() {
  try { const on = localStorage.getItem(IMPORT_MARK) === '1'; if (on) localStorage.removeItem(IMPORT_MARK); return on; } catch { return false; }
}
export const CODE_PREFIX = 'UF1.';
export const CODE_MAX = 256 * 1024; // 받는 글 최대 길이
export const QR_MAX = 2300;         // QR 에 담는 농장 코드 최대 길이

/** FNV-1a 32비트 → 8자리 16진수 (코드가 잘리거나 바뀌었는지) */
export function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0');
}
function toB64url(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64url(s) {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}
async function pipe(bytes, Stream, kind) {
  const res = new Response(new Blob([bytes]).stream().pipeThrough(new Stream(kind)));
  return new Uint8Array(await res.arrayBuffer());
}

/** 지금 저장된 농장 기록 (원문 JSON, 없으면 null) */
export function currentSaveRaw() {
  try { return localStorage.getItem(KEY) || null; } catch { return null; }
}

/**
 * 농장 코드 만들기: JSON → gzip → base64url, 'UF1.g.<체크섬>.<본문>' (압축을 못 하면 'UF1.j.' 로 그대로)
 * @param raw 저장 원문 (기본: 지금 저장된 기록)
 */
export async function exportCode(raw = currentSaveRaw()) {
  if (!raw) return null;
  const json = typeof raw === 'string' ? raw : JSON.stringify(raw);
  const sum = fnv1a(json), bytes = new TextEncoder().encode(json);
  if (typeof CompressionStream === 'function') {
    try { return `${CODE_PREFIX}g.${sum}.${toB64url(await pipe(bytes, CompressionStream, 'gzip'))}`; } catch { /* 압축 없이 */ }
  }
  return `${CODE_PREFIX}j.${sum}.${toB64url(bytes)}`;
}

/** 기록 요약 (비교 창): 이름·며칠째·코인·저장 시각 */
export function saveSummary(d) {
  if (!isObj(d)) return null;
  const day = Number(d.world?.day), coins = Number(d.economy?.money), at = Number(d.at);
  return { name: String(d.name || '').slice(0, 12) || '이름 없음', day: Number.isFinite(day) ? Math.max(1, Math.floor(day)) : 1, coins: Number.isFinite(coins) ? Math.floor(coins) : 0, at: Number.isFinite(at) ? at : 0 };
}

/** 이 기기의 지금 농장 요약 (없거나 못 읽으면 null) */
/** 이 기기에 못 읽는(망가진) 기록이 있는지 (비교 카드에서 '농장 없음' 대신 알림) */
export function hasBrokenSave() {
  return loadSaveInfo().status === 'broken';
}

export function localSummary() {
  const i = loadSaveInfo();
  return i.status === 'ok' || i.status === 'newer' ? saveSummary(i.data) : null;
}

/** 읽은 기록 검사: 버전·핵심 칸 → { ok, data, summary } | { ok:false, reason } */
function checkData(d) {
  if (!isObj(d)) return { ok: false, reason: 'format' };
  if ((Number(d.v) || 1) > SAVE_VERSION) return { ok: false, reason: 'newer' };
  if (!isObj(d.farm) || !isObj(d.economy) || !isObj(d.world)) return { ok: false, reason: 'missing' };
  let m;
  try { m = migrate(d); } catch { return { ok: false, reason: 'format' }; }
  if (!sane({ player: m.player || { x: 0, z: 9 }, economy: m.economy })) return { ok: false, reason: 'format' };
  return { ok: true, data: m, summary: saveSummary(m) };
}

/** 까닭 → 안내 문구 */
export const CODE_ERR = {
  empty: '농장 코드나 파일을 넣어 주세요',
  toolong: '너무 커서 농장 기록이 아니에요',
  format: '유니코 팜 농장 코드가 아니에요',
  checksum: '코드가 잘렸거나 바뀌었어요. 처음부터 끝까지 다시 복사해 주세요',
  corrupt: '코드를 풀지 못했어요. 다시 복사해 주세요',
  newer: '더 새 버전에서 만든 농장이에요. 새로고침한 뒤 다시 해 주세요',
  missing: '농장 기록에 꼭 있어야 할 칸(밭·지갑·날짜)이 없어요',
};

/**
 * 농장 코드·파일 글 읽기 → { ok, data, summary } | { ok:false, reason }
 * 받는 것: 'UF1.' 코드, '#farm=' 이 붙은 주소, 파일로 저장한 JSON
 */
export async function parseCode(input) {
  let s = String(input ?? '').trim();
  if (!s) return { ok: false, reason: 'empty' };
  if (s.length > CODE_MAX) return { ok: false, reason: 'toolong' };
  const hash = s.indexOf('#farm=');
  if (hash >= 0) { s = s.slice(hash + 6); try { s = decodeURIComponent(s); } catch { /* 그대로 */ } }
  if (s.startsWith('{')) {
    let d;
    try { d = JSON.parse(s); } catch { return { ok: false, reason: 'format' }; }
    return checkData(d?.unicoFarm && isObj(d.save) ? d.save : d); // 파일: 기록 그대로 (또는 { unicoFarm, save })
  }
  s = s.replace(/\s+/g, '');
  const m = /^UF1\.([gj])\.([0-9a-f]{8})\.([A-Za-z0-9_-]+)$/.exec(s);
  if (!m) return { ok: false, reason: s.startsWith(CODE_PREFIX) ? 'checksum' : 'format' };
  let json;
  try {
    const bytes = fromB64url(m[3]);
    if (m[1] === 'g') {
      if (typeof DecompressionStream !== 'function') return { ok: false, reason: 'corrupt' };
      json = new TextDecoder().decode(await pipe(bytes, DecompressionStream, 'gzip'));
    } else json = new TextDecoder().decode(bytes);
  } catch { return { ok: false, reason: 'checksum' }; } // 잘린 gzip 은 풀다가 실패
  if (fnv1a(json) !== m[2]) return { ok: false, reason: 'checksum' };
  let d;
  try { d = JSON.parse(json); } catch { return { ok: false, reason: 'corrupt' }; }
  return checkData(d);
}

/**
 * 가져온 농장으로 바꾸기: 저장을 먼저 막고(떠날 때 저장이 덮지 않게) 지금 기록을 .bak 으로, 새 기록을 쓰고 새로고침
 * 게임이 돌고 있으면 그 자리에서 바꾸지 않음 (불러오기는 한 번만 하도록 짜여 있음)
 * @param opt.reload false 면 새로고침·저장 막기 없이 쓰기만 (부팅 중, 게임을 만들기 전)
 */
export function importSave(data, { reload = true } = {}) {
  if (!isObj(data)) return false;
  if (reload) blocked = true;
  try {
    const cur = localStorage.getItem(KEY);
    if (cur) {
      let ok = false;
      try { ok = isObj(JSON.parse(cur)); } catch { /* 못 읽는 기록 */ }
      if (ok) localStorage.setItem(BAK_KEY, cur);
      else keepBroken(cur); // 못 읽는 기록은 .bak 대신 망가진 기록 칸에 (나중에 되살릴 수 있게, 그냥 덮지 않음)
    }
    localStorage.setItem(KEY, JSON.stringify(data));
    localStorage.removeItem(CRASH_MARK);
    if (cur) localStorage.setItem(IMPORT_MARK, '1'); // 다음 부팅이 .bak(옮기기 전 농장)을 덮지 않게
  } catch { if (reload) blocked = false; return false; }
  if (reload && typeof location !== 'undefined' && typeof location.reload === 'function') location.reload();
  return true;
}
