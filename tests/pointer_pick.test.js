import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildRoom, IO, ROOM } from '../src/game/view/home_interior.js';
import { PointerNav, roomSpotAt, roomSpotSolids, nearestOnScreen, inSeeHole, TOUCH_PICK_PX } from '../src/game/pointer.js';
import { SURF, enhanceMaterial } from '../src/game/surface.js';
import { LAYOUT } from '../src/game/world.js';

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
    ranch: { ents: [], visitors: [] }, npcs: none, ride: { driving: true }, koat: { booths: [], desk: { group: new THREE.Group() } },
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

test('집 안: 책상 앞 의자(앉는 판·등받이)를 눌러도 책상 (모든 집 단계), 벽이 아닌 곳은 달력·문으로 가지 않음', () => {
  for (let lv = 0; lv < ROOM.length; lv++) {
    const room = buildRoom(lv, mats());
    const pairs = roomSpotSolids(room);
    const desk = room.spots.find((s) => s.key === 'desk');
    // 의자: 앉는 판은 자리에서 0.5m, 등받이는 0.25m 책상 쪽 (home_interior.js)
    for (const [name, z] of [['앉는 판', desk.z - 0.5], ['등받이', desk.z - 0.25]]) {
      assert.equal(roomSpotAt(room, desk.x + 0.1, z + 0.05, false, pairs, { x: desk.x, z })?.key, 'desk', `단계 ${lv} 의자 ${name} (메시 가운데)`);
      assert.equal(roomSpotAt(room, desk.x - 0.15, z, false, pairs)?.key, 'desk', `단계 ${lv} 의자 ${name} (맞힌 점만)`);
    }
    // 방 가운데 쪽(꾸밈 가구 밖, 벽 아님)을 맞혀도 달력·문으로 가지 않음
    const cal = room.spots.find((s) => s.key === 'calendar');
    assert.equal(roomSpotAt(room, cal.x + 0.3, cal.z + 0.2, false, pairs), null, `단계 ${lv} 벽이 아닌 곳`);
  }
});

test('집 안 PointerNav.pick: 실제 카메라(위·앞)에서 의자를 눌러도 책상 (세로 폰 390x844)', () => {
  globalThis.innerWidth = 390; globalThis.innerHeight = 844;
  for (let lv = 0; lv < ROOM.length; lv++) {
    const room = buildRoom(lv, mats());
    room.group.position.set(IO.x, IO.y, IO.z);
    room.group.updateMatrixWorld(true);
    const desk = room.spots.find((s) => s.key === 'desk');
    // 집 안 카메라: yaw 0, pitch 0.92, 거리 9.5~12, 유니코(책상 자리) 머리 높이를 봄
    const camera = new THREE.PerspectiveCamera(45, 390 / 844, 0.1, 100);
    const tgt = new THREE.Vector3(IO.x + desk.x, IO.y + 1.1, IO.z + desk.z), dist = [9.5, 10.5, 12][lv];
    camera.position.copy(tgt).add(new THREE.Vector3(0, Math.sin(0.92), Math.cos(0.92)).multiplyScalar(dist));
    camera.lookAt(tgt);
    camera.updateMatrixWorld(true);
    const nav = new PointerNav({ world: { scene: new THREE.Scene() }, camera, home: { inside: true, room } });
    for (const [name, y, dz] of [['앉는 판', 0.51, -0.5], ['등받이', 0.9, -0.25]]) {
      const v = new THREE.Vector3(IO.x + desk.x, IO.y + y, IO.z + desk.z + dz).project(camera);
      const r = nav.pick(((v.x + 1) / 2) * 390, ((1 - v.y) / 2) * 844, true);
      assert.equal(r.target?.key, 'home_desk', `단계 ${lv} 의자 ${name}`);
    }
  }
});

/** 바깥 pick 시험용 최소 게임 */
function outdoorGame(camera, extra = {}) {
  return {
    world: { scene: new THREE.Scene(), placed: [] }, camera, home: { inside: false },
    ranch: { ents: [], visitors: [] }, npcs: { list: [] }, ride: { driving: true }, koat: { booths: [], desk: { group: new THREE.Group() } },
    nature: { trees: [], bugs: [] }, rice: { thresher: new THREE.Group(), paddyAt: () => -1, paddies: [] },
    farm: { tiles: [] }, player: { position: new THREE.Vector3() }, ...extra,
  };
}
const screenOf = (p, camera) => { const v = p.clone().project(camera); return [((v.x + 1) / 2) * innerWidth, ((1 - v.y) / 2) * innerHeight]; };

test('시야 구멍: 셰이더와 같은 식 (선분 둘레 안쪽만, 바닥 높이·유니코 뒤는 아님)', () => {
  const cam = new THREE.Vector3(0, 5, 8), tgt = new THREE.Vector3(0, 1.1, 0);
  assert.equal(inSeeHole(new THREE.Vector3(0, 3, 4), cam, tgt), true, '선분 위');
  assert.equal(inSeeHole(new THREE.Vector3(1.2, 3, 4), cam, tgt), true, '반지름 안');
  assert.equal(inSeeHole(new THREE.Vector3(2.5, 3, 4), cam, tgt), false, '반지름 밖');
  assert.equal(inSeeHole(new THREE.Vector3(0, 0.3, 0.5), cam, tgt), false, '바닥 가까이는 구멍 없음');
  assert.equal(inSeeHole(new THREE.Vector3(0, 0.8, -1), cam, tgt), false, '유니코 뒤');
  assert.equal(inSeeHole(new THREE.Vector3(0, 3, 4), cam, tgt, 0), false, '꺼짐');
});

test('바깥 PointerNav.pick: 유니코를 가린 집은 시야 구멍 자리를 누르면 그 뒤의 땅, 보이는 지붕을 누르면 집', () => {
  globalThis.innerWidth = 390; globalThis.innerHeight = 844;
  const L = LAYOUT;
  // 집 남쪽(뒤)에 카메라, 집 북쪽 문 앞에 유니코 → 집이 유니코를 가림
  const house = new THREE.Group();
  const wall = new THREE.Mesh(new THREE.BoxGeometry(4.5, 4.6, 3.9), enhanceMaterial(new THREE.MeshStandardMaterial({ name: 'home_wall' })));
  wall.position.y = 2.3;
  house.add(wall);
  house.position.set(L.home.x, 0, L.home.z);
  const player = new THREE.Vector3(L.home.x, 0, L.home.door.z - 3);
  const tgt = player.clone().setY(1.1);
  const camera = new THREE.PerspectiveCamera(45, 390 / 844, 0.1, 200);
  camera.position.copy(tgt).add(new THREE.Vector3(0, Math.sin(0.45), Math.cos(0.45)).multiplyScalar(9));
  camera.lookAt(tgt);
  camera.updateMatrixWorld(true);
  const game = outdoorGame(camera, { home: { inside: false, house }, player: { position: player } });
  game.world.scene.add(house);
  game.world.scene.updateMatrixWorld(true);
  const keep = [SURF.seeCam.value.clone(), SURF.seeTarget.value.clone()];
  SURF.seeCam.value.copy(camera.position); SURF.seeTarget.value.copy(tgt);
  try {
    const nav = new PointerNav(game);
    for (const [dx, dz] of [[0, 0], [0.6, 0.3], [-0.6, -0.4], [0.3, 0.8], [-0.4, 0.6]]) {
      const p = player.clone().add(new THREE.Vector3(dx, 0, dz));
      const r = nav.pick(...screenOf(p, camera), true);
      assert.ok(r.point && !r.target, `유니코 옆 땅 (${dx}, ${dz}) 은 걷기`);
      assert.ok(r.point.distanceTo(p) < 0.05);
    }
    // 시야 구멍 밖 (집 옆 모서리 위쪽)
    const roof = new THREE.Vector3(L.home.x + 2.1, 4.5, L.home.z + 1.9);
    assert.equal(inSeeHole(roof), false);
    assert.equal(nav.pick(...screenOf(roof, camera), true).target?.key, 'home', '보이는 지붕은 집');
    // 구멍이 꺼지면 예전처럼 집을 맞힘
    SURF.seeOn.value = 0;
    assert.equal(nav.pick(...screenOf(player, camera), true).target?.key, 'home');
  } finally {
    SURF.seeOn.value = 1; SURF.seeCam.value.copy(keep[0]); SURF.seeTarget.value.copy(keep[1]);
  }
});

test('바깥 PointerNav.pick: 카메라가 축사 상자 안에 있으면 그 축사는 대상이 아님, 밖에서 보면 축사', () => {
  globalThis.innerWidth = 390; globalThis.innerHeight = 844;
  const L = LAYOUT;
  const camera = new THREE.PerspectiveCamera(45, 390 / 844, 0.1, 200);
  const look = (from, to) => { camera.position.copy(from); camera.lookAt(to); camera.updateMatrixWorld(true); };
  const game = outdoorGame(camera);
  game.world.placed = [{ name: 'barn', x: L.barn.x, z: L.barn.z, hx: 3, hz: 2.5, h: 4.5 }];
  SURF.seeOn.value = 0; // 상자 판정만 봄
  try {
    const nav = new PointerNav(game);
    // 유니코는 축사 북쪽 뒤, 카메라는 남쪽 지붕 아래(상자 안)
    const player = new THREE.Vector3(L.barn.x, 0, L.barn.z - 4);
    look(new THREE.Vector3(L.barn.x, 1.8, L.barn.z + 1.5), player.clone().setY(1.1));
    const r = nav.pick(innerWidth / 2, innerHeight * 0.6, true);
    assert.ok(r.point && !r.target, '상자 안에서 쏜 광선은 축사가 아님');
    // 밖(남쪽 멀리)에서 축사를 보면 축사
    look(new THREE.Vector3(L.barn.x, 5, L.barn.z + 12), new THREE.Vector3(L.barn.x, 2, L.barn.z));
    assert.equal(nav.pick(innerWidth / 2, innerHeight / 2, true).target?.key, 'barn');
  } finally {
    SURF.seeOn.value = 1;
  }
});
