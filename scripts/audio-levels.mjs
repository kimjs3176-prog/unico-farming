// 효과음·음악 크기 재기 (선택 점검): Chromium 의 OfflineAudioContext 로 실제 믹서를 지나 그림. 무작위는 고정 씨앗
// 효과음은 압축기·리미터 앞(마스터 바로 뒤)에서 가장 큰 50ms 구간(dBFS)을 재고 목표(MIX_DB + PRE_DB)와 비교
// (압축기는 비선형이라 뒤에서 맞추면 소리마다 깎이는 양이 달라 음악이 출렁임)
//   node scripts/audio-levels.mjs            재고 tests/fixtures/audio_levels.json 갱신
//   node scripts/audio-levels.mjs --write    MIX·STEP_MIX 배율을 고쳐 씀 (그다음 한 번 더 재기)
//   node scripts/audio-levels.mjs --wav DIR  발소리·새 소리를 WAV 로 저장 (들어 보기용, 압축기 뒤)
// Playwright 가 없으면 건너뜀
import http from 'node:http';
import { readFileSync, writeFileSync, existsSync, createReadStream, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';

const ROOT = new URL('..', import.meta.url).pathname;
const SRC = join(ROOT, 'src/game');
const WRITE = process.argv.includes('--write');
const WAV_DIR = process.argv.includes('--wav') ? process.argv[process.argv.indexOf('--wav') + 1] : null;

async function loadChromium() {
  try { return (await import('playwright')).chromium; } catch { /* 다음 */ }
  try { return createRequire(import.meta.url)('playwright').chromium; } catch { /* 다음 */ }
  try { const g = execSync('npm root -g', { encoding: 'utf8' }).trim(); return createRequire(join(g, 'x.js'))('playwright').chromium; } catch { return null; }
}

const chromium = await loadChromium();
if (!chromium) { console.log('audio-levels: playwright 가 없어 건너뜀'); process.exit(0); }

const srv = http.createServer((req, res) => {
  const u = req.url.split('?')[0];
  if (u === '/') { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end('<!doctype html><html><body></body></html>'); }
  const f = join(SRC, u);
  if (!f.startsWith(SRC) || !existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': 'text/javascript' }); createReadStream(f).pipe(res);
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const port = srv.address().port;
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('페이지 오류', e.message));
await page.goto(`http://127.0.0.1:${port}/`);

const out = await page.evaluate(async (wantWav) => {
  const { Audio, MIX_DB, STEP_KINDS } = await import('/audio.js');
  const { Music } = await import('/music.js');
  const SR = 44100;
  // 고정 씨앗 무작위 (같은 결과)
  let seed = 7;
  // mulberry32 (단순 LCG 는 고역 노이즈에 무늬가 생겨 봉우리가 부풀어 보임)
  Math.random = () => { let t = (seed = (seed + 0x6d2b79f5) >>> 0); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const mk = (secs, hp = false, dry = false) => {
    window.AudioContext = function () {
      const c = new OfflineAudioContext(2, SR * secs, SR);
      if (hp) { // 폰 스피커 흉내: 300Hz 아래를 깎음
        const real = c.destination, f1 = c.createBiquadFilter(), f2 = c.createBiquadFilter();
        f1.type = f2.type = 'highpass'; f1.frequency.value = f2.frequency.value = 300;
        f1.connect(f2).connect(real);
        Object.defineProperty(c, 'destination', { get: () => f1 });
      }
      return c;
    };
    const a = new Audio(); a._ctx();
    if (dry) { a.master.disconnect(); a.master.connect(a.ctx.destination); } // 압축기·리미터 앞
    return a;
  };
  const stats = (buf) => {
    const L = buf.getChannelData(0), R = buf.getChannelData(1);
    const db = (x) => +(20 * Math.log10(Math.max(x, 1e-9))).toFixed(1);
    const win = (secs) => { const W = Math.round(SR * secs), arr = []; for (let i = 0; i + W <= L.length; i += Math.round(W / 2)) { let w = 0; for (let j = i; j < i + W; j++) { const v = (L[j] + R[j]) / 2; w += v * v; } arr.push(Math.sqrt(w / W)); } return arr.sort((x, y) => x - y); };
    let peak = 0; for (let i = 0; i < L.length; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
    const a50 = win(0.05), a400 = win(0.4);
    let rms = 0; for (let i = 0; i < L.length; i++) rms += ((L[i] + R[i]) / 2) ** 2;
    return { st50: db(a50[a50.length - 1]), med400: db(a400[Math.floor(a400.length / 2)]), rms: db(Math.sqrt(rms / L.length)), peak: db(peak) };
  };
  const res = { sfx: {}, post: {}, hp: {}, step: {}, misc: {}, wav: {} };
  const keep = (name, buf) => { if (wantWav) res.wav[name] = Array.from(buf.getChannelData(0)); };
  for (const n of Object.keys(MIX_DB)) {
    const secs = n === 'thunder' || n === 'levelup' ? 3.5 : 2;
    seed = 7; let a = mk(secs, false, true); a.play(n); res.sfx[n] = stats(await a.ctx.startRendering());
    seed = 7; a = mk(secs); a.play(n); let b = await a.ctx.startRendering(); res.post[n] = stats(b).st50;
    if (['eat', 'scatter', 'sleep', 'morning', 'blip', 'catch', 'combo'].includes(n)) keep(n, b);
    seed = 7; a = mk(secs, true, true); a.play(n); res.hp[n] = stats(await a.ctx.startRendering()).st50;
  }
  for (const k of STEP_KINDS) {
    seed = 7; let a = mk(1, false, true);
    Object.defineProperty(a.ctx, 'state', { get: () => 'running' });
    a.step(k, 1); res.step[k] = stats(await a.ctx.startRendering()).st50;
    // 들어 보기: 네 걸음 (압축기 뒤), 흙은 젖은 땅도
    if (wantWav) {
      for (const wet of k === 'dirt' ? [false, true] : [false]) {
        seed = 7; a = mk(1.6); Object.defineProperty(a.ctx, 'state', { get: () => 'running' });
        const c = a.ctx;
        for (let i = 0; i < 4; i++) { const at = i * 0.35; Object.defineProperty(c, 'currentTime', { configurable: true, get: () => at }); a.step(k, 1, 1, { left: i % 2 === 0, wet }); }
        keep(wet ? `step_${k}_wet` : `step_${k}`, await c.startRendering());
      }
    }
  }
  // 압축기·리미터의 자동 보정 이득: 조용한 1kHz 사인(-40dBFS)이 지나며 커지는 양 (= -PRE_DB 이어야 함)
  {
    const lvl = async (dry) => {
      const a = mk(1, false, dry), c = a.ctx, o = c.createOscillator(), g = c.createGain();
      o.frequency.value = 1000; g.gain.value = 0.01 * Math.SQRT2; o.connect(g).connect(a.sfx); o.start();
      return stats(await c.startRendering()).med400;
    };
    res.misc.makeup = +((await lvl(false)) - (await lvl(true))).toFixed(1);
  }
  // 음악 출렁임: 음악 버스의 60Hz 사인을 저역통과로 읽고, 작은 소리를 잇달아 낼 때 얼마나 줄어드는지 (dB)
  {
    const lowLevel = async (name, every) => {
      seed = 7; const a = mk(2.4), c = a.ctx;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 120;
      const real = c.destination; lp.connect(real); a.master.disconnect();
      // 마스터 → 압축기 체인 다시 만들기 대신: 체인 끝(리미터)을 바꿔 끼움
      const comp = (o) => { const n = c.createDynamicsCompressor(); for (const k in o) if (n[k]) n[k].value = o[k]; return n; };
      a.master.connect(comp({ threshold: -18, knee: 6, ratio: 3, attack: 0.003, release: 0.25 })).connect(comp({ threshold: -3, knee: 0, ratio: 20, attack: 0.001, release: 0.1 })).connect(lp);
      const o = c.createOscillator(); o.frequency.value = 60; const g = c.createGain(); g.gain.value = 0.25; o.connect(g).connect(a.music); o.start();
      if (name) for (let t = 0.2; t < 2.3; t += every) { Object.defineProperty(c, 'currentTime', { configurable: true, get: () => t }); a._lastAt = {}; a.play(name); }
      const buf = await c.startRendering(), L = buf.getChannelData(0);
      let w = 0; const i0 = Math.round(SR * 0.8); for (let i = i0; i < L.length; i++) w += L[i] * L[i];
      return 10 * Math.log10(w / (L.length - i0));
    };
    const base = await lowLevel(null);
    for (const [n, e] of [['blip', 0.06], ['tap', 0.25], ['catch', 0.3]]) res.misc[`pump_${n}`] = +((await lowLevel(n, e)) - base).toFixed(1);
  }
  for (const night of [false, true]) {
    seed = 7; const a = mk(24); const m = new Music(a); const e = 60 / (night ? 66 : 84) / 2;
    for (let s = 0; s * e < 22; s++) m.playStep(s, s * e, night, e);
    res.misc[night ? 'music_night' : 'music_day'] = stats(await a.ctx.startRendering());
  }
  // 비: music.js 와 같은 루프와 게인 공식
  for (const p of [0.55, 1]) {
    seed = 7; const a = mk(6); const m = new Music(a); m.scene = { daylight: 1, kind: 'rain', precip: p, wind: 0.15 };
    const c = a.ctx; const s = c.createBufferSource(); s.buffer = a.noiseBuf; s.loop = true;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 0.6;
    const g = c.createGain(); g.gain.value = m.rainLevel(); s.connect(f).connect(g).connect(a.amb); s.start();
    res.misc[`rain_${p}`] = stats(await c.startRendering());
  }
  // 최악: 폭풍 비 + 천둥 + 레벨업 + 음악
  {
    seed = 7; const a = mk(4); const m = new Music(a); m.scene = { daylight: 1, kind: 'storm', precip: 1, wind: 0.9 };
    const c = a.ctx; const s = c.createBufferSource(); s.buffer = a.noiseBuf; s.loop = true;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 0.6;
    const g = c.createGain(); g.gain.value = m.rainLevel(); s.connect(f).connect(g).connect(a.amb); s.start();
    const e = 60 / 84 / 2; for (let k = 0; k * e < 3.5; k++) m.playStep(k, k * e, false, e);
    a.play('thunder'); a.play('levelup'); a.play('coin');
    res.misc.storm_peak = stats(await c.startRendering());
  }
  // 엔진: 트랙터 최고 속도 + 쟁기
  {
    seed = 7; const a = mk(2); Object.defineProperty(a.ctx, 'state', { get: () => 'running' });
    a.engineStart('tractor'); a._eng.setAt = -1; a.engineSet(1, true);
    res.misc.engine_full = stats(await a.ctx.startRendering());
  }
  return res;
}, !!WAV_DIR);
await browser.close(); srv.close();

const { MIX_DB, MIX, STEP_DB, STEP_MIX, PRE_DB } = await import(join(ROOT, 'src/game/audio.js'));
let bad = 0;
const next = {};
console.log(`압축기 보정 이득 ${out.misc.makeup}dB (PRE_DB ${PRE_DB} 이면 맞음)`);
console.log('이름        목표(앞)  잰값  봉우리  압축기 뒤  폰(300Hz)  차이');
for (const [n, t0] of Object.entries(MIX_DB)) {
  const target = t0 + PRE_DB, m = out.sfx[n].st50, d = +(m - target).toFixed(1);
  const flag = Math.abs(d) > 2 ? '  ← 벗어남' : '';
  if (flag) bad++;
  next[n] = +((MIX[n] ?? 1) * 10 ** (-d / 20)).toFixed(3);
  console.log(`${n.padEnd(10)} ${String(target).padStart(6)}  ${String(m).padStart(6)}  ${String(out.sfx[n].peak).padStart(6)}  ${String(out.post[n]).padStart(7)}  ${String(out.hp[n]).padStart(7)}   ${d > 0 ? '+' : ''}${d}${flag}`);
}
const nextStep = {};
console.log('\n발소리 (달리기)  목표(앞)   잰값');
for (const [k, t0] of Object.entries(STEP_DB)) {
  const target = t0 + PRE_DB, m = out.step[k], d = +(m - target).toFixed(1);
  if (Math.abs(d) > 2) bad++;
  nextStep[k] = +((STEP_MIX[k] ?? 1) * 10 ** (-d / 20)).toFixed(3);
  console.log(`${k.padEnd(10)} ${String(target).padStart(5)}  ${String(m).padStart(5)}${Math.abs(d) > 2 ? '  ← 벗어남' : ''}`);
}
for (const [k, v] of Object.entries(out.misc)) console.log(k.padEnd(12), JSON.stringify(v));
if (WAV_DIR) {
  // 16비트 모노 WAV
  mkdirSync(WAV_DIR, { recursive: true });
  for (const [name, data] of Object.entries(out.wav)) {
    const n = data.length, b = Buffer.alloc(44 + n * 2);
    b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
    b.writeUInt32LE(44100, 24); b.writeUInt32LE(88200, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
    for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, data[i])) * 32767), 44 + i * 2);
    writeFileSync(join(WAV_DIR, `${name}.wav`), b);
  }
  console.log(`WAV ${Object.keys(out.wav).length}개 → ${WAV_DIR}`);
}

if (WRITE) {
  const p = join(ROOT, 'src/game/audio.js');
  let s = readFileSync(p, 'utf8');
  const table = (name, obj) => {
    const items = Object.entries(obj).map(([k, v]) => `${k}: ${v}`), lines = [];
    for (let i = 0; i < items.length; i += 8) lines.push(`  ${items.slice(i, i + 8).join(', ')},`);
    s = s.replace(new RegExp(`export const ${name} = \\{[\\s\\S]*?\\n?\\};`), `export const ${name} = {\n${lines.join('\n')}\n};`);
  };
  table('MIX', next);
  table('STEP_MIX', nextStep);
  writeFileSync(p, s);
  console.log('\nMIX·STEP_MIX 를 고쳐 썼어요. 다시 재서 확인하세요.');
} else {
  // 잰 값과 그때의 가짜 컨텍스트 어림값을 함께 남김 (tests/audio_mix.test.js 가 비교)
  const { mockLevels } = await import(join(ROOT, 'tests/lib/audio_levels_mock.js'));
  const mock = await mockLevels();
  writeFileSync(join(ROOT, 'tests/fixtures/audio_levels.json'), JSON.stringify({
    note: 'scripts/audio-levels.mjs 로 잰 값 (dBFS). measured·peak·step = 압축기 앞 가장 큰 50ms·봉우리, post = 압축기 뒤, misc.pump_* = 음악이 줄어든 양(dB)',
    pre_db: PRE_DB,
    measured: Object.fromEntries(Object.keys(MIX_DB).map((n) => [n, out.sfx[n].st50])),
    peak: Object.fromEntries(Object.keys(MIX_DB).map((n) => [n, out.sfx[n].peak])),
    post: out.post, mock, step: out.step, misc: out.misc,
  }, null, 1) + '\n');
  console.log('\ntests/fixtures/audio_levels.json 갱신');
}
process.exit(bad ? 1 : 0);
