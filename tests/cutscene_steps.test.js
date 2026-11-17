// 컷신 구도: 인트로·KOAT·낚시터 스텝을 화면 없이 돌려 보며, 말하는 쪽 얼굴이 대화창에 가리지 않는지 (가로 16:10 · 세로 9:19.5)
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

const ctx = new Proxy({ measureText: () => ({ width: 60 }), createRadialGradient: () => ({ addColorStop() {} }) }, { get: (t, k) => (k in t ? t[k] : () => {}) });
const el = () => ({ className: '', innerHTML: '', style: {}, classList: { add() {}, remove() {}, contains: () => false }, querySelector: () => ({}), append() {}, getContext: () => ctx });
globalThis.document ??= { createElement: el, getElementById: el, body: el() };
globalThis.innerHeight ??= 800;
const { introSteps, koatSteps, farmShot } = await import('../src/game/game_story.js');
const { lakeIntroSteps } = await import('../src/game/view/lake_view.js');
const { faceShot, posOf, faceY, liftFor, guessBoxTop, hudFrac, screenShare, bodyR, LISTENER_MAX } = await import('../src/game/cutscene.js');
const { SPECIES } = await import('../src/game/species.js');
const { LAYOUT } = await import('../src/game/world.js');
const { fovFor } = await import('../src/game/camera.js');

const ASPECTS = { '가로 16:10': { aspect: 16 / 10, h: 800 }, '세로 9:19.5': { aspect: 9 / 19.5, h: 844 } };
const unico = (x, z, sp, facing = 0) => ({ group: { position: new THREE.Vector3(x, 0, z) }, scale: sp ? SPECIES[sp].scale : 1, facing, playAction() {} });

/** 컷신에 필요한 칸만 있는 가짜 게임 (반려견은 뛰어 들어와 내 옆에 선 뒤) */
function mockGame(aspect, where = 'spawn') {
  const N = LAYOUT.npcs;
  const P = where === 'lake' ? [-5.6, 25.4] : where === 'koat' ? [25, -24] : [0, 9];
  const me = unico(P[0], P[1]);
  const list = ['guide', 'fisher'].map((id) => ({ id, name: N[id].name, u: unico(N[id].x, N[id].z, N[id].species) }));
  return {
    playerName: '유니', flags: {}, camera: { aspect, fov: fovFor(aspect), position: new THREE.Vector3(P[0], 6, P[1] + 9) },
    player: { position: me.group.position, unico: me },
    npcs: { list },
    koat: { desk: unico(LAYOUT.koat.desk.x, LAYOUT.koat.desk.z) },
    pet: { ok: true, e: { m: { position: new THREE.Vector3(P[0] + 1.5, 0, P[1] + 1), rotation: { y: 0 } } }, sim: { name: '콩이' }, rename() {} },
    ui: { toast() {} }, audio: { play() {} },
  };
}

function viewCam(pos, look, aspect, lift) {
  const cam = new THREE.PerspectiveCamera(fovFor(aspect), aspect, 0.1, 600);
  cam.position.set(...pos); cam.lookAt(...look);
  if (lift) cam.setViewOffset(aspect, 1, 0, lift, aspect, 1);
  cam.updateMatrixWorld(); cam.updateProjectionMatrix();
  return cam;
}

/** 스텝을 차례로 돌려 대사마다 { text, speaker 얼굴 NDC, 보임 여부 } */
function simulate(steps, g, h) {
  const out = [];
  const { aspect } = g.camera;
  let cam = null, prev = null;
  for (const s of steps) {
    if (s.cam) cam = viewCam(s.cam[0], s.cam[1], aspect, 0);
    else if (s.face) {
      const me = !s.with && g.player.unico !== s.face ? g.player.position : null; // 컷신(_play)과 같게: 함께 담지 않는 나는 선을 막으면 안 됨
      const f = (prev = faceShot(s, cam ? cam.position : g.camera.position, fovFor(aspect), aspect, null, { clear: me ? [me] : [], prev }));
      assert.ok(f, '얼굴 구도');
      cam = viewCam(f.pos, f.look, aspect, liftFor(guessBoxTop(aspect), hudFrac(h)));
    }
    for (const ln of [].concat(s.say || [], s.ask || [])) {
      assert.ok(cam, '첫 대사 전에 카메라가 정해짐');
      const p = posOf(ln.speaker), v = new THREE.Vector3(p.x, faceY(ln.speaker), p.z).applyMatrix4(cam.matrixWorldInverse);
      const behind = v.z > -0.1;
      v.applyMatrix4(cam.projectionMatrix);
      const off = behind || Math.abs(v.x) > 1.05 || Math.abs(v.y) > 1.05;
      const inWin = !behind && Math.abs(v.x) <= 0.8 && v.y >= -0.15 && v.y <= 0.75;
      out.push({ text: ln.text, emote: ln.emote, x: +v.x.toFixed(2), y: +v.y.toFixed(2), off, inWin, ask: !!s.ask });
    }
  }
  return out;
}

const CASES = {
  인트로: (a) => { const g = mockGame(a); return { g, steps: introSteps(g) }; },
  KOAT: (a) => { const g = mockGame(a, 'koat'); return { g, steps: koatSteps(g) }; },
  낚시터: (a) => { const g = mockGame(a, 'lake'); return { g, steps: lakeIntroSteps(g) }; },
};

for (const [name, make] of Object.entries(CASES)) for (const [an, { aspect, h }] of Object.entries(ASPECTS)) {
  test(`컷신 구도 ${name} · ${an}: 말하는 얼굴은 대화창 위 빈 곳에 보이거나 아예 화면 밖 (대화창 띠에 걸치지 않음)`, () => {
    const { g, steps } = make(aspect);
    const lines = simulate(steps, g, h);
    assert.ok(lines.length >= 3);
    for (const l of lines) assert.ok(l.inWin || l.off, `${l.text} → (${l.x}, ${l.y})`);
    // 첫 줄·마지막 줄·선물(present) 줄은 얼굴이 보여야 함
    const must = [lines[0], lines.at(-1), ...lines.filter((l) => l.emote === 'present')];
    for (const l of must) assert.ok(l.inWin, `보여야 함: ${l.text} → (${l.x}, ${l.y})`);
  });
}

test('낚시터 컷신: 낚시꾼이 말하는 줄 중 부두 설명 둘만 화면 밖, 나머지는 얼굴이 보임', () => {
  const g = mockGame(1.6, 'lake'), lines = simulate(lakeIntroSteps(g), g, 800);
  assert.deepEqual(lines.map((l) => l.inWin), [true, false, false, true]);
});

test('인트로: 탭 4번 + 이름 카드 하나, 끝은 밭을 바라봄 · 그래픽 안내는 빠짐', () => {
  const g = mockGame(1.6), steps = introSteps(g);
  const says = steps.filter((s) => s.say).length, asks = steps.filter((s) => s.ask);
  assert.equal(says, 4);
  assert.equal(asks.length, 1);
  const { onShow, ...inp } = asks[0].ask.input;
  assert.deepEqual(inp, { value: '콩이', max: 6, icon: '🐕' });
  assert.equal(typeof onShow, 'function', '카드가 뜨면 반려견이 반김');
  const txt = JSON.stringify(steps.map((s) => s.say || s.ask));
  assert.match(txt, /네 거야/);
  assert.match(txt, /당근 씨앗 3개/);
  assert.ok(!/환경설정/.test(String(steps.at(-1).run)), '그래픽 안내 없음');
  // 마지막 run: 내 뒤에서 밭(북쪽)을 보게
  const toasts = [];
  g.ui.toast = (t) => toasts.push(t);
  g.followCam = { yaw: 2 };
  globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };
  steps.at(-1).run();
  assert.equal(g.followCam.yaw, 0);
  assert.equal(g.player.unico.facing, Math.PI);
  assert.deepEqual(toasts, ['🎯 왼쪽 위 목표를 따라가 보세요']);
});

test('인트로 반려견 없으면 이름 카드도 없음 · KOAT 컷신은 마지막 스텝에서 표시', () => {
  const g = mockGame(1.6);
  g.pet = { ok: false };
  assert.equal(introSteps(g).filter((s) => s.ask).length, 0);
  const gk = mockGame(1.6, 'koat'), k = koatSteps(gk);
  assert.equal(gk.flags.koatIntro, undefined);
  k.at(-1).run();
  assert.equal(gk.flags.koatIntro, true);
});

test('"내 농장" 전경: 밭 가운데와 집이 둘 다 화면 위쪽 2/3 안 (가로·세로)', () => {
  for (const { aspect } of Object.values(ASPECTS)) {
    const [pos, look] = farmShot(aspect), cam = viewCam(pos, look, aspect, 0);
    for (const [x, z] of [[0, 0], [LAYOUT.home.x, LAYOUT.home.z]]) {
      const v = new THREE.Vector3(x, 0.5, z).project(cam);
      assert.ok(Math.abs(v.x) < 0.85 && v.y > -0.3 && v.y < 0.85, `${aspect} (${x},${z}) → ${v.x.toFixed(2)}, ${v.y.toFixed(2)}`);
    }
  }
});

test('얼굴 구도: 카메라 자리·카메라→얼굴 선이 건물에 막히면 다른 각도·반대쪽으로', () => {
  const sp = unico(0, 0, 'cat');
  const step = { face: sp, toward: [-10, 0] }; // 서쪽을 소개 → 기본 카메라는 동쪽
  const free = faceShot(step, { x: 5, z: 1 }, 45, 1.6);
  assert.ok(free.pos[0] > 0);
  const f = faceShot(step, { x: 5, z: 1 }, 45, 1.6, (x) => x > 1.5); // 동쪽은 모두 건물
  assert.ok(f.pos[0] <= 1.5, `막히지 않은 자리: ${f.pos.map((v) => v.toFixed(1))}`);
  const part = faceShot(step, { x: 5, z: 1 }, 45, 1.6, (x, z) => x > 1.5 && z > 0); // 북동쪽만 막힘
  assert.ok(!(part.pos[0] > 1.5 && part.pos[2] > 0));
});

/** 구도 하나를 화면 없이: 듣는 쪽 화면 비율 · 카메라~듣는 얼굴 거리 · 말하는 얼굴 NDC (렌즈 올림 포함) */
function frameOf(f, s, aspect, h) {
  const fov = fovFor(aspect), W = posOf(s.with), S = posOf(s.face);
  const cam = viewCam(f.pos, f.look, aspect, liftFor(guessBoxTop(aspect), hudFrac(h)));
  const v = new THREE.Vector3(S.x, faceY(s.face), S.z).project(cam);
  return {
    share: W ? screenShare(f.pos, f.look, W, faceY(s.with), bodyR(s.with), fov, aspect) : 0,
    dist: W ? Math.hypot(W.x - f.pos[0], faceY(s.with) - f.pos[1], W.z - f.pos[2]) : Infinity,
    sx: v.x, sy: v.y,
  };
}

for (const [an, { aspect, h }] of Object.entries(ASPECTS)) {
  test(`두 사람 구도 · ${an}: 듣는 쪽(나)은 화면 가로 ${LISTENER_MAX * 100}% 이하·1.6m 이상, 말하는 얼굴은 아래 30%(대화창 띠) 위`, () => {
    const g = mockGame(aspect), steps = introSteps(g);
    let prev = null, cam = g.camera.position;
    for (const s of steps) {
      if (s.cam) { cam = { x: s.cam[0][0], z: s.cam[0][2] }; continue; }
      if (!s.face || !s.with || posOf(s.face) === g.pet.e.m.position) continue;
      const f = (prev = faceShot(s, cam, fovFor(aspect), aspect, null, { prev }));
      const m = frameOf(f, s, aspect, h);
      assert.ok(m.share < 0.25, `듣는 쪽 비율 ${m.share.toFixed(2)}`);
      assert.ok(m.dist >= 1.6, `듣는 얼굴까지 ${m.dist.toFixed(2)}m`);
      assert.ok(m.sy > -0.4 && Math.abs(m.sx) < 0.85, `말하는 얼굴 (${m.sx.toFixed(2)}, ${m.sy.toFixed(2)})`);
      cam = { x: f.pos[0], z: f.pos[2] };
    }
  });

  test(`같은 둘의 얼굴 구도가 잇달아 나오면 다른 자리 (1m 넘게) · ${an}`, () => {
    const g = mockGame(aspect), guide = g.npcs.list[0].u, me = g.player.unico;
    const s = { face: guide, with: me };
    const a = faceShot(s, g.camera.position, fovFor(aspect), aspect);
    const b = faceShot(s, { x: a.pos[0], z: a.pos[2] }, fovFor(aspect), aspect, null, { prev: a });
    const d = Math.hypot(a.pos[0] - b.pos[0], a.pos[2] - b.pos[2]);
    assert.ok(d > 1, `카메라 거리 ${d.toFixed(2)}m`);
    assert.ok(frameOf(b, s, aspect, h).share < 0.25);
  });
}

test('인트로 얼굴 구도 셋(첫 인사·씨앗 건네기·마무리)은 서로 다른 자리', () => {
  for (const { aspect } of Object.values(ASPECTS)) {
    const g = mockGame(aspect), steps = introSteps(g), guide = g.npcs.list[0].u;
    let prev = null, cam = g.camera.position;
    const pos = [];
    for (const s of steps) {
      if (s.cam) { cam = { x: s.cam[0][0], z: s.cam[0][2] }; continue; }
      if (!s.face) continue;
      const f = (prev = faceShot(s, cam, fovFor(aspect), aspect, null, { prev }));
      if (s.face === guide) pos.push(f.pos);
      cam = { x: f.pos[0], z: f.pos[2] };
    }
    assert.equal(pos.length, 3);
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) assert.ok(Math.hypot(pos[i][0] - pos[j][0], pos[i][2] - pos[j][2]) > 1, `${aspect}: ${i}·${j}`);
    // 건네주기는 옆모습(두 사람을 잇는 선과 거의 직각)
    const gift = steps.find((s) => s.profile);
    assert.ok(gift && gift.with === g.player.unico);
  }
});

test('낚시터 떡밥 선물 줄: 내가 낚시꾼 근처 어디에 서 있어도 카메라→낚시꾼 얼굴 선이 내 몸(캡슐)을 비켜 감', () => {
  for (const { aspect } of Object.values(ASPECTS)) {
    const g = mockGame(aspect, 'lake'), K = LAYOUT.lake, fisher = g.npcs.list.find((e) => e.id === 'fisher').u, F = posOf(fisher);
    const step = lakeIntroSteps(g).find((s) => s.face && s.toward && s.toward[0] === K.shop.x);
    assert.ok(step, '가게 쪽 구도 스텝');
    for (const r of [1.2, 2, 3]) for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2, me = { x: F.x + Math.cos(a) * r, z: F.z + Math.sin(a) * r };
      if (Math.abs(me.x - K.shop.x) < 1.6 && Math.abs(me.z - K.shop.z) < 1.6) continue; // 가게 안
      const f = faceShot(step, { x: me.x, z: me.z + 9 }, fovFor(aspect), aspect, null, { clear: [me] });
      const cx = f.pos[0], cz = f.pos[2], dx = F.x - cx, dz = F.z - cz, L = dx * dx + dz * dz;
      const t = Math.max(0, Math.min(1, ((me.x - cx) * dx + (me.z - cz) * dz) / L));
      const d = Math.hypot(me.x - cx - dx * t, me.z - cz - dz * t);
      assert.ok(d >= 0.55, `${aspect} 나 (${me.x.toFixed(1)}, ${me.z.toFixed(1)}) → 선까지 ${d.toFixed(2)}m`);
    }
  }
});

test('반려견 이름 카드 구도: 낮은 카메라(0.6m)·반려견은 카메라를 똑바로·주인이 멀리 있어도 반려견이 가운데 근처', () => {
  for (const { aspect } of Object.values(ASPECTS)) for (const far of [1.5, 6]) {
    const me = unico(0, 9), pet = { e: { m: { position: new THREE.Vector3(far, 0, 9.5), rotation: { y: 0 } } } };
    const f = faceShot({ face: pet, with: me }, { x: 0, z: 18 }, fovFor(aspect), aspect);
    assert.ok(Math.abs(f.pos[1] - 0.6) < 1e-9, '낮은 카메라');
    const cam = viewCam(f.pos, f.look, aspect, 0), v = new THREE.Vector3(far, 0.45, 9.5).project(cam);
    assert.ok(Math.abs(v.x) < 0.5, `${aspect} 주인 ${far}m: 반려견 x ${v.x.toFixed(2)}`);
    const toCam = Math.atan2(f.pos[0] - far, f.pos[2] - 9.5);
    assert.ok(Math.abs(Math.atan2(Math.sin(f.yaw - toCam), Math.cos(f.yaw - toCam))) < 1e-6, '카메라를 똑바로');
  }
});
