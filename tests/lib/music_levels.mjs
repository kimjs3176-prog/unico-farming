// 테마 음악·환경음 크기 재기 (선택 점검): Chromium 의 OfflineAudioContext 로 실제 믹서(압축기 뒤)를 지나 그림
//   node tests/lib/music_levels.mjs            재고 tests/fixtures/music_levels.json 갱신
//   node tests/lib/music_levels.mjs --wav DIR  테마마다 WAV 로 저장 (들어 보기용)
// 무작위는 고정 씨앗. Playwright 가 없으면 건너뜀
import http from 'node:http';
import { writeFileSync, existsSync, createReadStream, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const ROOT = new URL('../..', import.meta.url).pathname;
const SRC = join(ROOT, 'src/game');
const WAV_DIR = process.argv.includes('--wav') ? process.argv[process.argv.indexOf('--wav') + 1] : null;

let chromium = null;
try { chromium = (await import('playwright')).chromium; } catch { try { chromium = createRequire(import.meta.url)('playwright').chromium; } catch { /* 없음 */ } }
if (!chromium) { console.log('music_levels: playwright 가 없어 건너뜀'); process.exit(0); }

const srv = http.createServer((req, res) => {
  const u = req.url.split('?')[0];
  if (u === '/') { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end('<!doctype html><html><body></body></html>'); }
  const f = join(SRC, u);
  if (!f.startsWith(SRC) || !existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': 'text/javascript' }); createReadStream(f).pipe(res);
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('페이지 오류', e.message));
await page.goto(`http://127.0.0.1:${srv.address().port}/`);

const out = await page.evaluate(async (wantWav) => {
  const { Audio } = await import('/audio.js');
  const { Music } = await import('/music.js');
  const { THEME_LEVEL } = await import('/music_themes.js');
  const { Ambience } = await import('/ambience.js');
  const SR = 44100;
  let seed = 7;
  Math.random = () => { let t = (seed = (seed + 0x6d2b79f5) >>> 0); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const mk = (secs) => {
    window.AudioContext = function () { return new OfflineAudioContext(2, SR * secs, SR); };
    const a = new Audio(); a._ctx(); a.rng = Math.random;
    Object.defineProperty(a.ctx, 'state', { get: () => 'running' });
    return a;
  };
  const stats = (buf) => {
    const L = buf.getChannelData(0), R = buf.getChannelData(1);
    const db = (x) => +(20 * Math.log10(Math.max(x, 1e-9))).toFixed(1);
    const W = Math.round(SR * 0.05), arr = [];
    for (let i = 0; i + W <= L.length; i += Math.round(W / 2)) { let w = 0; for (let j = i; j < i + W; j++) { const v = (L[j] + R[j]) / 2; w += v * v; } arr.push(Math.sqrt(w / W)); }
    arr.sort((x, y) => x - y);
    let peak = 0, rms = 0;
    for (let i = 0; i < L.length; i++) { peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i])); rms += ((L[i] + R[i]) / 2) ** 2; }
    return { st50: db(arr[arr.length - 1]), rms: db(Math.sqrt(rms / L.length)), peak: db(peak) };
  };
  const res = { themes: {}, amb: {}, wav: {} };
  const keep = (n, b) => { if (wantWav) res.wav[n] = Array.from(b.getChannelData(0)); };
  // 테마: 첫 16마디 중 앞 22초
  const cases = [
    ['farm_day', {}], ['farm_spring', { season: 'spring' }], ['farm_summer', { season: 'summer' }], ['farm_autumn', { season: 'autumn' }],
    ['farm_winter', { season: 'winter' }], ['farm_rain', { rain: true }], ['farm_festival', { festival: true }],
    ['night', { night: true }], ['home', { inside: true }], ['minigame', { minigame: true }],
  ];
  for (const [name, st] of cases) {
    seed = 7;
    const secs = 22, a = mk(secs + 2), m = new Music(a, { themes: true });
    m.state = () => st;
    let t = 0.05;
    while (t < secs) { m.tick(t, t); t += m.eighth(); }
    const b = await a.ctx.startRendering();
    res.themes[name] = stats(b); keep(`theme_${name}`, b);
  }
  // 환경음: 물가에 섰을 때 바닥 소리, 지붕 빗소리(강수 1), 개구리 한 묶음, 매미 한 번
  const st0 = { x: 0, z: 0, yaw: 0, inside: false, season: 'spring', low: false, rain: false, night: false };
  {
    seed = 7; const a = mk(6), am = new Ambience(a, { layout: { lake: { x: 0, z: 6, r: 6 } } });
    am.nextPlop = 1e9; am.update(1, st0);
    const b = await a.ctx.startRendering(); res.amb.water = stats(b); keep('amb_water', b);
  }
  {
    seed = 7; const a = mk(6), am = new Ambience(a, {});
    am.update(1, { ...st0, inside: true, rain: true, rainLevel: 0.09 });
    const b = await a.ctx.startRendering(); res.amb.roof = stats(b); keep('amb_roof', b);
  }
  {
    seed = 7; const a = mk(3), am = new Ambience(a, {}), g = am._spot(3, 0, st0);
    am.frog(g, 5); const b = await a.ctx.startRendering(); res.amb.frog = stats(b); keep('amb_frog', b);
  }
  {
    seed = 7; const a = mk(6), am = new Ambience(a, {}), g = am._spot(3, 0, st0);
    am.cicada(g, 5); const b = await a.ctx.startRendering(); res.amb.cicada = stats(b); keep('amb_cicada', b);
  }
  res.level = THEME_LEVEL;
  return res;
}, !!WAV_DIR);
await browser.close(); srv.close();

for (const [k, v] of Object.entries(out.themes)) console.log(k.padEnd(14), JSON.stringify(v));
for (const [k, v] of Object.entries(out.amb)) console.log(('amb ' + k).padEnd(14), JSON.stringify(v));
if (WAV_DIR) {
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
writeFileSync(join(ROOT, 'tests/fixtures/music_levels.json'), JSON.stringify({
  note: 'node tests/lib/music_levels.mjs 로 잰 값 (압축기 뒤 dBFS). level = 잴 때의 THEME_LEVEL (바꾸면 다시 재기)',
  level: out.level, themes: out.themes, amb: out.amb,
}, null, 1) + '\n');
console.log('tests/fixtures/music_levels.json 갱신');
