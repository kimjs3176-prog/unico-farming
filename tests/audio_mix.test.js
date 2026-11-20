// 소리 믹스: 이름별 목표 크기·잰 값, 음악 낮추기(덕킹), 변주, 이어 하기 음계, 소리 수 상한, 엔진·릴 (src/game/audio.js)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { MockAudioContext } from './lib/audio_mock.js';
import { mockLevels } from './lib/audio_levels_mock.js';

const { Audio, MIX_DB, STEP_DB, COMBO_STEPS, PRE_DB, dbToGain, snapPenta } = await import('../src/game/audio.js');
const { Music, rainGainFor } = await import('../src/game/music.js');
const FIX = JSON.parse(readFileSync(new URL('./fixtures/audio_levels.json', import.meta.url), 'utf8'));

/** 가짜 컨텍스트로 소리 장치를 만든 Audio (변주 없이 rng 0.5) */
function make(o = {}) {
  globalThis.window = { AudioContext: MockAudioContext };
  const a = new Audio();
  a.rng = o.rng || (() => 0.5);
  a._ctx();
  return a;
}
/** 시작한 오실레이터의 처음 주파수 */
const oscFreqs = (c, from = 0) => c.started.slice(from).filter((s) => s.kind === 'osc').map((s) => s.frequency.events.find((e) => e[0] === 'set')?.[1] ?? s.frequency.value);

// 잰 값과 목표가 이만큼 안에 있어야 함 (dB)
const TOL_DB = 2;
// 조리법을 바꿨는데 다시 재지 않았는지: 가짜 컨텍스트 어림값이 잰 때와 이만큼 넘게 다르면 실패
const DRIFT_DB = 1.5;
// 소리 하나가 압축기 앞에서 넘지 말아야 할 봉우리 (dBFS): 압축기는 여러 소리가 겹칠 때만 일하게
const SINGLE_PEAK_DB = -6;
// 작은 소리를 잇달아 낼 때 음악이 줄어들어도 되는 양 (dB)
const PUMP_DB = 1;

test('목표 크기: 작은 소리 < 클릭 < 도구 < 줍기 < 시작·퀘스트 < 중간 보상 < 레벨업, 동물은 -30dB 아래', () => {
  const T = MIX_DB;
  assert.ok(T.tap < T.click && T.blip < T.click, '두드림·대사 < 클릭');
  for (const n of ['dig', 'plant', 'water', 'stroke', 'splash', 'shoo', 'bump']) assert.ok(T.click < T[n] && T[n] < T.coin, `${n} ${T[n]}`);
  for (const n of ['coin', 'pop', 'harvest', 'catch', 'combo', 'count', 'star']) assert.ok(T[n] < T.go, `${n} ${T[n]} < 시작 ${T.go}`);
  assert.ok(T.go <= T.quest && T.quest < T.win && T.win < T.levelup);
  for (const n of ['caw', 'howl', 'bark', 'buzz', 'yip', 'growl']) assert.ok(T[n] <= -30, `${n} ${T[n]}`);
  // 목장 동물 목소리는 도구 소리 크기 (≈ -24), 빗질은 도구와 같은 층
  for (const n of ['moo', 'baa', 'cluck', 'neigh', 'heehaw', 'hum', 'bristle']) assert.ok(T[n] >= -26 && T[n] <= -24, `${n} ${T[n]}`);
  // 축제 가락: 줍기보다 크고 중간 보상보다 작게
  assert.ok(T.coin < T.fest && T.fest < T.win, `축제 ${T.fest}`);
});

test('잰 값(fixtures/audio_levels.json): 압축기 앞에서 이름마다 목표+PRE_DB ±2dB, 발소리도 ±2dB', () => {
  assert.equal(FIX.pre_db, PRE_DB, 'PRE_DB 를 바꿨으면 다시 재세요');
  for (const [n, t0] of Object.entries(MIX_DB)) {
    const m = FIX.measured[n], target = t0 + PRE_DB;
    assert.ok(typeof m === 'number', `${n} 잰 값 없음 → node scripts/audio-levels.mjs`);
    assert.ok(Math.abs(m - target) <= TOL_DB, `${n}: 잰 값 ${m} / 목표 ${target}`);
  }
  for (const [k, t0] of Object.entries(STEP_DB)) assert.ok(Math.abs(FIX.step[k] - (t0 + PRE_DB)) <= TOL_DB, `발소리 ${k}: ${FIX.step[k]} / ${t0 + PRE_DB}`);
});

test('PRE_DB 는 압축기·리미터의 자동 보정 이득과 1dB 안 (조용한 소리는 압축기 뒤에서 MIX_DB 크기)', () => {
  assert.ok(Math.abs(FIX.misc.makeup + PRE_DB) <= 1, `보정 이득 ${FIX.misc.makeup} / PRE_DB ${PRE_DB}`);
});

test('압축기를 빼고 그려도 어떤 소리 하나의 봉우리도 -6dBFS 를 넘지 않음', () => {
  for (const [n, p] of Object.entries(FIX.peak)) assert.ok(p <= SINGLE_PEAK_DB, `${n}: 봉우리 ${p}dBFS`);
});

test('대사 블립(60ms 마다)·두드림·잡기를 잇달아 내도 음악이 1dB 넘게 줄지 않음 (압축기 출렁임 없음)', () => {
  for (const n of ['blip', 'tap', 'catch']) {
    const d = FIX.misc[`pump_${n}`];
    assert.ok(typeof d === 'number' && d >= -PUMP_DB, `${n}: 음악 ${d}dB`);
  }
});

test('잰 값: 폭풍 비 + 천둥 + 레벨업 + 음악이 겹쳐도 -1dBFS 아래, 음악은 -27±2 / 평균 -33±2', () => {
  assert.ok(FIX.misc.storm_peak.peak < -1, `봉우리 ${FIX.misc.storm_peak.peak}`);
  assert.ok(Math.abs(FIX.misc.music_day.st50 + 27) <= 2.5, `낮 음악 가장 큰 구간 ${FIX.misc.music_day.st50}`);
  assert.ok(Math.abs(FIX.misc.music_day.rms + 33) <= 2, `낮 음악 평균 ${FIX.misc.music_day.rms}`);
  // 보통 비(강수 0.55)는 음악 평균보다 조용
  assert.ok(FIX.misc['rain_0.55'].rms < FIX.misc.music_day.rms, `비 ${FIX.misc['rain_0.55'].rms}`);
});

test('조리법·배율을 바꾸면 다시 재야 함: 가짜 컨텍스트 어림값이 잰 때와 1.5dB 안', async () => {
  const now = await mockLevels();
  for (const n of Object.keys(MIX_DB)) {
    assert.ok(Math.abs(now[n] - FIX.mock[n]) <= DRIFT_DB, `${n}: 지금 ${now[n]} / 잰 때 ${FIX.mock[n]} → node scripts/audio-levels.mjs 로 다시 재세요`);
  }
});

test('비 소리 크기: 0.02 + 강수×0.07, 최대 0.09, 맑으면 0', () => {
  assert.equal(rainGainFor('clear', 1), 0);
  assert.ok(Math.abs(rainGainFor('rain', 0) - 0.02) < 1e-9);
  assert.ok(Math.abs(rainGainFor('storm', 1) - 0.09) < 1e-9);
  assert.ok(rainGainFor('storm', 5) <= 0.09 + 1e-9);
  const m = new Music({}); m.scene = { kind: 'rain', precip: 0.5 };
  assert.ok(Math.abs(m.rainLevel() - 0.055) < 1e-9);
});

test('효과음 이름 대신 날 소리(pluck/tone)를 화면 코드에서 직접 부르지 않음 (예외 없음)', () => {
  const ALLOW = new Set();
  const bad = [];
  const walk = (d) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (p.endsWith('.js') && !ALLOW.has(p) && /\.(pluck|tone)\(/.test(readFileSync(p, 'utf8'))) bad.push(p);
    }
  };
  walk('src/ui'); walk('src/game/view');
  assert.deepEqual(bad, []);
});

test('변주: play() 가 끝나면 배율이 1로 돌아와 음악(직접 부르는 tone)의 음 높이는 그대로', () => {
  const a = make({ rng: () => 0.95 });
  a.play('dig');
  assert.equal(a._pm, 1); assert.equal(a._vm, 1); assert.equal(a._lm, 1);
  const c = a.ctx, from = c.started.length;
  new Music(a).playStep(0, 0, false, 0.36);
  const fs = oscFreqs(c, from);
  // 낮 첫 마디 C 화음 패드(60·64·67) + 베이스(48)
  const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);
  for (const n of [60, 64, 67, 48]) assert.ok(fs.some((f) => Math.abs(f - NOTE(n)) < 1e-9), `음 ${n}: ${fs}`);
});

test('변주: 음 있는 소리는 ±1.2%, 두드리는 소리는 ±10%, 레벨업은 그대로', () => {
  // 준비: 가장 큰 쪽으로 흔듦
  const a = make({ rng: () => 1 });
  const c = a.ctx;
  // 실행·확인: 동전(음 있는 소리) 1976Hz → 최대 +1.2%
  let from = c.started.length; a.play('coin');
  const coin = oscFreqs(c, from)[0];
  assert.ok(Math.abs(coin / 1976 - 1.012) < 1e-6, `동전 ${coin}`);
  // 땅파기(두드리는 소리) 110Hz 삼각파 → +10%
  c.currentTime = 1; from = c.started.length; a.play('dig');
  const dig = oscFreqs(c, from)[0];
  assert.ok(Math.abs(dig / 110 - 1.1) < 1e-6, `땅파기 ${dig}`);
  // 레벨업: 정해진 음 그대로
  c.currentTime = 2; from = c.started.length; a.play('levelup');
  assert.ok(oscFreqs(c, from).includes(131), '레벨업 바닥음 131Hz');
});

test('이어 하기: 2.5초 안에 다시 수확하면 오음계로 한 칸씩 올라가고, 쉬면 처음으로, 2.4kHz 를 넘지 않음', () => {
  const a = make();
  const c = a.ctx;
  // 수확 = 맑은 음 셋(784·988·1319), 음마다 오실레이터 둘(바탕·배음) → 다섯째가 가장 높은 바탕음
  const top = () => { for (const s of c.started) s.onended?.(); const from = c.started.length; a.play('harvest'); return oscFreqs(c, from)[4]; };
  const seq = [];
  for (let i = 0; i < 8; i++) { c.currentTime = i * 0.8; seq.push(top() / 1319); }
  assert.ok(Math.abs(seq[0] - COMBO_STEPS[0]) < 1e-9 && Math.abs(seq[1] - COMBO_STEPS[1]) < 1e-9 && Math.abs(seq[2] - COMBO_STEPS[2]) < 1e-9, `${seq}`);
  for (const r of seq) assert.ok(r * 1319 <= 2400, `가장 높은 음 ${r * 1319}`);
  c.currentTime = 20;
  assert.ok(Math.abs(top() / 1319 - 1) < 1e-9, '쉬었다 하면 처음 음');
});

test('소리 수 상한: 같은 소리는 45ms 안에 한 번, 낮은 품질 16개를 넘지 않음, 클릭·레벨업은 늘 남', () => {
  const a = make();
  const c = a.ctx;
  a.maxVoices = 16;
  // 같은 이름 45ms 안: 한 번만
  let n0 = c.started.length; a.play('pop'); a.play('pop');
  assert.equal(c.started.length - n0, 2, '뽁 한 번 = 오실레이터 2개');
  // 6칸 물 주기 + 모두 팔기를 한꺼번에 (끝나는 소리 없이)
  for (let i = 0; i < 6; i++) { c.currentTime += 0.05; a.play('water'); }
  c.currentTime += 0.05; a.play('sale', 1, { all: true });
  assert.ok(a._live <= 16, `울리는 재료 ${a._live}`);
  n0 = c.started.length; a.play('click');
  assert.ok(c.started.length > n0, '클릭은 상한이어도 남');
  // 재료가 끝나면 다시 낼 수 있음
  for (const s of c.started) s.onended?.();
  assert.equal(a._live, 0);
  c.currentTime += 0.1; n0 = c.started.length; a.play('water');
  assert.ok(c.started.length > n0);
});

test('음악 낮추기: 음악 버튼 게인과 따로, 겹치면 깊은 쪽, 끝나면 늦게 끝나는 쪽까지 유지, 계속 낮춤은 풀 때까지', () => {
  const a = make();
  const c = a.ctx;
  const musicEvents = a.music.gain.events.length;
  a.duck(-5, 0.6);
  assert.equal(a.duckDb, -5);
  const off = a.duckHold(-3);
  assert.equal(a.duckDb, -5, '더 깊은 쪽');
  c.currentTime = 0.7; a._applyDuck();
  assert.equal(a.duckDb, -3, '짧은 낮춤이 끝나도 계속 낮춤은 남음');
  off();
  assert.equal(a.duckDb, 0);
  assert.equal(a.music.gain.events.length, musicEvents, '음악 버튼 게인은 건드리지 않음');
  const last = a.duckGain.gain.events.at(-1);
  assert.equal(last[0], 'target'); assert.ok(Math.abs(last[1] - 1) < 1e-9);
  // reward.js 의 duck(0.6, 1.5): 배율로 봄 (≈ -4.4dB)
  a.duck(0.6, 1.5);
  assert.ok(Math.abs(a.duckDb - 20 * Math.log10(0.6)) < 1e-9);
  assert.ok(Math.abs(a.duckGain.gain.events.at(-1)[1] - 0.6) < 1e-9);
});

test('레벨업·중간 보상은 음악을 낮추고, 천둥은 낮추지 않음', () => {
  const a = make();
  a.play('thunder');
  assert.equal(a.duckDb ?? 0, 0);
  a.play('levelup');
  assert.ok(a.duckDb <= -5);
  assert.ok(Math.abs(dbToGain(-6) - 0.501) < 0.001);
});

test('엔진: 켜면 공회전, 빠르기를 따라가되 초당 10번까지, 끄거나 화면을 벗어나면 멈추고 끊음', () => {
  const a = make();
  const c = a.ctx;
  a.engineStart('tractor');
  const e = a._eng;
  assert.ok(e && e.o.type === 'sawtooth');
  a.engineStart('tractor');
  assert.equal(a._eng, e, '두 번 불러도 하나');
  c.currentTime = 1; a.engineSet(1, true);
  const n = e.o.frequency.events.length;
  c.currentTime = 1.05; a.engineSet(0.2, false);
  assert.equal(e.o.frequency.events.length, n, '0.1초 안에는 다시 쓰지 않음');
  assert.ok(Math.abs(e.o.frequency.events.at(-1)[1] - 105) < 1e-9, '최고 속도 105Hz');
  assert.ok(e.noiseGain.gain.events.at(-1)[1] > 0, '쟁기질 노이즈');
  a.sleep();
  assert.equal(a._eng, null);
  assert.ok(e.o.t1 !== undefined, '오실레이터 멈춤');
  e.o.onended?.();
  assert.equal(e.out.outs.length, 0, '연결 끊음');
  // 자고 있는 동안에는 다시 켜지 않음
  a.engineStart('tractor');
  assert.equal(a._eng, null);
});

test('자전거: 엔진 대신 바퀴 소리, 페달을 안 밟고 굴러가면 따르르 째깍', () => {
  const a = make();
  const c = a.ctx;
  a.engineStart('bike');
  assert.equal(a._eng.o, undefined, '톱니파 엔진 없음');
  const n = c.started.length;
  c.currentTime = 1; a.engineSet(0.8, true);
  assert.ok(c.started.length - n >= 1, '프리휠 째깍');
  a.engineStop();
});

test('릴: 감는 동안 째깍 버퍼 하나를 반복, 빠르기는 재생 속도(0.8~1.25 로 묶어 음 높이가 날카로워지지 않음), 멈추면 끊음', () => {
  const a = make();
  const c = a.ctx;
  a.reel(0);
  assert.equal(a._reel, null, '감지 않으면 만들지 않음');
  a.reel(1.2);
  const R = a._reel;
  assert.ok(R.s.loop);
  const n = c.started.length;
  a.reel(1.5);
  assert.equal(c.started.length, n, '버퍼 소스는 하나');
  assert.equal(R.s.playbackRate.events.at(-1)[1], 1.25, '1.5 → 1.25');
  a.reel(0.3);
  assert.equal(R.s.playbackRate.events.at(-1)[1], 0.8, '0.3 → 0.8');
  a.reelStop();
  assert.equal(a._reel, null);
});

test('잡기·연속 음 높이는 C장조 오음계 음으로 맞추고 2.4kHz 를 넘지 않음', () => {
  // 준비: 도·레·미·솔·라 (평균율)
  const PENTA = new Set([0, 2, 4, 7, 9]);
  const isPenta = (f) => PENTA.has(((Math.round(12 * Math.log2(f / 440)) + 69) % 12 + 12) % 12);
  // 실행·확인: 이어 하기 10번까지(880 + 콤보×60)
  for (let k = 0; k <= 10; k++) {
    const f = snapPenta(880 + k * 60);
    assert.ok(isPenta(f), `${880 + k * 60} → ${f}`);
    assert.ok(f >= 880 + k * 60 - 1 || f <= 2400, `${f}`);
    assert.ok(f <= 2400, `${f}`);
  }
  assert.equal(Math.round(snapPenta(880)), 880, '라 그대로');
  assert.equal(Math.round(snapPenta(940)), 1047, '940 → 다음 도');
  // 소리에도 맞춘 음이 들어감
  const a = make(), c = a.ctx, from = c.started.length;
  a.play('catch', 1, { freq: 1000 });
  assert.equal(Math.round(oscFreqs(c, from)[0]), 1047);
});

test('새 생활 소리(먹기·모이 뿌리기·잠들기·아침)는 소리를 내고, 잠들기는 내려가고 아침은 올라감', () => {
  const a = make(), c = a.ctx;
  for (const n of ['eat', 'scatter', 'sleep', 'morning']) {
    for (const x of c.started) x.onended?.();
    c.currentTime += 1;
    const from = c.started.length;
    a.play(n);
    assert.ok(c.started.length - from >= 3, `${n}: 재료 ${c.started.length - from}`);
    assert.ok(MIX_DB[n] < MIX_DB.levelup && MIX_DB[n] > MIX_DB.tap, `${n} 목표 ${MIX_DB[n]}`);
  }
  const done = () => { for (const x of c.started) x.onended?.(); }; // 앞 소리가 끝남 (소리 수 상한에 걸리지 않게)
  done(); c.currentTime += 1; let from = c.started.length; a.play('sleep');
  const down = oscFreqs(c, from).filter((_, i) => i % 2 === 0);
  assert.deepEqual(down, [784, 659, 523]);
  done(); c.currentTime += 1; from = c.started.length; a.play('morning');
  const up = oscFreqs(c, from).slice(0, 8).filter((_, i) => i % 2 === 0);
  assert.deepEqual(up, [523, 659, 784, 1046]);
});

test('대사 블립은 목소리 버스로 나감', () => {
  const a = make(), c = a.ctx, from = c.started.length;
  a.play('blip');
  const o = c.started[from];
  // 오실레이터 → 필터 → 게인 → 목소리 버스
  assert.ok(o.outs[0].outs[0].outs.includes(a.voiceBus), '목소리 버스');
});

test('음악 낮추기: 소리 장치가 멈춘 동안에는 타이머를 다시 걸지 않고, 다시 켜지면 이어서 계산', async () => {
  // 준비
  const a = make(), c = a.ctx;
  a.duck(-5, 0.6);
  clearTimeout(a._duckTimer);
  // 실행: 멈춤 → 다시 계산
  c.state = 'suspended';
  a._duckTimer = undefined;
  a._applyDuck();
  // 확인
  assert.equal(a._duckTimer, undefined, '멈춘 동안 타이머 없음');
  assert.equal(a.duckDb, -5);
  a._resume();
  await Promise.resolve(); await Promise.resolve();
  assert.equal(c.state, 'running');
  assert.ok(a._duckTimer !== undefined, '켜지면 다시 검');
  clearTimeout(a._duckTimer);
});

test('엔진: 톱니파 둘(+1.5% 어긋남)·한 옥타브 아래 사각파, 저역통과 Q 1.2, 털털이 밝기도 흔듦, 밟으면 푸흣', () => {
  const a = make(), c = a.ctx;
  a.engineStart('tractor');
  const e = a._eng;
  assert.equal(e.o2.type, 'sawtooth');
  assert.ok(Math.abs(Math.pow(2, e.o2.detune.value / 1200) - 1.015) < 0.001, `어긋남 ${e.o2.detune.value}c`);
  assert.equal(e.sub.type, 'square');
  assert.equal(e.sub.frequency.value, e.o.frequency.value / 2);
  assert.equal(e.lp.Q.value, 1.2);
  assert.ok(e.lfo.outs.some((g) => g.gain.value === 150 && g.outs.includes(e.lp.frequency)), '밝기 ±150Hz');
  // 털털 빠르기가 매번 조금씩 다름 (rng 0.5 면 그대로, 1 이면 +0.5)
  a.rng = () => 1;
  c.currentTime = 0.5; a.engineSet(0, false);
  assert.ok(Math.abs(e.lfo.frequency.events.at(-1)[1] - 7.5) < 1e-9);
  // 0.3초 안에 빠르기 +0.2 넘게 → 노이즈 푸흣
  const n = c.started.length;
  c.currentTime = 0.9; a.engineSet(0.6, false);
  assert.ok(c.started.slice(n).some((s) => s.kind === 'buffer'), '푸흣');
  a.engineStop(true);
});

test('자전거 프리휠 째깍은 2.4kHz 삼각파 (사각파 아님)', () => {
  const a = make(), c = a.ctx;
  a.engineStart('bike');
  const n = c.started.length;
  c.currentTime = 1; a.engineSet(0.8, true);
  const ticks = c.started.slice(n).filter((s) => s.kind === 'osc');
  assert.ok(ticks.length >= 1);
  for (const t of ticks) { assert.equal(t.type, 'triangle'); assert.equal(t.frequency.events[0][1], 2400); }
  a.engineStop(true);
});

test('효과음 조리법은 Math.random 대신 a.rng 를 씀 (같은 씨앗이면 같은 소리)', () => {
  const src = readFileSync(new URL('../src/game/audio.js', import.meta.url), 'utf8');
  const body = src.slice(src.indexOf('  tone('));
  assert.equal((body.match(/Math\.random/g) || []).length, 0);
});
