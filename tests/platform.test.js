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
