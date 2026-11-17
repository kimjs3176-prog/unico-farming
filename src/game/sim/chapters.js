// 퀘스트 장(chapter) 구성과 지금 따라갈 퀘스트 고르기 (three 없음, 3D판 전용)
// QUESTS 배열 순서·이름은 그대로 (저장은 id 로, 도트판도 같이 씀) — 장 정보는 여기에만
import { QUESTS } from './quests.js';

/** 장 목록: ids 는 장 안에서 안내할 순서. reward 는 장을 끝내면 한 번 주는 선물 */
export const CHAPTERS = [
  { n: 1, title: '첫 농사', ids: ['till1', 'plant3', 'water3', 'harvest5', 'sell3'], reward: { money: 100, seeds: { carrot: 4 } } },
  { n: 2, title: '마을 인사·KOAT 첫 방문', ids: ['koat1', 'petfeed3', 'feed3', 'collect5', 'shake3'], reward: { money: 150, seeds: { cabbage: 3 } } },
  { n: 3, title: '논과 목장', ids: ['tractor1', 'ride5', 'smart1', 'rice1', 'riceharv', 'sell10', 'fish1', 'bug1', 'weed2', 'fert3', 'care5'], reward: { money: 250, seeds: { tomato: 3 } } },
  { n: 4, title: 'KOAT 체험관', ids: ['koat6', 'explore4', 'chest3', 'lake1', 'swim1'], reward: { money: 300, seeds: { strawberry: 3 } } },
  { n: 5, title: '우리 마을', ids: ['process2', 'order3', 'build1', 'home2', 'decor1', 'cos1', 'buyanimal', 'rprocess2'], reward: { money: 400, seeds: { corn: 3 } } },
  { n: 6, title: '사계절 농부', ids: [], reward: { money: 500, seeds: { strawberry: 4, corn: 4 } } },
];

/** 오래 걸리는 목표 (기다려야 끝남): 따라가기 대상에서 빼고 업적 칸에 */
const WAIT = ['friend2', 'book10', 'fest1', 'build5', 'giant1', 'rich', 'decor10', 'cos4', 'heart3', 'rgold1', 'plow30', 'egg30'];
/** 다른 플레이어가 있어야 하는 목표 */
const PEERS = ['greet1', 'five3', 'friend1'];

/** id → { ch, wait?, peers? } (모든 퀘스트) */
export const QMETA = {};
for (const c of CHAPTERS) for (const id of c.ids) QMETA[id] = { ch: c.n };
const last = CHAPTERS[CHAPTERS.length - 1];
for (const q of QUESTS) {
  if (!QMETA[q.id]) { QMETA[q.id] = { ch: last.n }; last.ids.push(q.id); }
  if (WAIT.includes(q.id)) QMETA[q.id].wait = true;
  if (PEERS.includes(q.id)) QMETA[q.id].peers = true;
}

const BY_ID = Object.fromEntries(QUESTS.map((q) => [q.id, q]));
/** 장을 여는 데 필요한 퀘스트 (기다리기·친구 퀘스트 제외) */
export const coreIds = (c) => c.ids.filter((id) => BY_ID[id] && !QMETA[id].wait && !QMETA[id].peers);

/** 장 진행: 받은 핵심 퀘스트 수 / 전체 */
export function chapterProgress(q, c) {
  const core = coreIds(c);
  return { done: core.filter((id) => q.claimed[id]).length, total: core.length };
}

/** 지금 장: 앞 장의 핵심 퀘스트를 모두 받으면 다음 장이 열림 (claimed 로만 계산, 이전 저장도 그대로) */
export function currentChapter(q) {
  for (const c of CHAPTERS) if (coreIds(c).some((id) => !q.claimed[id])) return c;
  return null; // 모든 장 끝
}

const isDone = (q, x) => (q.progress[x.id] || 0) >= x.goal;

/**
 * 지금 따라갈 퀘스트: 고정(📌) → 다 했는데 안 받은 것(🎁) → 지금 장의 첫 미완료 → 다음 장 → null
 * 기다리기 퀘스트는 고르지 않고, 친구 퀘스트는 다른 플레이어가 있을 때만
 * @param q Quests (progress·claimed)
 */
export function pickTracked(q, { pinned = null, peersOnline = false } = {}) {
  if (pinned && BY_ID[pinned] && !q.claimed[pinned]) return BY_ID[pinned];
  // 받을 보상: 장 순서대로
  for (const c of CHAPTERS) for (const id of c.ids) { const x = BY_ID[id]; if (x && !q.claimed[id] && isDone(q, x)) return x; }
  const cur = currentChapter(q);
  const ok = (id) => BY_ID[id] && !q.claimed[id] && !QMETA[id].wait && (!QMETA[id].peers || peersOnline);
  if (cur) {
    for (const c of CHAPTERS) {
      if (c.n < cur.n) continue;
      const id = c.ids.find(ok);
      if (id) return BY_ID[id];
    }
  } else if (peersOnline) {
    const id = PEERS.find(ok);
    if (id) return BY_ID[id];
  }
  return null;
}
