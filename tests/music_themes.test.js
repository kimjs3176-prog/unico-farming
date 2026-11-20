// 테마 음악: 악보 점검, 고르는 순서, 마디 경계에서만 바꿈, 두 번 돌고 쉼, 계절 변주, 크기 (src/game/music_themes.js · music.js)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MockAudioContext } from './lib/audio_mock.js';

const { THEMES, THEME_LEVEL, validateTheme, compileTheme, pickCue, nextNight, variantFor, BARS } = await import('../src/game/music_themes.js');
const { Music, PASSES, TAIL_BARS, REST_MIN, REST_MAX } = await import('../src/game/music.js');
const { Audio } = await import('../src/game/audio.js');
const LV = JSON.parse(readFileSync(new URL('./fixtures/music_levels.json', import.meta.url), 'utf8'));

/** 낮 음악 목표 (scripts/audio-levels.mjs 와 같은 기준): 가장 큰 50ms 구간 -27±2.5dB, 평균 -33dB 근처 */
const MUSIC_ST50 = -27, ST50_TOL = 2.5, MUSIC_RMS_MIN = -38, MUSIC_RMS_MAX = -31;
/** 환경음 바닥 소리 목표 (평균, dBFS) */
const BED_RMS = [-40, -36];

function themed(st) {
  globalThis.window = { AudioContext: MockAudioContext };
  const a = new Audio(); a._ctx();
  const m = new Music(a, { themes: true });
  m.state = () => st;
  return { a, m };
}

test('테마 넷(낮·밤·집·미니게임)은 16마디·마디마다 4박·음역 17반음 안·대부분 이웃 음으로 이어짐', () => {
  assert.deepEqual(Object.keys(THEMES).sort(), ['farm_day', 'home', 'minigame', 'night']);
  for (const [k, T] of Object.entries(THEMES)) {
    assert.deepEqual(validateTheme(T), [], k);
    assert.equal(compileTheme(T).eighths, BARS * 8, `${k} 8분음 칸`);
  }
  assert.equal(THEMES.farm_day.bpm, 84);
  assert.equal(THEMES.night.bpm, 66);
  assert.equal(THEMES.home.bpm, 72);
  assert.equal(THEMES.minigame.bpm, 120);
  assert.equal(THEMES.minigame.perc, 'drums');
});

test("가락은 A A' B A 꼴: 마지막 4마디의 앞 3마디는 앞부분(1~4 또는 5~8마디)의 앞 3마디와 같음", () => {
  for (const [k, T] of Object.entries(THEMES)) {
    const bars = compileTheme(T).bars.map((b) => JSON.stringify(b.notes));
    const last = bars.slice(12, 15).join('|');
    assert.ok(last === bars.slice(0, 3).join('|') || last === bars.slice(4, 7).join('|'), `${k}: 돌아오는 A 없음`);
    assert.notEqual(bars.slice(8, 11).join('|'), bars.slice(0, 3).join('|'), `${k}: B 가 A 와 같음`);
  }
});

test('고르는 순서: 미니게임 > 집 안 > 밤 > 낮', () => {
  assert.equal(pickCue({ minigame: true, inside: true, night: true }), 'minigame');
  assert.equal(pickCue({ inside: true, night: true }), 'home');
  assert.equal(pickCue({ night: true }), 'night');
  assert.equal(pickCue({}), 'farm_day');
});

test('밤 판정은 두 문턱(0.3 / 0.42): 해 질 녘에 밤·낮이 오락가락하지 않음', () => {
  assert.equal(nextNight(false, 0.35), false);
  assert.equal(nextNight(false, 0.29), true);
  assert.equal(nextNight(true, 0.4), true, '밤이면 0.42 넘을 때까지 밤');
  assert.equal(nextNight(true, 0.43), false);
});

test('계절 변주: 봄 칼림바 · 여름 마림바+손북 · 가을 플루트(한 옥타브 아래, 78bpm) · 겨울 종(76bpm, 셰이커 없음)', () => {
  assert.equal(variantFor('farm_day', { season: 'spring' }).patch, 'kalimba');
  const su = variantFor('farm_day', { season: 'summer' });
  assert.equal(su.patch, 'marimba'); assert.equal(su.handDrum, true);
  const au = variantFor('farm_day', { season: 'autumn' });
  assert.equal(au.patch, 'flute'); assert.equal(au.oct, -12); assert.equal(au.bpm, 78);
  const wi = variantFor('farm_day', { season: 'winter' });
  assert.equal(wi.patch, 'bell'); assert.equal(wi.bpm, 76); assert.equal(wi.shaker, false);
  // 비: 셰이커 없음, 패드 어둡게 · 축제: 손북 + 실로폰 겹침
  const r = variantFor('farm_day', { rain: true });
  assert.equal(r.shaker, false); assert.ok(r.padLp <= 800, `패드 ${r.padLp}`);
  const f = variantFor('farm_day', { festival: true });
  assert.equal(f.handDrum, true); assert.equal(f.glock, true);
  // 계절은 낮 농장 테마만 바꿈
  assert.equal(variantFor('home', { season: 'winter' }).patch, 'musicbox');
});

test('테마는 마디 첫 박에서만 바뀜: 마디 가운데 상태가 바뀌어도 그 마디는 그대로 끝냄', () => {
  // 준비: 낮 테마 첫 마디 3칸 진행
  const st = { night: false };
  const { m } = themed(st);
  for (let i = 0; i < 3; i++) m.tick(0, i * 0.36);
  assert.equal(m.cue, 'farm_day');
  // 실행: 마디 가운데에 미니게임 시작
  st.minigame = true;
  for (let i = 3; i < 8; i++) { m.tick(0, i * 0.36); assert.equal(m.cue, 'farm_day', `칸 ${i}`); }
  m.tick(0, 8 * 0.36);
  // 확인: 다음 마디 첫 칸에서 바뀌고 첫 마디부터
  assert.equal(m.cue, 'minigame');
  assert.equal(m.bar, 0);
  assert.equal(m.var.bpm, 120);
});

test('바깥 테마는 두 번 돈 뒤 패드 꼬리 4마디 → 15~40초 쉼 → 처음부터, 집 안은 쉬지 않음', () => {
  // 준비
  const { m } = themed({});
  let t = 0;
  const bar = () => { for (let i = 0; i < 8; i++) { m.tick(0, t); t += m.eighth(); } };
  // 실행: 두 번(32마디)
  for (let i = 0; i < BARS * PASSES; i++) bar();
  assert.equal(m.phase, 'play');
  bar();
  assert.equal(m.phase, 'tail');
  for (let i = 1; i < TAIL_BARS; i++) bar();
  bar();
  // 확인: 쉼
  assert.equal(m.phase, 'rest');
  const len = m.restUntil - t + m.eighth() * 8;
  assert.ok(len >= REST_MIN - 0.01 && len <= REST_MAX + 3, `쉼 ${len}초`);
  // 쉬는 동안 집에 들어가면 바로 오르골
  m.state = () => ({ inside: true });
  bar();
  assert.equal(m.cue, 'home'); assert.equal(m.phase, 'play');
  for (let i = 0; i < BARS * 3; i++) bar();
  assert.equal(m.phase, 'play', '집 안은 쉬지 않음');
});

test('쉬는 동안 낮 → 밤으로 바뀌면 쉼을 이어 가고, 쉼이 끝나면 밤 테마 첫 마디부터', () => {
  const { m } = themed({});
  m.cue = 'farm_day'; m.phase = 'rest'; m.restUntil = 10; m.e8 = 0;
  m.state = () => ({ night: true });
  m.barStart(5, { night: true });
  assert.equal(m.cue, 'night'); assert.equal(m.phase, 'rest');
  m.barStart(11, { night: true });
  assert.equal(m.phase, 'play'); assert.equal(m.bar, 0);
});

test('테마 연주는 음악 버스로만 나가고, 비 오는 날은 셰이커 없이 가락이 줄어듦', () => {
  const count = (st) => {
    const { a, m } = themed(st);
    const c = a.ctx;
    let t = 0;
    for (let i = 0; i < 8 * 16; i++) { m.tick(0, t); t += m.eighth(); }
    return { n: c.started.length, bufs: c.started.filter((s) => s.kind === 'buffer').length };
  };
  const dry = count({}), wet = count({ rain: true });
  assert.ok(dry.bufs > 0, '셰이커');
  assert.equal(wet.bufs, 0, '비: 셰이커 없음');
  assert.ok(wet.n < dry.n, `비 ${wet.n} < 맑음 ${dry.n}`);
});

test('잰 크기(fixtures/music_levels.json): 모든 테마·변주가 음악 목표 안, 바닥 환경음은 -40~-36dB', () => {
  assert.deepEqual(LV.level, THEME_LEVEL, 'THEME_LEVEL 을 바꿨으면 node tests/lib/music_levels.mjs 로 다시 재세요');
  for (const [k, v] of Object.entries(LV.themes)) {
    assert.ok(Math.abs(v.st50 - MUSIC_ST50) <= ST50_TOL, `${k}: 가장 큰 구간 ${v.st50}`);
    assert.ok(v.rms >= MUSIC_RMS_MIN && v.rms <= MUSIC_RMS_MAX, `${k}: 평균 ${v.rms}`);
    assert.ok(v.peak <= -1, `${k}: 봉우리 ${v.peak}`);
  }
  for (const k of ['water', 'roof']) assert.ok(LV.amb[k].rms >= BED_RMS[0] && LV.amb[k].rms <= BED_RMS[1], `${k}: ${LV.amb[k].rms}`);
});

test('도트 판(테마를 켜지 않은 Music)은 예전 음악 그대로: setScene 이 0.35 문턱, 마디 상태를 쓰지 않음', () => {
  const m = new Music({});
  m.setScene({ daylight: 0.34, kind: 'clear', precip: 0, wind: 0.1 });
  assert.equal(m.mood, 'night');
  assert.equal(m.themed, false);
  assert.equal(m.cue, null);
});
