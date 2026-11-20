// 아이템 아이콘 굽기: 코드로 만든 메시(src/game/iconmesh/) · 게임 모델(꾸미기) · 유니코(코스튬) → 아이콘 한 장(아틀라스)
//  결과: public/ui/items.webp (아이템) · public/ui/items_deco.webp (코스튬·꾸미기) — 128px 칸 한 줄 12칸, 칸 안쪽 4px 여백, 투명 배경, 장마다 250KB 이하
//        src/ui/item_icons.gen.js (열쇠 → 칸 위치, 다 구운 분류 CATS_DONE, 주소에 ?v=<해시>)
//  모든 칸이 같은 카메라(앞·위 3/4) · 같은 빛(주광 + 역광) · 2px 갈색 테두리 · 부드러운 바닥 그림자
//  실행: npm run bake:icons   (개발용. Playwright Chromium 필요 — 저장소 의존성에는 없음: 전역 설치 또는 `npm i --no-save playwright`)
//  옵션: --only fish,bug   그 분류만 구워 미리보기만 저장 (아틀라스·생성 모듈은 그대로)
//        --sheet <파일.png> 크림색 바탕에 32·48·64px 로 늘어놓은 확인용 그림도 저장
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const ONLY = arg('--only')?.split(',').filter(Boolean) || null;
const SHEET = arg('--sheet');
const OUT_IMGS = [path.join(ROOT, 'public/ui/items.webp'), path.join(ROOT, 'public/ui/items_deco.webp')];
const SHEET1 = ['costume', 'decor']; // 둘째 장에 넣는 분류
const OUT_GEN = path.join(ROOT, 'src/ui/item_icons.gen.js');
const CELL = 128, COLS = 12, PAD = 4, MAX_KB = 250, Q = +(arg('--q') || 0.7);

async function loadChromium() {
  try { return (await import('playwright')).chromium; } catch { /* 다음 */ }
  try { return createRequire(import.meta.url)('playwright').chromium; } catch { /* 다음 */ }
  try { const g = execSync('npm root -g', { encoding: 'utf8' }).trim(); return createRequire(path.join(g, 'x.js'))('playwright').chromium; } catch { return null; }
}

/** 브라우저 안에서 도는 굽기 (vite 개발 서버가 모듈을 풀어 줌) */
async function bakeInPage({ CELL, COLS, PAD, ONLY, SHEET, Q, SHEET1 }) {
  const M = await import('/src/game/iconmesh/index.js');
  const THREE = M.THREE;
  const IN = CELL - PAD * 2, SS = 2, R = IN * SS; // 칸 안쪽 120px, 두 배로 그려 줄임 (계단 없이)
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(R, R);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  const scene = new THREE.Scene();
  // 빛: 왼쪽 위 앞 주광(따뜻) + 오른쪽 뒤 역광(테두리 빛) + 하늘/땅 반사광
  scene.add(new THREE.HemisphereLight(0xfff4e4, 0x8c7a62, 1.25));
  const key = new THREE.DirectionalLight(0xfff0d8, 2.1); key.position.set(-2.2, 3.2, 2.6); scene.add(key);
  const rim = new THREE.DirectionalLight(0xe8f2ff, 1.7); rim.position.set(2.6, 1.6, -3.0); scene.add(rim);
  const fill = new THREE.DirectionalLight(0xffe2c8, 0.45); fill.position.set(3, 0.5, 2); scene.add(fill);
  const { RoomEnvironment } = M;
  if (RoomEnvironment) { const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.35; }
  // 카메라: 앞·오른쪽 조금·위 30도 (모든 칸 같음), 직교 투영
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 100);
  const dir = new THREE.Vector3(...M.ICON_VIEW).normalize();
  cam.position.copy(dir).multiplyScalar(20); cam.lookAt(0, 0, 0); cam.updateMatrixWorld(true);

  const small = document.createElement('canvas'); small.width = small.height = IN;
  const sctx = small.getContext('2d', { willReadFrequently: true });
  const cats = M.iconCats();
  const want = ONLY ? Object.fromEntries(Object.entries(cats).filter(([c]) => ONLY.includes(c))) : cats;
  const list = Object.entries(want).flatMap(([cat, keys]) => keys.map((k) => [cat, k]));
  await M.prepareIcons(Object.keys(want));
  // 장: 0 = 아이템(가방·도감·장터), 1 = 코스튬·꾸미기 (옷장·꾸미기 창에서만 필요)
  const sheetOf = (cat) => (SHEET1.includes(cat) ? 1 : 0);
  const atlases = [0, 1].map((s) => { const c = document.createElement('canvas'); c.width = CELL * COLS; c.height = CELL * Math.max(1, Math.ceil(list.filter(([cat]) => sheetOf(cat) === s).length / COLS)); return c; });
  const cells = {}, failed = [], v = new THREE.Vector3(), count = [0, 0];
  for (const [cat, k] of list) {
    const si = sheetOf(cat), actx = atlases[si].getContext('2d'), n = count[si];
    let obj = null;
    try { obj = await M.iconBuilder(k, cat)?.(); } catch (e) { failed.push([k, String(e?.message || e)]); continue; }
    if (!obj) { failed.push([k, '만드는 함수 없음']); continue; }
    scene.add(obj);
    obj.updateMatrixWorld(true);
    // 화면(카메라) 기준 실제 정점 범위 → 칸에 꼭 맞게
    const clipY = obj.userData.clipY ?? null; // 이 높이 아래는 잘라서 안 그림 (코스튬 상반신)
    renderer.clippingPlanes = clipY != null ? [new THREE.Plane(new THREE.Vector3(0, 1, 0), -clipY)] : [];
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    obj.traverse((o) => {
      if (!o.isMesh || !o.visible) return;
      let vis = true; for (let a = o; a; a = a.parent) if (!a.visible) vis = false;
      if (!vis) return;
      const pos = o.geometry.attributes.position;
      if (o.isSkinnedMesh) o.skeleton.update();
      for (let i = 0; i < pos.count; i += 1) {
        o.getVertexPosition(i, v); v.applyMatrix4(o.matrixWorld);
        if (clipY != null && v.y < clipY) continue;
        v.applyMatrix4(cam.matrixWorldInverse);
        if (v.x < x0) x0 = v.x; if (v.x > x1) x1 = v.x; if (v.y < y0) y0 = v.y; if (v.y > y1) y1 = v.y;
      }
    });
    const fitW = IN - 8, fitH = IN - 13; // 테두리 2px + 그림자 자리
    const scale = Math.min(fitW / (x1 - x0), fitH / (y1 - y0)); // px / 단위
    const cx = (x0 + x1) / 2, topPx = 4 + (fitH - (y1 - y0) * scale) / 2, cyTop = y1 + topPx / scale;
    cam.left = cx - IN / 2 / scale; cam.right = cx + IN / 2 / scale;
    cam.top = cyTop; cam.bottom = cyTop - IN / scale;
    cam.updateProjectionMatrix();
    renderer.render(scene, cam);
    scene.remove(obj);
    sctx.clearRect(0, 0, IN, IN);
    sctx.imageSmoothingQuality = 'high';
    sctx.drawImage(renderer.domElement, 0, 0, IN, IN);
    const img = sctx.getImageData(0, 0, IN, IN), d = img.data;
    // 테두리: 알파를 2px 넓혀 그 바깥 띠만 갈색으로
    const A = new Float32Array(IN * IN);
    for (let i = 0; i < IN * IN; i++) A[i] = d[i * 4 + 3] / 255;
    const out = new Float32Array(IN * IN);
    const offs = [];
    for (let oy = -3; oy <= 3; oy++) for (let ox = -3; ox <= 3; ox++) { const w = Math.min(1, Math.max(0, 2.6 - Math.hypot(ox, oy))); if (w > 0) offs.push([ox, oy, w]); }
    let bx0 = IN, bx1 = 0, by1 = 0;
    for (let y = 0; y < IN; y++) for (let x = 0; x < IN; x++) {
      let m = 0;
      for (const [ox, oy, w] of offs) { const xx = x + ox, yy = y + oy; if (xx < 0 || yy < 0 || xx >= IN || yy >= IN) continue; const a = A[yy * IN + xx] * w; if (a > m) m = a; }
      out[y * IN + x] = m;
      if (A[y * IN + x] > 0.3) { if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y > by1) by1 = y; }
    }
    const col = n % COLS, row = Math.floor(n / COLS), ox0 = col * CELL + PAD, oy0 = row * CELL + PAD;
    // 바닥 그림자 (물체 아래 부드러운 타원)
    if (bx1 > bx0) {
      const sw = (bx1 - bx0) * 0.42, sx = ox0 + (bx0 + bx1) / 2, sy = oy0 + Math.min(IN - 5, by1 + 1);
      actx.save(); actx.translate(sx, sy); actx.scale(1, 0.2);
      const gr = actx.createRadialGradient(0, 0, 0, 0, 0, sw);
      gr.addColorStop(0, 'rgba(74,48,26,0.34)'); gr.addColorStop(0.6, 'rgba(74,48,26,0.16)'); gr.addColorStop(1, 'rgba(74,48,26,0)');
      actx.fillStyle = gr; actx.beginPath(); actx.arc(0, 0, sw, 0, Math.PI * 2); actx.fill(); actx.restore();
    }
    // 테두리 + 그림 합치기
    const ol = new ImageData(IN, IN);
    for (let i = 0; i < IN * IN; i++) {
      const a = A[i], oa = out[i] * (1 - a);
      // 그림 위에 테두리 아래: 결과 = 그림(a) over 테두리(oa)
      const ra = a + oa * (1 - a) || 1e-6;
      ol.data[i * 4] = (d[i * 4] * a + 0x5c * oa * (1 - a)) / ra;
      ol.data[i * 4 + 1] = (d[i * 4 + 1] * a + 0x3a * oa * (1 - a)) / ra;
      ol.data[i * 4 + 2] = (d[i * 4 + 2] * a + 0x22 * oa * (1 - a)) / ra;
      ol.data[i * 4 + 3] = Math.round((a + oa * (1 - a)) * 255);
    }
    // 그림자 위에 얹기 (putImageData 는 덮어써서 따로 캔버스로)
    sctx.putImageData(ol, 0, 0);
    actx.drawImage(small, ox0, oy0);
    cells[k] = si ? [col, row, si] : [col, row];
    count[si]++;
    obj.userData.dispose?.();
  }
  // 장마다 실제로 쓴 줄까지만
  const fins = atlases.map((a, si) => { const f = document.createElement('canvas'); f.width = CELL * COLS; f.height = CELL * Math.max(1, Math.ceil(count[si] / COLS)); f.getContext('2d').drawImage(a, 0, 0); return f; });
  const webps = fins.map((f, si) => (count[si] ? f.toDataURL('image/webp', Q) : null));
  const n = count[0] + count[1];
  let sheet = null;
  if (SHEET) {
    // 확인용: 크림 바탕에 64·48·32px
    const sizes = [64, 48, 32], W = 1280, gap = 10;
    const hOf = (s) => Math.ceil(n / Math.floor((W - 20) / (s + gap))) * (s + gap) + 30;
    const sc = document.createElement('canvas'); sc.width = W; sc.height = sizes.reduce((a, s) => a + hOf(s), 10);
    const c = sc.getContext('2d'); c.fillStyle = '#f6ecd6'; c.fillRect(0, 0, sc.width, sc.height);
    c.imageSmoothingQuality = 'high';
    let y = 10;
    for (const s of sizes) {
      c.fillStyle = '#7a5a3a'; c.font = 'bold 16px sans-serif'; c.fillText(`${s}px`, 10, y + 16); y += 26;
      const per = Math.floor((W - 20) / (s + gap));
      Object.values(cells).forEach(([cc, rr, si = 0], i) => c.drawImage(fins[si], cc * CELL, rr * CELL, CELL, CELL, 10 + (i % per) * (s + gap), y + Math.floor(i / per) * (s + gap), s, s));
      y += hOf(s) - 26;
    }
    sheet = sc.toDataURL('image/png');
  }
  return { webps, sheet, cells, failed, cats, count };
}

const chromium = await loadChromium();
if (!chromium) { console.error('bake:icons: playwright 를 찾을 수 없어요 (`npm i --no-save playwright && npx playwright install chromium`)'); process.exit(1); }
const { createServer } = await import('vite');
const server = await createServer({ root: ROOT, logLevel: 'error', clearScreen: false, server: { host: '127.0.0.1', port: 0, hmr: false, watch: null } });
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
let code = 0;
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('page error:', e.message));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[page]', m.text().slice(0, 300)); });
  await page.route('**/__bake', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><body></body>' }));
  await page.goto(base + '/__bake');
  const t0 = Date.now();
  const res = await page.evaluate(bakeInPage, { CELL, COLS, PAD, ONLY, SHEET: !!SHEET, Q, SHEET1 });
  console.log(`bake:icons: ${Object.keys(res.cells).length}칸 (${((Date.now() - t0) / 1000).toFixed(0)}초)`);
  for (const [k, why] of res.failed) console.log(`  못 구움 ${k}: ${why}`);
  const webps = res.webps.map((w) => (w ? Buffer.from(w.split(',')[1], 'base64') : null));
  if (SHEET) { fs.mkdirSync(path.dirname(path.resolve(SHEET)), { recursive: true }); fs.writeFileSync(path.resolve(SHEET), Buffer.from(res.sheet.split(',')[1], 'base64')); console.log('  확인용 그림:', SHEET); }
  if (ONLY) {
    webps.forEach((w, si) => {
      if (!w) return;
      const prev = path.resolve(SHEET ? path.dirname(SHEET) : os.tmpdir(), `items.preview${si || ''}.webp`);
      fs.writeFileSync(prev, w);
      console.log(`  --only: 미리보기만 ${prev} (${(w.length / 1024).toFixed(0)}KB)`);
    });
  } else {
    const urls = [];
    webps.forEach((w, si) => {
      if (!w) return;
      if (w.length > MAX_KB * 1024) console.warn(`  ⚠ ${path.basename(OUT_IMGS[si])} 가 ${(w.length / 1024).toFixed(0)}KB 로 ${MAX_KB}KB 를 넘어요 (--q 를 낮추거나 장을 나누기)`);
      fs.mkdirSync(path.dirname(OUT_IMGS[si]), { recursive: true });
      fs.writeFileSync(OUT_IMGS[si], w);
      urls[si] = `/ui/${path.basename(OUT_IMGS[si])}?v=${crypto.createHash('sha1').update(w).digest('hex').slice(0, 10)}`;
      console.log(`  ${path.relative(ROOT, OUT_IMGS[si])} ${(w.length / 1024).toFixed(0)}KB · ${res.count[si]}칸`);
    });
    const done = Object.entries(res.cats).filter(([, keys]) => keys.every((k) => res.cells[k])).map(([c]) => c).sort();
    const body = [
      '// 자동 생성 파일 — 고치지 말고 `npm run bake:icons` 로 다시 만드세요 (scripts/bake-item-icons.mjs)',
      '// 아이템 아이콘 아틀라스: CELLS[열쇠] = [열, 행] (둘째 장이면 [열, 행, 1]), 칸 크기 CELL px (칸 안쪽 4px 투명 여백), 한 줄에 COLS 칸',
      '// 장: URL(=URLS[0]) 아이템(가방·도감·장터·선물) · URLS[1] 코스튬·꾸미기 (옷장·꾸미기 창에서만 받으면 됨)',
      '// 열쇠: ITEMS·작물·목장 생산물은 원래 id, 사료 feed, 코스튬 costume:<id>, 꾸미기 decor:<id>',
      '// CATS_DONE: 모든 아이템을 구운 분류 (이 분류만 아이콘으로, 나머지는 이모지 그대로 — 한 칸 묶음에 섞지 않기)',
      '// 주소는 사이트 뿌리 기준 (/ui/...) — 하위 경로에 배포하면 BASE_URL 을 앞에 붙여 쓰기. 첫 화면에서 받지 말고 창을 처음 열 때 받기',
      `export const URLS = ${JSON.stringify(urls)};`,
      'export const URL = URLS[0];',
      `export const CELL = ${CELL};`,
      `export const COLS = ${COLS};`,
      `export const ROWS = ${JSON.stringify(res.count.map((c) => Math.ceil(c / COLS)))};`,
      `export const CATS_DONE = ${JSON.stringify(done)};`,
      'export const CELLS = {',
      ...Object.entries(res.cells).map(([k, cell]) => `  ${/^[a-z_][a-z0-9_]*$/i.test(k) ? k : `'${k}'`}: ${JSON.stringify(cell).replace(/,/g, ', ')},`),
      '};',
      '',
    ].join('\n');
    fs.writeFileSync(OUT_GEN, body);
    console.log(`  ${path.relative(ROOT, OUT_GEN)} · 다 구운 분류: ${done.join(', ')}`);
  }
} catch (e) {
  console.error('bake:icons 실패:', e?.message || e);
  code = 1;
} finally {
  await browser.close();
  await server.close();
}
process.exit(code);
