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
  // 역할은 유니폼: 역할이 달라도 셰이더 프로그램은 하나 (첫 화면 컴파일 끊김 줄임)
  assert.equal(leafOf(pine).customProgramCacheKey(), leafOf(tree).customProgramCacheKey());
  const roleOf = (m) => { const sh = { uniforms: {}, vertexShader: '#include <begin_vertex>', fragmentShader: '#include <color_fragment>' }; m.onBeforeCompile(sh); return sh.uniforms.uLeafRole.value; };
  assert.equal(roleOf(leafOf(pine)), LEAF_ROLE.conifer);
  assert.equal(roleOf(leafOf(tree)), LEAF_ROLE.canopy);
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

test('단풍나무(원래 주황)는 봄·여름엔 초록, 가을엔 그대로', () => {
  const g = (hex) => { const h = {}; new THREE.Color(hex).getHSL(h); return h; };
  for (const id of ['spring', 'summer']) {
    const lv = SEASONS.find((s) => s.id === id).look.leaves;
    assert.ok(lv.amt[1] > 0.7, `${id} 단풍나무 섞는 양 ${lv.amt[1]}`);
    for (const hex of [lv.a, lv.b]) assert.ok(g(hex).h > 70 / 360 && g(hex).h < 140 / 360, `${id} 초록`);
  }
  assert.equal(autumn.look.leaves.amt[1], 0);
});

test('가을: 빨강·녹슨 색 활엽수, 따뜻하고 덜 푸른 땅·풀 / 겨울: 잿빛 서리 잎', () => {
  const lv = autumn.look.leaves, h = {};
  assert.notEqual(lv.red2, lv.red);
  new THREE.Color(lv.red2).getHSL(h);
  assert.ok(h.h < 25 / 360, '녹슨 색');
  const [r, , b] = autumn.look.ground;
  assert.ok(r >= 1.08 && b <= 0.8, '땅이 따뜻하게');
  assert.ok(autumn.look.grass[0] <= 0.1, '풀 색상이 주황 쪽');
  const wv = winter.look.leaves;
  assert.ok(wv.amt[0] >= 0.85);
  new THREE.Color(wv.a).getHSL(h);
  assert.ok(h.s < 0.15 && h.l > 0.5, `겨울 잎은 잿빛 서리 (s ${h.s.toFixed(2)})`);
  const sv = new SeasonView(seasonGame());
  sv.apply(autumn, false);
  assert.equal(SURF.leafR2.value.getHex(), lv.red2);
});

test('잔디 둑(seasonLawn): 겨울엔 눈 색, 봄엔 다시 초록', () => {
  const g = seasonGame(), sv = new SeasonView(g);
  const m = new THREE.MeshStandardMaterial({ color: 0x7fae4e });
  m.userData.seasonLawn = true;
  g.world.scene.add(meshOf(m));
  const h = {};
  sv.apply(winter, false);
  m.color.getHSL(h);
  assert.ok(h.l > 0.75 && h.s < 0.35, `겨울 둑 (l ${h.l.toFixed(2)}, s ${h.s.toFixed(2)})`);
  sv.apply(spring, false);
  m.color.getHSL(h);
  assert.ok(h.h > 70 / 360 && h.h < 140 / 360 && h.s > 0.3, '봄 둑은 초록');
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

test('꽃잎 재질: 흰 바탕 + 아주 약한 분홍 빛 (안개에 잿빛으로 죽지 않게)', () => {
  const sv = new SeasonView(seasonGame());
  assert.equal(sv.fall.material.color.getHex(), 0xffffff);
  const e = sv.fall.material.emissive;
  assert.ok(e.r > e.b && e.r > 0 && e.r < 0.2);
});

test('정적 병합: 질감 있는 잎도 나무마다 aLeaf (합친 메시 원점 하나로 모든 나무가 같은 색이 되지 않게)', async () => {
  const { World } = await import('../src/game/world.js');
  const tex = new THREE.MeshStandardMaterial({ name: 'leaf', map: new THREE.Texture() });
  tex.userData.leafRole = LEAF_ROLE.canopy;
  enhanceMaterial(tex, 'foliage');
  const fake = { scene: new THREE.Scene(), staticObjs: [] };
  for (const [x, z] of [[0.3, 0.2], [7.6, -3.1]]) {
    const o = new THREE.Group(); o.add(meshOf(tex)); o.position.set(x, 1, z);
    fake.scene.add(o); fake.staticObjs.push(o);
  }
  World.prototype._batchStatic.call(fake);
  const merged = fake.scene.children.filter((o) => o.isMesh);
  assert.ok(merged.length >= 1);
  const vals = new Set();
  for (const m of merged) {
    assert.equal(m.material.userData.leafAttr, true, '정점 속성을 읽는 재질');
    assert.notEqual(m.material, tex);
    for (const v of m.geometry.attributes.aLeaf.array) vals.add(v);
  }
  assert.equal(vals.size, 2, '나무 두 그루 → 값 두 개');
  for (const v of vals) assert.equal(Math.floor(v + 0.001), LEAF_ROLE.canopy);
});
