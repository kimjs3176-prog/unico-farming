import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SeasonView } from '../src/game/view/season_view.js';
import { seasonOf, DAYS_PER_SEASON } from '../src/game/sim/season.js';
import { FX } from '../src/game/fx.js';
import { SURF } from '../src/game/surface.js';

const leafMat = (hex) => { const m = new THREE.MeshStandardMaterial({ color: hex }); m.userData.enhanced = 'foliage'; return m; };
const meshOf = (m) => new THREE.Mesh(new THREE.BoxGeometry(), m);

function seasonGame(placedAtStart) {
  const scene = new THREE.Scene();
  const forest = leafMat(0x55aa44); // 장면에만 있는 잎 (합쳐 그린 숲)
  scene.add(meshOf(forest));
  const bushMat = leafMat(0x3f9a35), treeMat = leafMat(0x4f9f3a);
  const assets = { scenes: new Map([['tree_1', meshOf(treeMat)], ['bush_1', meshOf(bushMat)]]) };
  if (placedAtStart) scene.add(assets.scenes.get('bush_1').clone(true)); // 저장된 꾸미기 덤불 (원본 재질 공유)
  const g = {
    assets, farm: { sim: {} }, economy: {}, ui: { toast() {}, seasonChip: null }, audio: { play() {} }, onEvent() {},
    world: { scene, day: 1 },
  };
  return { g, forest, bushMat, treeMat };
}

const autumn = seasonOf(DAYS_PER_SEASON * 2 + 1);

test('게임 중에 새로 놓은 꾸미기 덤불도 지금 계절 잎 색 (원본 재질까지 물들임)', () => {
  const { g, bushMat, forest } = seasonGame(false);
  const base = bushMat.color.clone();
  const sv = new SeasonView(g);
  sv.apply(autumn, false);
  assert.notEqual(bushMat.color.getHex(), base.getHex(), '장면에 없던 원본도 계절 색');
  assert.notEqual(forest.color.getHex(), 0x55aa44);
  const placed = g.assets.scenes.get('bush_1').clone(true);
  g.world.scene.add(placed);
  assert.equal(placed.material, bushMat); // 놓은 덤불은 같은 재질 → 이미 가을 색
  // 다시 적용해도 색이 겹쳐 진해지지 않음
  const hex = bushMat.color.getHex();
  sv.apply(autumn, false);
  assert.equal(bushMat.color.getHex(), hex);
});

test('두 색 번갈이는 저장된 꾸미기가 있든 없든 같음', () => {
  const a = seasonGame(false), b = seasonGame(true);
  const sa = new SeasonView(a.g), sb = new SeasonView(b.g);
  sa.apply(autumn, false); sb.apply(autumn, false);
  for (const k of ['forest', 'bushMat', 'treeMat']) assert.equal(a[k].color.getHex(), b[k].color.getHex(), k);
});

test('FX: 다 쓴 별·먼지는 풀로 돌려놓고 다시 씀 (재질·메시를 새로 만들지 않음)', () => {
  const scene = new THREE.Scene(), fx = new FX(scene);
  SURF.seeCam.value.set(0, 5, 10);
  fx.burst(0, 1, 0, 0xfff3a0, 5);
  fx.dust(1, 1);
  assert.equal(fx.items.length, 8);
  const made = fx.group.children.length;
  for (let i = 0; i < 40; i++) fx.update(0.05);
  assert.equal(fx.items.length, 0);
  assert.ok(fx.group.children.every((o) => !o.visible), '끝난 입자는 숨김');
  fx.burst(0, 1, 0, 0xff0000, 5);
  fx.dust(1, 1);
  assert.equal(fx.group.children.length, made, '새로 만들지 않음');
  const star = fx.items.find((it) => it.star).obj;
  assert.equal(star.material.opacity, 1);
  assert.equal(star.material.color.getHex(), new THREE.Color(0xff0000).getHex());
  assert.equal(fx.items.find((it) => it.fade).obj.material.opacity, 0.7);
});

test('FX: 카메라에서 먼 작은 반짝임은 만들지 않고, 큰 효과(순간이동 등)는 그대로', () => {
  const fx = new FX(new THREE.Scene());
  SURF.seeCam.value.set(0, -190, 150); // 집 안 (땅속 방)
  fx.burst(10, 0.9, 10, 0xfff3a0, 5); // 익은 밭 반짝임
  fx.dust(10, 10);
  assert.equal(fx.items.length, 0);
  fx.burst(10, 1, 10, 0xbfe8ff, 16);
  assert.equal(fx.items.length, 16);
});
