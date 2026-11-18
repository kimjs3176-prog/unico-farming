// 발소리: 바닥 종류 고르기와 소리 장치를 새로 켜지 않는 발소리 (src/game/footsteps.js, audio.step)
import test from 'node:test';
import assert from 'node:assert/strict';
import { MockAudioContext } from './lib/audio_mock.js';

const { surfaceAt } = await import('../src/game/footsteps.js');
const { LAYOUT } = await import('../src/game/world.js');
const { Audio, STEP_KINDS } = await import('../src/game/audio.js');

test('바닥 종류: 집 안은 마루, 부두는 나무, 눈이 쌓이면 눈, KOAT 광장은 돌, 밭·흙길은 흙, 그 밖은 풀', () => {
  const g = { home: { inside: false } };
  const P = LAYOUT.lake.pier[0];
  assert.equal(surfaceAt({ home: { inside: true } }, 0, 0, 0), 'floor');
  assert.equal(surfaceAt(g, (P.x0 + P.x1) / 2, (P.z0 + P.z1) / 2, 0), 'wood');
  assert.equal(surfaceAt(g, LAYOUT.dock.x, LAYOUT.dock.z, 0), 'wood', '연못 데크');
  assert.equal(surfaceAt(g, (P.x0 + P.x1) / 2, (P.z0 + P.z1) / 2, 1), 'wood', '눈이 와도 부두는 나무');
  assert.equal(surfaceAt(g, 25, -25, 0), 'stone');
  assert.equal(surfaceAt(g, 0, 0, 0), 'dirt', '밭');
  assert.equal(surfaceAt(g, 0, 8, 0), 'dirt', '가운데 흙길');
  assert.equal(surfaceAt(g, 15, 20, 0), 'dirt', '트랙터 밭');
  assert.equal(surfaceAt(g, -30, -30, 0), 'grass');
  assert.equal(surfaceAt(g, -30, -30, 1), 'snow');
  assert.equal(surfaceAt(null, -30, -30, 0), 'grass', '게임 없이도');
});

test('발소리: 소리 장치가 없거나 멈춰 있으면 만들지도 켜지도 않음', () => {
  let made = 0;
  globalThis.window = { AudioContext: class extends MockAudioContext { constructor() { super(); made++; } } };
  const a = new Audio();
  a.step('grass', 1);
  assert.equal(made, 0, '발소리가 소리 장치를 만들지 않음');
  assert.equal(a.ctx, null);
  a._ctx();
  a.ctx.state = 'suspended';
  const n = a.ctx.started.length;
  a.step('wood', 1);
  assert.equal(a.ctx.started.length, n, '멈춘 동안 소리 없음');
  assert.equal(a.ctx.state, 'suspended', '다시 켜지 않음');
});

test('발소리: 바닥마다 소리가 나고, 90ms 안 두 번째는 건너뛰며, 좌우를 번갈아 감', () => {
  globalThis.window = { AudioContext: MockAudioContext };
  const a = new Audio();
  a._ctx();
  const c = a.ctx;
  const pans = [];
  for (const [i, k] of STEP_KINDS.entries()) {
    c.currentTime = i * 0.3;
    const n = c.started.length;
    a.step(k, 1);
    assert.ok(c.started.length - n >= 2, `${k} 재료 ${c.started.length - n}`);
    pans.push(a._stepPan);
    const m = c.started.length;
    c.currentTime += 0.05; a.step(k, 1);
    assert.equal(c.started.length, m, `${k}: 90ms 안 두 번째는 건너뜀`);
  }
  assert.ok(pans.every((p, i) => i === 0 || p === -pans[i - 1]), `좌우 ${pans}`);
});

test('발소리: 달리면 걸을 때보다 큼 (0.6 + 0.4×빠르기)', () => {
  globalThis.window = { AudioContext: MockAudioContext };
  const peak = (s) => {
    const a = new Audio(); a.rng = () => 0.5; a._ctx();
    const c = a.ctx; a.step('grass', s);
    return Math.max(...c.started.map((x) => x.outs[0]?.outs[0]?.gain?.peak ?? 0));
  };
  const walk = peak(0), run = peak(1);
  assert.ok(Math.abs(run / walk - 1 / 0.6) < 1e-6, `달리기/걷기 ${run / walk}`);
});
