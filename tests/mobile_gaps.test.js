// 모바일 최적화 3차: 남은 작은 틈 (시점 복귀 멈춤, 한글 조합 Enter, 음악 밀린 박자, 입자 상한, 마우스 올림 상자 거르기, 스크린샷, 꾸미기 시작)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';

// 브라우저 없이: window·canvas 는 이벤트 등록만 받는 가짜
globalThis.window ??= { addEventListener() {} };
globalThis.window.innerWidth = 400;
globalThis.innerWidth = 400; globalThis.innerHeight = 800;

const { Input, lookHold, isSubmitEnter } = await import('../src/game/input.js');
const { Music } = await import('../src/game/music.js');
const { FX, fxCap } = await import('../src/game/fx.js');
const { PointerNav, staticBox } = await import('../src/game/pointer.js');
const { SURF } = await import('../src/game/surface.js');
const { LAYOUT } = await import('../src/game/world.js');
const { UI } = await import('../src/ui/ui.js');
const { DecorView } = await import('../src/game/view/decor_view.js');

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');

// ---------------------------------------------------------------- 트랙터 시점 복귀
test('시점 끌기: 끄는 동안과 손을 뗀 뒤 0.5초는 자동 복귀를 멈춤', () => {
  let h = lookHold(0, true, 1 / 60);
  assert.equal(h, 0.5);
  for (let i = 0; i < 20; i++) h = lookHold(h, false, 1 / 60); // 약 0.33초
  assert.ok(h > 0, '아직 기다리는 중');
  for (let i = 0; i < 20; i++) h = lookHold(h, false, 1 / 60);
  assert.equal(h, 0, '0.5초가 지나면 복귀');
  assert.equal(lookHold(undefined, false, 0.016), 0, '처음(값 없음)은 바로 복귀');
});

test('입력: looking 은 마우스 드래그·시점 터치만 (조이스틱 손가락은 빼고)', () => {
  const canvas = { addEventListener() {}, setPointerCapture() {} };
  const I = new Input(canvas);
  assert.equal(I.looking, false);
  I.drag.active = true;
  assert.equal(I.looking, true);
  I.drag.active = false;
  const ev = (id, x) => ({ type: 'touchstart', changedTouches: [{ identifier: id, clientX: x, clientY: 500 }], touches: [{ identifier: id, clientX: x, clientY: 500 }] });
  I.touchStart(ev(1, 60), 0); // 왼쪽 반 = 조이스틱
  assert.equal(I.joy.active, true);
  assert.equal(I.looking, false, '조이스틱은 시점이 아님');
  I.touchEnd({ type: 'touchend', changedTouches: [{ identifier: 1, clientX: 60, clientY: 500 }], touches: [] }, 100);
  I.touchStart(ev(2, 330), 1000); // 오른쪽 반 = 시점
  assert.equal(I.looking, true);
});

test('트랙터·낚시: 시점 판정을 input.looking 하나로', () => {
  assert.match(read('src/main.js'), /lookHold\(this\._lookHold, input\.looking, dt\)/);
  assert.match(read('src/game/view/tractor_view.js'), /g\._lookHold = 0/);
  assert.match(read('src/game/view/nature_view.js'), /input\.looking \|\| input\.joy\.active/);
});

// ---------------------------------------------------------------- 한글 조합 Enter
test('입력칸 Enter: 한글 조합을 확정하는 Enter 는 보내기가 아님', () => {
  assert.equal(isSubmitEnter({ key: 'Enter', isComposing: true }), false);
  assert.equal(isSubmitEnter({ key: 'Enter', isComposing: false }), true);
  assert.equal(isSubmitEnter({ key: 'Enter' }), true);
  assert.equal(isSubmitEnter({ key: 'a', isComposing: false }), false);
  assert.match(read('src/main.js'), /nick\.addEventListener\('keydown', \(e\) => \{ if \(isSubmitEnter\(e\)\) start\(\); \}\)/);
});

// ---------------------------------------------------------------- 음악: 늦게 불린 예약 타이머
test('음악: 타이머가 늦게 불려도 지난 박자를 한꺼번에 몰아 내지 않음', () => {
  const ctx = { state: 'running', currentTime: 0 };
  const m = new Music({ ctx, enabled: true, musicOn: true });
  m.rainGain = m.windGain = { gain: { setTargetAtTime() {} } };
  m.bird = m.crickets = () => {};
  const ats = [];
  m.playStep = (step, at) => ats.push(at);
  m.nextTime = 1;
  ctx.currentTime = 60; // 배경 탭에서 1분 동안 타이머가 거의 안 불림
  m.schedule();
  assert.ok(ats.length >= 1 && ats.length <= 2, `예약한 박자 ${ats.length}개 (앞 0.25초 분량만)`);
  assert.ok(ats.every((a) => a >= 0), `지난 시각(음수)에 예약하지 않음: ${ats}`);
  assert.ok(m.nextTime > ctx.currentTime);
  // 제때 불리면 박자는 그대로 이어짐 (건너뛰지 않음)
  const next = m.nextTime;
  ctx.currentTime = next - 0.2;
  ats.length = 0;
  m.schedule();
  assert.ok(Math.abs(ats[0] - 0.2) < 1e-9, '다음 박자는 원래 시각');
});

// ---------------------------------------------------------------- 입자 상한
test('FX: 동시에 떠 있는 입자는 낮음 48개, 그 밖 128개까지 (넘으면 더 만들지 않음)', () => {
  assert.equal(fxCap({ level: 'low' }), 48);
  assert.equal(fxCap({ level: 'high' }), 128);
  assert.equal(fxCap(null), 128);
  SURF.seeCam.value.set(0, 5, 10);
  const fx = new FX(new THREE.Scene(), { level: 'low' });
  for (let i = 0; i < 10; i++) fx.burst(0, 1, 0, 0xffd75a, 12);
  fx.sprinkle(0, 0);
  fx.dust(0, 0);
  assert.equal(fx.items.length, 48);
  assert.equal(fx.live, 48);
  assert.ok(fx.group.children.length <= 48, '메시도 상한까지만 만듦');
  for (let i = 0; i < 40; i++) fx.update(0.05);
  assert.equal(fx.items.length, 0);
  assert.equal(fx.live, 0, '끝난 입자는 수에서 빠짐');
  fx.setQuality({ level: 'medium' });
  for (let i = 0; i < 12; i++) fx.burst(0, 1, 0, 0xffd75a, 12);
  assert.equal(fx.live, 128);
});

test('FX: 상한에 걸린 별 터지기는 개수를 줄여 고른 고리로 (한쪽으로 쏠리지 않음)', () => {
  SURF.seeCam.value.set(0, 5, 10);
  const fx = new FX(new THREE.Scene(), { level: 'low' });
  fx.sprinkle(0, 0); fx.sprinkle(0, 0); // 28
  for (let i = 0; i < 4; i++) fx.dust(0, 0); // 40
  assert.equal(fx.live, 40);
  fx.burst(0, 1, 0, 0xffd75a, 24);
  const stars = fx.items.filter((it) => it.star);
  assert.equal(stars.length, 8, '남은 8개만');
  assert.equal(fx.live, 48);
  const ang = stars.map((it) => Math.atan2(it.obj.userData.v.z, it.obj.userData.v.x)).map((a) => (a + Math.PI * 2) % (Math.PI * 2)).sort((a, b) => a - b);
  ang.forEach((a, i) => assert.ok(Math.abs(a - (i / 8) * Math.PI * 2) < 1e-9, `${i}번째 별 각도`));
  fx.burst(0, 1, 0, 0xffd75a, 24); // 가득 차면 아무것도 안 만듦
  assert.equal(fx.items.filter((it) => it.star).length, 8);
});

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

// ---------------------------------------------------------------- 스크린샷
function shotRig(calls) {
  const cv = {
    toDataURL(t) { calls.push(`dataURL:${t}`); return 'data:image/png;base64,iVBORw0KGgo='; },
    toBlob(cb, t) { calls.push(`toBlob:${t}`); this.cb = cb; },
  };
  const self = {
    game: { renderer: { domElement: cv }, postfx: { render: () => calls.push('render') }, audio: { play() {} } },
    toast: (t) => calls.push(`toast:${t}`), _download: (url) => calls.push(`dl:${url}`),
  };
  return { cv, self };
}

test('스크린샷(PC·안드로이드): 그린 직후 toBlob 으로 비동기 인코딩, 내려받은 뒤 10초에 주소 해제', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const calls = [];
  const { cv, self } = shotRig(calls);
  const keep = [URL.createObjectURL, URL.revokeObjectURL];
  URL.createObjectURL = () => 'blob:shot';
  URL.revokeObjectURL = (u) => calls.push(`revoke:${u}`);
  try {
    UI.prototype.snapshot.call(self);
    assert.deepEqual(calls, ['render', 'toBlob:image/png'], '같은 태스크에서 그리고 바로 toBlob (동기 toDataURL 없음)');
    cv.cb(new Blob(['png']));
    assert.equal(calls.at(-1), 'dl:blob:shot');
    t.mock.timers.tick(9999);
    assert.ok(!calls.includes('revoke:blob:shot'));
    t.mock.timers.tick(1);
    assert.equal(calls.at(-1), 'revoke:blob:shot');
    calls.length = 0;
    UI.prototype.snapshot.call(self);
    cv.cb(null); // 인코딩 실패
    assert.ok(calls.at(-1).startsWith('toast:'), calls.at(-1));
  } finally {
    [URL.createObjectURL, URL.revokeObjectURL] = keep;
  }
});

test('스크린샷(iPhone): 누른 그 순간에 공유 시트 (동기로 파일을 만듦)', () => {
  const calls = [];
  const { self } = shotRig(calls);
  const nav = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X)', canShare: () => true, share: (d) => { calls.push(`share:${d.files[0].name.endsWith('.png')}`); return new Promise(() => {}); } },
  });
  try {
    UI.prototype.snapshot.call(self);
    assert.deepEqual(calls, ['render', 'dataURL:image/png', 'share:true']);
  } finally {
    if (nav) Object.defineProperty(globalThis, 'navigator', nav); else delete globalThis.navigator;
  }
});

// ---------------------------------------------------------------- 꾸미기 시작
test('꾸미기 시작: 그 전에 탭해 걷던 목표는 지움 (도착해서 주민 대화 등이 실행되지 않게)', () => {
  const g = { home: { inside: false }, tractor: { driving: false }, ui: { closePanel() {}, toast() {} }, player: { moveTarget: { pos: () => null, stop: 1.9, interact: true, key: 'npc' } } };
  const dv = Object.assign(Object.create(DecorView.prototype), { game: g, mode: null, _bar() {}, _ghost: () => null });
  dv.start(null);
  assert.equal(g.player.moveTarget, null);
  assert.ok(dv.mode);
});

// ---------------------------------------------------------------- 뒤에서 받는 동물
test('입장 뒤: 목장 손님 동물은 플레이어 위치 없이 바로 넣지 않음 (ranch.update 가 화면 밖에 풀어 놓음), 셰이더는 미리 준비', () => {
  const main = read('src/main.js');
  const shown = main.slice(main.indexOf('  shown() {'), main.indexOf('  resetSave()'));
  assert.ok(shown.length > 0);
  assert.ok(!/addVisitors/.test(shown), 'shown() 이 addVisitors() 를 부르지 않음');
  assert.match(shown, /loadDeferred\?\.\(\)\.then\(\(\) => this\.warmDeferred\(\)\)/);
  assert.match(shown, /compileAsync\(batch, this\.camera, this\.world\.scene\)/);
  assert.match(read('src/game/view/ranch_view.js'), /this\.addVisitors\(playerPos\)/);
});

test('뒤에서 받는 동물 셰이더: 도착한 것만 모델마다 한 번, 로딩 화면 뒤에서도 준비', () => {
  const main = read('src/main.js');
  const src = main.slice(main.indexOf('  warmDeferred() {'), main.indexOf('  resetSave()')).trim();
  const warm = new Function('THREE', 'DEFERRED_MODELS', `return function ${src}`)(THREE, [['q_horse', 'q_donkey'], ['q_wolf']]);
  const have = new Set(['q_horse']);
  const batches = [];
  const g = {
    camera: new THREE.PerspectiveCamera(), world: { scene: new THREE.Scene() }, postfx: null,
    assets: { deferredDone: false, has: (n) => have.has(n), anims: new Map(), clone: (n) => Object.assign(new THREE.Object3D(), { name: n }) },
    renderer: { compileAsync: (b) => { batches.push(b.children.map((o) => o.name)); return Promise.resolve(); }, getRenderTarget: () => null, setRenderTarget() {} },
  };
  assert.ok(warm.call(g) instanceof Promise, '기다릴 수 있게 약속을 돌려줌');
  assert.equal(warm.call(g), null, '이미 준비한 것은 다시 하지 않음');
  have.add('q_donkey'); have.add('q_wolf');
  warm.call(g);
  assert.deepEqual(batches, [['q_horse'], ['q_donkey', 'q_wolf']]);
  assert.equal(g._warmedDeferred, true, '다 왔으면 멈춤');
  // 입장 전 컴파일(5초 경주) 안에서 함께, 게임 루프에서는 도착하는 대로 (목장이 풀기 전에)
  assert.match(main, /Promise\.race\(\[Promise\.all\(\[R\.compileAsync\(sc, cm\), window\.game\.warmDeferred\(\)\]\)/);
  const loop = main.slice(main.indexOf('  loop(now'), main.indexOf('this.ranch.update(dt, pw)'));
  assert.match(loop, /if \(!this\._warmedDeferred\) this\.warmDeferred\(\)/);
});
