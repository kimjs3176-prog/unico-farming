// 방 공동 목표 '함께 수확' (server/goal.js) — 순수 로직
import test from 'node:test';
import assert from 'node:assert/strict';
import { kstDate, goalFor, goalTarget, sanitizeContrib, addContrib, rateOk, rollGoal, nextGoal, goalMsg, contribKey, shareCap, GOALS_PER_DAY, CONTRIB_MSGS } from '../server/goal.js';

test('목표: KST 날짜 열쇠, 크기는 150 → 225 → 340, 하루 3개까지', () => {
  // 2026-11-20 14:59 UTC = 23:59 KST, 15:00 UTC = 다음 날 0시 KST
  assert.equal(kstDate(Date.UTC(2026, 10, 20, 14, 59)), '2026-11-20');
  assert.equal(kstDate(Date.UTC(2026, 10, 20, 15, 0)), '2026-11-21');
  assert.deepEqual([1, 2, 3].map(goalTarget), [150, 225, 340]);
  const g = goalFor('2026-11-20', 2);
  assert.equal(g.key, '2026-11-20#2');
  assert.equal(g.target, 225);
  assert.equal(goalFor('2026-11-20', 9).seq, GOALS_PER_DAY, '3개를 넘지 않음');
});

test('목표: 받은 수는 정수 1~10만 (넘으면 10, 소수·문자·음수는 버림)', () => {
  assert.equal(sanitizeContrib(3), 3);
  assert.equal(sanitizeContrib(99), 10);
  for (const bad of [0, -2, 1.5, '5', NaN, null, undefined, Infinity]) assert.equal(sanitizeContrib(bad), 0, String(bad));
});

test('목표: 혼자서는 못 채우고(몫 1/2), 둘이면 채움', () => {
  // 준비
  const g = goalFor('2026-11-20', 1), tally = {};
  // 실행: 한 사람이 계속 보탬
  let added = 0;
  for (let i = 0; i < 12; i++) added += addContrib(g, tally, 'a', 10).added;
  // 확인
  assert.equal(added, 75, '150 의 1/2');
  assert.equal(addContrib(g, tally, 'a', 5).changed, false);
  let done = false;
  for (let i = 0; i < 12; i++) done ||= addContrib(g, tally, 'b', 10).done;
  assert.equal(g.progress, 150, '둘이서 다 채움 (넘지 않음)');
  assert.equal(done, true);
  assert.equal(addContrib(g, tally, 'e', 3).changed, false, '다 채운 뒤에는 더하지 않음');
  const n = nextGoal(g);
  assert.equal(n.key, '2026-11-20#2');
  assert.equal(nextGoal({ ...n, done: true, seq: 3 }), null, '그날 마지막 목표 뒤에는 없음');
});

test('목표: 넷 이상 보태면 한 사람 몫은 1/4 (셋이면 1/3)', () => {
  const g = goalFor('2026-11-20', 2), tally = {};
  for (const who of ['a', 'b', 'c', 'd']) addContrib(g, tally, who, 1);
  assert.equal(shareCap(g, tally, 'a'), 57, '225 의 1/4 (올림)');
  let d = 1;
  for (let i = 0; i < 10; i++) d += addContrib(g, tally, 'd', 10).added;
  assert.equal(d, 57);
  assert.equal(shareCap(goalFor('2026-11-20', 1), { a: 1, b: 1 }, 'c'), 50, '셋째 사람: 150 의 1/3');
});

test('목표: 10초에 6번까지 (도배 방지)', () => {
  let times = [];
  let ok = 0;
  for (let i = 0; i < 10; i++) { const r = rateOk(times, 1000 + i * 100); times = r.times; if (r.ok) ok++; }
  assert.equal(ok, CONTRIB_MSGS);
  assert.equal(rateOk(times, 12000).ok, true, '10초 지나면 다시');
});

test('목표: 날짜가 바뀌면 새 목표·새 몫 (같은 날이면 그대로)', () => {
  const day1 = Date.UTC(2026, 10, 20, 3);
  const st = rollGoal(null, day1);
  addContrib(st.goal, st.tally, 'a', 7);
  const same = rollGoal(structuredClone(st), day1 + 3600000);
  assert.equal(same.goal.progress, 7);
  assert.equal(same.tally.a, 7);
  const next = rollGoal(st, day1 + 86400000);
  assert.equal(next.goal.key, '2026-11-21#1');
  assert.equal(next.goal.progress, 0);
  assert.deepEqual(next.tally, {});
  assert.equal(rollGoal({ goal: { date: '2026-11-20' } }, day1).goal.progress, 0, '망가진 저장은 새로');
});

test('함께 수확 화면: 한 줄 글, 보상은 기여했고 처음 받는 목표에만', async () => {
  const { goalLine, shouldReward } = await import('../src/ui/coop_goal.js');
  assert.equal(goalLine({ progress: 132, target: 300, seq: 1, of: 3 }), '🌾 함께 수확 132/300');
  assert.equal(goalLine({ progress: 340, target: 340, seq: 3, of: 3, done: true }), '🌾 오늘 함께 수확 3개 모두 달성!');
  assert.equal(shouldReward({}, { key: 'd#1', mine: 5 }), true);
  assert.equal(shouldReward({}, { key: 'd#1', mine: 0 }), false, '기여하지 않음');
  assert.equal(shouldReward({ coopGot: ['d#1'] }, { key: 'd#1', mine: 5 }), false, '이미 받음');
});

test('목표: 알림 모양·사람 열쇠', () => {
  const m = goalMsg(goalFor('2026-11-20', 1));
  assert.deepEqual(m, { t: 'goal', key: '2026-11-20#1', seq: 1, of: 3, target: 150, progress: 0, done: false, share: 75 });
  assert.equal(goalMsg(null), null);
  assert.equal(contribKey({ id: 3, clientId: 'abc' }), 'c:abc');
  assert.equal(contribKey({ id: 3 }), '#3');
});
