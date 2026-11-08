import test from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS, applyPreset, resolveQuality, FpsGovernor, autoStartLevel } from '../src/game/quality.js';

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

test('자동 조절기: FPS 가 계속 낮으면 내림 제안, 높으면 그대로', () => {
  const slow = new FpsGovernor({ window: 1, minFps: 30, grace: 0 });
  let down = false;
  for (let i = 0; i < 40 && !down; i++) down = slow.tick(1 / 20); // 20 FPS
  assert.ok(down);
  const fast = new FpsGovernor({ window: 1, minFps: 30, grace: 0 });
  let d2 = false;
  for (let i = 0; i < 300; i++) d2 ||= fast.tick(1 / 60);
  assert.equal(d2, false);
});

test('자동 조절기: 시작 직후 유예 시간에는 내리지 않음', () => {
  const g = new FpsGovernor({ window: 1, minFps: 30, grace: 5 });
  let down = false;
  for (let i = 0; i < 60; i++) down ||= g.tick(1 / 20); // 3초
  assert.equal(down, false);
});

test('자동 시작 단계: 모바일 낮음, PC 높음', () => {
  assert.equal(autoStartLevel(true), 'low');
  assert.equal(autoStartLevel(false), 'high');
});

test('자동 조절기: 탭 전환 후 reset 하면 유예 시간부터 다시', () => {
  const g = new FpsGovernor({ window: 1, minFps: 30, grace: 2 });
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

test('UI text size: three steps, invalid or missing values fall back to normal', async () => {
  const { UI_SCALES, uiScaleOf } = await import('../src/game/quality.js');
  assert.deepEqual(UI_SCALES.map((u) => u.v), [1, 1.15, 1.3]);
  assert.equal(uiScaleOf({}), 1);
  assert.equal(uiScaleOf({ uiScale: 'abc' }), 1);
  assert.equal(uiScaleOf({ uiScale: 1.3 }), 1.3);
  assert.equal(uiScaleOf({ uiScale: 1.2 }), 1.15, '가장 가까운 단계로');
  assert.equal(uiScaleOf({ uiScale: 9 }), 1.3);
});
