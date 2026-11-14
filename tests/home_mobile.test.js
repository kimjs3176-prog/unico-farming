// 집 안·밖 (세로 폰): 가구 메시 합치기·누른 가구 고르기·옷장 카메라
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

// 브라우저 없이: 세로 터치 폰처럼 보이게 하는 최소 흉내 (각 시험 파일은 따로 실행됨)
const el = () => ({ className: '', innerHTML: '', style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {} }, remove() {}, append() {}, querySelector: () => null, querySelectorAll: () => [] });
globalThis.document ??= { createElement: el, getElementById: el };
globalThis.requestAnimationFrame ??= (f) => f();
globalThis.window ??= { addEventListener() {}, innerWidth: 390 };
globalThis.screen ??= { width: 390, height: 844 };
globalThis.matchMedia = (q) => ({ matches: /coarse|max-width: 600px/.test(q) });

const { PointerNav } = await import('../src/game/pointer.js');
const { buildRoom, IO, ROOM } = await import('../src/game/view/home_interior.js');
const { HomeView, mergeByMaterial } = await import('../src/game/view/home_view.js');

// ---------------------------------------------------------------- 집 안 가구 표시·합치기
const mats = () => ({ glass: new THREE.MeshStandardMaterial(), lampMat: new THREE.MeshStandardMaterial() });

test('집 안: 가구 메시마다 자리 표시, 재질별로 합쳐 메시 수가 절반 아래로', () => {
  for (let lv = 0; lv < ROOM.length; lv++) {
    const room = buildRoom(lv, mats());
    const tags = new Set();
    let n = 0;
    room.group.traverse((o) => { if (o.isMesh) { n++; if (o.userData.spot) tags.add(o.userData.spot); } });
    assert.deepEqual([...tags].sort(), room.spots.map((s) => s.key).sort(), `단계 ${lv} 모든 가구에 표시`);
    assert.ok(n < 55, `단계 ${lv} 메시 ${n}개 (합치기 전 100개 넘음)`);
    if (room.fire) assert.ok(room.group.children.includes(room.fire), '일렁이는 불꽃은 따로');
    // 같은 재질·같은 자리끼리는 하나뿐
    const keys = room.group.children.filter((o) => o.isMesh).map((o) => `${o.material.uuid}|${o.userData.spot || ''}`);
    assert.equal(new Set(keys).size, keys.length);
  }
});

test('집 안 PointerNav.pick: 실제 카메라(세로 폰)에서 책상 윗판·달력을 누르면 각자 그 가구', () => {
  globalThis.innerWidth = 390; globalThis.innerHeight = 844;
  for (let lv = 0; lv < ROOM.length; lv++) {
    const room = buildRoom(lv, mats());
    room.group.position.set(IO.x, IO.y, IO.z);
    room.group.updateMatrixWorld(true);
    const desk = room.spots.find((s) => s.key === 'desk'), cal = room.spots.find((s) => s.key === 'calendar');
    const camera = new THREE.PerspectiveCamera(56, 390 / 844, 0.1, 100);
    const tgt = new THREE.Vector3(IO.x + desk.x, IO.y + 1.1, IO.z + desk.z), dist = [9.5, 10.5, 12][lv];
    camera.position.copy(tgt).add(new THREE.Vector3(0, Math.sin(0.92), Math.cos(0.92)).multiplyScalar(dist));
    camera.lookAt(tgt);
    camera.updateMatrixWorld(true);
    const nav = new PointerNav({ world: { scene: new THREE.Scene() }, camera, home: { inside: true, room } });
    const tap = (x, y, z) => { const v = new THREE.Vector3(IO.x + x, IO.y + y, IO.z + z).project(camera); return nav.pick(((v.x + 1) / 2) * 390, ((1 - v.y) / 2) * 844, true); };
    // 책상 윗판 (자리에서 1.15m 뒤, 높이 0.78) — 예전에는 달력으로 가던 곳
    assert.equal(tap(desk.x - 0.4, 0.82, desk.z - 1.15).target?.key, 'home_desk', `단계 ${lv} 책상`);
    assert.equal(tap(cal.x, 1.85, -room.D / 2 + 0.07).target?.key, 'home_calendar', `단계 ${lv} 달력`);
  }
});

test('집 밖: 집·마당은 재질별로 합쳐도 굴뚝·지붕 높이는 그대로', () => {
  const g = new THREE.Group();
  const a = new THREE.MeshStandardMaterial(), b = new THREE.MeshStandardMaterial();
  const sub = new THREE.Group(); sub.position.set(2, 0, 0); sub.rotation.y = Math.PI / 2;
  sub.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), a));
  g.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), a), new THREE.Mesh(new THREE.SphereGeometry(0.5), b), sub);
  g.userData.chimney = new THREE.Vector3(1, 2, 3);
  const before = new THREE.Box3().setFromObject(g);
  mergeByMaterial(g);
  assert.equal(g.children.length, 2);
  assert.ok(g.userData.chimney.equals(new THREE.Vector3(1, 2, 3)));
  const after = new THREE.Box3().setFromObject(g);
  assert.ok(after.min.distanceTo(before.min) < 1e-6 && after.max.distanceTo(before.max) < 1e-6, '하위 묶음 위치까지 그대로');
});

// ---------------------------------------------------------------- 옷장 카메라 (세로 폰)
function homeGame() {
  return {
    world: { scene: new THREE.Scene(), obstacles: [], time: 0.5, day: 3, daylight: 1, clockText: () => '' },
    ui: { closePanel() {}, toast() {}, openPanel: () => el(), panel: null },
    audio: { play() {} },
    player: { frozen: false, position: new THREE.Vector3(), vel: new THREE.Vector3(), moveTarget: null, unico: { playAction() {}, floorY: null, facing: 0, group: new THREE.Group() } },
    followCam: { yaw: 0, pitch: 0.92, distance: 9.5, lookOffsetY: 0, first: false },
    costume: { wearing: null, has: () => false, sets: [] }, outfitNow: () => ({}), applyLook() {},
    ride: { driving: false }, onEvent() {},
  };
}

test('옷장 (세로 폰): 물러나 바라보는 점을 낮추고, 지도로 바로 나가도 원래대로', () => {
  const g = homeGame(), h = new HomeView(g), cam = g.followCam;
  h.inside = true; h._cam = { yaw: 0.3, pitch: 0.45, distance: 9 };
  h.openWardrobe();
  assert.equal(cam.distance, 6.5);
  assert.equal(cam.lookOffsetY, -1.25);
  h.leave(true);
  assert.equal(cam.lookOffsetY, 0);
  assert.equal(h._wdCam, null, '다시 들어와도 옷장 시점이 되살아나지 않음');
  assert.equal(cam.distance, 9);
});

test('옷장 (세로 폰): 창을 닫으면 다음 프레임에 카메라가 원래대로', () => {
  const g = homeGame(), h = new HomeView(g), cam = g.followCam;
  h.inside = true;
  const p = el();
  g.ui.openPanel = () => p; g.ui.panel = p;
  h.openWardrobe();
  assert.equal(cam.lookOffsetY, -1.25);
  g.ui.panel = null; // 창 닫음
  h._updateInside(0.016, g.player.position);
  assert.equal(cam.lookOffsetY, 0);
  assert.equal(cam.distance, 9.5);
  assert.equal(h._wdCam, null);
});
