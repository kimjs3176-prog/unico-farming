// 가짜 컨텍스트로 이름마다 어림 크기(dB)를 냄: scripts/audio-levels.mjs 가 잰 값과 함께 남기고,
// tests/audio_mix.test.js 가 지금 값과 비교해 조리법·배율이 바뀌었는데 다시 재지 않았는지 찾음
import { MockAudioContext, estimateDb } from './audio_mock.js';

export async function mockLevels() {
  const { Audio, MIX_DB } = await import('../../src/game/audio.js');
  const rnd = Math.random, win = globalThis.window;
  const out = {};
  try {
    globalThis.window = { AudioContext: MockAudioContext };
    for (const n of Object.keys(MIX_DB)) {
      let seed = 7;
      Math.random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
      const a = new Audio();
      a.rng = () => 0.5; // 변주 없이
      a._ctx();
      const c = a.ctx, from = c.started.length;
      a.play(n);
      out[n] = +estimateDb(c, from).toFixed(1);
    }
  } finally { Math.random = rnd; globalThis.window = win; }
  return out;
}
