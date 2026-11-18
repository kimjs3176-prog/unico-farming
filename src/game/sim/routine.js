/**
 * 주민 하루 일과 (렌더링 무관, 테스트: tests/routine.test.js)
 *
 * 마을을 가로지르지 않는 '자리 옮기기': 주민마다 2~3개 자리, 모두 제자리(LAYOUT.npcs)에서 12m 안.
 * 하루(6분)에 몇 번만 걸어서 옮기고, 밤에도 사라지지 않음 (졸기만 함 — 말 걸면 깸).
 *  - at: 갈 자리 {x, z} (null = 제자리), face: 바라볼 방향(atan2(dx, dz)), act: 그 자리에서 하는 동작,
 *    via: 제자리 → 자리 사이 경유점 (돌아올 때는 거꾸로), dry: 비 오면 제자리에 있음, awake: 밤에도 졸지 않음 (밤낚시·반딧불이)
 *  - 꼬마(kid)의 제자리는 돌아다니는 들판 (wander)
 *  - face 는 일하는 모습이 다가오는 길에서 3/4 앞모습으로 보이게 (논·연못을 등지지 않는 선에서 길 쪽으로 비스듬히)
 * 밭(±7.2, ±3.6)·자전거 자리·장식 놓는 자리와 겹치지 않음 (decor_view 가 모든 자리를 보호 구역으로)
 */
export const NIGHT_FROM = 21, NIGHT_TO = 5; // 졸기 시작·깨는 시각
export const ROUTINE_REACH = 12; // 제자리에서 이만큼(m) 안에만 자리
export const ROUTINE_CHECK = 1; // 자리 확인 간격(초) — 매 프레임 찾지 않음

/** 여우가 밤에 돈 세는 벤치 옆 (밤 12시 앞뒤 두 칸이 같은 자리), 길(x=0)을 오가는 플레이어 쪽으로 비스듬히 */
const BENCH = { x: 2.7, z: -11.2 }, BENCH_FACE = Math.atan2(-0.7, 1);
/** 주민별: 시각 어긋남(시간, ±0.7 안 — 모두 같은 순간에 출발하지 않게)과 자리 목록 (0~24시를 빈틈없이) */
export const ROUTINE = {
  // 낚시꾼 고양이: 아침·저녁은 부두 끝에서 낚시, 낮엔 가게 앞
  fisher: {
    shift: 0.4,
    slots: [
      { from: 0, to: 5, at: null },
      { from: 5, to: 10, at: { x: -12.5, z: 31.8 }, face: 0, act: 'fishwait', via: [[-6.2, 27.4], [-6.2, 24.3], [-12.5, 24.3], [-12.5, 29.0]], dry: true },
      { from: 10, to: 18, at: null },
      { from: 18, to: 24, awake: true, at: { x: -12.5, z: 31.8 }, face: 0, act: 'fishwait', via: [[-6.2, 27.4], [-6.2, 24.3], [-12.5, 24.3], [-12.5, 29.0]], dry: true },
    ],
  },
  // 곰 할머니: 아침엔 논두렁에서 호미질
  granny: {
    shift: -0.2,
    slots: [
      { from: 0, to: 6, at: null },
      { from: 6, to: 11, at: { x: -7.6, z: -21.2 }, face: Math.PI / 4, act: 'hoe', via: [], dry: true },
      { from: 11, to: 24, at: null },
    ],
  },
  // 연구원 너구리: 오전엔 스마트팜 온실 옆에서 태블릿으로 센서 값 보기
  researcher: {
    shift: -0.5,
    slots: [
      { from: 0, to: 7, at: null },
      { from: 7, to: 12, at: { x: -16.8, z: -6.2 }, face: -Math.PI / 2, act: 'lab', via: [] },
      { from: 12, to: 24, at: null },
    ],
  },
  // 장터 여우: 낮엔 가판대, 저녁엔 가로등·벤치 옆에서 오늘 번 돈 세기
  merchant: {
    shift: 0.3,
    slots: [
      { from: 0, to: 6, at: BENCH, face: BENCH_FACE, act: 'count', via: [] },
      { from: 6, to: 19, at: null },
      { from: 19, to: 24, at: BENCH, face: BENCH_FACE, act: 'count', via: [] },
    ],
  },
  // 안내 강아지: 낮엔 확성기, 해 질 녘엔 가로등 옆에서 손 흔들기
  guide: {
    shift: 0.6,
    slots: [
      { from: 0, to: 17, at: null },
      { from: 17, to: 21, at: { x: 4.4, z: 8.6 }, face: Math.atan2(-4.4, 0.4), act: 'wave', via: [] },
      { from: 21, to: 24, at: null },
    ],
  },
  // 꼬마 토끼: 낮엔 들판을 뛰어다니고, 밤 8시부터 연못 동쪽에서 반딧불이 채집
  kid: {
    shift: -0.6,
    slots: [
      { from: 0, to: 6, at: null },
      { from: 6, to: 20, at: null },
      { from: 20, to: 24, awake: true, at: { x: -6.6, z: 16.6 }, face: Math.atan2(-0.4, -1), act: 'net', via: [[-5.4, 9.6], [-1.6, 9.6], [-1.6, 12.8], [-5.3, 13.0]], dry: true },
    ],
  },
};

/** 0~24 로 */
export const wrapHour = (h) => ((h % 24) + 24) % 24;
/** 하루 진행(0..1) → 시각 */
export const hourOf = (time) => wrapHour(time * 24);
/** 밤인가 (졸 시간) */
export const isNight = (hour) => hour >= NIGHT_FROM || hour < NIGHT_TO;

/** id 주민이 hour 시에 있을 자리 (비가 오면 dry 자리는 제자리로). 일과가 없으면 null */
export function slotAt(id, hour, rain = false) {
  const R = ROUTINE[id];
  if (!R) return null;
  const h = wrapHour(hour - R.shift);
  let s = R.slots.find((x) => h >= x.from && h < x.to) || R.slots[0];
  if (rain && s.dry) s = HOME;
  return s;
}
const HOME = { from: 0, to: 24, at: null };

/** 제자리 home → 자리 slot 경로 (경유점 + 도착점). 돌아올 때(back)는 거꾸로 */
export function legOf(home, slot, back = false) {
  const pts = [{ x: home.x, z: home.z }, ...(slot.via || []).map(([x, z]) => ({ x, z })), { x: slot.at.x, z: slot.at.z }];
  return back ? pts.reverse() : pts;
}

/** 모든 일과 자리 (장식 보호 구역용): [{ id, x, z }] */
export function routineSpots() {
  const out = [];
  for (const [id, R] of Object.entries(ROUTINE)) for (const s of R.slots) if (s.at && !out.some((o) => o.id === id && o.x === s.at.x && o.z === s.at.z)) out.push({ id, x: s.at.x, z: s.at.z });
  return out;
}

/** 지금 출발해도 되나: 플레이어가 가까이(4m) 있거나 대화 중이면 기다림 */
export const HOLD_NEAR = 4;
export const canDepart = (playerDist, talking) => !talking && !(playerDist <= HOLD_NEAR);
