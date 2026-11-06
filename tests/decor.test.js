import test from 'node:test';
import assert from 'node:assert/strict';
import { DecorSim, DECOR, DECOR_BY_ID, DECOR_MAX, outsideZones, snapAhead } from '../src/game/sim/decor.js';

test('꾸미기: 사서 놓기 · 레벨·코인 조건 · 치우면 보관함 → 다시 놓을 때 무료', () => {
  const d = new DecorSim();
  assert.match(d.whyNot('bench', { money: 10 }), /모자라요/);
  assert.match(d.whyNot('well', { money: 9999, level: 1 }), /Lv\.4/);
  assert.equal(d.place('bench', 1.234, 2, 1, { money: 9999 }), DECOR_BY_ID.bench.price);
  assert.deepEqual(d.placed[0], { id: 'bench', x: 1.23, z: 2, rot: 1 });
  const p = d.pickUp(0);
  assert.equal(p.id, 'bench'); assert.equal(d.count, 0); assert.equal(d.storedOf('bench'), 1);
  assert.equal(d.whyNot('bench', { money: 0, level: 1 }), null, '보관함 것은 돈·레벨 상관없이');
  assert.equal(d.place('bench', 3, 3, 9, { money: 0 }), 0);
  assert.equal(d.placed[0].rot, 1, '돌리기는 8단계(45도)로');
  assert.equal(d.storedOf('bench'), 0);
});

test('꾸미기: 옮기기는 무료, 가장 가까운 소품 찾기, 개수 한도', () => {
  const d = new DecorSim();
  d.place('lamp', 0, 0, 0, { money: 9999 }); d.place('crate', 5, 5, 0, { money: 9999 });
  assert.equal(d.nearest(4.5, 5.2), 1);
  assert.equal(d.nearest(20, 20), -1);
  const spent = d.spent;
  assert.ok(d.move(0, 2, 2, 3));
  assert.equal(d.spent, spent);
  assert.deepEqual(d.placed.find((p) => p.id === 'lamp'), { id: 'lamp', x: 2, z: 2, rot: 3 });
  for (let i = d.count; i < DECOR_MAX; i++) d.place('stump', i, 0, 0, { money: 99999 });
  assert.match(d.whyNot('stump', { money: 99999 }), /까지/);
  assert.equal(d.place('stump', 0, 0, 0, { money: 99999 }), -1);
});

test('꾸미기: 불러오기 검사 (없는 소품·이상한 좌표·너무 많음 거름)', () => {
  const d = new DecorSim();
  d.load({ placed: [{ id: 'bench', x: 1, z: 2, rot: 2 }, { id: 'rocket', x: 0, z: 0 }, { id: 'lamp', x: 'NaN', z: 1 }, { id: 'lamp', x: 1e9, z: 0 }], stored: { bench: 2, ufo: 5, lamp: -3 } });
  assert.deepEqual(d.placed, [{ id: 'bench', x: 1, z: 2, rot: 2 }]);
  assert.deepEqual(d.stored, { bench: 2 });
  const many = { placed: Array.from({ length: 200 }, (_, i) => ({ id: 'stump', x: i % 50, z: 0 })) };
  d.load(many);
  assert.equal(d.count, DECOR_MAX);
});

test('꾸미기: 보호 구역·앞쪽 자리 계산, 카탈로그는 모두 모델 이름이 있음', () => {
  const zones = [[0, 0, 10, 10], { x: 20, z: 0, r: 2 }];
  assert.equal(outsideZones(5, 5, 0.5, zones), false);
  assert.equal(outsideZones(10.3, 5, 0.5, zones), false, '반지름만큼 여유');
  assert.equal(outsideZones(11, 5, 0.5, zones), true);
  assert.equal(outsideZones(21, 0, 0.3, zones), false);
  assert.deepEqual(snapAhead(0, 0, 0, 2.2), { x: 0, z: 2 });
  assert.deepEqual(snapAhead(1, 1, Math.PI / 2, 2.2), { x: 3, z: 1 });
  for (const it of DECOR) assert.ok(it.model && it.price > 0 && it.icon, it.id);
  assert.equal(new Set(DECOR.map((x) => x.id)).size, DECOR.length);
});
