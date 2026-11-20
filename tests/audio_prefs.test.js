// 소리 설정 저장·복원 ('unico.audio'): 깨진 값·없는 저장소, 끔 복원이 환경음까지 막는지 (src/game/audio.js)
import test from 'node:test';
import assert from 'node:assert/strict';
import { MockAudioContext } from './lib/audio_mock.js';

const { Audio, parseAudioPrefs, AUDIO_PREF_KEY, DEFAULT_VOLUME } = await import('../src/game/audio.js');

/** 가짜 저장소 (throws: 읽기·쓰기에서 오류) */
function store(init = {}, throws = false) {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => { if (throws) throw new Error('막힘'); return m.has(k) ? m.get(k) : null; }, setItem: (k, v) => { if (throws) throw new Error('막힘'); m.set(k, String(v)); }, m };
}

test('저장된 값이 없거나 깨졌으면 기본값 (모두 켬, 기본 크기)', () => {
  for (const raw of [null, '', '{', 'null', '42', '"x"', '[]']) {
    const p = parseAudioPrefs(raw);
    assert.equal(p.enabled, true, String(raw)); assert.equal(p.musicOn, true);
    assert.deepEqual(p.volume, DEFAULT_VOLUME);
  }
});

test('크기는 0~1 로 묶고 숫자가 아니면 그 칸만 기본값', () => {
  const p = parseAudioPrefs(JSON.stringify({ enabled: false, musicOn: false, volume: { master: 3, music: -1, sfx: 'a', amb: 0.25 } }));
  assert.equal(p.enabled, false); assert.equal(p.musicOn, false);
  assert.deepEqual(p.volume, { master: 1, sfx: DEFAULT_VOLUME.sfx, music: 0, amb: 0.25 });
  assert.equal(parseAudioPrefs('{"volume":{"music":null}}').volume.music, DEFAULT_VOLUME.music);
});

test('저장 → 다시 불러오면 같은 상태, 저장소가 막혀도 오류 없이 기본값', () => {
  // 준비
  const s = store();
  const a = new Audio();
  a.enabled = true; a.musicOn = false; a.volume = { master: 0.4, sfx: 0.7, music: 0.2, amb: 0.1 };
  // 실행
  assert.equal(a.save(s), true);
  const b = new Audio(); b.load(s);
  // 확인
  assert.equal(b.mode, 'sfx');
  assert.deepEqual(b.volume, a.volume);
  assert.ok(s.m.has(AUDIO_PREF_KEY));
  const c = new Audio();
  assert.doesNotThrow(() => c.load(store({}, true)));
  assert.equal(c.mode, 'all');
  assert.equal(c.save(store({}, true)), false);
});

test("끔으로 저장했으면 소리 장치를 만들 때 마스터가 0 (비·바람 환경음도 조용), 음악만 끔이면 음악 게인 0", () => {
  globalThis.window = { AudioContext: MockAudioContext };
  const a = new Audio(); a.enabled = false; a._ctx();
  assert.equal(a.master.gain.value, 0);
  const b = new Audio(); b.musicOn = false; b._ctx();
  assert.equal(b.music.gain.value, 0);
  assert.equal(b.master.gain.value, b.volume.master);
});

test('opts.prefs 가 있을 때만 생성자에서 불러오고, 순환·세 단추는 저장함 (도트 판 new Audio() 는 저장 안 함)', () => {
  const s = store({ [AUDIO_PREF_KEY]: JSON.stringify({ enabled: false, musicOn: false }) });
  const keep = globalThis.localStorage;
  globalThis.localStorage = s;
  try {
    const plain = new Audio();
    assert.equal(plain.mode, 'all', '도트 판은 저장값을 읽지 않음');
    const a = new Audio({ prefs: true });
    assert.equal(a.mode, 'off');
    assert.equal(a.cycle(), 'all');
    assert.equal(JSON.parse(s.m.get(AUDIO_PREF_KEY)).enabled, true);
    a.setMode('sfx');
    assert.equal(JSON.parse(s.m.get(AUDIO_PREF_KEY)).musicOn, false);
  } finally { globalThis.localStorage = keep; }
});

test('크기를 바꾸고 apply 하면 효과음·목소리·주변 소리 게인도 따라감', () => {
  globalThis.window = { AudioContext: MockAudioContext };
  const a = new Audio(); a._ctx();
  a.volume.sfx = 0.3; a.volume.amb = 0.2; a.apply();
  assert.equal(a.sfx.gain.events.at(-1)[1], 0.3);
  assert.equal(a.voiceBus.gain.events.at(-1)[1], 0.3);
  assert.equal(a.amb.gain.events.at(-1)[1], 0.2);
});
