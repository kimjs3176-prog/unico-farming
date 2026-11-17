// 안내 표시가 실제 밭 한 칸을 가리킴 (src/game/guide.js farmTarget·Guide.target)
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { FarmSim } from '../src/game/sim/farm.js';
import { Quests, QUESTS } from '../src/game/sim/quests.js';
import { LAYOUT } from '../src/game/world.js';
import { farmTarget, fmtEta, Guide, harvestShort } from '../src/game/guide.js';

/** 밭 6×3 (farm_view 와 같은 칸 간격 2.4) */
function fakeGame() {
  const tiles = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 6; c++) tiles.push({ x: -6 + c * 2.4, z: -2.4 + r * 2.4 });
  const sim = new FarmSim(18); sim.rng = () => 0.99;
  const g = {
    flags: {}, quests: new Quests(),
    farm: { sim, tiles, grace: false },
    player: { position: new THREE.Vector3(-6, 0, -4) },
    ride: { driving: false },
    economy: { inventory: { seeds: { carrot: 3 } }, count: () => 0, money: 0, earn(n) { this.money += n; } },
    world: { scene: new THREE.Scene() },
    camera: new THREE.PerspectiveCamera(50, 1, 0.1, 100),
    followCam: { yaw: 0 },
    ui: { calls: [], setObjective(...a) { this.calls.push(a); }, toast() {}, stampObjective() {} },
    cinema: { locked: false }, dialogue: { active: false },
    audio: { play() {} },
  };
  return g;
}

test('가장 가까운 빈 밭을 가리키고, 다른 칸이 2m 넘게 가까워질 때까지 그대로', () => {
  const g = fakeGame(), st = { i: -1 };
  let t = farmTarget('till1', g, st);
  assert.equal(t.i, 0); assert.equal(t.tile, true);
  assert.equal(t.pos.x, g.farm.tiles[0].x);
  // 옆 칸 쪽으로 조금 (1칸 = 2.4m, 차이 2m 안쪽)
  g.player.position.set(-4.4, 0, -4);
  assert.equal(farmTarget('till1', g, st).i, 0, '조금 움직여서는 안 바뀜');
  g.player.position.set(-1.2, 0, -4);
  assert.notEqual(farmTarget('till1', g, st).i, 0, '충분히 가까운 칸이 생기면 바뀜');
});

test('갈고 나면 다음 빈 밭, 심기는 갈아 둔 밭 → 물 주기는 마른 밭이 먼저', () => {
  const g = fakeGame(), st = { i: -1 }, sim = g.farm.sim;
  const a = farmTarget('till1', g, st).i;
  sim.till(a);
  const b = farmTarget('till1', g, st).i;
  assert.notEqual(a, b);
  assert.equal(farmTarget('plant3', g, st).i, a, '갈아 둔 칸');
  sim.plant(a, 'carrot');
  assert.equal(farmTarget('plant3', g, st).i, b, '갈아 둔 칸이 없으면 빈 칸');
  // 물 주기: 가까운 칸에 물을 줬으면 먼 마른 칸
  sim.till(17); sim.plant(17, 'carrot');
  sim.water(a);
  assert.equal(farmTarget('water3', g, st).i, 17, '먼 칸이라도 마른 칸');
  sim.water(17);
  assert.equal(farmTarget('water3', g, st).i, a, '모두 젖었으면 가까운 자라는 칸');
});

test('수확: 다 익은 칸, 없으면 자라는 칸은 고리만. 씨앗이 없으면 장터 여우', () => {
  const g = fakeGame(), st = { i: -1 }, sim = g.farm.sim;
  sim.till(1); sim.plant(1, 'carrot'); sim.water(1);
  // 1칸(2개)만 자람 → 첫 수확 5개에 모자람: 더 심을 칸 (빈 칸)
  assert.deepEqual(harvestShort(g), { short: 3, plots: 2 });
  const m0 = farmTarget('harvest5', g, st);
  assert.equal(m0.ringOnly, false); assert.equal(g.farm.sim.plots[m0.i].state, 'empty');
  for (const i of [2, 3]) { sim.till(i); sim.plant(i, 'carrot'); sim.water(i); }
  assert.equal(harvestShort(g).short, 0);
  const t = farmTarget('harvest5', g, st);
  assert.ok([1, 2, 3].includes(t.i)); assert.equal(t.ringOnly, true);
  sim.till(9); sim.plant(9, 'carrot'); sim.plots[9].state = 'ready';
  assert.equal(farmTarget('harvest5', g, st).ringOnly, false);
  assert.equal(farmTarget('harvest5', g, st).i, 9);
  g.economy.inventory.seeds.carrot = 0;
  const m = farmTarget('plant3', g, st);
  assert.equal(m.tile, false);
  assert.equal(m.pos.x, LAYOUT.npcs.merchant.x);
  assert.equal(m.pos.z, LAYOUT.npcs.merchant.z);
});

test('농사 퀘스트가 아니면 칸 표시 없음, 퀘스트가 없으면 Guide.target 도 null', () => {
  const g = fakeGame();
  assert.equal(farmTarget('koat1', g), null);
  assert.equal(farmTarget('sell3', g), null);
  const gd = new Guide(g);
  gd.update(0.2);
  assert.ok(gd.target, '새 저장: 첫 밭 갈기 칸');
  assert.equal(gd.square.visible, true, '금빛 네모');
  const tile = g.farm.tiles.find((t) => t.x === gd.target.x && t.z === gd.target.z);
  assert.ok(tile, '실제 칸 위');
  // 모든 퀘스트를 받음 → 따라갈 것 없음
  for (const q of QUESTS) g.quests.claimed[q.id] = true;
  gd.update(0.2);
  assert.equal(gd.target, null);
  assert.equal(gd.marker.visible, false);
  assert.equal(g.ui.calls.at(-1)[0], null);
});

test('남은 시간 글자: 20초 넘으면 5초 단위, 1분 넘으면 분', () => {
  assert.equal(fmtEta(3.2), '4초');
  assert.equal(fmtEta(17), '17초');
  assert.equal(fmtEta(33), '35초');
  assert.equal(fmtEta(95), '1분 35초');
  assert.equal(fmtEta(120), '2분');
});
