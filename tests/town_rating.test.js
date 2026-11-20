// 마을 별점: 칸별 무게, 별 문턱, 가장 높은 별만 기록 (예전 저장은 조용히)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rating, starsFor, latchStar, STAR_AT, PARTS, starLine, snapshot } from '../src/game/sim/town_rating.js';

const empty = { built: 0, home: 0, decor: 0, hearts: [0, 0, 0, 0, 0, 0], villagers: 6, book: 0, bookTotal: 48, stamps: 0, farmLv: 1, riceLv: 1 };

test('무게 합은 1, 빈 마을은 0점 0별, 모두 채우면 1점 5별', () => {
  assert.equal(Math.round(PARTS.reduce((a, p) => a + p.w, 0) * 1000) / 1000, 1);
  const r0 = rating(empty);
  assert.equal(r0.points, 0);
  assert.equal(r0.stars, 0);
  const full = { built: 5, home: 2, decor: 30, hearts: [5, 5, 5, 5, 5, 5], villagers: 6, book: 48, bookTotal: 48, stamps: 6, farmLv: 8, riceLv: 6 };
  const r5 = rating(full);
  assert.equal(r5.points, 1);
  assert.equal(r5.stars, 5);
  assert.deepEqual(r5.next, []);
});

test('칸별 무게: 건물 5채 = 0.2, 도감 절반 = 0.125, 꾸미기는 20개까지만', () => {
  assert.equal(rating({ ...empty, built: 5 }).points, 0.2);
  assert.equal(rating({ ...empty, book: 24 }).points, 0.125);
  assert.equal(rating({ ...empty, decor: 40 }).points, 0.1);
  assert.equal(rating({ ...empty, stamps: 6 }).points, 0.1);
  assert.equal(rating({ ...empty, home: 1 }).points, 0.05);
});

test('별 문턱 0.06 / 0.3 / 0.5 / 0.72 / 0.92 (첫 별은 20분 안팎)', () => {
  assert.deepEqual(STAR_AT, [0.06, 0.3, 0.5, 0.72, 0.92]);
  assert.equal(starsFor(0.059), 0);
  assert.equal(starsFor(0.06), 1);
  assert.equal(starsFor(0.5), 3);
  assert.equal(starsFor(0.95), 5);
  assert.equal(starLine(2), '★★☆☆☆');
});

test('다음 별 안내: 혼자서 별을 채우는 칸이 먼저, 필요한 양이 맞음', () => {
  // 건물 2채(0.08) + 스탬프 6 (0.1) = 0.18 → 1별, 다음은 0.3 까지 0.12
  const r = rating({ ...empty, built: 2, stamps: 6 });
  assert.equal(r.stars, 1);
  assert.ok(r.next.length > 0);
  const first = r.next[0];
  assert.equal(first.enough, true, JSON.stringify(first));
  const book = r.next.find((n) => n.key === 'book');
  assert.equal(book.n, Math.ceil(0.12 / (0.25 / 48)), '도감 종 수');
  assert.equal(r.next.some((n) => n.key === 'stamps'), false, '다 채운 칸은 빠짐');
});

test('가장 높은 별만 기록: 처음은 조용히 맞추고, 내려가지 않음', () => {
  const f = {};
  assert.equal(latchStar(f, 3), null, '예전 저장: 축하 없이');
  assert.equal(f.townStar, 3);
  assert.equal(latchStar(f, 2), null);
  assert.equal(f.townStar, 3, '꾸미기를 치워도 별은 그대로');
  assert.deepEqual(latchStar(f, 5), { from: 3, to: 5 });
  assert.equal(f.townStar, 5);
});

test('게임 → 점수 값: 없는 시스템은 0, 하트는 주민마다', () => {
  const g = {
    town: { sim: { doneCount: 2 } }, home: { sim: { level: 1 } }, decor: { sim: { count: 4 } },
    villagers: { state: { a: {}, b: {} }, hearts: (id) => (id === 'a' ? 3 : 1) },
    collection: { progress: (c) => ({ got: c === 'fish' ? 5 : 0, total: 10 }) }, koat: { book: { count: 2 } },
    farm: { sim: { level: 3 } }, rice: { sim: { skillLevel: 2 } },
  };
  const s = snapshot(g);
  assert.deepEqual(s, { built: 2, home: 1, decor: 4, hearts: [3, 1], villagers: 2, book: 5, bookTotal: 30, stamps: 2, farmLv: 3, riceLv: 2 });
});
