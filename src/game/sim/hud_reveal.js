// HUD 단계적 공개: 처음에는 꼭 필요한 버튼만, 해 보면 하나씩 열림 (튜토리얼을 건너뛰는 지름길을 늦게)
// 저장: game.flags.hud = 열린 열쇠 배열 (flags 와 함께 저장). 예전 기록(인트로를 봤고 hud 가 없음)은 모두 열림

/** 차례로 열리는 버튼 */
export const GATED = ['market', 'book', 'koat', 'decor', 'auto'];
/** 접속 중일 때만 보이는 버튼 (저장하지 않음) */
export const NET_KEYS = ['emote', 'talk', 'rooms'];

/** 열릴 때 한 줄 안내 */
export const COACH = {
  market: '🛒 장터 버튼이 생겼어요! 이제 어디서든 사고팔 수 있어요',
  book: '📖 도감이 열렸어요! 모은 물고기·곤충을 볼 수 있어요',
  koat: 'KOAT 체험관이 열렸어요! 🏢 버튼으로 가 보세요',
  decor: '🪑 꾸미기가 열렸어요! 소품으로 농장을 꾸며 보세요',
  auto: '🤖 자동 버튼이 생겼어요! 바쁠 땐 유니코에게 맡겨 보세요 (P 키)',
};

/** 주소 쿼리 → 행사용 바로 열기 (?koat=1 체험관, ?kiosk=1 체험관·자동) */
export function hudParams(search = '') {
  let q;
  try { q = new URLSearchParams(search); } catch { return { koat: false, kiosk: false }; }
  const on = (k) => q.has(k) && q.get(k) !== '0';
  return { koat: on('koat'), kiosk: on('kiosk') };
}

/**
 * 처음 한 번: 저장에 hud 가 없을 때 무엇으로 시작할지
 * @param fresh 새 농장(인트로 전)이면 true → 빈 목록, 아니면 예전 기록 → 모두 열림
 */
export function initHud(flags, fresh) {
  if (Array.isArray(flags?.hud)) return flags.hud;
  return fresh ? [] : [...GATED];
}

const n = (v) => (typeof v === 'number' && v > 0 ? v : 0);

/**
 * 지금 열려야 하는 버튼 (조건은 누적: 한 번 맞으면 계속)
 * @param s { progress, claimed, level, book, params }
 */
export function revealsFor(s) {
  const pr = s.progress || {}, cl = s.claimed || {}, P = s.params || {};
  const sold = n(pr.sell10) > 0 || !!cl.sell10;
  const harvested = n(pr.harvest5) > 0 || !!cl.harvest5;
  const out = [];
  if (sold) out.push('market'); // 장터 여우에게 직접 한 번 팔아 본 뒤
  if (n(s.book) > 0) out.push('book'); // 물고기·곤충 등 도감 첫 등록
  if (harvested || P.koat || P.kiosk) out.push('koat'); // 늦어도 첫 수확
  if ((s.level || 1) >= 3 || n(pr.decor1) > 0 || !!cl.decor1) out.push('decor');
  if ((cl.harvest5 && cl.sell10) || P.kiosk) out.push('auto');
  return out;
}

/** 새로 열린 것만 (이미 열린 것은 빼고, GATED 순서대로) */
export function newReveals(hud, s) {
  const want = new Set(revealsFor(s));
  return GATED.filter((k) => want.has(k) && !hud.includes(k));
}

/** 보일지: 늘 보임 · 열린 것 · 접속 중 */
export function isVisible(key, hud, connected) {
  if (NET_KEYS.includes(key)) return !!connected;
  if (GATED.includes(key)) return !Array.isArray(hud) || hud.includes(key);
  return true;
}

/** 오토플레이를 켜도 되나 (P 키도 같은 확인). hud 가 아직 없으면(예전 기록·시험) 허용 */
export function autoAllowed(flags, params = {}) {
  if (params.kiosk) return true;
  const hud = flags?.hud;
  return !Array.isArray(hud) || hud.includes('auto');
}
