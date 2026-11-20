/**
 * 방 공동 목표 '함께 수확' (Node 서버 rooms.js 와 Cloudflare worker.js 가 함께 씀 — 순수 로직, tests/goal.test.js)
 *  - 한국 날짜(KST)마다 목표 3개까지: 150 → 225 → 340 (방 인원과 무관, 만들 때 정해짐)
 *  - 기여 메시지 하나는 정수 1~10, 한 사람이 10초에 6번까지
 *  - 한 사람 몫: 보탠 사람 수에 맞춰 목표의 1/2(둘 이하) → 1/3 → 1/4(넷 이상). 혼자서는 못 채우고, 둘이면 채울 수 있음
 *    (작은 방에서도 막대가 끝까지 찰 수 있게. 1/4 고정이면 넷 미만인 방은 첫 목표도 못 채움)
 *  - 몫은 저장된 농장 식별자(clientId)로 셈: 다시 접속해도 몫이 이어짐
 */
export const GOAL_BASE = 150;
export const GOAL_GROW = 1.5;
export const GOALS_PER_DAY = 3;
export const CONTRIB_MAX = 10;      // 메시지 하나에 담는 최대 수
export const CONTRIB_MSGS = 6;      // 10초에 이만큼 메시지까지
export const CONTRIB_WINDOW = 10000;
export const PLAYER_SHARE = 0.25;   // 한 사람 몫의 가장 작은 값 (목표 대비, 넷 이상일 때)
export const SHARE_MIN_PEOPLE = 2;  // 몫을 나눌 때 적어도 이만큼 있다고 셈 (혼자 다 채우지 않게)
export const GOAL_FLUSH_MS = 1000;  // 진행 알림·저장을 이 간격 이상으로 묶음

/** 한국 날짜 'YYYY-MM-DD' (UTC+9, 서머타임 없음) */
export function kstDate(now = Date.now()) {
  return new Date(now + 9 * 3600000).toISOString().slice(0, 10);
}

/** 목표 크기: 5 단위로 반올림 */
export function goalTarget(seq) {
  return Math.round((GOAL_BASE * GOAL_GROW ** (seq - 1)) / 5) * 5;
}

/** 그날 seq 번째 목표 (만들 때 크기가 정해짐) */
export function goalFor(date, seq = 1) {
  const s = Math.max(1, Math.min(GOALS_PER_DAY, Math.floor(Number(seq) || 1)));
  return { key: `${date}#${s}`, date, seq: s, target: goalTarget(s), progress: 0, done: false };
}

/** 받은 수 검사: 정수 1 이상만, 10 넘으면 10 으로 (아니면 0) */
export function sanitizeContrib(n) {
  const v = typeof n === 'number' ? n : NaN;
  if (!Number.isInteger(v) || v < 1) return 0;
  return Math.min(CONTRIB_MAX, v);
}

/** 보낸 시각 목록으로 도배 검사 → { ok, times } (times 는 새 배열) */
export function rateOk(times, now) {
  const t = (Array.isArray(times) ? times : []).filter((x) => now - x < CONTRIB_WINDOW);
  if (t.length >= CONTRIB_MSGS) return { ok: false, times: t };
  t.push(now);
  return { ok: true, times: t };
}

/** 저장해 둔 상태 → 오늘 목표 (날짜가 바뀌었으면 새 목표·새 몫) */
export function rollGoal(state, now = Date.now()) {
  const date = kstDate(now);
  if (state?.goal?.date === date && state.goal.key && Number.isFinite(state.goal.target)) return { goal: state.goal, tally: state.tally || {} };
  return { goal: goalFor(date, 1), tally: {} };
}

/** 이 사람(who)이 채울 수 있는 몫: 보탠 사람 수(이 사람 포함)로 나눈 만큼, 1/4 보다 작아지지 않음 */
export function shareCap(goal, tally = {}, who = null) {
  const keys = Object.keys(tally || {}).length;
  const people = keys + (who && !(who in (tally || {})) ? 1 : 0);
  const frac = Math.max(PLAYER_SHARE, 1 / Math.max(SHARE_MIN_PEOPLE, people));
  return Math.ceil(goal.target * frac);
}

/**
 * 기여 더하기 (goal·tally 를 고침) → { changed, done, added }
 * who: 사람 열쇠 (clientId 또는 '#id')
 */
export function addContrib(goal, tally, who, n) {
  const v = sanitizeContrib(n);
  if (!goal || goal.done || !v || !who) return { changed: false, done: false, added: 0 };
  const cap = shareCap(goal, tally, who);
  const mine = tally[who] || 0;
  const add = Math.min(v, cap - mine, goal.target - goal.progress);
  if (add <= 0) return { changed: false, done: false, added: 0 };
  tally[who] = mine + add;
  goal.progress += add;
  if (goal.progress >= goal.target) goal.done = true;
  return { changed: true, done: goal.done, added: add };
}

/** 다 채운 목표 다음: 그날의 다음 목표 (마지막이면 그대로 두고 null) */
export function nextGoal(goal) {
  if (!goal?.done || goal.seq >= GOALS_PER_DAY) return null;
  return goalFor(goal.date, goal.seq + 1);
}

/** 사람에게 보내는 목표 모양 (share: 새로 보태는 사람이 채울 수 있는 몫, 표시용) */
export function goalMsg(goal, tally = {}) {
  return goal ? { t: 'goal', key: goal.key, seq: goal.seq, of: GOALS_PER_DAY, target: goal.target, progress: goal.progress, done: !!goal.done, share: shareCap(goal, tally, '\u0000new') } : null;
}

/** 사람 열쇠: 저장된 농장 식별자가 있으면 그것 (다시 접속해도 같은 몫), 없으면 접속 번호 */
export const contribKey = (p) => (p?.clientId ? `c:${p.clientId}` : `#${p?.id}`);
