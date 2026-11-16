// 첫 작물 보호: 별 하한·잡초/까마귀 없음·마른 밭 💧·목표 고치기 (src/game/sim/farm.js, view/farm_view.js, view/pests.js, guide.js)
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

const { FarmSim } = await import('../src/game/sim/farm.js');
const { FarmView } = await import('../src/game/view/farm_view.js');
const { Pests } = await import('../src/game/view/pests.js');
const { farmObjective } = await import('../src/game/guide.js');
const { LAYOUT } = await import('../src/game/world.js');

/** 물 한 번만 주고 그냥 둔 당근 (관리 점수 낮음 → 별 1개) */
function neglected(sim, i) {
  sim.rng = () => 0.99; sim.weedChance = 0; // 대왕 작물·잡초 없이 (결과가 늘 같게)
  sim.till(i); sim.plant(i, 'carrot'); sim.water(i);
  for (let k = 0; k < 400 && sim.plots[i].state !== 'ready'; k++) sim.tick(0.5);
  assert.equal(sim.plots[i].state, 'ready');
}

test('FarmSim.harvest(i, 2): 별과 수확량에 하한 (첫 당근 3칸 → 6개 이상), 기본 수확은 그대로', () => {
  const a = new FarmSim(3), b = new FarmSim(3);
  let total = 0;
  for (let i = 0; i < 3; i++) {
    neglected(a, i); neglected(b, i);
    const plain = a.harvest(i);
    assert.equal(plain.stars, 1, '그냥 두면 별 1개');
    assert.equal(plain.amount, 1);
    const kept = b.harvest(i, 2);
    assert.equal(kept.stars, 2);
    assert.equal(kept.amount, 2);
    total += kept.amount;
  }
  assert.ok(total >= 6, '첫 수확 퀘스트(5개)를 한 번에 채움');
  // 하한보다 잘 키운 작물은 그대로
  const c = new FarmSim(1);
  c.rng = () => 0.99;
  c.till(0); c.plant(0, 'carrot'); c.plots[0].fert = true;
  for (let k = 0; k < 400 && c.plots[0].state !== 'ready'; k++) { c.plots[0].water = 45; c.tick(0.5); }
  assert.equal(c.harvest(0, 2).stars, 3);
});

function fakeGame() {
  const g = {
    flags: {}, quests: { claimed: {}, progress: {} },
    assets: { clone: () => new THREE.Group(), cloneCrop: () => new THREE.Group(), scenes: new Map() },
    world: { scene: new THREE.Scene(), daylight: 1 },
    player: { position: new THREE.Vector3(), unico: { playAction() {}, label: null }, arrow: null, group: new THREE.Group() },
    fx: { burst() {}, pop() {}, sprinkle() {} }, audio: { play() {} }, juice: { shake() {}, pop() {} },
    economy: { inventory: { seeds: { carrot: 0 } }, count: () => 0, addCrop() {}, useSeed: () => true, useItem: () => false },
    ui: { toast() {}, flyToBag() {} }, cinema: { locked: false },
    onEvent: (e, n) => { if (e === 'harvest') g.quests.progress.harvest5 = (g.quests.progress.harvest5 || 0) + n; },
  };
  g.farm = new FarmView(g);
  return g;
}

test('보호 기간: 첫 수확 5개 전에는 잡초 없음·까마귀 타이머 멈춤, 끝나면 다시', () => {
  const g = fakeGame(), F = g.farm;
  assert.equal(F.grace, true);
  F.update(0.1, g.player.position);
  assert.equal(F.sim.weedChance, 0);
  const pests = new Pests(g);
  const t0 = pests.crowTimer;
  pests.update(10, g.player.position);
  assert.equal(pests.crowTimer, t0, '까마귀가 오지 않음');
  g.quests.progress.harvest5 = 5;
  assert.equal(F.grace, false);
  F.update(0.1, g.player.position);
  assert.ok(F.sim.weedChance > 0);
  pests.update(10, g.player.position);
  assert.ok(pests.crowTimer < t0);
  // 보상을 받은 저장도 보호 끝
  const g2 = fakeGame(); g2.quests.claimed.harvest5 = true;
  assert.equal(g2.farm.grace, false);
});

test('보호 기간 수확은 별 2개 이상, 질 낮은 수확의 품질 안내는 보호 기간 뒤 tip 으로', () => {
  const g = fakeGame(), F = g.farm;
  neglected(F.sim, 0);
  const r = F.harvest(0);
  assert.equal(r.stars, 2);
  assert.equal(g.flags.qualityTip, undefined, '보호 기간에는 안내 없음');
  g.quests.progress.harvest5 = 9;
  const tips = [];
  g.ui.tip = (id, t) => tips.push([id, t]);
  neglected(F.sim, 1);
  assert.equal(F.harvest(1).stars, 1);
  assert.equal(tips.length, 1);
  assert.equal(tips[0][0], 'quality');
});

test('마른 밭 💧: 자라는 중 물이 마르면 보이고, 물을 주거나 잡초가 나면 숨김', () => {
  const g = fakeGame(), F = g.farm;
  const on = (i) => F.dry.vis.array[i] === 1;
  assert.equal(F.dry.points.visible, false, '마른 밭이 없으면 그리지 않음');
  F.sim.till(0); F.sim.plant(0, 'carrot');
  assert.ok(on(0) && F.tiles[0].dry && F.dry.points.visible);
  F.sim.till(1); F.sim.plant(1, 'carrot');
  assert.ok(on(1));
  assert.equal(F.dry.points.geometry.attributes.position.count, F.tiles.length, '모든 칸이 점 하나씩, Points 는 하나 (그리기 1번)');
  F.sim.water(0);
  assert.ok(!on(0) && on(1));
  F.sim.water(1);
  assert.equal(F.dry.points.visible, false);
  F.sim.plots[0].water = 0; F.refresh(0);
  assert.ok(on(0));
  F.sim.plots[0].weeds = true; F.refresh(0);
  assert.ok(!on(0));
});

test('목표 고치기: 첫 수확 중 마른 밭 → 그 밭, 씨앗도 작물도 없으면 → 장터 여우', () => {
  const g = fakeGame(), F = g.farm;
  const cur = { id: 'harvest5', title: '첫 수확', desc: '다 익은 작물을 수확하세요', goal: 5, count: 0, complete: false };
  // 씨앗도 작물도 없음
  let o = farmObjective(cur, g);
  assert.equal(o.q.desc, '장터 여우에게 당근 씨앗 사기');
  assert.equal(o.tgt.x, LAYOUT.npcs.merchant.x);
  assert.notEqual(o.q.id, cur.id, '칩이 새로 그려지게 id 꼬리');
  assert.equal(farmObjective({ ...cur, id: 'plant3' }, g).q.desc, '장터 여우에게 당근 씨앗 사기');
  // 마른 밭
  F.sim.till(4); F.sim.plant(4, 'carrot');
  o = farmObjective(cur, g);
  assert.equal(o.q.desc, '💧 마른 밭에 다시 물 주기');
  assert.equal(o.dry, true);
  assert.equal(o.tgt.x, F.tiles[4].x);
  // 물을 주면 원래 목표
  F.sim.water(4);
  assert.equal(farmObjective(cur, g), null);
  // 다 익은 밭이 있으면 수확이 먼저
  F.sim.plots[4].water = 0; F.sim.till(5); F.sim.plant(5, 'carrot'); F.sim.plots[5].state = 'ready';
  assert.equal(farmObjective(cur, g), null);
  // 다른 퀘스트·완료한 퀘스트는 그대로
  assert.equal(farmObjective({ ...cur, id: 'water3' }, g), null);
  assert.equal(farmObjective({ ...cur, complete: true }, g), null);
});
