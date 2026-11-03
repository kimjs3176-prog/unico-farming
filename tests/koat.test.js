import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DIVISIONS, makeMatchRound, scoreMatch, makeStagesRound, scoreStages, makeSortRound, scoreSort, SEED_KINDS,
  makeInspectRound, scoreInspect, makeCarbonRound, scoreCarbon, StampBook, PASS_SCORE,
} from '../src/game/sim/koat.js';

const seeded = (s) => () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };

test('six business divisions with a game each', () => {
  assert.equal(DIVISIONS.length, 6);
  assert.deepEqual(DIVISIONS.map((d) => d.name), ['기술사업본부', '벤처창업본부', '종자사업본부', '스마트농업본부', '농기계검정본부', '농업환경분석본부']);
  for (const d of DIVISIONS) assert.ok(d.game.type && d.summary && d.teams.length);
});

test('match: perfect and partial scores', () => {
  const r = makeMatchRound(seeded(1));
  assert.equal(r.techs.length, 4);
  assert.equal(scoreMatch(r, r.answer), 100);
  const half = { [r.techs[0]]: r.answer[r.techs[0]], [r.techs[1]]: r.answer[r.techs[1]] };
  assert.equal(scoreMatch(r, half), 50);
});

test('stages: options shuffled but answer tracked', () => {
  const r = makeStagesRound(seeded(2));
  assert.equal(scoreStages(r, r.map((s) => s.answer)), 100);
  assert.ok(r.every((s) => s.options[s.answer].length > 0));
  assert.equal(scoreStages(r, r.map((s) => (s.answer + 1) % 3)), 0);
});

test('seed sort: removing bad seeds scores, removing good seeds penalizes', () => {
  const r = makeSortRound(seeded(3));
  const bad = new Set(r.items.filter((x) => SEED_KINDS[x.kind].bad).map((x) => x.id));
  assert.ok(bad.size > 0);
  assert.equal(scoreSort(r, bad), 100);
  const all = new Set(r.items.map((x) => x.id));
  assert.ok(scoreSort(r, all) < 100);
  assert.equal(scoreSort(r, new Set()), 0);
});

test('inspection verdicts', () => {
  const r = makeInspectRound(seeded(4));
  assert.equal(r.length, 5);
  assert.equal(scoreInspect(r, r.map((x) => x.pass)), 100);
  assert.equal(scoreInspect(r, r.map((x) => !x.pass)), 0);
});

test('low-carbon cards', () => {
  const r = makeCarbonRound(seeded(5));
  assert.equal(r.length, 8);
  const goods = new Set(r.map((c, i) => (c.good ? i : -1)).filter((i) => i >= 0));
  assert.equal(scoreCarbon(r, goods), 100);
  assert.equal(scoreCarbon(r, new Set(r.map((_, i) => i))), 50);
});

test('stamp tour: pass threshold, completion reward once', () => {
  const b = new StampBook();
  assert.equal(b.record('tech', PASS_SCORE - 1).newStamp, false);
  assert.equal(b.record('tech', 80).newStamp, true);
  assert.equal(b.record('tech', 100).newStamp, false);
  assert.equal(b.claim(), null);
  for (const d of DIVISIONS) b.record(d.id, 100);
  assert.ok(b.complete);
  assert.equal(b.claim().money, 1000);
  assert.equal(b.claim(), null);
});

test('run scoring: accuracy first, speed bonus only for correct answers', async () => {
  const { scoreRun, scoreConveyor, makeConveyor, VENTURE_STAGES } = await import('../src/game/sim/koat.js');
  assert.equal(scoreRun([]), 0);
  assert.equal(scoreRun([{ ok: true, left: 1 }, { ok: true, left: 1 }]), 100);
  assert.equal(scoreRun([{ ok: true, left: 0 }, { ok: true, left: 0 }]), 85);
  assert.equal(scoreRun([{ ok: false, left: 1 }, { ok: false, left: 1 }]), 0, '틀린 문제는 빨라도 0점');
  assert.ok(scoreRun([{ ok: true, left: 0.5 }, { ok: false, left: 0 }]) >= PASS_SCORE - 15);
  // 컨베이어: 다 골라내면 100, 실수는 감점, 음수 없음
  assert.equal(scoreConveyor(10, 0, 10), 100);
  assert.ok(scoreConveyor(10, 3, 10) < 100);
  assert.equal(scoreConveyor(0, 5, 10), 0);
  const seq = makeConveyor(seeded(9));
  assert.ok(seq.some((x) => x.kind !== 'good') && seq.some((x) => x.kind === 'good'));
  assert.ok(VENTURE_STAGES.every((s) => s.why));
});
