import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { ROUTINE, ROUTINE_REACH, slotAt, legOf, routineSpots, canDepart, isNight, hourOf } from '../src/game/sim/routine.js';
import { NavGrid } from '../src/game/sim/path.js';
import { LAYOUT, World } from '../src/game/world.js';

// 정적 월드: 게임을 띄워 주민 장애물만 뺀 장애물·건물 상자·물(부두 포함)을 그대로 옮겨 둔 것 (2026-11 레이아웃)
const FX = JSON.parse(readFileSync(new URL('./fixtures/static_world.json', import.meta.url), 'utf8'));
const world = { obstacles: FX.obstacles, boxes: FX.boxes, waters: FX.waters };
world.inWater = World.prototype.inWater.bind(world);
world.isBlocked = World.prototype.isBlocked.bind(world);
world.resolveCollision = World.prototype.resolveCollision.bind(world);
/** 주민 몸 반지름 (걷기 resolveCollision 과 같은 0.4) */
const BODY_R = 0.4;
const nav = new NavGrid((x, z) => world.isBlocked(x, z, BODY_R), LAYOUT.bounds - 1, 0.5);
const FARM = { x: (LAYOUT.farm.cols * LAYOUT.farm.tile) / 2, z: (LAYOUT.farm.rows * LAYOUT.farm.tile) / 2 };

test('일과: 주민마다 0~24시를 빈틈·겹침 없이 덮고, 어긋남은 ±0.7시간 안', () => {
  for (const [id, R] of Object.entries(ROUTINE)) {
    assert.ok(Math.abs(R.shift) <= 0.7, `${id} 어긋남 ${R.shift}`);
    const s = [...R.slots].sort((a, b) => a.from - b.from);
    assert.equal(s[0].from, 0, `${id} 0시부터`);
    assert.equal(s[s.length - 1].to, 24, `${id} 24시까지`);
    for (let i = 1; i < s.length; i++) assert.equal(s[i].from, s[i - 1].to, `${id} ${s[i - 1].to}시 빈틈`);
    for (let h = 0; h < 24; h += 0.25) assert.ok(slotAt(id, h), `${id} ${h}시`);
  }
  assert.equal(slotAt('nobody', 3), null);
});

test('일과 자리: 제자리에서 12m 안, 밭·자전거 자리 밖, 서 있을 수 있는 곳', () => {
  for (const s of routineSpots()) {
    const home = LAYOUT.npcs[s.id];
    assert.ok(Math.hypot(s.x - home.x, s.z - home.z) <= ROUTINE_REACH, `${s.id} ${Math.hypot(s.x - home.x, s.z - home.z).toFixed(1)}m`);
    assert.ok(Math.abs(s.x) > FARM.x + 0.5 || Math.abs(s.z) > FARM.z + 0.5, `${s.id} 밭 위 (${s.x}, ${s.z})`);
    for (const b of LAYOUT.rides.bike) assert.ok(Math.hypot(s.x - b.x, s.z - b.z) > 2.4, `${s.id} 자전거 자리 옆`);
    assert.ok(!world.isBlocked(s.x, s.z, BODY_R), `${s.id} 막힌 자리 (${s.x}, ${s.z})`);
  }
});

test('일과 길: 제자리 → 경유점 → 자리 구간마다 NavGrid.lineFree (정적 월드, 몸 반지름 0.4)', () => {
  for (const [id, R] of Object.entries(ROUTINE)) {
    const n = LAYOUT.npcs[id];
    for (const s of R.slots) {
      if (!s.at) continue;
      // 꼬마의 제자리는 들판 → 첫 경유점부터 (들판 어디서든 첫 경유점까지는 열려 있어야)
      const pts = legOf({ x: n.x, z: n.z }, s);
      const from = n.wander ? 1 : 0;
      if (n.wander) for (const [x, z] of [[n.wander.x0 + 1, n.wander.z1 - 0.5], [n.wander.x1 - 1, n.wander.z1 - 0.5], [n.x, n.z]]) assert.ok(nav.lineFree({ x, z }, pts[1]), `${id} 들판 (${x}, ${z}) → 첫 경유점`);
      for (let i = from; i < pts.length - 1; i++) assert.ok(nav.lineFree(pts[i], pts[i + 1]), `${id} ${s.from}시: (${pts[i].x}, ${pts[i].z}) → (${pts[i + 1].x}, ${pts[i + 1].z})`);
    }
  }
});

test('일과: 비 오면 부두·논두렁·연못 자리 대신 제자리, 밤은 21~5시', () => {
  const h = 7 + ROUTINE.fisher.shift;
  assert.ok(slotAt('fisher', h).at, '맑은 아침 낚시꾼은 부두');
  assert.equal(slotAt('fisher', h, true).at, null, '비 오면 제자리');
  assert.equal(slotAt('granny', 8 + ROUTINE.granny.shift, true).at, null);
  assert.ok(slotAt('researcher', 9 + ROUTINE.researcher.shift, true).at, '연구원은 비가 와도 센서 옆 (온실 옆)');
  assert.ok(isNight(22) && isNight(3) && !isNight(12) && !isNight(5));
  assert.equal(hourOf(0.5), 12);
});

test('출발 보류: 플레이어가 4m 안이거나 대화 중이면 기다림', () => {
  assert.equal(canDepart(3.9, false), false);
  assert.equal(canDepart(4.0, false), false);
  assert.equal(canDepart(4.1, false), true);
  assert.equal(canDepart(20, true), false);
});

// ---- 화면 코드(npcs.js) 와 함께: 처음엔 바로 그 자리, 시간이 바뀌면 걸어서, 플레이어가 곁에 있으면 기다림 ----
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => new Proxy({ createRadialGradient: () => ({ addColorStop() {} }), measureText: () => ({ width: 60 }) }, { get: (t, k) => (k in t ? t[k] : () => {}) }) }) };
globalThis.fetch = async (url) => {
  const b = readFileSync(new URL(`../public/models/${url}`, import.meta.url));
  return { ok: true, arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) };
};
const { unicoDecoderReady } = await import('../src/game/unico_mesh.js');
const { loadUnicoMesh } = await import('../src/game/unico.js');
const { SPECIES_IDS } = await import('../src/game/species.js');
await unicoDecoderReady;
for (const sp of SPECIES_IDS) await loadUnicoMesh(`villager_${sp}_lod.bin`, `v_${sp}_lod`);

async function village(time) {
  const { NPCs } = await import('../src/game/view/npcs.js');
  const { Villagers } = await import('../src/game/sim/villagers.js');
  const camera = new THREE.PerspectiveCamera();
  const w = { ...world, scene: new THREE.Scene(), obstacles: [...FX.obstacles.map((o) => ({ ...o }))], time, day: 3, weatherKind: 'clear' };
  w.isBlocked = World.prototype.isBlocked.bind(w); w.inWater = World.prototype.inWater.bind(w); w.resolveCollision = World.prototype.resolveCollision.bind(w);
  const game = { assets: null, world: w, followCam: { camera }, villagers: new Villagers(() => 0.5), player: { position: new THREE.Vector3(0, 0, 9) }, audio: { play() {} }, dialogue: { active: false } };
  const npcs = new NPCs(game);
  return { npcs, game, camera, w };
}
const step = (v, n, dt = 1 / 20) => { for (let i = 0; i < n; i++) v.npcs.update(dt, v.game.player.position); };

test('주민 일과: 처음엔 걷지 않고 바로 그 자리, 시간이 바뀌면 걸어서 옮기고 장애물도 따라감', async () => {
  // 준비: 아침 7시 30분(어긋남 포함 낚시 시간)
  const v = await village((7.5 + ROUTINE.fisher.shift) / 24);
  v.camera.position.set(-10, 5, 30); // 낚시터를 보는 카메라 (30m 안 → 걸어서)
  step(v, 2);
  const f = v.npcs.list.find((e) => e.id === 'fisher'), p = f.u.group.position;
  assert.ok(Math.hypot(p.x + 12.5, p.z - 31.8) < 0.01, `불러온 직후 부두 끝 (${p.x.toFixed(2)}, ${p.z.toFixed(2)})`);
  assert.ok(Math.hypot(f.ob.x - p.x, f.ob.z - p.z) < 0.01 && f.ob.r > 0, '장애물도 부두 끝');
  assert.equal(v.npcs.posOf('fisher'), p);
  // 실행: 12시 → 가게 앞 제자리로 걸어감
  v.w.time = (12 + ROUTINE.fisher.shift) / 24;
  step(v, 25);
  assert.ok(f.route && f.u.moving, '걷는 중');
  assert.equal(f.ob.r, 0, '걷는 동안 장애물 끔');
  step(v, 20 * 30);
  // 확인
  assert.ok(Math.hypot(p.x - LAYOUT.npcs.fisher.x, p.z - LAYOUT.npcs.fisher.z) < 0.4, `가게 앞 (${p.x.toFixed(2)}, ${p.z.toFixed(2)})`);
  assert.ok(f.ob.r > 0 && Math.hypot(f.ob.x - p.x, f.ob.z - p.z) < 0.01);
  assert.equal(f.route, null);
});

test('주민 일과: 플레이어가 4m 안이면 자리를 뜨지 않고 기다렸다가, 멀어지면 출발', async () => {
  const v = await village((10 + ROUTINE.merchant.shift) / 24);
  v.camera.position.set(3, 6, -2);
  step(v, 2);
  const m = v.npcs.list.find((e) => e.id === 'merchant'), p = m.u.group.position;
  v.game.player.position.set(p.x + 2, 0, p.z + 1); // 곁에 섬
  v.w.time = (20 + ROUTINE.merchant.shift) / 24; // 저녁: 벤치 옆으로 갈 시간
  step(v, 60);
  assert.equal(m.route, null, '플레이어 곁이면 기다림');
  assert.ok(Math.hypot(p.x - LAYOUT.npcs.merchant.x, p.z - LAYOUT.npcs.merchant.z) < 0.01);
  v.game.player.position.set(p.x + 8, 0, p.z + 8);
  step(v, 20 * 10);
  const s = slotAt('merchant', 20 + ROUTINE.merchant.shift);
  assert.ok(Math.hypot(p.x - s.at.x, p.z - s.at.z) < 0.4, `벤치 옆 (${p.x.toFixed(2)}, ${p.z.toFixed(2)})`);
});

test('밤: 플레이어가 6m 밖이면 하던 일(돈 세기)을 멈추고 졸다가, 다가오면 깨서 한마디 · 밤낚시 자리는 깨어 있음', async () => {
  const v = await village((23 + ROUTINE.merchant.shift) / 24);
  v.camera.position.set(3, 6, -2);
  v.game.player.position.set(12, 0, 0);
  step(v, 20 * 8); // 돈 세기 동작이 돌아가는 동안에도
  const m = v.npcs.list.find((e) => e.id === 'merchant'), f = v.npcs.list.find((e) => e.id === 'fisher');
  assert.equal(m.cur.act, 'count');
  assert.ok(m.dozing, '졸기');
  assert.equal(m.u.action, 'doze');
  assert.ok(f.cur.awake && !f.dozing, '밤낚시는 깨어 있음');
  const p = m.u.group.position;
  v.game.player.position.set(p.x + 2, 0, p.z + 2);
  step(v, 2);
  assert.ok(!m.dozing && m.u.bubble, '깨서 말풍선');
});

test('주민 일과: 제자리 → 부두 끝도 경유점을 차례로 지나 걸어감 (물에 빠지지 않음)', async () => {
  // 준비: 한낮 가게 앞, 플레이어는 6m 넘게 떨어져 있음
  const v = await village((12 + ROUTINE.fisher.shift) / 24);
  v.camera.position.set(-6, 6, 20);
  v.game.player.position.set(-2, 0, 22);
  step(v, 2);
  const f = v.npcs.list.find((e) => e.id === 'fisher'), p = f.u.group.position;
  // 실행: 아침 낚시 시간
  v.w.time = (6 + ROUTINE.fisher.shift) / 24;
  step(v, 30);
  assert.ok(f.route, '출발함');
  for (let i = 0; i < 20 * 40 && f.route; i++) {
    step(v, 1);
    assert.ok(!v.w.inWater(p.x, p.z, 0), `물에 빠짐 (${p.x.toFixed(2)}, ${p.z.toFixed(2)})`);
  }
  // 확인
  assert.ok(Math.hypot(p.x + 12.5, p.z - 31.8) < 0.4, `부두 끝 (${p.x.toFixed(2)}, ${p.z.toFixed(2)})`);
  assert.equal(f.cur.act, 'fishwait');
});
