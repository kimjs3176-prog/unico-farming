import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildRoom, IO, ROOM } from '../src/game/view/home_interior.js';
import { PointerNav, roomSpotAt, roomSpotSolids, nearestOnScreen, TOUCH_PICK_PX } from '../src/game/pointer.js';

const mats = () => ({ glass: new THREE.MeshStandardMaterial(), lampMat: new THREE.MeshStandardMaterial() });
const center = (b) => [(b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2];

test('집 안: 침대·책상·옷장·책장은 자기 가구 상자와 짝, 달력·문은 짝 없음 (모든 집 단계)', () => {
  for (let lv = 0; lv < ROOM.length; lv++) {
    const room = buildRoom(lv, mats());
    const pairs = roomSpotSolids(room);
    const keys = [...pairs.keys()].map((s) => s.key).sort();
    assert.deepEqual(keys, ['bed', 'books', 'desk', 'wardrobe'], `단계 ${lv}`);
    // 짝이 겹치지 않음
    assert.equal(new Set(pairs.values()).size, pairs.size);
  }
});

test('집 안: 가구 몸체를 누르면 그 가구, 꾸밈 가구(탁자·조명·부엌·벽난로)는 아무것도 아님', () => {
  for (let lv = 0; lv < ROOM.length; lv++) {
    const room = buildRoom(lv, mats());
    const pairs = roomSpotSolids(room);
    for (const [sp, b] of pairs) {
      const [x, z] = center(b);
      assert.equal(roomSpotAt(room, x, z, false, pairs)?.key, sp.key, `단계 ${lv} ${sp.key} 가운데`);
      // 앞면(자리 쪽)을 누름: 맞힌 점은 상자 가장자리, 맞힌 메시 가운데는 상자 안
      const fx = Math.min(b.x1, Math.max(b.x0, sp.x)), fz = Math.min(b.z1, Math.max(b.z0, sp.z));
      assert.equal(roomSpotAt(room, fx, fz, false, pairs)?.key, sp.key, `단계 ${lv} ${sp.key} 앞면`);
      assert.equal(roomSpotAt(room, fx, fz, false, pairs, { x, z })?.key, sp.key, `단계 ${lv} ${sp.key} 앞면 + 메시`);
    }
    const paired = new Set(pairs.values());
    const inPaired = (x, z) => [...paired].some((q) => x > q.x0 && x < q.x1 && z > q.z0 && z < q.z1);
    for (const b of room.solids) {
      const [x, z] = center(b);
      if (paired.has(b) || inPaired(x, z)) continue; // 침대 머리맡 화분처럼 가구 상자 안에 놓인 것은 그 가구로 쳐도 됨
      assert.equal(roomSpotAt(room, x, z, false, pairs), null, `단계 ${lv} 꾸밈 가구 (${x.toFixed(1)}, ${z.toFixed(1)}) 는 문·가구로 가지 않음`);
    }
  }
});

test('집 안: 벽의 달력·문을 누르면 그 자리, 바닥은 자리 바로 위만', () => {
  for (let lv = 0; lv < ROOM.length; lv++) {
    const room = buildRoom(lv, mats());
    const cal = room.spots.find((s) => s.key === 'calendar'), door = room.spots.find((s) => s.key === 'door');
    assert.equal(roomSpotAt(room, cal.x, -room.D / 2 + 0.05, false)?.key, 'calendar');
    assert.equal(roomSpotAt(room, room.W / 2 - 0.05, door.z, false)?.key, 'door');
    for (const sp of room.spots) assert.equal(roomSpotAt(room, sp.x + 0.2, sp.z, true)?.key, sp.key);
    assert.equal(roomSpotAt(room, 0, room.D / 2 - 0.4, true), null, '앞쪽 빈 바닥은 그냥 걸어감');
  }
});

test('집 안 PointerNav.pick: 위에서 침대를 누르면 침대 자리로, 빈 바닥은 방바닥 높이의 점', () => {
  globalThis.innerWidth = 800; globalThis.innerHeight = 600;
  const room = buildRoom(0, mats());
  room.group.position.set(IO.x, IO.y, IO.z);
  room.group.updateMatrixWorld(true);
  const bed = room.spots.find((s) => s.key === 'bed');
  const bedBox = roomSpotSolids(room).get(bed);
  const [bx, bz] = center(bedBox);
  const camera = new THREE.PerspectiveCamera(45, 800 / 600, 0.1, 100);
  camera.position.set(IO.x + bx, IO.y + 8, IO.z + bz + 3);
  camera.lookAt(IO.x + bx, IO.y + 0.5, IO.z + bz);
  camera.updateMatrixWorld(true);
  const scene = new THREE.Scene();
  const game = { world: { scene }, camera, home: { inside: true, room } };
  const nav = new PointerNav(game);
  const r = nav.pick(400, 300, true);
  assert.equal(r.target?.key, 'home_bed');
  const p = r.target.pos();
  assert.ok(Math.abs(p.x - (IO.x + bed.x)) < 1e-6 && Math.abs(p.z - (IO.z + bed.z)) < 1e-6 && p.y === IO.y);
  // 화면 아래쪽(앞쪽 바닥) → 걷기 점, 방 안
  camera.position.set(IO.x, IO.y + 8, IO.z + 9);
  camera.lookAt(IO.x, IO.y, IO.z + 1.5);
  camera.updateMatrixWorld(true);
  const r2 = nav.pick(400, 300, true);
  assert.ok(r2.point, '빈 바닥은 걷기');
  assert.equal(r2.point.y, IO.y);
  assert.ok(Math.abs(r2.point.x - IO.x) <= room.W / 2 && Math.abs(r2.point.z - IO.z) <= room.D / 2);
});

test('터치 보정: 화면 반경 안의 가장 가까운 후보만', () => {
  const c = [{ x: 100, y: 100, t: 'a' }, { x: 120, y: 100, t: 'b' }, { x: 300, y: 300, t: 'c' }];
  assert.equal(nearestOnScreen(c, 116, 100), 'b');
  assert.equal(nearestOnScreen(c, 200, 200), null);
  assert.equal(nearestOnScreen(c, 300 + TOUCH_PICK_PX - 1, 300), 'c');
  assert.equal(nearestOnScreen(c, 300 + TOUCH_PICK_PX + 1, 300), null);
});

test('바깥 PointerNav.pick: 곤충은 터치로 조금 빗나가도 잡히고, 마우스는 그대로 정밀', () => {
  globalThis.innerWidth = 800; globalThis.innerHeight = 600;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 800 / 600, 0.1, 200);
  camera.position.set(0, 6, 9);
  camera.lookAt(0, 0.7, 0);
  camera.updateMatrixWorld(true);
  // 날개 크기쯤의 작은 곤충 (지면 위 0.7m)
  const bug = new THREE.Group();
  bug.add(new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.12), new THREE.MeshBasicMaterial()));
  bug.position.set(0, 0.7, 0);
  scene.add(bug);
  scene.updateMatrixWorld(true);
  const none = { list: [], ents: [], visitors: [], trees: [], booths: [] };
  const game = {
    world: { scene, placed: [] }, camera, home: { inside: false },
    ranch: { ents: [], visitors: [] }, npcs: none, tractor: { driving: true }, koat: { booths: [], desk: { group: new THREE.Group() } },
    nature: { trees: [], bugs: [{ g: bug }] }, rice: { thresher: new THREE.Group(), paddyAt: () => -1, paddies: [] },
    farm: { tiles: [] }, player: { position: new THREE.Vector3(0, 0, 5) },
  };
  const nav = new PointerNav(game);
  const v = bug.position.clone().project(camera);
  const sx = ((v.x + 1) / 2) * 800 + 20, sy = ((1 - v.y) / 2) * 600; // 20px 옆
  assert.equal(nav.pick(sx, sy, true).target?.key, 'bug', '터치는 잡힘');
  assert.ok(nav.pick(sx, sy, false).point, '마우스는 땅으로');
  assert.ok(nav.pick(sx + 60, sy, true).point, '멀리 빗나가면 땅으로');
});
