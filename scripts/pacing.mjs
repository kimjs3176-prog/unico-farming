/**
 * 성장 곡선 점검: 플레이어 레벨이 언제 오르는지 (퀘스트 경험치 + 행동 경험치), 마을 별이 언제 뜨는지
 * 가정: 효율 30% = 잘 아는 사람이 쉬지 않고 할 때의 30% 속도 (걷기·구경·대화·쉬기 포함)
 * 실행: node scripts/pacing.mjs [효율 0~1]
 */
import { QUESTS, LEVELS, actionXp } from '../src/game/sim/quests.js';
import { CHAPTERS, QMETA } from '../src/game/sim/chapters.js';
import { CROPS } from '../src/game/sim/crops.js';
import { rating, STAR_AT } from '../src/game/sim/town_rating.js';
import { rewardFor } from '../src/game/sim/weekly.js';

const EFF = Number(process.argv[2]) || 0.3;
const PLOTS = 18;
const STEP_S = 2.5; // 밭 한 칸 일 하나(갈기·심기·물·수확)에 드는 초
const DAY_S = 360;

/** 잘하는 사람이 한 퀘스트에 드는 분 (장 순서대로 하나씩) */
const questMin = (q) => {
  const m = QMETA[q.id];
  if (m.peers) return Infinity; // 혼자 하는 계산에서는 빼기
  if (m.wait) return 12; // 오래 걸리는 목표: 다른 일을 하는 사이에 끝남 (여기서는 순서대로 12분씩)
  return 2.5 + Math.min(6, q.goal * 0.4);
};
const order = [];
for (const c of CHAPTERS) for (const id of c.ids) { const q = QUESTS.find((x) => x.id === id); if (q && !QMETA[id].wait) order.push(q); }
for (const q of QUESTS) if (QMETA[q.id].wait) order.push(q);

// 물고기·곤충은 지금 아이템 id 없이 오므로 희귀도 없이 3 XP (null), 미니게임 별 경험치는 지금 체험관(KOAT) 결과만 보냄 → 하루 두 판 별 2개로 봄
/** 잘하는 사람의 1분 행동 경험치 (레벨에 따라 가장 좋은 작물) — 시간의 40% 밭, 나머지는 목장·낚시·곤충·주문·미니게임 */
function actionPerMin(level) {
  const crop = Object.entries(CROPS).filter(([, c]) => c.unlockLevel <= level).sort((a, b) => b[1].growTime - a[1].growTime)[0][0];
  const C = CROPS[crop];
  const cycle = C.growTime + PLOTS * 4 * STEP_S; // 자라는 동안 + 18칸 일
  const farm = actionXp('harvest', PLOTS * C.yield, crop) / (cycle / 60);
  const day = DAY_S / 60;
  const other = 2 * actionXp('fish', 1, null) + 1 * actionXp('bug', 1, null) + (3 * actionXp('order')) / day + (2 * actionXp('mgstars', 2)) / day + actionXp('thresh') / (DAY_S / 60);
  return 0.4 * farm + 0.6 * other;
}

// 시간 진행 (분 단위)
let xp = 0, t = 0, qi = 0, qLeft = order.length ? questMin(order[0]) : 0, seasonT = 0;
const reach = {}, levelOf = (x) => { let lv = 1; for (let i = 1; i < LEVELS.length; i++) if (x >= LEVELS[i]) lv = i + 1; return lv; };
const MAXT = 20 * 60;
while (t < MAXT && levelOf(xp) < LEVELS.length) {
  t += 1;
  const lv = levelOf(xp);
  xp += actionPerMin(lv) * EFF;
  // 퀘스트: 한 분에 EFF 분만큼 진행
  if (qi < order.length) {
    qLeft -= EFF;
    while (qi < order.length && qLeft <= 0) { const q = order[qi]; if (questMin(q) !== Infinity) xp += q.reward.xp; qi++; qLeft += qi < order.length ? questMin(order[qi]) : 0; }
  }
  // 계절 도전: 계절(7일 = 42분)마다 셋 중 둘쯤
  seasonT += 1;
  if (seasonT >= (7 * DAY_S) / 60) { seasonT = 0; xp += 2 * rewardFor('farm', lv, null, 0).xp; }
  const nl = levelOf(xp);
  for (let l = 2; l <= nl; l++) reach[l] ??= t;
}
const fmt = (m) => (m === undefined ? '도달 못함' : m >= 60 ? `${Math.floor(m / 60)}시간 ${m % 60}분` : `${m}분`);
console.log(`\n== 플레이어 레벨 (효율 ${Math.round(EFF * 100)}%, 혼자) ==`);
for (let l = 2; l <= LEVELS.length; l++) console.log(`Lv.${l} (${LEVELS[l - 1]} XP): ${fmt(reach[l])}`);
const questTotal = QUESTS.filter((q) => !QMETA[q.id].peers).reduce((a, q) => a + q.reward.xp, 0);
console.log(`혼자 받는 퀘스트 경험치 합: ${questTotal} (최고 레벨 ${LEVELS.at(-1)})`);

// 마을 별: 시간에 따라 대략 쌓이는 것 (효율 30% 기준 한 시간에)
console.log('\n== 마을 별 (대략) ==');
const at = (h) => {
  const m = h * 60 * (EFF / 0.3);
  return {
    built: Math.min(5, Math.floor(m / 45)), home: m > 120 ? (m > 300 ? 2 : 1) : 0, decor: Math.min(20, Math.floor(m / 12)),
    hearts: Array(6).fill(Math.min(5, m / 70)).map(Math.floor), villagers: 6,
    book: Math.min(48, Math.floor(m / 6)), bookTotal: 48, stamps: Math.min(6, Math.floor(m / 8)), farmLv: Math.min(8, 1 + Math.floor(m / 30)), riceLv: Math.min(6, 1 + Math.floor(m / 90)),
  };
};
let lastStar = 0;
for (let m = 5; m <= 16 * 60; m += 5) {
  const r = rating(at(m / 60));
  if (r.stars > lastStar) { for (let s = lastStar + 1; s <= r.stars; s++) console.log(`★${s} (${STAR_AT[s - 1]}): ${fmt(m)}`); lastStar = r.stars; }
}
