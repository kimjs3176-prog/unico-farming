import test from 'node:test';
import assert from 'node:assert/strict';
import { dismountSpot } from '../src/game/view/tractor_view.js';
import { beltLaneY, beltSpeedScale, BELT_REF } from '../src/ui/koat_ui.js';
import { LAYOUT } from '../src/game/world.js';

const Y = LAYOUT.tractorYard, PAD = 0.8;
const inside = (p) => p.x > Y.x0 + PAD && p.x < Y.x1 - PAD && p.z > Y.z0 + PAD && p.z < Y.z1 - PAD;

test('트랙터 하차: 마당 가운데에서는 예전과 같은 쪽 옆으로 내림', () => {
  const v = { x: 18, z: 20, heading: 0.7 };
  const p = dismountSpot(v, Y);
  assert.ok(Math.abs(p.x - (v.x - Math.cos(v.heading) * 2.4)) < 1e-9);
  assert.ok(Math.abs(p.z - (v.z + Math.sin(v.heading) * 2.4)) < 1e-9);
});

test('트랙터 하차: 울타리에 붙어 있어도 언제나 마당 안쪽에 내림', () => {
  const m = 1.55; // 운전 중 트랙터가 갈 수 있는 울타리 안쪽 한계
  for (const [x, z] of [[Y.x0 + m, 20], [Y.x1 - m, 20], [18, Y.z0 + m], [18, Y.z1 - m], [Y.x0 + m, Y.z0 + m], [Y.x1 - m, Y.z1 - m]]) {
    for (let k = 0; k < 16; k++) {
      const v = { x, z, heading: (k / 16) * Math.PI * 2 };
      const p = dismountSpot(v, Y);
      assert.ok(inside(p), `(${x}, ${z}) 방향 ${k}: (${p.x.toFixed(2)}, ${p.z.toFixed(2)}) 가 마당 밖`);
      assert.ok(Math.hypot(p.x - v.x, p.z - v.z) > 1.8 + 0.45 - 1e-9 || !inside({ x: v.x, z: v.z }), '트랙터 충돌원과 겹치지 않음');
    }
  }
});

test('트랙터 하차: 막힌 자리는 건너뛰고, 다 막혔으면 마당 안으로 당김', () => {
  const v = { x: 18, z: 20, heading: 0 };
  const first = dismountSpot(v, Y);
  const p = dismountSpot(v, Y, (x, z) => Math.hypot(x - first.x, z - first.z) < 0.1);
  assert.ok(Math.hypot(p.x - first.x, p.z - first.z) > 1, '첫 자리가 막히면 다른 자리');
  const q = dismountSpot({ x: Y.x1 - 1.55, z: Y.z1 - 1.55, heading: 1 }, Y, () => true);
  assert.ok(inside(q));
});

test('종자 정선 벨트: 세 줄이 벨트 높이 안에 들어감 (PC·낮은 화면)', () => {
  for (const [H, S] of [[164, 48], [134, 48], [122, 40], [100, 40]]) {
    const ys = [0, 1, 2].map((l) => beltLaneY(l, H, S));
    assert.ok(ys[0] >= 0 && ys[2] + S <= H, `높이 ${H}: ${ys.join('/')}`);
    assert.ok(ys[1] > ys[0] && ys[2] > ys[1], '줄이 겹치지 않음');
  }
  assert.deepEqual([0, 1, 2].map((l) => beltLaneY(l, 164)), [6, 58, 110], 'PC 줄 간격 52px 그대로');
});

test('종자 정선 벨트: 좁은 벨트에서도 종자가 머무는 시간은 PC 와 같음, 넓으면 PC 속도', () => {
  const dwell = (w) => (w + 70) / (120 * beltSpeedScale(w));
  assert.equal(beltSpeedScale(BELT_REF), 1);
  assert.equal(beltSpeedScale(900), 1);
  assert.ok(Math.abs(dwell(300) - dwell(BELT_REF)) < 1e-9);
});
