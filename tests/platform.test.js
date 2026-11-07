// 플랫폼(모바일 수명주기·소리·저장·날씨 위치·세로 화면 시야) 순수 로직 테스트
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { fovFor, BASE_FOV } from '../src/game/camera.js';
import { talkDistance, talkShot } from '../src/game/cutscene.js';

const hfov = (fov, a) => (2 * Math.atan(Math.tan((fov * Math.PI) / 360) * a) * 180) / Math.PI;

test('시야각: 가로 화면·데스크톱은 그대로, 세로 폰은 가로 시야가 너무 좁아지지 않게', () => {
  for (const a of [1, 1.25, 1.6, 1280 / 800, 2.2]) assert.equal(fovFor(a), BASE_FOV);
  const a = 412 / 839;
  const f = fovFor(a);
  assert.ok(f > BASE_FOV && f <= 64, `세로 fov ${f}`);
  assert.ok(hfov(f, a) > 30, `가로 시야 ${hfov(f, a)}° (예전 ${hfov(BASE_FOV, a).toFixed(1)}°)`);
  // 아주 좁은 화면에서도 상한을 넘지 않고, 화면비가 좁을수록 넓어짐(단조)
  let prev = BASE_FOV;
  for (let x = 0.99; x >= 0.3; x -= 0.03) { const v = fovFor(x); assert.ok(v >= prev - 1e-9 && v <= 64); prev = v; }
  assert.equal(fovFor(NaN), BASE_FOV);
});

test('대화 구도: 가로 화면은 기존 거리, 세로 폰은 두 인물이 화면 안에 들어오게 물러남', () => {
  for (const d of [0.8, 1.5, 2, 3]) assert.equal(talkDistance(d, 45, 1.6), 4.6 + d * 0.9);
  for (const d of [1, 2, 3]) {
    const a = 0.462, f = fovFor(a), dist = talkDistance(d, f, a);
    const tanH = Math.tan((f * Math.PI) / 360) * a;
    assert.ok(dist >= 4.6 + d * 0.9);
    assert.ok((d / 2 + 0.8) / dist <= tanH + 1e-9, `d=${d}: 인물이 화면 밖 (dist ${dist})`);
  }
  assert.ok(talkDistance(6, 45, 0.3) <= 10, '너무 멀리 물러나지 않음');
});

test('대화 구도: 세로 폰에서 두 인물이 화면 안, 아래쪽 대화창(화면 아래 약 57%) 위에 보임', () => {
  const project = (aspect, d) => {
    const a = { x: 0, z: 0 }, b = { x: d * 0.76, z: d * 0.65 };
    const fov = fovFor(aspect);
    const cam = new THREE.PerspectiveCamera(fov, aspect, 0.1, 600);
    const { pos, look } = talkShot(a, b, { x: 3, z: 9 }, fov, aspect);
    cam.position.set(...pos); cam.lookAt(...look); cam.updateMatrixWorld();
    const p = (o, y) => new THREE.Vector3(o.x, y, o.z).project(cam);
    return { a: [p(a, 0), p(a, 0.8), p(a, 1.6)], b: [p(b, 0), p(b, 0.8), p(b, 1.6)], look };
  };
  for (const aspect of [412 / 839, 390 / 844, 360 / 780]) {
    for (const d of [1.2, 1.84, 2.6]) {
      const r = project(aspect, d);
      for (const [feet, mid, head] of [r.a, r.b]) {
        for (const v of [feet, mid, head]) assert.ok(Math.abs(v.x) < 0.85, `가로로 잘림 x=${v.x.toFixed(2)} (화면비 ${aspect.toFixed(2)}, d=${d})`);
        assert.ok(head.y < 0.92, `머리가 화면 위로 잘림 y=${head.y.toFixed(2)}`);
        assert.ok(mid.y > 0.13, `몸 가운데가 대화창에 가림 y=${mid.y.toFixed(2)} (화면비 ${aspect.toFixed(2)}, d=${d})`);
      }
    }
  }
  // 가로 화면은 예전 구도 그대로 (시선 높이 1.1)
  assert.equal(project(1.6, 1.84).look[1], 1.1);
});

// ---------------------------------------------------------------- 저장
test('저장: 초기화(clearSave) 뒤에는 떠날 때 저장이 지운 농장을 되살리지 않음', async () => {
  const store = new Map();
  globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  const { saveGame, loadSave, clearSave } = await import('../src/game/save.js');
  const j = () => ({ toJSON: () => ({}) });
  const game = {
    playerName: '유니', farm: { sim: j() }, economy: j(), quests: j(), ranch: j(), rice: j(), nature: j(), villagers: j(), collection: j(), koat: j(),
    world: { time: 1, day: 2 }, player: { position: { x: 3, z: 4 } }, flags: { intro: true },
  };
  assert.equal(saveGame(game), true);
  assert.equal(loadSave().name, '유니');
  clearSave();
  assert.equal(loadSave(), null);
  assert.equal(saveGame(game), false, '초기화 뒤 저장은 막힘');
  assert.equal(loadSave(), null, '숨김·pagehide 저장이 와도 지운 상태 유지');
});

// ---------------------------------------------------------------- 날씨 위치 권한
function stubWeatherEnv(permission) {
  const calls = { geo: 0 };
  globalThis.location = { search: '' };
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true, writable: true,
    value: {
      permissions: permission === null ? undefined : { query: async () => ({ state: permission }) },
      geolocation: { getCurrentPosition: (ok) => { calls.geo++; ok({ coords: { latitude: 37.5, longitude: 127 } }); } },
    },
  });
  globalThis.fetch = async () => ({ json: async () => ({ current: { weather_code: 0, temperature_2m: 20, wind_speed_10m: 5, cloud_cover: 10, is_day: 1 } }) });
  return calls;
}

test('날씨: 입장 때 위치 권한을 묻지 않음 (허용 전이면 기본 위치)', async () => {
  for (const perm of ['prompt', 'denied', null]) {
    const calls = stubWeatherEnv(perm);
    const { WeatherService } = await import('../src/game/weather.js');
    const svc = new WeatherService(() => {});
    await svc.start();
    clearInterval(svc.timer);
    assert.equal(calls.geo, 0, `권한 ${perm}: getCurrentPosition 을 부르면 안 됨`);
    assert.match(svc.loc.name, /기본 위치/);
    assert.equal(svc.source, 'live');
  }
});

test('날씨: 이미 허용했거나 실시간 버튼을 누르면 현재 위치', async () => {
  let calls = stubWeatherEnv('granted');
  const { WeatherService, geoGranted } = await import('../src/game/weather.js');
  assert.equal(await geoGranted(), true);
  let svc = new WeatherService(() => {});
  globalThis.fetch = async (u) => ({ json: async () => (String(u).includes('reverse') ? { locality: '서울' } : { current: { weather_code: 0, temperature_2m: 20, wind_speed_10m: 5, cloud_cover: 10, is_day: 1 } }) });
  await svc.start();
  clearInterval(svc.timer);
  assert.equal(calls.geo, 1);
  assert.equal(svc.loc.lat, 37.5);
  // 사용자 동작(📡 실시간 날씨)에서는 권한을 물어도 됨
  calls = stubWeatherEnv('prompt');
  svc = new WeatherService(() => {});
  await svc.start();
  assert.equal(calls.geo, 0);
  await svc.useLive();
  clearInterval(svc.timer);
  assert.equal(calls.geo, 1);
});

// ---------------------------------------------------------------- 소리
class FakeParam { constructor(v = 0) { this.value = v; } setValueAtTime() { return this; } exponentialRampToValueAtTime() { return this; } setTargetAtTime() { return this; } }
const fakeNode = () => ({ connect: (x) => x, start() {}, stop() {}, gain: new FakeParam(1), frequency: new FakeParam(440), Q: new FakeParam(1), threshold: new FakeParam(), ratio: new FakeParam(), pan: new FakeParam() });
class FakeCtx {
  constructor() {
    this.state = 'suspended'; this.currentTime = 0; this.sampleRate = 4000; this.destination = fakeNode(); this.log = []; this.nodes = 0;
    return new Proxy(this, { get: (t, k) => (typeof k === 'string' && k.startsWith('create') && !(k in t) ? () => { t.nodes++; return fakeNode(); } : t[k]) });
  }
  resume() { this.log.push('resume'); this.state = 'running'; return Promise.resolve(); }
  suspend() { this.log.push('suspend'); this.state = 'suspended'; return Promise.resolve(); }
  createBuffer(ch, len) { this.nodes++; return { getChannelData: () => new Float32Array(len) }; }
}

test('소리: 화면을 벗어나면 멈추고 효과음이 다시 켜지 않음, 돌아오면 다시 켬', async () => {
  globalThis.window = { AudioContext: FakeCtx };
  const { Audio } = await import('../src/game/audio.js');
  const a = new Audio();
  a.unlock(); // 탭 처리 안에서 만들고 켬 (무음 1샘플)
  const c = a.ctx;
  assert.equal(c.state, 'running');
  a.sleep();
  assert.equal(c.state, 'suspended');
  const n = c.nodes;
  a.play('pop'); // 숨긴 동안 네트워크 이벤트 소리
  assert.equal(c.nodes, n, '숨긴 동안 소리 노드를 만들지 않음');
  assert.equal(c.state, 'suspended', '효과음이 소리 장치를 다시 켜지 않음');
  a.wake();
  assert.equal(c.state, 'running');
  // iOS: 전화·알림 뒤 'interrupted' → 다음 사용자 동작에서 복구
  const target = new EventTarget();
  a.wakeOnGesture(target);
  c.state = 'interrupted';
  target.dispatchEvent(new Event('pointerup'));
  assert.equal(c.state, 'running');
  // 숨긴 동안에는 동작이 와도 켜지 않음
  a.sleep();
  target.dispatchEvent(new Event('touchend'));
  assert.equal(c.state, 'suspended');
  a.wake();
});

test('음악: 멈췄다 이어 갈 때 밀린 박자를 몰아 치지 않고 예약 타이머도 멈춤', async () => {
  globalThis.window = { AudioContext: FakeCtx };
  const { Audio } = await import('../src/game/audio.js');
  const { Music } = await import('../src/game/music.js');
  const a = new Audio();
  const m = new Music(a);
  m.resume(); // 시작 전에는 아무 일도 하지 않음
  assert.equal(m.timer ?? null, null);
  m.start();
  assert.ok(m.timer);
  m.pause();
  assert.equal(m.timer, null);
  a.ctx.currentTime = 120; // 2분 뒤 돌아옴
  m.resume();
  assert.ok(m.timer);
  assert.ok(m.nextTime >= 120, `다음 박자 ${m.nextTime}`);
  const before = a.ctx.nodes;
  a.ctx.state = 'suspended';
  m.schedule(); // 멈춘 동안에는 예약하지 않음
  assert.equal(a.ctx.nodes, before);
  m.pause();
});

// ---------------------------------------------------------------- 고주사율 프레임 제한
/** 화면 갱신(vsync)마다 rAF 를 부르고, 그린 프레임은 cost(ms)만큼 걸려 다음 갱신을 놓칠 수 있음 */
async function simulateCap(hz, cost, ms = 4000) {
  const { FrameCap } = await import('../src/game/postfx.js');
  const cap = new FrameCap();
  const vs = 1000 / hz, drawn = [];
  for (let n = 0; n * vs < ms;) {
    const t = n * vs;
    const c = typeof cost === 'function' ? cost(t) : cost;
    let busy = 0.2; // 건너뛴 프레임은 거의 공짜
    if (cap.tick(t)) { drawn.push(t); busy = c; }
    n = Math.max(n + 1, Math.ceil((t + busy) / vs - 1e-9));
  }
  const tail = drawn.filter((t) => t > 1500); // 주사율 추정이 자리 잡은 뒤
  const gaps = tail.slice(1).map((t, i) => t - tail[i]);
  return { fps: (gaps.length * 1000) / (tail.at(-1) - tail[0]), min: Math.min(...gaps), max: Math.max(...gaps) };
}

test('프레임 제한: 120Hz → 60, 144Hz → 72 고르게, 60·90Hz 는 그대로', async () => {
  const near = (v, want, tol = 0.6) => Math.abs(v - want) < tol;
  for (const [hz, want] of [[60, 60], [90, 90], [120, 60], [144, 72], [240, 60]]) {
    const r = await simulateCap(hz, 4);
    assert.ok(near(r.fps, want), `${hz}Hz: ${r.fps.toFixed(1)}fps (기대 ${want})`);
    assert.ok(r.max - r.min < 0.5, `${hz}Hz: 프레임 간격이 들쭉날쭉 ${r.min.toFixed(1)}~${r.max.toFixed(1)}ms`);
  }
});

test('프레임 제한: 그리기가 무거우면(GPU 한계) 저절로 꺼지고, 한 번 늦은 프레임 뒤에도 박자가 고름', async () => {
  for (const cost of [10, 15]) {
    const r = await simulateCap(120, cost);
    assert.ok(r.fps > 59, `120Hz·${cost}ms: ${r.fps.toFixed(1)}fps (제한 때문에 30fps 로 떨어지면 안 됨)`);
  }
  // 2.5초에 한 번 30ms 걸린 프레임 → 그 뒤로도 16.7ms 간격 유지
  const r = await simulateCap(120, (t) => (Math.abs(t - 2500) < 5 ? 30 : 4));
  assert.ok(r.max < 34, `늦은 프레임 ${r.max.toFixed(1)}ms`);
  const { FrameCap } = await import('../src/game/postfx.js');
  const cap = new FrameCap();
  const vs = 1000 / 120;
  let drawn = [];
  for (let n = 0; n < 240; n++) cap.tick(n * vs);
  for (let n = 244; n < 304; n++) if (cap.tick(n * vs)) drawn.push(n); // 갱신 몇 번을 통째로 놓친 뒤에도
  const gaps = drawn.slice(1).map((v, i) => v - drawn[i]);
  assert.ok(gaps.every((g) => g === 2), `갱신 2번에 한 번: ${gaps.join(',')}`);
  // 탭 숨김 뒤 복귀: 첫 프레임은 바로 그림
  cap.reset();
  assert.equal(cap.tick(1e6), true);
});

// ---------------------------------------------------------------- 탭 숨김 때 눌린 입력 정리
test('입력: 앱 전환으로 손 뗀 이벤트를 놓쳐도 조이스틱·시점 터치·키가 눌린 채 남지 않음', async () => {
  const listeners = (o) => { const L = {}; o.addEventListener = (k, fn) => (L[k] ||= []).push(fn); o.fire = (k, e) => (L[k] || []).forEach((fn) => fn(e)); return o; };
  globalThis.window = listeners({ innerWidth: 400, innerHeight: 800 });
  const canvas = listeners({ setPointerCapture() {} });
  const { Input } = await import('../src/game/input.js');
  const { releaseInput } = await import('../src/game/camera.js');
  const I = new Input(canvas);
  const joyLog = [];
  I.onJoystick = (on) => joyLog.push(on);
  const touch = (id, x, y) => ({ identifier: id, clientX: x, clientY: y });
  const ev = (list, all = list) => ({ changedTouches: list, touches: all, preventDefault() {} });
  canvas.fire('touchstart', ev([touch(1, 60, 600)]));
  canvas.fire('touchmove', ev([touch(1, 60, 540)]));
  assert.equal(I.joy.active, true);
  assert.ok(I.axis().y < -0.5, '조이스틱으로 앞으로 걷는 중');
  // 오른쪽 시점 드래그 손가락, 마우스 드래그, 키, 핀치, 화면 버튼도 눌린 채 (touchend 를 못 받음)
  I.touches.set(2, { x: 320, y: 400 }); I.tapStart.set(2, { x: 320, y: 400, t: 0, moved: 0 });
  I.drag.active = true; I.drag.dx = 40; I.keys.add('KeyW'); I.pinch = 80; I.virtual.x = 1; I.wheel = 30;
  releaseInput(I);
  assert.deepEqual(I.axis(), { x: 0, y: 0 }, '더 걷지 않음');
  assert.equal(I.joy.active, false);
  assert.equal(joyLog.at(-1), false, '조이스틱 그림도 숨김');
  assert.equal(I.touches.size, 0, '남은 시점 터치 때문에 트랙터 시점 복귀가 멈추지 않음');
  assert.equal(I.tapStart.size, 0);
  assert.equal(I.drag.active, false);
  assert.equal(I.drag.dx, 0);
  assert.equal(I.pinch, null);
  assert.equal(I.wheel, 0);
  assert.equal(I.keys.size, 0);
  // 돌아와서 다시 왼쪽을 누르면 조이스틱이 새로 잡힘 (예전 손가락 id 에 막히지 않음)
  canvas.fire('touchstart', ev([touch(5, 70, 610)]));
  assert.equal(I.joy.active, true);
  assert.equal(I.joy.id, 5);
});

// ---------------------------------------------------------------- 날씨: 기본 위치 안내
test('날씨: 기본 위치인지 알려 줌 (날씨 창에서 내 위치 날씨를 권할 때)', async () => {
  stubWeatherEnv('prompt');
  const { WeatherService } = await import('../src/game/weather.js');
  const svc = new WeatherService(() => {});
  assert.equal(svc.usingDefault, true, '아직 위치 없음');
  await svc.start();
  assert.equal(svc.usingDefault, true, '권한을 묻지 않았으니 기본 위치');
  assert.equal(svc.source, 'live');
  assert.equal(await svc.useLive(), true, '버튼을 누르면 현재 위치');
  assert.equal(svc.usingDefault, false);
  clearInterval(svc.timer);
  // 위치를 못 받으면 기본 위치로 돌아가고 false
  navigator.geolocation.getCurrentPosition = (ok, fail) => fail(new Error('denied'));
  const svc2 = new WeatherService(() => {});
  assert.equal(await svc2.useLive(), false);
  assert.equal(svc2.usingDefault, true);
  clearInterval(svc2.timer);
});
