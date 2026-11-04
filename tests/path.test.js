import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NavGrid } from '../src/game/sim/path.js';

const boxes = (list, r = 0.5) => (x, z) => list.some((b) => x > b.x0 - r && x < b.x1 + r && z > b.z0 - r && z < b.z1 + r);

/** 경로를 따라 0.1 간격으로 걸으며 막힌 곳을 지나지 않는지 */
function walkable(blocked, from, path) {
  let a = from;
  for (const b of path) {
    const d = Math.hypot(b.x - a.x, b.z - a.z), n = Math.ceil(d / 0.1);
    for (let i = 1; i < n; i++) { const x = a.x + ((b.x - a.x) * i) / n, z = a.z + ((b.z - a.z) * i) / n; if (blocked(x, z)) return false; }
    a = b;
  }
  return true;
}

test('길찾기: 막힘이 없으면 바로 목표로', () => {
  const nav = new NavGrid(() => false, 20);
  assert.deepEqual(nav.find({ x: 0, z: 0 }, { x: 5, z: 3 }), [{ x: 5, z: 3 }]);
});

test('길찾기: 앞을 가로막은 건물을 돌아서 감', () => {
  const blocked = boxes([{ x0: -1, z0: -6, x1: 1, z1: 6 }]);
  const nav = new NavGrid(blocked, 20);
  const from = { x: -5, z: 0 }, to = { x: 5, z: 0 };
  const path = nav.find(from, to);
  assert.ok(path && path.length >= 2, '경유점이 있어야 함');
  assert.deepEqual(path.at(-1), to);
  assert.ok(walkable(blocked, from, path), '경로가 건물을 통과하면 안 됨');
});

test('길찾기: 울타리 출입구를 찾아 들어감', () => {
  // 오른쪽 우리 (x 5..15, z -5..5), 왼쪽 벽에 z=0 근처 출입구
  const t = 0.2, R = { x0: 5, x1: 15, z0: -5, z1: 5 };
  const walls = [
    { x0: R.x0 - t, z0: R.z0 - t, x1: R.x1 + t, z1: R.z0 + t }, { x0: R.x0 - t, z0: R.z1 - t, x1: R.x1 + t, z1: R.z1 + t },
    { x0: R.x1 - t, z0: R.z0, x1: R.x1 + t, z1: R.z1 },
    { x0: R.x0 - t, z0: R.z0, x1: R.x0 + t, z1: -1.5 }, { x0: R.x0 - t, z0: 1.5, x1: R.x0 + t, z1: R.z1 },
  ];
  const blocked = boxes(walls, 0.3), nav = new NavGrid(boxes(walls, 0.6), 20); // 격자는 여유 있게(게임과 같은 0.6), 실제 통과는 0.3 으로 확인
  const from = { x: 0, z: -8 }, to = { x: 12, z: -3 };
  const path = nav.find(from, to);
  assert.ok(path, '출입구로 가는 길이 있어야 함');
  assert.ok(walkable(blocked, from, path));
  assert.ok(path.some((p) => Math.abs(p.z) < 1.5 && p.x > 3 && p.x < 7), '출입구 근처를 지나야 함');
});

test('길찾기: 목표가 막힌 자리면 가장 가까운 빈자리까지', () => {
  const blocked = boxes([{ x0: 3, z0: -2, x1: 7, z1: 2 }]);
  const nav = new NavGrid(blocked, 20);
  const path = nav.find({ x: -5, z: 0 }, { x: 5, z: 0 });
  assert.ok(path);
  const end = path.at(-1);
  assert.ok(!blocked(end.x, end.z) && Math.hypot(end.x - 5, end.z) < 4);
});

test('길찾기: 완전히 갇힌 목표는 길 없음(null)이 아니라 바깥 빈자리까지만', () => {
  const blocked = boxes([{ x0: -20, z0: 2, x1: 20, z1: 3 }]);
  const nav = new NavGrid(blocked, 10);
  // 벽 너머로는 못 감
  assert.equal(nav.find({ x: 0, z: 0 }, { x: 0, z: 6 }), null);
});

test('길찾기: 목표 옆 빈칸이 막힌 틈이어도, 닿을 거리 안의 다른 빈칸으로 감', () => {
  // 목표(사람) 둘레를 벽이 감싸고 남쪽에만 틈 → 목표 바로 옆 칸 중 일부는 갇힌 틈
  const blocked = (x, z) => Math.hypot(x, z) < 0.9 || (Math.hypot(x, z) > 1.4 && Math.hypot(x, z) < 1.9 && z > -0.5);
  const nav = new NavGrid(blocked, 10);
  const path = nav.find({ x: 0, z: 6 }, { x: 0, z: 0 }, 2.2);
  assert.ok(path, '닿을 거리 안의 빈칸까지 길이 있어야 함');
  const end = path.at(-1);
  assert.ok(Math.hypot(end.x, end.z) <= 2.2 + 0.01);
});
