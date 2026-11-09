// 마우스 올림: 정적 메시 상자로 먼저 거르기 (src/game/pointer.js 의 staticBox·바깥 PointerNav.pick)
// mobile_gaps.test.js 에서 나눔 — 포인터 모듈을 바꾸는 배치가 이 파일을 고침
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

// 브라우저 없이: 화면 크기만 있는 가짜 window
globalThis.window ??= { addEventListener() {} };
globalThis.window.innerWidth = 400;
globalThis.innerWidth = 400; globalThis.innerHeight = 800;

const { PointerNav, staticBox } = await import('../src/game/pointer.js');
const { SURF } = await import('../src/game/surface.js');
const { LAYOUT } = await import('../src/game/world.js');

// ---------------------------------------------------------------- 마우스 올림: 상자로 먼저 거름
function outdoorGame(camera, extra = {}) {
  return {
    world: { scene: new THREE.Scene(), placed: [] }, camera, home: { inside: false },
    ranch: { ents: [], visitors: [] }, npcs: { list: [] }, tractor: { driving: true }, koat: { booths: [], desk: { group: new THREE.Group() } },
    nature: { trees: [], bugs: [] }, rice: { thresher: new THREE.Group(), paddyAt: () => -1, paddies: [] },
    farm: { tiles: [] }, player: { position: new THREE.Vector3() }, ...extra,
  };
}
const screenOf = (p, camera) => { const v = p.clone().project(camera); return [((v.x + 1) / 2) * innerWidth, ((1 - v.y) / 2) * innerHeight]; };

test('staticBox: 메시 상자를 합치고, 뼈대 메시가 섞이면 null (상자 계산이 비싸고 자세마다 달라짐)', () => {
  const g = new THREE.Group();
  const a = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2)); a.position.set(5, 1, 0);
  const b = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)); b.position.set(-3, 0.5, 0);
  g.add(a, b);
  g.updateMatrixWorld(true);
  const box = staticBox(g, new THREE.Box3(), 0);
  assert.deepEqual(box.min.toArray(), [-3.5, 0, -1]);
  assert.deepEqual(box.max.toArray(), [6, 2, 1]);
  const sk = new THREE.SkinnedMesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  g.add(sk);
  assert.equal(staticBox(g), null);
  assert.equal(sk.boundingBox, null, '뼈대 메시의 상자는 건드리지 않음');
});

test('바깥 PointerNav.pick: 마우스 올림은 상자를 비켜 간 집의 메시를 검사하지 않고, 맞으면 그대로 집', () => {
  const L = LAYOUT;
  const house = new THREE.Group();
  const wall = new THREE.Mesh(new THREE.BoxGeometry(4.5, 4.6, 3.9), new THREE.MeshBasicMaterial());
  wall.position.y = 2.3;
  house.add(wall);
  house.position.set(L.home.x, 0, L.home.z);
  const camera = new THREE.PerspectiveCamera(45, 400 / 800, 0.1, 300);
  camera.position.set(L.home.x, 8, L.home.z + 16);
  camera.lookAt(L.home.x, 2, L.home.z);
  camera.updateMatrixWorld(true);
  const game = outdoorGame(camera, { home: { inside: false, house } });
  game.world.scene.add(house);
  game.world.scene.updateMatrixWorld(true);
  SURF.seeOn.value = 0;
  try {
    const nav = new PointerNav(game);
    const seen = [];
    const orig = nav.ray.intersectObjects.bind(nav.ray);
    nav.ray.intersectObjects = (objs, rec) => { seen.push(objs.includes(house)); return orig(objs, rec); };
    const [hx, hy] = screenOf(new THREE.Vector3(L.home.x, 2.3, L.home.z), camera);
    assert.equal(nav.pick(hx, hy, false, true).target?.key, 'home', '마우스 올림: 집 위면 손가락');
    assert.equal(nav.pick(hx, hy).target?.key, 'home', '클릭도 집');
    seen.length = 0;
    const r = nav.pick(20, innerHeight - 20, false, true); // 화면 아래 구석 (집 상자 밖)
    assert.ok(r.point && !r.target);
    assert.deepEqual(seen, [false], '마우스 올림은 집 메시를 광선 검사에 넣지 않음');
    seen.length = 0;
    nav.pick(20, innerHeight - 20);
    assert.deepEqual(seen, [true], '클릭·탭은 그대로 모두 검사');
  } finally {
    SURF.seeOn.value = 1;
  }
});

