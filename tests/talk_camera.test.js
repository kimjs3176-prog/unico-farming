// 대화 카메라: 말하는 주민 얼굴을 3/4 앞에서, 내 뒤통수는 화면 가장자리, 얼굴은 렌즈 올림으로 대화창 위
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

const ctx = new Proxy({ measureText: () => ({ width: 60 }), createRadialGradient: () => ({ addColorStop() {} }) }, { get: (t, k) => (k in t ? t[k] : () => {}) });
const el = () => ({ className: '', innerHTML: '', style: {}, classList: { add() {}, remove() {}, contains: () => false }, querySelector: () => ({}), append() {}, getContext: () => ctx });
globalThis.document ??= { createElement: el, getElementById: el, body: el() };
globalThis.innerHeight ??= 800;
const { NPCs, TALK_FRAME, talkBoxTop } = await import('../src/game/view/npcs.js');
const { Cinematics, speakerShot, cheatYaw, facingAngle, liftFor, hudFrac, ndcX, talkShot } = await import('../src/game/cutscene.js');
const { SPECIES, SPECIES_IDS } = await import('../src/game/species.js');
const { fovFor } = await import('../src/game/camera.js');
const { SURF } = await import('../src/game/surface.js');

const DEG = Math.PI / 180;
/** 화면 크기별 실제 대화창 윗변 (선택지 5개, 스크린샷에서 잰 값) */
const ASPECTS = { 가로: { aspect: 1.6, h: 800, boxTop: 0.45 }, 세로: { aspect: 412 / 839, h: 839, boxTop: 0.46 }, 가로폰: { aspect: 844 / 390, h: 390, boxTop: 0.48 } };
const FACE_ME = 1.35;

function npcsWith(camera, extra = {}) {
  return Object.assign(Object.create(NPCs.prototype), { game: { camera, ...extra }, list: [] });
}
function entry(sp, x = 0, z = 0) {
  const u = { scale: SPECIES[sp].scale, group: { position: new THREE.Vector3(x, 0, z) } };
  return { id: sp, u };
}
/** 렌즈 올림까지 넣은 실제 화면 카메라 */
function viewCam(shot, aspect, lift) {
  const cam = new THREE.PerspectiveCamera(fovFor(aspect), aspect, 0.1, 600);
  cam.position.set(...shot.pos); cam.lookAt(...shot.look);
  if (lift) cam.setViewOffset(aspect, 1, 0, lift, aspect, 1);
  cam.updateMatrixWorld(); cam.updateProjectionMatrix();
  return cam;
}
const proj = (cam, p, y) => new THREE.Vector3(p.x, y, p.z).project(cam);

test('앞모습 대화 구도: 주민 6종 × 다가온 방향 8곳 × 가로·세로·가로폰 — 얼굴 45° 안, 두 얼굴 모두 대화창 위·화면 안, 내 머리와 떨어짐', () => {
  for (const sp of SPECIES_IDS) for (let k = 0; k < 8; k++) for (const [name, { aspect, h, boxTop }] of Object.entries(ASPECTS)) {
    const e = entry(sp, 2, -3), S = e.u.group.position, a = (k * 45 + 10) * DEG;
    const L = { x: S.x + Math.sin(a) * 1.9, z: S.z + Math.cos(a) * 1.9 }; // 이쪽에서 걸어와 1.9m 앞에 섬
    const camera = new THREE.PerspectiveCamera(fovFor(aspect), aspect, 0.1, 600);
    const back = a + (k % 2 ? 0.5 : -0.5); // 따라가기 카메라는 내 뒤쪽 (조금 비껴)
    camera.position.set(L.x + Math.sin(back) * 8, 4.5, L.z + Math.cos(back) * 8);
    const shot = npcsWith(camera).talkCamera(L, S, e, { front: true });
    const tag = `${sp} ${k * 45 + 10}° ${name}`;
    assert.ok(shot.front && shot.lift === true, `${tag}: 앞모습 구도`);
    assert.ok(shot.theta <= 55 * DEG + 1e-9, `${tag}: 55° 넘는 후보는 쓰지 않음`);
    const yaw = cheatYaw(S, L, shot.pos, 17 * DEG);
    const f = facingAngle(yaw, S, shot.pos);
    assert.ok(f <= 45, `${tag}: 주민 얼굴 각도 ${f.toFixed(1)}°`);
    const hud = hudFrac(h), cam = viewCam(shot, aspect, liftFor(boxTop, hud)), face = 1.3 * e.u.scale;
    const s = proj(cam, S, face), l = proj(cam, L, FACE_ME), top = proj(cam, S, face + 0.45 * e.u.scale);
    for (const [who, v] of [['주민', s], ['나', l]]) {
      const yFrac = (1 - v.y) / 2;
      assert.ok(yFrac < boxTop - 0.04, `${tag}: ${who} 얼굴이 대화창 위 (${yFrac.toFixed(2)} < ${boxTop})`);
      assert.ok(Math.abs(v.x) < 0.85, `${tag}: ${who} 얼굴 가로 ${v.x.toFixed(2)}`);
    }
    assert.ok((1 - top.y) / 2 > hud - 0.04, `${tag}: 주민 머리 끝이 위 HUD 에 덜 가림 (${((1 - top.y) / 2).toFixed(2)})`);
    assert.ok(Math.abs(s.x - l.x) / 2 >= 0.15, `${tag}: 두 얼굴 간격 ${(Math.abs(s.x - l.x) / 2).toFixed(2)}`);
  }
});

test('앞모습 구도 화면 검사: 주민 턱이 이름 칩보다 0.04 위, 내 몸은 좁고(가로 28%·세로 폰 40%) 화면 끝에 40% 넘게 잘리지 않음, 낮은 가로폰은 얼굴이 창 위로 12%', () => {
  const H0 = globalThis.innerHeight;
  try {
    for (const sp of SPECIES_IDS) for (let k = 0; k < 8; k++) for (const [name, { aspect, h }] of Object.entries(ASPECTS)) {
      globalThis.innerHeight = h;
      const e = entry(sp, 2, -3), S = e.u.group.position, a = (k * 45 + 10) * DEG, sc = e.u.scale;
      const L = { x: S.x + Math.sin(a) * 1.9, z: S.z + Math.cos(a) * 1.9 };
      const camera = new THREE.PerspectiveCamera(fovFor(aspect), aspect, 0.1, 600);
      camera.position.set(L.x + Math.sin(a + 0.5) * 8, 4.5, L.z + Math.cos(a + 0.5) * 8);
      const shot = npcsWith(camera).talkCamera(L, S, e, { front: true });
      const tag = `${sp} ${k * 45 + 10}° ${name} (${(shot.theta / DEG).toFixed(0)}° ${shot.dist.toFixed(1)}m)`;
      assert.ok(shot.front && shot.fit, `${tag}: 검사를 통과한 앞모습`);
      assert.ok(shot.dist <= 6.5 + 1e-9, `${tag}: 6.5m 안`);
      // 렌즈 올림까지 넣은 실제 화면 (대화창 윗변은 선택지 5개 + 설명 줄일 때)
      const box = talkBoxTop(aspect, h), cam = viewCam(shot, aspect, liftFor(box, hudFrac(h)));
      const yFrac = (y) => (1 - proj(cam, S, y).y) / 2;
      const chin = yFrac(1.3 * sc - 0.25 * sc);
      assert.ok(chin <= box - TALK_FRAME.chip / h - 0.04 + 1e-9, `${tag}: 턱 ${chin.toFixed(3)} / 이름 칩 ${(box - TALK_FRAME.chip / h).toFixed(3)}`);
      if (aspect > 1 && h <= 500) assert.ok(box - yFrac(1.3 * sc) >= 0.12 - 1e-9, `${tag}: 낮은 가로폰 얼굴 여유`);
      // 내 몸 (가로 ±heroR, 높이 0.2~1.85m) 의 화면 가로 범위
      const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0).setY(0).normalize().multiplyScalar(TALK_FRAME.heroR);
      let x0 = Infinity, x1 = -Infinity;
      for (const sgn of [-1, 1]) for (const y of [0.2, 1.85]) { const v = new THREE.Vector3(L.x + right.x * sgn, y, L.z + right.z * sgn).project(cam); x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); }
      const w = (x1 - x0) / 2, clip = (Math.max(0, x1 - 1) + Math.max(0, -1 - x0)) / (x1 - x0);
      if (clip < 0.999) {
        assert.ok(w <= (aspect < 1 ? 0.4 : 0.28) + 1e-9, `${tag}: 내 몸 너비 ${w.toFixed(2)}`);
        assert.ok(clip <= 0.4 + 1e-9, `${tag}: 내 몸 잘림 ${clip.toFixed(2)}`);
      }
    }
  } finally { globalThis.innerHeight = H0; }
});

test('앞모습 구도 화면 검사: 가까우면 턱이 대화창에 붙으므로 물러남 (가로 화면 큰 대화창), 검사를 통과한 후보가 가리면 통과 못 한 트인 후보', () => {
  const camera = new THREE.PerspectiveCamera(45, 1.6, 0.1, 600);
  camera.position.set(-3, 4, 10);
  const e = entry('bear'), S = e.u.group.position, L = { x: 0, z: 1.9 };
  const self = npcsWith(camera);
  const near = speakerShot(L, S, -1, { theta: 35 * DEG, D: 3.2, maxD: 3.2, fov: 45, aspect: 1.6, faceS: 1.3, camY: 1.6, lookY: 1.265 });
  const m = self.talkFrame(near, L, S, 1, 1.6, 45, 800);
  assert.ok(m.chinGap < TALK_FRAME.room || m.heroW > TALK_FRAME.heroW, '3.2m 는 너무 가까움');
  for (const s of self._frontShots(L, S, e)) {
    const f = self.talkFrame(s, L, S, 1, 1.6, 45, 800);
    assert.equal(s.fit, self._frameOk(f, 1.6, 800));
    if (s.fit) assert.ok(f.chinGap >= TALK_FRAME.room && f.heroW <= TALK_FRAME.heroW);
  }
});

test('앞모습 구도: 지금 카메라 쪽을 먼저, 다른 주민이 시선을 가리면 다른 각도, 키 작은 반려견은 가리지 않음', () => {
  const camera = new THREE.PerspectiveCamera(45, 1.6, 0.1, 600);
  const e = entry('fox'), S = e.u.group.position, L = { x: 0, z: 1.9 };
  camera.position.set(-3, 4, 10); // 왼쪽 뒤
  const self = npcsWith(camera);
  const s0 = self.talkCamera(L, S, e, { front: true });
  assert.ok(s0.pos[0] < 0, '카메라가 있던 쪽');
  assert.equal(s0.theta, 35 * DEG);
  // 첫 구도의 시선 가운데에 다른 주민
  const mid = { x: (s0.pos[0] + s0.look[0]) / 2, z: (s0.pos[2] + s0.look[2]) / 2 };
  const other = entry('bear', mid.x, mid.z);
  self.list = [e, other];
  const s1 = self.talkCamera(L, S, e, { front: true });
  assert.ok(s1.front, '여전히 앞모습');
  assert.notDeepEqual(s1.pos, s0.pos);
  assert.ok(s1.clear >= 1.2);
  // 반려견은 거의 수평인 시선 아래 → 그대로
  self.list = [e];
  self.game.pet = { label: { visible: true }, e: { m: { position: new THREE.Vector3(mid.x, 0, mid.z) } } };
  const s2 = self.talkCamera(L, S, e, { front: true });
  assert.deepEqual(s2.pos, s0.pos);
});

test('앞모습 구도: 모든 앞모습 후보가 건물에 막히면 옛 옆 구도 (렌즈 올림 없이 카메라를 낮춘 것)', () => {
  const camera = new THREE.PerspectiveCamera(45, 1.6, 0.1, 600);
  camera.position.set(0, 4, 10);
  const e = entry('cat'), S = e.u.group.position, L = { x: 0, z: 1.9 };
  // 앞모습 후보마다 카메라→시선 선 중간에 작은 상자 (옆 구도 자리는 비움)
  const boxes = [], probe = npcsWith(camera);
  for (const f of probe._frontShots(L, S, e)) {
    const x = f.pos[0] + (f.look[0] - f.pos[0]) * 0.55, z = f.pos[2] + (f.look[2] - f.pos[2]) * 0.55;
    boxes.push({ x0: x - 0.3, x1: x + 0.3, z0: z - 0.3, z1: z + 0.3 });
  }
  const self = npcsWith(camera, { world: { obstacles: [], boxes } });
  const s = self.talkCamera(L, S, e, { front: true });
  assert.ok(!s.front, '옛 구도');
  assert.equal(s.lift, 0);
  assert.equal(s.block, 0);
  // front 를 안 주면 옛 구도 그대로 (tests/species.test.js 의 옛 시험과 같은 값)
  const self2 = npcsWith(camera);
  const old = self2.talkCamera(L, S, e);
  const t = talkShot(L, S, { x: (L.x + S.x) / 2 + 5, z: (L.z + S.z) / 2 }, 45, 1.6);
  assert.ok(!old.front && old.lift === 0);
  assert.equal(old.pos[1], 2.0, '가로 화면 옛 높이');
  assert.ok(Math.abs(Math.hypot(old.pos[0] - 0, old.pos[2] - 0.95) - Math.hypot(t.pos[0], t.pos[2] - 0.95)) < 1e-9);
});

test('speakerShot: 세로 폰은 두 얼굴이 들어오게 물러나고(최대 6m), 반려견 구도는 반려견만 맞춤', () => {
  const S = { x: 0, z: 0 }, L = { x: 0, z: 1.9 };
  const wide = speakerShot(L, S, 1, { aspect: 1.6, fov: 45 });
  assert.equal(wide.dist, 4.2);
  const tall = speakerShot(L, S, 1, { aspect: 0.462, fov: fovFor(0.462) });
  assert.ok(tall.dist > 4.2 && tall.dist <= 6, `세로 ${tall.dist}`);
  for (const [p, y] of [[S, 1.3], [L, 1.35]]) assert.ok(Math.abs(ndcX(tall.pos, tall.look, p, y, fovFor(0.462), 0.462)) < 0.8);
  // 반려견 돌보기 (pet.js PET_SHOT): 60° 옆에서 낮게, 콩이는 카메라 쪽으로 50° 고개 → 거의 정면, 1.3m 앞의 내 몸은 화면 가장자리 밖
  const P = { x: 0, z: 1.3 };
  for (const aspect of [1.6, 0.462]) {
    const dog = speakerShot(P, S, -1, { theta: 60 * DEG, D: 2.4, maxD: 3.4, camY: 0.9, lookY: 0.45, lookMix: 0.15, faceS: 0.45, faceL: null, aspect, fov: fovFor(aspect) });
    assert.ok(dog.dist <= 3.4 && dog.pos[1] === 0.9 && dog.look[1] === 0.45);
    assert.ok(Math.abs(ndcX(dog.pos, dog.look, S, 0.45, fovFor(aspect), aspect)) < 0.8, '반려견 얼굴이 화면 안');
    const f = facingAngle(cheatYaw(S, P, dog.pos, 50 * DEG), S, dog.pos);
    assert.ok(f < 15, `반려견 얼굴 거의 정면 ${f.toFixed(1)}°`);
    const me = ndcX(dog.pos, dog.look, P, 0.9, fovFor(aspect), aspect);
    assert.ok(Math.abs(me) > 0.8, `내 몸은 가장자리 밖 (${me.toFixed(2)})`);
  }
});

test('렌즈 올림: 아직 한 번도 올리지 않은 처음 상태의 컷신 샷도 멈추지 않고 카메라를 옮김 (시야 구멍은 그대로)', () => {
  const camera = new THREE.PerspectiveCamera(45, 1.6, 0.1, 600);
  camera.position.set(0, 6, 10); camera.lookAt(0, 0, 0);
  const game = { camera, followCam: { smooth: new THREE.Vector3() } };
  const cin = new Cinematics(game, { append() {} });
  const goal = new THREE.Vector3(3, 2, 3), d0 = camera.position.distanceTo(goal);
  assert.doesNotThrow(() => cin.update(1 / 30)); // 아무 샷도 없을 때
  cin.shot([3, 2, 3], [0, 1, 0], 0.01);
  cin.t0 -= 1000; // 이동 시간은 이미 지남
  assert.doesNotThrow(() => { for (let i = 0; i < 60; i++) cin.update(1 / 30); });
  assert.ok(camera.position.distanceTo(goal) < d0 * 0.2, '컷신 샷으로 옮겨 감');
  assert.equal(SURF.seeOn.value, 1);
  assert.ok(!camera.view?.enabled);
});

test('렌즈 올림: 대화창 윗변을 재서 얼굴을 그 위로 (위로만 따라감), 화면비·시야각은 그대로, 끝나면 섞임과 함께 줄다가 지움', async () => {
  const camera = new THREE.PerspectiveCamera(45, 1.6, 0.1, 600);
  camera.position.set(0, 6, 10); camera.lookAt(0, 0, 0);
  let top = 0.46 * 800;
  const game = { camera, followCam: { smooth: new THREE.Vector3() }, dialogue: { el: { classList: { contains: () => false }, getBoundingClientRect: () => ({ top, height: 300 }) } } };
  const cin = new Cinematics(game, { append() {} });
  const P0 = camera.projectionMatrix.clone();
  cin.shot([3, 1.6, 3], [0, 1.25, 0.5], 0.01, { lift: true });
  const run = (n) => { for (let i = 0; i < n; i++) cin.update(1 / 30); };
  run(90);
  const off = () => (camera.view?.enabled ? camera.view.offsetY / camera.view.fullHeight : 0);
  assert.ok(Math.abs(off() - liftFor(0.46, hudFrac())) < 0.01, `올림 ${off().toFixed(3)} ≈ ${liftFor(0.46, hudFrac()).toFixed(3)}`);
  assert.equal(camera.aspect, 1.6);
  assert.equal(camera.fov, 45);
  assert.equal(SURF.seeOn.value, 0, '내 어깨 너머 구도에선 시야 구멍(내 머리까지 점묘로 지움)을 끔');
  top = 0.3 * 800; run(60); // 선택지가 펼쳐져 창이 커짐 → 더 올림
  assert.ok(Math.abs(off() - liftFor(0.3, hudFrac())) < 0.01);
  top = 0.6 * 800; run(60); // 다시 작아져도 출렁이지 않음
  assert.ok(Math.abs(off() - liftFor(0.3, hudFrac())) < 0.01);
  const u = { facing: 0 };
  cin.faceLock(u, 1.2);
  assert.equal(u.faceLock, 1.2); assert.equal(u.facing, 1.2);
  cin.release();
  assert.equal(u.faceLock, null, '몸 방향 고정 풂');
  run(3);
  assert.ok(off() > 0 && off() < liftFor(0.3, hudFrac()), '바로 끊기지 않고 줄어듦');
  run(120);
  assert.ok(!camera.view?.enabled, '다 돌아오면 지움');
  assert.equal(SURF.seeOn.value, 1, '시야 구멍 되돌림');
  assert.deepEqual(camera.projectionMatrix.elements, P0.elements, '원래 투영 그대로');
  // 컷신 샷(올림 없음)은 렌즈를 건드리지 않음
  cin.shot([3, 2, 3], [0, 1, 0], 0.01);
  run(30);
  assert.ok(!camera.view?.enabled);
});

test('주민과 대화: 앞모습 구도 + 렌즈 올림 + 몸 방향 살짝, 끝나거나 오류가 나도 카메라·몸 방향을 풂', async () => {
  const camera = new THREE.PerspectiveCamera(45, 1.6, 0.1, 600);
  camera.position.set(0, 4, 12);
  const me = { facing: 0 };
  let say = async () => 'bye', during = null;
  const game = {
    camera, followCam: { smooth: new THREE.Vector3() },
    player: { position: new THREE.Vector3(0, 0, 1.9), unico: me },
    dialogue: { active: false, say: (l) => { during ??= { lock: e.u.faceLock, lift: cin.liftAuto, pos: [...cin.to.pos.toArray()], me: me.facing }; return say(l); } },
    villagers: { talk: () => ({}), requestFor: () => ({ done: true }), state: { guide: {} }, hearts: () => 1 },
    economy: { count: () => 0 }, world: { day: 1 }, ui: { toast() {}, openQuests() {} }, onEvent() {}, quests: { level: 1 }, audio: { play() {} },
  };
  const cin = new Cinematics(game, { append() {} });
  game.cinema = cin;
  const self = npcsWith(camera); Object.assign(self.game, game);
  const e = { ...entry('puppy'), name: '안내 강아지', lines: ['안녕'], lineIdx: 0 };
  e.id = 'guide'; e.u.facing = 0;
  self.list = [e];
  await self.talk(e);
  assert.equal(during.lift, true, '렌즈 올림 구도');
  assert.ok(Number.isFinite(during.lock), '주민 몸 방향 고정');
  const want = Math.atan2(0 - 0, 1.9 - 0); // 나를 보는 방향
  assert.ok(Math.abs(during.lock - want) > 10 * DEG && Math.abs(during.lock - want) < 20 * DEG, '카메라 쪽으로 15~20°');
  assert.ok(facingAngle(during.lock, e.u.group.position, during.pos) <= 45);
  assert.equal(e.u.faceLock, null);
  assert.equal(cin.want, 0);
  // 대화 도중 오류
  say = async () => { throw new Error('dlg'); };
  during = null;
  await assert.rejects(self.talk(e), /dlg/);
  assert.equal(e.u.faceLock, null, '오류가 나도 풂');
  assert.equal(cin.want, 0);
  assert.equal(cin.liftWant, 0);
});

test('반려견 돌보기 구도: 앞 2m 안이나 시선에 나무·기둥이 걸리면 다른 각도(60°→75°→40°, 양쪽), 모두 가리면 가장 덜 가리는 것', async () => {
  const { Pet, petShotBlock } = await import('../src/game/view/pet.js');
  const camera = new THREE.PerspectiveCamera(45, 1.6, 0.1, 600);
  const P = new THREE.Vector3(0, 0, 0), me = new THREE.Vector3(0, 0, 1.3);
  camera.position.set(-3, 4, 8);
  const world = { obstacles: [], boxes: [] };
  const pet = Object.assign(Object.create(Pet.prototype), { game: { camera, world } });
  const s0 = pet._careShot(me, P, -1);
  assert.equal(s0.theta, 60 * DEG);
  assert.equal(s0.block, 0);
  // 첫 구도 카메라 앞 1.3m 오른쪽 가장자리에 나무 줄기 (스크린샷의 검은 줄기)
  const fx = s0.look[0] - s0.pos[0], fz = s0.look[2] - s0.pos[2], fl = Math.hypot(fx, fz);
  const ux = fx / fl, uz = fz / fl, tanH = Math.tan(22.5 * DEG) * 1.6;
  world.obstacles.push({ x: s0.pos[0] + ux * 1.3 - uz * 0.8 * 1.3 * tanH, z: s0.pos[2] + uz * 1.3 + ux * 0.8 * 1.3 * tanH, r: 0.35 });
  assert.ok(petShotBlock(s0, P, me, world, 45, 1.6) > 0, '줄기가 걸림');
  const s1 = pet._careShot(me, P, -1);
  assert.equal(s1.block, 0, '안 걸리는 후보');
  assert.notDeepEqual(s1.pos, s0.pos);
  // 콩이·내 곁(0.6m 안)의 물체는 셈하지 않음 (울타리 옆에서 돌보기)
  world.obstacles.length = 0;
  world.obstacles.push({ x: 0.3, z: 0.2, r: 0.2 });
  assert.equal(pet._careShot(me, P, -1).block, 0);
  // 사방이 막히면 가장 덜 막힌 것 (첫 순서 우선)
  world.obstacles.length = 0;
  world.boxes.push({ x0: -20, x1: 20, z0: -20, z1: -1.5 }, { x0: -20, x1: 20, z0: 2.8, z1: 20 }, { x0: -20, x1: -1.5, z0: -20, z1: 20 }, { x0: 1.5, x1: 20, z0: -20, z1: 20 });
  const s3 = pet._careShot(me, P, -1);
  assert.ok(s3.block > 0 && Number.isFinite(s3.pos[0]));
});

test('렌즈 올림: 올린 대화 바로 뒤 컷신 샷(올림 없음)은 남은 올림을 3배 빨리 걷음', () => {
  const mk = () => {
    const camera = new THREE.PerspectiveCamera(45, 1.6, 0.1, 600);
    camera.position.set(0, 6, 10); camera.lookAt(0, 0, 0);
    const cin = new Cinematics({ camera, followCam: { smooth: new THREE.Vector3() } }, { append() {} });
    cin.shot([3, 1.6, 3], [0, 1.25, 0.5], 0.01, { lift: true });
    for (let i = 0; i < 90; i++) cin.update(1 / 30);
    return { cin, camera };
  };
  const off = (c) => (c.view?.enabled ? c.view.offsetY / c.view.fullHeight : 0);
  const a = mk(), b = mk();
  const v0 = off(a.camera);
  assert.ok(v0 > 0.1);
  a.cin.release(); a.cin.shot([3, 2, 3], [0, 1, 0], 0.5); // 대화 끝 → 바로 컷신
  b.cin.shot([3, 1.6, 3], [0, 1.25, 0.5], 0.5, { lift: 0.0001 }); // 비교: 보통 빠르기로 줄어드는 것
  b.cin._liftFast = false; b.cin.liftWant = 0;
  for (let i = 0; i < 6; i++) { a.cin.update(1 / 30); b.cin.update(1 / 30); }
  assert.ok(off(a.camera) < off(b.camera) * 0.5, `빨리 걷힘 ${off(a.camera).toFixed(3)} < ${off(b.camera).toFixed(3)}`);
  for (let i = 0; i < 30; i++) a.cin.update(1 / 30);
  assert.ok(!a.camera.view?.enabled, '다 걷히면 지움');
  assert.equal(a.cin._liftFast, false);
});
