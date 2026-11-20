import test from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS, applyPreset, resolveQuality, FpsGovernor, autoStartLevel, gpuTier, resolveAuto, noteAutoDrop, saveSettings, loadSettings, AUTO_DROP_DAYS, SLOW_MS } from '../src/game/quality.js';

const base = { preset: 'auto', autoLevel: 'high', showFps: false, ...PRESETS.high };

test('프리셋: 낮음은 후처리·주변광 차폐 끄고 해상도·그림자 낮춤', () => {
  const q = resolveQuality(applyPreset(base, 'low'), 2);
  assert.equal(q.post, false);
  assert.equal(q.ao, false);
  assert.equal(q.shadowMap, 1024);
  assert.equal(q.shadowEvery, 3);
  assert.equal(q.level, 'low');
  assert.ok(q.pixelRatio <= 0.75 + 1e-9, `pixelRatio ${q.pixelRatio}`);
});

test('프리셋: 높음은 모든 효과, 고해상도 화면은 최대 2배', () => {
  const q = resolveQuality(applyPreset(base, 'high'), 3);
  assert.equal(q.ao, true);
  assert.equal(q.tiltShift, true);
  assert.equal(q.pixelRatio, 2);
  assert.equal(q.shadowEvery, 1);
});

test('자동: autoLevel 단계를 따름', () => {
  const s = applyPreset({ ...base, autoLevel: 'medium' }, 'auto');
  const q = resolveQuality(s, 1);
  assert.equal(q.level, 'medium');
  assert.equal(q.ao, false);
  assert.equal(q.post, true);
});

test('사용자 지정: 세부 항목 그대로, 그림자 끔', () => {
  const q = resolveQuality({ ...base, preset: 'custom', shadows: 'off', scale: 0.5, post: false }, 1);
  assert.equal(q.shadows, 'off');
  assert.equal(q.shadowEvery, 0);
  assert.equal(q.pixelRatio, 0.5);
  assert.equal(q.level, 'low');
});

test('자동 조절기: 프레임 중앙값이 두 창 잇달아 36ms 를 넘으면(20fps) 내림 제안, 60fps 는 그대로', () => {
  const slow = new FpsGovernor({ window: 1, grace: 0 });
  let at = -1;
  for (let i = 0; i < 60 && at < 0; i++) if (slow.tick(1 / 20)) at = i;
  assert.equal(at, 39, '두 번째 창 끝에서 (한 창 = 20프레임)');
  const fast = new FpsGovernor({ window: 1, grace: 0 });
  let d2 = false;
  for (let i = 0; i < 300; i++) d2 ||= fast.tick(1 / 60);
  assert.equal(d2, false);
});

test(`자동 조절기: 30fps 로 꾸준히 도는 화면(33ms < ${SLOW_MS}ms)은 내리지 않음`, () => {
  const g = new FpsGovernor({ window: 1, grace: 0 });
  let down = false;
  for (let i = 0; i < 600; i++) down ||= g.tick(1 / 30);
  assert.equal(down, false);
});

test('자동 조절기: 한 번 크게 끊기거나(1초 멈춤) 한 창만 느리면 내리지 않음', () => {
  const g = new FpsGovernor({ window: 1, grace: 0 });
  let down = false;
  for (let i = 0; i < 120; i++) down ||= g.tick(1 / 60);
  down ||= g.tick(1.0); // 한 번 멈춤
  for (let i = 0; i < 20; i++) down ||= g.tick(1 / 20); // 한 창만 느림
  for (let i = 0; i < 120; i++) down ||= g.tick(1 / 60);
  assert.equal(down, false);
});

test('자동 조절기: 시작 직후 유예 시간에는 내리지 않음', () => {
  const g = new FpsGovernor({ window: 1, grace: 5 });
  let down = false;
  for (let i = 0; i < 60; i++) down ||= g.tick(1 / 20); // 3초
  assert.equal(down, false);
});

test('자동 시작 단계: 모바일 낮음, PC 는 GPU 를 모르면 보통', () => {
  assert.equal(autoStartLevel(true), 'low');
  assert.equal(autoStartLevel(false), 'medium');
  assert.equal(autoStartLevel(false, { tier: 'high' }), 'high');
});

test('GPU 등급표: 내장 그래픽·모르는 이름은 보통, 외장 상급은 높음, 소프트웨어는 낮음', () => {
  const table = {
    'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)': 'medium',
    'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)': 'medium',
    'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Laptop GPU Direct3D11 vs_5_0 ps_5_0, D3D11)': 'high',
    'ANGLE (NVIDIA, NVIDIA GeForce GTX 1060 6GB Direct3D11 vs_5_0 ps_5_0, D3D11)': 'high',
    'ANGLE (NVIDIA, NVIDIA GeForce GTX 1050 Direct3D11 vs_5_0 ps_5_0, D3D11)': 'high',
    'ANGLE (NVIDIA, NVIDIA GeForce MX450 Direct3D11 vs_5_0 ps_5_0, D3D11)': 'medium',
    'ANGLE (AMD, AMD Radeon RX Vega 11 Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)': 'medium',
    'ANGLE (AMD, AMD Radeon RX 6600 Direct3D11 vs_5_0 ps_5_0, D3D11)': 'high',
    'ANGLE (AMD, AMD Radeon(TM) Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)': 'medium',
    'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)': 'low',
    'llvmpipe (LLVM 15.0.7, 256 bits)': 'low',
    'Microsoft Basic Render Driver': 'low',
    'Apple M2 Pro': 'high',
    'Apple M1': 'medium',
    'Apple GPU': 'medium',
    '': 'medium',
  };
  for (const [name, want] of Object.entries(table)) assert.equal(gpuTier(name), want, name);
});

test('예전 설정(GPU 기록 없음, 높음·낮음에 굳음)은 GPU 단계로 다시 고르고, 같은 GPU 면 그대로', () => {
  const intel = { tier: 'medium', key: 'Intel UHD 620' };
  const old = { preset: 'auto', autoLevel: 'high', ...PRESETS.high };
  const s1 = resolveAuto(old, intel, false, 1000);
  assert.equal(s1.autoLevel, 'medium');
  assert.equal(s1.autoGpu, 'Intel UHD 620');
  const stuckLow = resolveAuto({ preset: 'auto', autoLevel: 'low' }, { tier: 'high', key: 'RTX' }, false, 1000);
  assert.equal(stuckLow.autoLevel, 'high', '예전에 한 번 끊겨 낮음에 굳은 PC 도 풀림');
  assert.equal(resolveAuto(s1, intel, false, 2000).autoLevel, 'medium');
  assert.equal(resolveAuto(s1, { tier: 'high', key: 'RTX 4070' }, false, 2000).autoLevel, 'high', 'GPU 가 바뀌면 다시');
  assert.equal(resolveAuto(s1, intel, true, 2000).autoLevel, 'low', '모바일은 낮음');
});

test('자동 내림: 한 접속에서만 내리면 저장 안 함, 다음 접속도 내려야 시작 단계로 저장, 14일 지나면 GPU 단계로', () => {
  // 준비: 높음 GPU
  const gpu = { tier: 'high', key: 'RTX' };
  const day = 86400000;
  let s = resolveAuto({ preset: 'auto' }, gpu, false, 0);
  // 실행: 첫 접속에서 보통으로
  const a = noteAutoDrop(s, 'medium', 1000, {});
  assert.equal(a.persist, false);
  assert.equal(a.settings.autoLevel, 'high', '첫 번째는 기록만');
  s = resolveAuto(a.settings, gpu, false, 2 * day);
  assert.equal(s.autoLevel, 'high', '다음 접속도 높음으로 시작');
  // 두 번째 접속에서 낮음까지 → 두 접속 모두 필요했던 보통을 저장
  const sess = {};
  const b1 = noteAutoDrop(s, 'medium', 2 * day, sess);
  const b2 = noteAutoDrop(b1.settings, 'low', 2 * day + 5000, sess);
  assert.equal(b1.persist, true);
  assert.equal(b2.settings.autoDrop.keep, 'medium');
  assert.equal(b2.settings.autoDrop.n, 2, '같은 접속은 한 번만 셈');
  s = resolveAuto(b2.settings, gpu, false, 3 * day);
  assert.equal(s.autoLevel, 'medium', '세 번째 접속은 보통으로 시작');
  // 확인: 마지막으로 내린 뒤 14일이 지나면 다시 높음
  assert.equal(resolveAuto(s, gpu, false, 2 * day + (AUTO_DROP_DAYS + 1) * day).autoLevel, 'high');
});

test('사용자가 고른 단계는 GPU·자동 내림이 건드리지 않고, 이번 접속 단계(sessionLevel)는 저장하지 않음', () => {
  const store = new Map();
  const realLS = globalThis.localStorage;
  globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) };
  try {
    saveSettings({ preset: 'high', autoLevel: 'low', sessionLevel: 'low', ...PRESETS.high });
    assert.equal(JSON.parse(store.get('unico.gfx')).sessionLevel, undefined);
    const s = loadSettings();
    assert.equal(s.preset, 'high');
    assert.equal(resolveQuality(s, 1).level, 'high');
    const sess = resolveQuality({ ...applyPreset({ ...s, autoLevel: 'high' }, 'auto'), sessionLevel: 'medium' }, 1);
    assert.equal(sess.level, 'medium', '자동이면 이번 접속 단계를 씀');
  } finally { globalThis.localStorage = realLS; }
});

test('자동 조절기: 탭 전환 후 reset 하면 유예 시간부터 다시', () => {
  const g = new FpsGovernor({ window: 1, grace: 2 });
  for (let i = 0; i < 200; i++) g.tick(1 / 60);
  g.reset();
  let down = false;
  for (let i = 0; i < 30; i++) down ||= g.tick(1 / 20); // 1.5초 느려도 유예 중
  assert.equal(down, false);
});

test('단계별 덧붙임: 낮음만 새 떼 끔·비눈 입자 줄임·풀 거리 제한·잎 수·노이즈·그림자 상자 줄임, 보통·높음은 그대로', () => {
  const low = resolveQuality(applyPreset(base, 'low'), 1);
  assert.equal(low.birds, false);
  assert.ok(low.precip > 0 && low.precip < 1);
  assert.ok(low.grassFar > 30, '안개 시작(45m) 근처까지는 그림');
  assert.equal(low.grassLean, true);
  assert.equal(low.lowDetail, true);
  assert.equal(low.shadowBoxMax, 26, '가로 폰 그림자 상자 작게');
  for (const p of ['medium', 'high']) {
    const q = resolveQuality(applyPreset(base, p), 1);
    assert.equal(q.birds, true);
    assert.equal(q.precip, 1);
    assert.equal(q.grassFar, 0);
    assert.equal(q.grassLean, false);
    assert.equal(q.lowDetail, false);
    assert.equal(q.shadowBoxMax, 36);
  }
  // 자동 모드(모바일 시작 단계 low)도 같은 값
  const autoLow = resolveQuality(applyPreset({ ...base, autoLevel: 'low' }, 'auto'), 1);
  assert.equal(autoLow.level, 'low');
  assert.equal(autoLow.birds, false);
  // 사용자 지정 (후처리 끔 → low 로 봄)
  assert.equal(resolveQuality({ ...base, preset: 'custom', post: false }, 1).birds, false);
});

test('환경맵(IBL): 낮음만 끄고 보통·높음·후처리 켠 사용자 지정은 켬', () => {
  assert.equal(resolveQuality(applyPreset(base, 'low'), 1).env, false);
  assert.equal(resolveQuality(applyPreset({ ...base, autoLevel: 'low' }, 'auto'), 1).env, false);
  for (const p of ['medium', 'high']) assert.equal(resolveQuality(applyPreset(base, p), 1).env, true);
  assert.equal(resolveQuality({ ...base, preset: 'custom', post: true, ao: false }, 1).env, true);
  assert.equal(resolveQuality({ ...base, preset: 'custom', post: false }, 1).env, false);
});

test('환경맵(IBL)은 언제나 후처리와 함께 바뀜 (자동 내림에서 재질 셰이더 다시 컴파일이 따로 더 생기지 않음)', () => {
  const states = [
    ...['low', 'medium', 'high'].map((p) => applyPreset(base, p)),
    ...['low', 'medium', 'high'].map((l) => applyPreset({ ...base, autoLevel: l }, 'auto')),
    ...[true, false].flatMap((post) => [true, false].map((ao) => ({ ...base, preset: 'custom', post, ao }))),
  ];
  for (const s of states) {
    const q = resolveQuality(s, 1);
    assert.equal(q.env, q.post, `${s.preset}/${s.autoLevel}/post=${s.post}`);
  }
});

test('UI text size: three steps, invalid or missing values fall back to normal', async () => {
  const { UI_SCALES, uiScaleOf } = await import('../src/game/quality.js');
  assert.deepEqual(UI_SCALES.map((u) => u.v), [1, 1.15, 1.3]);
  assert.equal(uiScaleOf({}), 1);
  assert.equal(uiScaleOf({ uiScale: 'abc' }), 1);
  assert.equal(uiScaleOf({ uiScale: 1.3 }), 1.3);
  assert.equal(uiScaleOf({ uiScale: 1.2 }), 1.15, '가장 가까운 단계로');
  assert.equal(uiScaleOf({ uiScale: 9 }), 1.3);
});

test('낮음: 폰 화면은 화면 크기에 맞춰 선명하게 (예전 0.75배 고정 → 뿌옇게), 큰 PC 화면은 0.75배까지만', async () => {
  const { lowPixelRatio, LOW_PIXELS } = await import('../src/game/quality.js');
  const phone = resolveQuality(applyPreset(base, 'low'), 3, 390 * 844);
  assert.ok(phone.pixelRatio >= 1.3 && phone.pixelRatio <= 1.5, `폰 ${phone.pixelRatio}`);
  assert.ok(phone.pixelRatio ** 2 * 390 * 844 <= LOW_PIXELS * 1.01, '그리는 픽셀 수는 예산 안');
  assert.equal(resolveQuality(applyPreset(base, 'low'), 1, 1920 * 1080).pixelRatio, 0.75, 'PC 1080p 는 예전과 같음');
  assert.equal(resolveQuality(applyPreset(base, 'low'), 1, 390 * 844).pixelRatio, 1, 'dpr 1 화면은 1배를 넘지 않음');
  assert.equal(lowPixelRatio(3, 100 * 100), 1.5, '작은 화면도 1.5배 상한');
  // 사용자 지정 해상도 슬라이더는 그대로 곱해짐
  assert.ok(Math.abs(resolveQuality({ ...base, preset: 'custom', post: false, ao: false, scale: 0.5 }, 3, 390 * 844).pixelRatio - phone.pixelRatio * 0.5) < 1e-9);
});
