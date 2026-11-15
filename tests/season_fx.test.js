import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SeasonView, fallScale, petalGeometry, leafGeometry } from '../src/game/view/season_view.js';
import { seasonOf, DAYS_PER_SEASON, SEASONS } from '../src/game/sim/season.js';
import { FX } from '../src/game/fx.js';
import { SURF, seasonRole, LEAF_ROLE, leafAttrValue, enhanceMaterial } from '../src/game/surface.js';
import { applyLeafRole } from '../src/game/assets.js';

const leafMat = (hex, name = 'leaf') => { const m = new THREE.MeshStandardMaterial({ color: hex, name }); enhanceMaterial(m, 'foliage'); return m; };
const meshOf = (m) => new THREE.Mesh(new THREE.BoxGeometry(), m);

function seasonGame() {
  return {
    farm: { sim: {} }, economy: {}, ui: { toast() {}, seasonChip: null }, audio: { play() {} }, onEvent() {},
    world: { scene: new THREE.Scene(), day: 1 },
    followCam: { target: new THREE.Vector3(0, 1.1, 9) },
  };
}

const spring = seasonOf(1), autumn = seasonOf(DAYS_PER_SEASON * 2 + 1), winter = seasonOf(DAYS_PER_SEASON * 3 + 1);

test('계절 잎 역할: 모델 이름으로 (소나무는 침엽수, 양배추·꽃은 물들지 않음, 과수원은 꽃송이)', () => {
  assert.equal(seasonRole('pine_1'), LEAF_ROLE.conifer);
  assert.equal(seasonRole('pine'), LEAF_ROLE.conifer);
  assert.equal(seasonRole('tree_3'), LEAF_ROLE.canopy);
  assert.equal(seasonRole('birch_2'), LEAF_ROLE.canopy);
  assert.equal(seasonRole('willow_1'), LEAF_ROLE.canopy);
  assert.equal(seasonRole('autumn_2'), LEAF_ROLE.autumnal);
  assert.equal(seasonRole('bush_1'), LEAF_ROLE.shrub);
  assert.equal(seasonRole('berrybush_2'), LEAF_ROLE.shrub);
  assert.equal(seasonRole('fruit_tree'), LEAF_ROLE.orchard);
  for (const n of ['cabbage', 'crops', 'flowers', 'flowers_q', 'plant_3', 'grass_q', 'planter', 'market', 'smartfarm']) assert.equal(seasonRole(n), LEAF_ROLE.none, n);
});

test('잎 재질 복제: 소나무와 활엽수가 같은 원본 잎 재질을 써도 역할별로 따로, 같은 쌍은 한 번만', () => {
  const shared = leafMat(0x4f9f3a);
  const trunk = new THREE.MeshStandardMaterial({ name: 'wood' }); enhanceMaterial(trunk);
  const mk = () => { const r = new THREE.Group(); r.add(meshOf(shared), meshOf(trunk)); return r; };
  const cache = new Map(), pine = mk(), tree = mk(), tree2 = mk(), cab = mk();
  applyLeafRole(pine, 'pine_1', cache); applyLeafRole(tree, 'tree_1', cache); applyLeafRole(tree2, 'tree_2', cache);
  assert.equal(applyLeafRole(cab, 'cabbage', cache), 0);
  const leafOf = (r) => r.children[0].material;
  assert.notEqual(leafOf(pine), leafOf(tree));
  assert.equal(leafOf(tree), leafOf(tree2), '같은 (원본, 역할) 은 재질 하나');
  assert.equal(leafOf(cab), shared, '역할 없음은 원본 그대로');
  assert.equal(pine.children[1].material, trunk, '줄기(나무 질감)는 그대로');
  assert.equal(leafOf(pine).userData.leafRole, LEAF_ROLE.conifer);
  assert.equal(leafOf(tree).userData.enhanced, 'foliage', '복제본에도 셰이더 다시 입힘');
  assert.equal(cache.size, 2);
  assert.notEqual(leafOf(pine).customProgramCacheKey(), leafOf(tree).customProgramCacheKey());
});

test('정적 병합 잎 값: 역할은 정수 부분, 나무 난수는 0~0.5 (나무 하나가 한 색)', () => {
  for (const role of [0, 1, 3, 5]) for (const [x, z] of [[3.3, -2], [-20.1, 17.4], [0, 0]]) {
    const v = leafAttrValue(role, x, z);
    assert.equal(Math.floor(v + 0.001), role);
    assert.ok(v - role >= 0 && v - role < 0.5);
  }
});

test('계절 잎 유니폼: 봄 꽃송이, 가을 활엽수 주황(침엽수는 그대로), 겨울 서리', () => {
  const sv = new SeasonView(seasonGame());
  sv.apply(spring, false);
  assert.equal(SURF.blossom.value, 1);
  assert.ok(SURF.leafAmt.value.x <= 0.3, '봄에 잎 전체를 분홍으로 섞지 않음');
  sv.apply(autumn, false);
  assert.equal(SURF.blossom.value, 0);
  assert.ok(SURF.leafAmt.value.x >= 0.7);
  assert.equal(SURF.leafAmt.value.z, 0, '가을 소나무는 초록');
  const hsl = {};
  SURF.leafA.value.getHSL(hsl);
  assert.ok(hsl.h > 15 / 360 && hsl.h < 40 / 360, `가을 색상 ${hsl.h * 360}`);
  sv.apply(winter, false);
  assert.ok(SURF.leafAmt.value.x >= 0.5 && SURF.leafAmt.value.z <= 0.15);
  for (const s of SEASONS) assert.equal(s.look.leaves.amt.length, 4, s.id);
});

test('꽃잎·낙엽: document 없이 만들고 계절마다 모양을 바꿈, 그리기 1번', () => {
  const g = seasonGame(), sv = new SeasonView(g);
  sv.apply(spring, false);
  assert.equal(sv.fall.geometry, sv.petalGeo);
  assert.equal(sv.fall.count, 70);
  sv.updateFall(0.05);
  assert.ok(sv.fall.visible);
  sv.apply(autumn, false);
  assert.equal(sv.fall.geometry, sv.leafGeo);
  for (const geo of [petalGeometry(), leafGeometry()]) {
    geo.computeBoundingBox();
    const s = geo.boundingBox.getSize(new THREE.Vector3());
    assert.ok(s.x < 0.12 && s.y < 0.12 && s.x > 0.04, `크기 ${s.x} ${s.y}`);
  }
  // 꽃잎 색: 하얗게 날지 않는 분홍 (초록이 빨강보다 확실히 낮음)
  const c = new THREE.Color();
  sv.apply(spring, false);
  for (let i = 0; i < 4; i++) { sv.fall.getColorAt(i, c); assert.ok(c.g < c.r * 0.75, `꽃잎 ${i}`); }
});

test('꽃잎: 카메라 1m 앞이나 카메라→머리 사이에서는 크기 0, 멀리 옆은 그대로', () => {
  const cam = new THREE.Vector3(0, 5, 17), head = new THREE.Vector3(0, 1.1, 9);
  assert.equal(fallScale(new THREE.Vector3(0.5, 4.5, 16.3), cam, head), 0);
  assert.equal(fallScale(new THREE.Vector3(0, 3, 13), cam, head), 0, '선분 위');
  assert.equal(fallScale(new THREE.Vector3(5, 2, 6), cam, head), 1);
  // 실제 인스턴스: 카메라를 당겨 둔 상태에서 카메라 1m 앞에 둔 꽃잎은 크기 0 으로 그려짐
  cam.set(0, 2.6, 11.5);
  const g = seasonGame();
  g.camera = new THREE.PerspectiveCamera();
  g.camera.position.copy(cam); g.camera.lookAt(head); g.camera.updateMatrixWorld();
  g.followCam.target.copy(head);
  const sv = new SeasonView(g);
  sv.apply(spring, false);
  sv.updateFall(0.01);
  const p = sv.fallP[0];
  p.x = cam.x + 0.3; p.y = cam.y - 0.5; p.z = cam.z - 0.8; p.vy = 0;
  sv.updateFall(0.0001);
  assert.ok(Math.abs(p.z - (cam.z - 0.8)) < 0.01, '상자 안이라 다시 뿌리지 않음');
  const m = new THREE.Matrix4();
  sv.fall.getMatrixAt(0, m);
  const e = m.elements, sx = Math.hypot(e[0], e[1], e[2]); // decompose 는 크기 0 행렬을 1 로 돌려주므로 직접 계산
  assert.ok(sx < 1e-6, `크기 ${sx}`);
  assert.ok(Math.abs(e[14] - p.z) < 0.01, '자리는 그대로');
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
