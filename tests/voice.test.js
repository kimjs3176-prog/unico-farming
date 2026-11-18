// 주민 말소리 (src/game/voice.js): 종마다 다른 목소리, 같은 글자는 늘 같은 소리, 겹치지 않음, 소리 설정을 따름
import test from 'node:test';
import assert from 'node:assert/strict';

const { voiceParams, voice, greet, lineShape, holdDuck, GREETS, CHO_STEP, JUNG_VOWEL, VOICE_PEAK } = await import('../src/game/voice.js');
const { SPECIES, SPECIES_IDS, VOICE_UNICO } = await import('../src/game/species.js');

test('종마다 말소리가 있고 서로 다름: 곰은 낮고 느리게, 토끼는 높고 빠르게', () => {
  const f0 = new Set();
  for (const id of SPECIES_IDS) {
    const v = SPECIES[id].voice;
    assert.ok(v && v.f0 > 100 && v.f0 < 1200, `${id} 기준 음`);
    assert.ok(GREETS[v.greet], `${id} 첫인사 소리 '${v.greet}'`);
    f0.add(v.f0);
  }
  assert.equal(f0.size, SPECIES_IDS.length, '기준 음이 모두 다름');
  const bear = SPECIES.bear.voice, rabbit = SPECIES.rabbit.voice;
  assert.ok(bear.f0 < 300 && bear.cps < 38 && bear.sub, '곰: 낮고 느리고 아래 옥타브');
  assert.ok(rabbit.f0 > 900 && rabbit.cps > 38 && rabbit.dur <= 0.03, '토끼: 높고 빠르고 짧게');
  assert.ok(VOICE_UNICO.bell && VOICE_UNICO.f0 === 880, '유니코는 종소리');
});

test('같은 글자는 늘 같은 소리 (초성 → 음 높이, 중성 → 울림, 받침 → 짧게)', () => {
  for (const id of SPECIES_IDS) {
    const v = SPECIES[id].voice;
    for (const ch of '안녕하세요반가워') assert.deepEqual(voiceParams(v, ch), voiceParams(v, ch), `${id} '${ch}'`);
  }
  const fox = SPECIES.fox.voice;
  const a = voiceParams(fox, '가'), i = voiceParams(fox, '기'), o = voiceParams(fox, '고');
  assert.ok(a.f1 > i.f1 && i.f2 > a.f2, 'ㅏ 는 F1 높고 ㅣ 는 F2 높음');
  assert.ok(o.f2 < a.f2, 'ㅗ 는 F2 낮음');
  assert.equal(a.f0, i.f0, '초성이 같으면 음 높이 같음');
  assert.ok(voiceParams(fox, '각').dur < a.dur, '받침이 있으면 짧게');
  assert.equal(voiceParams(fox, '사').onset, 'noise', 'ㅅ 은 바람 소리로 시작');
  assert.equal(voiceParams(fox, '바').onset, 'click', 'ㅂ 은 톡 하고 시작');
  assert.equal(voiceParams(fox, '마').onset, null);
  assert.equal(CHO_STEP.length, 19); assert.equal(JUNG_VOWEL.length, 21);
  assert.ok(CHO_STEP.every((s) => Math.abs(s) <= 3), '초성 음 높이는 ±3 반음 안');
  // 모음 울림은 종의 fs 배율
  assert.equal(voiceParams(SPECIES.bear.voice, '가').f1, Math.round(800 * SPECIES.bear.voice.fs));
});

test('문장 모양: 물음표는 끝 음절을 올리고, 느낌표는 크게, 고양이는 끝을 내림, 문장부호·이모지·띄어쓰기는 소리 없음', () => {
  const v = SPECIES.puppy.voice;
  const plain = voiceParams(v, '요'), up = voiceParams(v, '요', { last: true, q: true });
  assert.ok(Math.abs(up.f0 / plain.f0 - Math.pow(2, 4 / 12)) < 0.01, '+4 반음');
  assert.ok(voiceParams(v, '요', { ex: true }).gain > plain.gain);
  assert.equal(voiceParams(SPECIES.cat.voice, '옹', { last: true }).glide, -120);
  assert.equal(voiceParams(SPECIES.cat.voice, '옹').glide, 0);
  for (const ch of [' ', '!', '?', '🙏', '🎣']) assert.equal(voiceParams(v, ch), null, `'${ch}'`);
  assert.ok(voiceParams(v, '…').pause > 0 && voiceParams(v, ',').pause > 0, '쉼');
  assert.deepEqual(voiceParams(v, '7'), voiceParams(v, '7'), '숫자도 늘 같은 소리');
  const sh = lineShape([...'정말 고마워?! 🙏']);
  assert.equal(sh.lastIdx, 5); assert.ok(sh.q && sh.ex);
  assert.ok(!lineShape([...'그래? 좋아']).q, '물음표가 끝이 아니면 끝을 올리지 않음');
  // 음절 길이 40~70ms (토끼만 30ms)
  for (const id of SPECIES_IDS) for (const ch of '가각') { const d = voiceParams(SPECIES[id].voice, ch).dur; assert.ok(d >= 0.028 && d <= 0.07, `${id} ${d}`); }
});

/** 아주 작은 가짜 WebAudio (만든 소리 수·시각만 셈) */
function fakeAudio({ enabled = true } = {}) {
  const made = [];
  const param = () => ({ value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {}, setTargetAtTime(v) { this.target = v; }, cancelScheduledValues() {} });
  const node = (kind) => { const n = { kind, gain: param(), frequency: param(), Q: param(), connect: (x) => x, start(t) { made.push({ kind, t }); }, stop() {} }; return n; };
  const ctx = { currentTime: 10, state: 'running', createGain: () => node('gain'), createOscillator: () => node('osc'), createBiquadFilter: () => node('filter'), createBufferSource: () => node('noise') };
  return { made, a: { ctx, enabled, sfx: node('bus'), music: node('music'), musicOn: true, volume: { music: 0.5 }, noiseBuf: {} } };
}

test('한 번에 한 소리: 같은 순간에 여러 글자가 나와도 겹치지 않고 이어 붙이거나 버림, 소리 끄면 아무것도 안 냄', () => {
  const { a, made } = fakeAudio();
  const v = SPECIES.rabbit.voice;
  for (const ch of '가나다라마바사아') voice(a, v, ch);
  const starts = made.filter((m) => m.kind === 'osc').map((m) => m.t);
  assert.ok(starts.length >= 1 && starts.length <= 3, `80ms 안에 들어오는 것만 (${starts.length})`);
  for (let k = 1; k < starts.length; k++) assert.ok(starts[k] - starts[k - 1] >= 0.02, '앞 소리 끝난 뒤에');
  assert.ok(a._voiceUntil > a.ctx.currentTime);
  const off = fakeAudio({ enabled: false });
  voice(off.a, v, '가'); greet(off.a, 'yip');
  assert.equal(off.made.length, 0, '소리 꺼짐');
  assert.ok(VOICE_PEAK > 0.03 && VOICE_PEAK < 0.12, '말소리 크기는 예전(0.035)보다 들리되 음악을 넘지 않음');
});

test('대화 동안 음악 줄이기: holdDuck API 가 있으면 그것, 없으면 음악 버스를 -3dB, 풀면 음악 설정값으로 (음악 끔이면 0)', () => {
  const calls = [];
  holdDuck({ holdDuck: (...x) => calls.push(x) }, true);
  assert.deepEqual(calls[0].slice(0, 2), ['dialogue', true]);
  const { a } = fakeAudio();
  holdDuck(a, true);
  assert.ok(Math.abs(a.music.gain.target - 0.5 * Math.pow(10, -3 / 20)) < 1e-6);
  holdDuck(a, false);
  assert.equal(a.music.gain.target, 0.5);
  a.musicOn = false; holdDuck(a, false);
  assert.equal(a.music.gain.target, 0, '음악 끔 설정을 따름');
});
