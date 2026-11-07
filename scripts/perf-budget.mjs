/**
 * 성능 예산 점검 (3D 판) — 절차는 .claude/skills/unico-perf-budget/SKILL.md, 예산은 docs/perf/budget.json
 *
 *   npm run build                       # 내려받기 크기는 dist/ 를 잼 (없으면 '판단 불가')
 *   npm run dev                         # 다른 터미널 (실행 중 수치)
 *   node scripts/perf-budget.mjs [URL] [--out docs/perf/YYYY-MM-DD.md] [--json] [--static]
 *
 * 재는 것 (예산이 없는 항목, 잴 수 없는 항목은 '판단 불가' — 통과로 치지 않음):
 *  - 드로우콜·삼각형: 고사양·저사양 프리셋, 1280×800 스폰 화면, 한 프레임 안의 모든 그리기(그림자·후처리 포함) 중 10프레임 최대
 *  - 게임 로직 시간: 한 프레임의 loop() 에서 그리기(renderer.render) 시간을 뺀 것 — 평균·p95 (헤드리스라 GPU 와 무관한 CPU 몫만)
 *  - JS 메모리: 시작 직후(GC 후), 오토플레이로 게임 시간 60초를 돌린 뒤 늘어난 양(GC 후) — 새는 메모리 확인
 *  - 내려받기: 3D 판 첫 화면 JS·CSS(gzip) + 모델(.gz) 합
 *  - 실제 폰 프레임 시간: 이 스크립트로는 못 잼 → 늘 '판단 불가' (기기에서 환경설정 'FPS 표시'로 재어 budget.json 의 measured 에 적음)
 */
import { readFileSync, readdirSync, statSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { gzipSync } from 'node:zlib';
import { createRequire } from 'node:module';

const args = process.argv.slice(2);
const PAGE = args.find((a) => /^https?:/.test(a)) || 'http://localhost:5173/';
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const OUT = opt('--out');
const JSON_OUT = args.includes('--json');
const STATIC_ONLY = args.includes('--static');
const BUDGET = JSON.parse(readFileSync(new URL('../docs/perf/budget.json', import.meta.url), 'utf8'));

// ---------------------------------------------------------------- 내려받기 크기 (dist)
function downloadSizes() {
  if (!existsSync('dist/index.html')) return null;
  const html = readFileSync('dist/index.html', 'utf8');
  const refs = [...html.matchAll(/(?:src|href)="\/?(assets\/[^"]+\.(?:js|css))"/g)].map((m) => m[1]);
  // 첫 화면이 바로 불러오는 JS 가 다시 import 하는 청크도 셈 (정적 import 만)
  const seen = new Set();
  const visit = (p) => {
    if (seen.has(p) || !existsSync(join('dist', p))) return;
    seen.add(p);
    if (!p.endsWith('.js')) return;
    const src = readFileSync(join('dist', p), 'utf8');
    for (const m of src.matchAll(/(?:^|[;\n}])\s*import\s*(?:[^'"()]*?from\s*)?["']\.\/([^"']+\.js)["']/g)) visit('assets/' + m[1]);
  };
  refs.forEach(visit);
  let js = 0;
  for (const p of seen) js += gzipSync(readFileSync(join('dist', p))).length;
  js += gzipSync(Buffer.from(html)).length;
  let models = 0, modelsN = 0;
  if (existsSync('dist/models')) for (const f of readdirSync('dist/models')) {
    if (/\.(glb|bin)$/.test(f)) { const gz = join('dist/models', f + '.gz'); models += existsSync(gz) ? statSync(gz).size : gzipSync(readFileSync(join('dist/models', f))).length; modelsN++; }
  }
  return { jsGzipKB: Math.round(js / 1024), files: [...seen], modelsGzMB: +(models / 1048576).toFixed(2), modelsN };
}

// ---------------------------------------------------------------- 실행 중 수치 (브라우저)
async function runtime() {
  let chromium;
  try { ({ chromium } = await import('playwright')); } catch { try { ({ chromium } = createRequire(import.meta.url)('playwright')); } catch { /* 없음 */ } }
  if (!chromium) return { error: 'playwright 없음 (`npm i -D playwright && npx playwright install chromium`)' };
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--js-flags=--expose-gc', '--enable-precise-memory-info'] });
  const out = { errors: [] };
  for (const preset of ['high', 'low']) {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 })).newPage();
    page.setDefaultTimeout(10000);
    page.on('pageerror', (e) => out.errors.push(e.message));
    try {
      await page.goto(PAGE + (PAGE.includes('?') ? '&' : '?') + 'quality=' + preset);
      await page.waitForSelector('#start-btn:not([disabled])', { timeout: 120000 });
      await page.evaluate(() => document.getElementById('start-btn').click());
      await page.waitForFunction(() => window.game, null, { timeout: 60000 });
      for (let i = 0; i < 14; i++) { await page.waitForTimeout(700); await page.evaluate(() => { document.querySelector('.cine-skip')?.click(); window.game?.dialogue?.skipAll?.(); }); }
      await page.waitForTimeout(1500);
      // 드로우콜·삼각형: 한 프레임 동안 모든 그리기를 합산, 10프레임 중 최대
      const draw = await page.evaluate(async () => {
        const r = window.game.renderer, info = r.info;
        let calls = 0, tris = 0;
        for (let f = 0; f < 10; f++) {
          info.autoReset = false; info.reset();
          await new Promise((res) => requestAnimationFrame(res)); // 게임의 그리기 다음에 불림 → 정확히 한 프레임
          calls = Math.max(calls, info.render.calls); tris = Math.max(tris, info.render.triangles);
        }
        info.autoReset = true;
        return { calls, tris };
      });
      out[preset] = draw;
      if (preset === 'low') {
        // 로직 시간·메모리: 화면 그리기는 멈추고 loop() 를 직접 돌림 (게임 시간 1/20초씩)
        Object.assign(out, await page.evaluate(async () => {
          const g = window.game;
          g.renderer.setAnimationLoop(null);
          let inRender = 0, renderMs = 0;
          const wrap = (obj, k) => { const f = obj[k].bind(obj); obj[k] = (...a) => { if (inRender++) { const v = f(...a); inRender--; return v; } const t = performance.now(); try { return f(...a); } finally { renderMs += performance.now() - t; inRender--; } }; };
          wrap(g.renderer, 'render'); if (g.postfx?.render) wrap(g.postfx, 'render');
          g.timer.getDelta = () => 1 / 20; g.timer.update = () => {};
          const gc = () => { if (window.gc) { window.gc(); window.gc(); } };
          const heap = () => (performance.memory ? performance.memory.usedJSHeapSize / 1048576 : null);
          // 측정 1: 평소 화면 (그리기 포함 loop 에서 그리기 시간을 뺌)
          const logic = [];
          for (let i = 0; i < 120; i++) { renderMs = 0; const t = performance.now(); g.loop(); logic.push(performance.now() - t - renderMs); await null; }
          gc(); const heap0 = heap();
          // 측정 2: 오토플레이로 게임 시간 60초 (그리기는 생략) 후 메모리
          g.renderer.render = () => {}; if (g.postfx) g.postfx.render = () => {};
          g.autoplay?.toggle?.(true);
          const auto = [];
          for (let i = 0; i < 1200; i++) { const t = performance.now(); g.loop(); auto.push(performance.now() - t); if (i % 4 === 0) await null; }
          g.autoplay?.toggle?.(false);
          gc(); const heap1 = heap();
          const stat = (a) => { const s = [...a].sort((x, y) => x - y); return { avg: +(s.reduce((x, y) => x + y, 0) / s.length).toFixed(2), p95: +s[Math.floor(s.length * 0.95)].toFixed(2), max: +s.at(-1).toFixed(2) }; };
          return { logic: stat(logic.slice(20)), autoLogic: stat(auto.slice(50)), heapMB: heap0 && +heap0.toFixed(1), heapGrowthMB: heap0 && +(heap1 - heap0).toFixed(1) };
        }));
      }
    } catch (e) { out.errors.push(`${preset}: ${e.message.split('\n')[0]}`); }
    await page.context().close();
  }
  await browser.close();
  return out;
}

const dl = downloadSizes();
const rt = STATIC_ONLY ? { skipped: true } : await runtime();

// ---------------------------------------------------------------- 예산과 비교
const rows = [];
const check = (name, value, budget, unit, note = '') => {
  let verdict;
  if (budget == null) verdict = '판단 불가 — 예산 없음';
  else if (value == null) verdict = '판단 불가 — 측정 못 함';
  else verdict = value <= budget ? '✅ 통과' : '❌ 초과';
  const head = value != null && budget ? Math.round((1 - value / budget) * 100) : null;
  rows.push({ name, value, budget, unit, verdict, head, note });
};
const B = BUDGET.budgets;
check('드로우콜 (고사양)', rt.high?.calls, B.drawCalls?.high, '회');
check('드로우콜 (저사양)', rt.low?.calls, B.drawCalls?.low, '회');
check('삼각형 (고사양)', rt.high?.tris, B.triangles?.high, '개');
check('삼각형 (저사양)', rt.low?.tris, B.triangles?.low, '개');
check('게임 로직 평균 (저사양)', rt.logic?.avg, B.logicMs?.avg, 'ms', '헤드리스 PC CPU 기준');
check('게임 로직 p95 (저사양)', rt.logic?.p95, B.logicMs?.p95, 'ms', '헤드리스 PC CPU 기준');
check('오토플레이 중 로직 p95', rt.autoLogic?.p95, B.logicMs?.autoplayP95, 'ms', '길찾기·할 일 고르기 포함');
check('JS 메모리 (시작 후, GC 후)', rt.heapMB, B.heapMB?.afterLoad, 'MB');
check('메모리 증가 (게임 60초 후, GC 후)', rt.heapGrowthMB, B.heapMB?.growthPerMinute, 'MB', '계속 늘면 새는 것');
check('첫 화면 JS·CSS (gzip)', dl?.jsGzipKB, B.download?.jsGzipKB, 'KB', dl ? `${dl.files.length}개 파일` : 'dist 없음 — npm run build 먼저');
check('3D 모델 (.gz)', dl?.modelsGzMB, B.download?.modelsGzMB, 'MB', dl ? `${dl.modelsN}개` : '');
check('실제 폰 프레임 시간', BUDGET.measured?.mobileFrameMs ?? null, B.mobileFrameMs, 'ms', BUDGET.measured?.mobileDevice || '기기에서 직접 재야 함');

if (JSON_OUT) { console.log(JSON.stringify({ rows, rt, dl }, null, 1)); process.exit(0); }

const today = new Date().toISOString().slice(0, 10);
const over = rows.filter((r) => r.verdict.startsWith('❌')).length;
const na = rows.filter((r) => r.verdict.startsWith('판단')).length;
const enforce = BUDGET.enforce || 'warn';
const fmt = (v) => (v == null ? '—' : typeof v === 'number' ? v.toLocaleString('ko-KR') : v);
const L = [];
L.push(`# 성능 예산 점검 — ${today}`, '');
L.push(`예산: \`docs/perf/budget.json\` (${BUDGET.updated || '?'}) · 적용 수준: **${enforce}**${enforce === 'block' ? ' (초과 = 배포 막음)' : enforce === 'off' ? ' (참고만)' : ' (초과 = 경고)'}`, '');
L.push(`**결과: 초과 ${over}건 · 판단 불가 ${na}건 · 통과 ${rows.length - over - na}건**`, '');
L.push('| 항목 | 측정 | 예산 | 여유 | 판정 | 비고 |', '|---|---|---|---|---|---|');
for (const r of rows) L.push(`| ${r.name} | ${fmt(r.value)}${r.value != null ? ' ' + r.unit : ''} | ${fmt(r.budget)}${r.budget != null ? ' ' + r.unit : ''} | ${r.head == null ? '—' : r.head + '%'} | ${r.verdict} | ${r.note} |`);
L.push('');
if (rt.errors?.length) L.push(`실행 오류 ${rt.errors.length}건: ${rt.errors.slice(0, 3).join(' / ')}`, '');
if (rt.error) L.push(`실행 중 수치 못 잼: ${rt.error}`, '');
L.push('측정 조건: 1280×800 · 스폰 화면 · Chromium 헤드리스(소프트웨어 GL) — 로직 시간은 그리기를 뺀 CPU 시간이라 실제 기기와 비율만 비교할 것. 그리기 비용(GPU)은 드로우콜·삼각형으로 대신 봄.');
const md = L.join('\n');
if (OUT) { mkdirSync(dirname(OUT), { recursive: true }); writeFileSync(OUT, md + '\n'); console.log(`보고서: ${OUT}`); }
console.log(md);
process.exit(enforce === 'block' && over ? 1 : 0);
