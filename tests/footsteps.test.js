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
    // 게인이 올라간 값 (exp 램프 중 가장 큰 값)
    return Math.max(...c.started.map((x) => Math.max(0, ...(x.outs[0]?.outs[0]?.gain?.events ?? []).filter((e) => e[0] === 'exp').map((e) => e[1]))));
  };
  const walk = peak(0), run = peak(1);
  assert.ok(Math.abs(run / walk - 1 / 0.6) < 1e-6, `달리기/걷기 ${run / walk}`);
});

test('발소리: 디딘 발을 알면 그쪽으로(왼발 -0.1, 오른발 +0.1), 젖은 흙·풀은 찰박을 얹음', () => {
  globalThis.window = { AudioContext: MockAudioContext };
  const a = new Audio(); a.rng = () => 0.5; a._ctx();
  const c = a.ctx;
  // 실행·확인: 같은 발이 두 번 디뎌도 같은 쪽
  a.step('grass', 1, 1, { left: true }); assert.equal(a._stepPan, -0.1);
  c.currentTime = 0.2; a.step('grass', 1, 1, { left: true }); assert.equal(a._stepPan, -0.1);
  c.currentTime = 0.4; a.step('grass', 1, 1, { left: false }); assert.equal(a._stepPan, 0.1);
  // 젖은 땅: 재료 하나 더 (1.2kHz)
  for (const x of c.started) x.onended?.();
  c.currentTime = 0.6; let n = c.started.length; a.step('dirt', 1);
  const dry = c.started.length - n;
  c.currentTime = 0.8; n = c.started.length; a.step('dirt', 1, 1, { wet: true });
  assert.equal(c.started.length - n, dry + 1);
  assert.ok(c.started.slice(n).some((s) => s.outs[0]?.frequency?.value === 1200), '1.2kHz 찰박');
  // 나무 바닥은 비가 와도 그대로
  c.currentTime = 1; n = c.started.length; a.step('wood', 1, 1, { wet: true });
  const woodWet = c.started.length - n;
  c.currentTime = 1.2; n = c.started.length; a.step('wood', 1);
  assert.equal(woodWet, c.started.length - n);
});

test('발소리: 나무·마루는 음 높이가 미끄러지지 않고 몸통음이 20ms 아래', () => {
  globalThis.window = { AudioContext: MockAudioContext };
  const a = new Audio(); a.rng = () => 0.5; a._ctx();
  const c = a.ctx;
  for (const [i, k] of ['wood', 'floor'].entries()) {
    c.currentTime = i; const n = c.started.length; a.step(k, 1);
    for (const o of c.started.slice(n).filter((s) => s.kind === 'osc')) {
      assert.ok(!o.frequency.events.some((e) => e[0] === 'exp'), `${k}: 미끄러짐 없음`);
      assert.ok(o.t1 - o.t0 <= 0.02 + 0.05 + 1e-9, `${k}: 길이 ${o.t1 - o.t0}`);
    }
  }
});

test('다른 플레이어 발소리는 내 발소리의 90ms 간격을 막지 않음', () => {
  globalThis.window = { AudioContext: MockAudioContext };
  const a = new Audio(); a.rng = () => 0.5; a._ctx();
  const c = a.ctx;
  a.step('grass', 0.6, 0.3, { remote: true });
  c.currentTime = 0.03; const n = c.started.length;
  a.step('grass', 1);
  assert.ok(c.started.length > n, '내 발소리는 남');
});

test('main.js: 발소리는 발이 닿을 때마다(onFoot), 디딘 발·젖은 땅을 넘기고, 다른 플레이어는 8m 안 40% 까지', async () => {
  const { readFileSync } = await import('node:fs');
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(main, /unico\.onFoot = \(x, z, r, left\) =>/);
  assert.match(main, /\{ left, wet: this\._wetGround\(\) \}/);
  assert.match(main, /if \(!this\._hasFoot\) myStep\(x, z\)/, 'onFoot 이 없을 때만 onStep 으로 대신');
  assert.match(main, /d >= 8 \|\| now - at < 250/);
  assert.match(main, /0\.4 \* \(1 - d \/ 8\)/);
});
