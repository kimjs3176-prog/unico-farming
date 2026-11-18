// 효과음·음악 크기 재기 (선택 점검): Chromium 의 OfflineAudioContext 로 실제 믹서(마스터·압축기·리미터)를 지나 그려
// 이름마다 가장 큰 50ms 구간(dBFS)을 재고 목표(MIX_DB)와 비교. 무작위는 고정 씨앗
//   node scripts/audio-levels.mjs            재기만
//   node scripts/audio-levels.mjs --write    MIX 배율을 고쳐 쓰고 tests/fixtures/audio_levels.json 갱신
// Playwright 가 없으면 건너뜀
import http from 'node:http';
import { readFileSync, writeFileSync, existsSync, createReadStream } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';

const ROOT = new URL('..', import.meta.url).pathname;
const SRC = join(ROOT, 'src/game');
const WRITE = process.argv.includes('--write');

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

const out = await page.evaluate(async () => {
  const { Audio, MIX_DB, STEP_KINDS } = await import('/audio.js');
  const { Music } = await import('/music.js');
  const SR = 44100;
  // 고정 씨앗 무작위 (같은 결과)
  let seed = 7;
  Math.random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const mk = (secs, hp = false) => {
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
    const a = new Audio(); a._ctx(); return a;
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
  const res = { sfx: {}, hp: {}, step: {}, misc: {} };
  for (const n of Object.keys(MIX_DB)) {
    const secs = n === 'thunder' || n === 'levelup' ? 3.5 : 2;
    seed = 7; let a = mk(secs); a.play(n); res.sfx[n] = stats(await a.ctx.startRendering());
    seed = 7; a = mk(secs, true); a.play(n); res.hp[n] = stats(await a.ctx.startRendering()).st50;
  }
  for (const k of STEP_KINDS) {
    seed = 7; const a = mk(1);
    Object.defineProperty(a.ctx, 'state', { get: () => 'running' });
    a.step(k, 1); res.step[k] = stats(await a.ctx.startRendering()).st50;
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
});
await browser.close(); srv.close();

const { MIX_DB, MIX, STEP_DB, STEP_MIX } = await import(join(ROOT, 'src/game/audio.js'));
let bad = 0;
const next = {};
console.log('이름        목표   잰값   폰(300Hz)  차이');
for (const [n, target] of Object.entries(MIX_DB)) {
  const m = out.sfx[n].st50, d = +(m - target).toFixed(1);
  const flag = Math.abs(d) > 2 ? '  ← 벗어남' : '';
  if (flag) bad++;
  next[n] = +((MIX[n] ?? 1) * 10 ** (-d / 20)).toFixed(3);
  console.log(`${n.padEnd(10)} ${String(target).padStart(5)}  ${String(m).padStart(5)}  ${String(out.hp[n]).padStart(7)}   ${d > 0 ? '+' : ''}${d}${flag}`);
}
const nextStep = {};
console.log('\n발소리 (달리기)  목표   잰값');
for (const [k, target] of Object.entries(STEP_DB)) {
  const m = out.step[k], d = +(m - target).toFixed(1);
  if (Math.abs(d) > 2) bad++;
  nextStep[k] = +((STEP_MIX[k] ?? 1) * 10 ** (-d / 20)).toFixed(3);
  console.log(`${k.padEnd(10)} ${String(target).padStart(5)}  ${String(m).padStart(5)}${Math.abs(d) > 2 ? '  ← 벗어남' : ''}`);
}
for (const [k, v] of Object.entries(out.misc)) console.log(k.padEnd(12), JSON.stringify(v));

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
  writeFileSync(join(ROOT, 'tests/fixtures/audio_levels.json'), JSON.stringify({ note: 'scripts/audio-levels.mjs 로 잰 값 (dBFS, 가장 큰 50ms)', measured: Object.fromEntries(Object.keys(MIX_DB).map((n) => [n, out.sfx[n].st50])), mock, step: out.step, misc: out.misc }, null, 1) + '\n');
  console.log('\ntests/fixtures/audio_levels.json 갱신');
}
process.exit(bad ? 1 : 0);
