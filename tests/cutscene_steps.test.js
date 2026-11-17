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
const { faceShot, posOf, faceY, liftFor, guessBoxTop, hudFrac } = await import('../src/game/cutscene.js');
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
  let cam = null;
  for (const s of steps) {
    if (s.cam) cam = viewCam(s.cam[0], s.cam[1], aspect, 0);
    else if (s.face) {
      const f = faceShot(s, cam ? cam.position : g.camera.position, fovFor(aspect), aspect);
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
  assert.deepEqual(asks[0].ask.input, { value: '콩이', max: 6, icon: '🐕' });
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
