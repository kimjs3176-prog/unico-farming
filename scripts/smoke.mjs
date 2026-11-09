// 브라우저 연기 시험: 빌드한 dist/ 를 띄워 실제 Chromium(소프트웨어 WebGL)으로 한 바퀴
//  1) ?autostart&quality=low 로 입장해 20초 동안 페이지 오류·console.error 없음
//  2) 게임 루프가 계속 돎 (frameNo 증가)
//  3) 첫 접속 인트로 컷신이 '건너뛰기' 를 누르면 5초 안에 풀림
//  4) 저장 → 새로 고침 → '저장된 농장을 불러왔어요' 알림 (저장이 살아남음)
// 실행: npm run build && npm i --no-save playwright && npx playwright install chromium && npm run smoke
// 바깥 주소(글꼴·날씨·릴레이 서버)는 모두 막음 → 네트워크 없이 같은 결과. 빌드는 VITE_WS_URL= 로 (릴레이에 붙지 않게)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright'); // package.json 에 넣지 않음 (CI 작업 안에서만 --no-save 로 설치)

const DIST = path.resolve(process.argv[2] || 'dist');
const BOOT_MS = Number(process.env.SMOKE_BOOT_MS || 300000); // 소프트웨어 WebGL 은 셰이더 준비가 느림
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream', '.gz': 'application/gzip', '.wasm': 'application/wasm' };

if (!fs.existsSync(path.join(DIST, 'index.html'))) { console.error(`smoke: ${DIST}/index.html 이 없어요 (먼저 npm run build)`); process.exit(2); }

// 작은 정적 서버: 없는 파일은 404 (확장자 없는 주소만 index.html)
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  let f = path.join(DIST, path.normalize(url).replace(/^(\.\.[/\\])+/, ''));
  if (!f.startsWith(DIST)) { res.writeHead(403).end(); return; }
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
  if (!fs.existsSync(f)) {
    if (path.extname(url)) { res.writeHead(404).end(); return; }
    f = path.join(DIST, 'index.html');
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;
const local = (u) => u.startsWith(origin) || u.startsWith('data:') || u.startsWith('blob:');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`); };

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
let code = 1;
try {
  const ctx = await browser.newContext({ viewport: { width: 412, height: 839 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  await ctx.route('**/*', (route) => (local(route.request().url()) ? route.continue() : route.abort()));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text(), at = m.location()?.url || '';
    if (/^Failed to load resource/.test(t) && at && !local(at)) return; // 막아 둔 바깥 주소
    if (/WebSocket connection to .* failed/.test(t)) return; // 멀티플레이 서버 없음 → 혼자 플레이
    errors.push(`console.error: ${t.slice(0, 300)}`);
  });
  const game = (fn, arg) => page.evaluate(fn, arg);
  const waitGame = (fn, ms) => page.waitForFunction(fn, null, { timeout: ms, polling: 250 }).then(() => true, () => false);

  // 1) 처음 입장 (저장 없음)
  const t0 = Date.now();
  await page.goto(`${origin}/?autostart&quality=low&weather=clear`, { waitUntil: 'commit' });
  const shown = await waitGame(() => !!window.game?._shown, BOOT_MS);
  check('입장: 로딩 화면이 걷히고 게임 시작', shown, `${((Date.now() - t0) / 1000).toFixed(0)}초`);
  if (!shown) throw new Error('boot');
  const tShown = Date.now();

  // 2) 루프가 도는지
  const f0 = await game(() => game.frameNo || 0);
  await sleep(3000);
  const f1 = await game(() => game.frameNo || 0);
  check('게임 루프: frameNo 가 늘어남', f1 > f0, `${f0} → ${f1}`);

  // 3) 인트로 컷신 건너뛰기
  const cine = await waitGame(() => game.cinema.locked, 30000);
  check('첫 접속: 인트로 컷신 시작', cine);
  if (cine) {
    const ts = Date.now();
    await game(() => document.querySelector('.cine-skip')?.click());
    const free = await waitGame(() => !game.cinema.locked && !game.dialogue.active, 5000);
    check('건너뛰기: 5초 안에 컷신이 풀림', free, `${((Date.now() - ts) / 1000).toFixed(1)}초`);
  }

  // 1) 20초 동안 오류 없음
  const rest = 20000 - (Date.now() - tShown);
  if (rest > 0) await sleep(rest);
  check('20초 동안 페이지 오류·console.error 없음', errors.length === 0, errors.slice(0, 5).join(' | '));

  // 4) 저장 → 새로 고침 → 불러오기
  const saved = await game(() => { game.save(); return !!localStorage.getItem('unico-farm-save-v1'); });
  check('저장: localStorage 에 농장이 생김', saved);
  await page.reload({ waitUntil: 'commit' });
  const toast = page.waitForFunction(() => document.body?.innerText.includes('저장된 농장을 불러왔어요'), null, { timeout: BOOT_MS, polling: 100 }).then(() => true, () => false);
  const back = await waitGame(() => !!window.game?._shown, BOOT_MS);
  check('새로 고침 뒤 다시 입장', back);
  check("새로 고침 뒤 '저장된 농장을 불러왔어요' 알림", await toast);
  if (back) {
    await sleep(2000);
    check('이어 하기: 인트로 컷신이 다시 나오지 않음', await game(() => !game.cinema.locked && !game._introPending));
  }
  check('끝까지 페이지 오류·console.error 없음', errors.length === 0, errors.slice(0, 5).join(' | '));
  code = results.every((r) => r.ok) ? 0 : 1;
} catch (e) {
  if (e.message !== 'boot') check('예외 없이 끝남', false, e.message);
} finally {
  await browser.close();
  server.close();
}
console.log(`\nsmoke: ${results.filter((r) => r.ok).length}/${results.length} 통과`);
process.exit(code);
