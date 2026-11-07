/**
 * 접근성 자동 점검 (3D 판 index.html) — 사용법은 .claude/skills/unico-a11y-check/SKILL.md
 *
 *   npm run dev                       # 다른 터미널에서 개발 서버
 *   node scripts/a11y-check.mjs [URL] [--out docs/a11y/결과.md] [--json] [--ui-scale 1.3]
 *
 * 화면(HUD·장터·가방·퀘스트·도감·환경설정·도움말·대화)을 PC(1280×800)와 폰(390×844, 터치)에서 열고 잰다:
 *  - 글자 명암 대비 (WCAG 2.1 SC 1.4.3, 보통 글자 4.5:1 · 큰 글자 3:1)
 *  - 터치·클릭 대상 크기 (WCAG 2.2 SC 2.5.8 최소 24px = 필수, SC 2.5.5 44px = 권장)
 *  - 이름 없는 버튼 (SC 4.1.2 — 아이콘만 있는 버튼은 title/aria-label 필요)
 *  - 너무 작은 글자 (게임 권장: 폰 11px·PC 12px 미만은 권장 사항)
 *  - 움직임 줄이기(prefers-reduced-motion) 대응 여부 (SC 2.3.3, AAA → 권장)
 * 3D 화면 바로 위에 놓인 글자처럼 배경을 알 수 없는 것은 '판단 불가'로 따로 셈 (통과로 치지 않음)
 * Playwright 가 필요: 이 저장소 의존성에는 없으므로 `npm i -D playwright && npx playwright install chromium` 또는 전역 설치
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createRequire } from 'node:module'; // 전역 설치(NODE_PATH)도 찾도록

const args = process.argv.slice(2);
const URL = args.find((a) => /^https?:/.test(a)) || 'http://localhost:5173/';
const outIdx = args.indexOf('--out');
const OUT = outIdx >= 0 ? args[outIdx + 1] : null;
const JSON_OUT = args.includes('--json');
const scaleIdx = args.indexOf('--ui-scale');
const UI_SCALE = scaleIdx >= 0 ? +args[scaleIdx + 1] : null; // 환경설정 글자 크기 (1 · 1.15 · 1.3)

let chromium;
try { ({ chromium } = await import('playwright')); } catch { try { ({ chromium } = createRequire(import.meta.url)('playwright')); } catch { /* 아래에서 안내 */ } }
if (!chromium) {
  console.error('playwright 를 찾을 수 없어요. `npm i -D playwright && npx playwright install chromium` 후 다시 실행하세요.');
  process.exit(2);
}

const VIEWS = [
  { id: 'pc', name: 'PC 1280×800', viewport: { width: 1280, height: 800 }, touch: false },
  { id: 'phone', name: '폰 390×844', viewport: { width: 390, height: 844 }, touch: true },
];
/** 열어 볼 화면: 게임 객체로 직접 엶 (window.game) */
const SCREENS = [
  { id: 'hud', name: 'HUD(기본 화면)', open: () => {} },
  { id: 'menu', name: '☰ 메뉴 펼침', open: (g) => g.ui.setBarOpen?.(true), phoneOnly: true },
  { id: 'market', name: '장터', open: (g) => g.ui.openMarket() },
  { id: 'bag', name: '가방', open: (g) => g.ui.openInventory() },
  { id: 'quests', name: '퀘스트', open: (g) => g.ui.openQuests() },
  { id: 'book', name: '도감', open: (g) => g.ui.openBook() },
  { id: 'settings', name: '환경설정', open: (g) => g.ui.openSettings() },
  { id: 'help', name: '도움말', open: (g) => g.ui.openHelp() },
  { id: 'dialogue', name: '대화(선택지)', open: (g) => { g.dialogue.say({ name: '🧭 안내 유니코', text: '접근성 점검용 대사예요. 선택지를 골라 보세요.', choices: [{ label: '🎁 선물하기', value: 1 }, { label: '👋 안녕!', value: 'bye' }] }); } },
];

/** 페이지 안에서 실행: 지금 보이는 UI 를 재서 결과 목록을 돌려줌 */
function measure({ touch }) {
  const out = { contrast: [], unknownBg: 0, unknownSamples: [], targets: [], unnamed: [], small: [], textCount: 0 };
  const ui = document.getElementById('ui');
  const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const lum = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const over = (top, under) => { const a = top.a; return { r: top.r * a + under.r * (1 - a), g: top.g * a + under.g * (1 - a), b: top.b * a + under.b * (1 - a), a: 1 }; };
  const visible = (el) => { const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return false; const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || +cs.opacity === 0) return false; return r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth; };
  const shown = (el) => { for (let e = el; e && e !== document.body; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return false; } return true; };
  /**
   * 글자 뒤 배경 후보 색들: 위로 올라가며 반투명 배경을 겹쳐 칠함. 그라데이션은 색 멈춤점마다 후보로 (가장 나쁜 쪽으로 판정).
   * 그림(url)·3D 화면이 나오면 null (판단 불가)
   */
  const bgOf = (el) => {
    const layers = [];
    for (let e = el; e && e !== document.documentElement; e = e.parentElement) {
      const cs = getComputedStyle(e);
      const img = cs.backgroundImage;
      if (img && img !== 'none') {
        if (/url\(/.test(img)) return null;
        const stops = (img.match(/rgba?\([^)]+\)/g) || []).map(parse).filter(Boolean);
        if (!stops.length) return null;
        layers.push(stops);
        if (stops.every((c) => c.a >= 0.99)) break;
      }
      const c = parse(cs.backgroundColor);
      if (c && c.a > 0) { layers.push([c]); if (c.a >= 0.99) break; }
      if (e === ui || e.id === 'ui') return null;
    }
    if (!layers.length || !layers.at(-1).every((c) => c.a >= 0.99)) return null;
    let cands = layers.pop();
    while (layers.length) { const top = layers.pop(); cands = top.flatMap((t) => cands.map((u) => over(t, u))).slice(0, 16); }
    return cands;
  };
  const label = (el) => (el.innerText || el.textContent || el.getAttribute('title') || el.getAttribute('aria-label') || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 40);
  const path = (el) => { const p = []; for (let e = el; e && e.id !== 'ui' && p.length < 3; e = e.parentElement) p.unshift(e.tagName.toLowerCase() + (e.classList[0] ? '.' + e.classList[0] : '')); return p.join(' > '); };
  const seen = new Set();
  // 글자: 글자 노드를 직접 가진 요소
  const walker = document.createTreeWalker(ui, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = n.textContent.trim();
    if (!t || !/[\p{L}\p{N}]/u.test(t)) continue; // 이모지·기호만 있는 글자는 대비 대상 아님
    const el = n.parentElement;
    if (!el || seen.has(el) || !visible(el) || !shown(el)) continue;
    seen.add(el);
    out.textCount++;
    const cs = getComputedStyle(el);
    let z = 1; for (let e = el; e && e !== document.body; e = e.parentElement) z *= +getComputedStyle(e).zoom || 1; // 글자 크기 설정(zoom)
    const px = parseFloat(cs.fontSize) * z;
    const bold = +cs.fontWeight >= 700 || /Jua/.test(cs.fontFamily); // Jua 는 굵은 글꼴
    const large = px >= 24 || (bold && px >= 18.66);
    const fg = parse(cs.color);
    const bg = bgOf(el);
    if (px < (touch ? 11 : 12)) out.small.push({ text: label(el), px: Math.round(px * 10) / 10, where: path(el) });
    if (!fg) continue;
    if (el.closest('button:disabled, input:disabled, select:disabled')) continue; // 비활성 컨트롤은 SC 1.4.3 예외
    if (!bg) { out.unknownBg++; if (out.unknownSamples.length < 6) out.unknownSamples.push({ text: label(el), where: path(el), shadow: cs.textShadow !== 'none' }); continue; }
    let worst = null, r = Infinity;
    for (const c of bg) { const v = ratio(over(fg, c), c); if (v < r) { r = v; worst = c; } }
    const need = large ? 3 : 4.5;
    if (r < need) out.contrast.push({ text: label(el), ratio: Math.round(r * 100) / 100, need, px: Math.round(px), fg: cs.color, bg: `rgb(${Math.round(worst.r)}, ${Math.round(worst.g)}, ${Math.round(worst.b)})`, where: path(el) });
  }
  // 누를 수 있는 것
  for (const el of ui.querySelectorAll('button, [role=button], input, select, a, .clickable, .objective, .minimap')) {
    if (!visible(el) || !shown(el)) continue;
    const r = el.getBoundingClientRect();
    const w = Math.round(r.width), h = Math.round(r.height);
    if (Math.min(w, h) < 44) out.targets.push({ text: label(el), w, h, level: Math.min(w, h) < 24 ? 'min' : 'rec', where: path(el) });
    if (el.tagName === 'BUTTON' || el.getAttribute('role') === 'button') {
      const txt = (el.innerText || '').replace(/[\p{Extended_Pictographic}️‍\s✕×▲▼◀▶☰]/gu, '');
      if (!txt && !el.getAttribute('title') && !el.getAttribute('aria-label')) out.unnamed.push({ text: (el.textContent || '').trim().slice(0, 8) || '(빈 버튼)', where: path(el) });
    }
  }
  return out;
}

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const results = [];
for (const v of VIEWS) {
  const ctx = await browser.newContext({ viewport: v.viewport, isMobile: v.touch, hasTouch: v.touch, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.setDefaultTimeout(8000);
  if (UI_SCALE) await page.addInitScript((v) => { try { const k = 'unico.gfx'; localStorage.setItem(k, JSON.stringify({ ...JSON.parse(localStorage.getItem(k) || '{}'), uiScale: v })); } catch { /* 무시 */ } }, UI_SCALE);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL + (URL.includes('?') ? '&' : '?') + 'quality=low');
  await page.waitForSelector('#start-btn:not([disabled])', { timeout: 120000 });
  await page.evaluate(() => document.getElementById('start-btn').click());
  await page.waitForFunction(() => window.game, null, { timeout: 60000 });
  for (let i = 0; i < 14; i++) { await page.waitForTimeout(700); await page.evaluate(() => { document.querySelector('.cine-skip')?.click(); window.game?.dialogue?.skipAll?.(); }); }
  await page.waitForTimeout(1200);
  const reduced = await page.evaluate(() => [...document.styleSheets].some((s) => { try { return [...s.cssRules].some((r) => r.media && /prefers-reduced-motion/.test(r.media.mediaText)); } catch { return false; } }));
  for (const s of SCREENS) {
    if (s.phoneOnly && !v.touch) continue;
    await page.evaluate(() => { const g = window.game; g.ui.closePanel(); g.dialogue.active && g.dialogue.skipAll(); g.ui.setBarOpen?.(false); });
    await page.waitForTimeout(300);
    await page.evaluate(`(${s.open.toString()})(window.game)`);
    await page.waitForTimeout(900);
    const m = await page.evaluate(measure, { touch: v.touch });
    results.push({ view: v, screen: s, m });
  }
  results.push({ view: v, reduced, errors });
  await ctx.close();
}
await browser.close();

// ---------------------------------------------------------------- 보고서
const rows = results.filter((r) => r.m);
const uniq = (list, key) => { const s = new Map(); for (const x of list) { const k = key(x); if (!s.has(k)) s.set(k, { ...x, n: 0, screens: new Set() }); const e = s.get(k); e.n++; e.screens.add(x.screen); } return [...s.values()]; };
const all = (f) => rows.flatMap((r) => r.m[f].map((x) => ({ ...x, view: r.view.id, screen: r.screen.name })));
const contrast = uniq(all('contrast'), (x) => `${x.where}|${x.fg}|${x.bg}`).sort((a, b) => a.ratio - b.ratio);
const targetsMin = uniq(all('targets').filter((x) => x.level === 'min' && x.view === 'phone'), (x) => x.where + '|' + x.text);
const targetsRec = uniq(all('targets').filter((x) => x.level === 'rec' && x.view === 'phone'), (x) => x.where);
const unnamed = uniq(all('unnamed'), (x) => x.where + '|' + x.text);
const small = uniq(all('small'), (x) => `${x.where}|${x.px}|${x.view}`);
const meta = results.filter((r) => !r.m);
const reduced = meta.every((r) => r.reduced);
const errors = meta.flatMap((r) => r.errors);
const texts = rows.reduce((a, r) => a + r.m.textCount, 0), unknown = rows.reduce((a, r) => a + r.m.unknownBg, 0);
const unknownSamples = rows.flatMap((r) => r.m.unknownSamples.map((x) => ({ ...x, screen: r.screen.name }))).slice(0, 8);

if (JSON_OUT) { console.log(JSON.stringify({ contrast, targetsMin, targetsRec, unnamed, small, reduced, errors, texts, unknown }, (k, v) => (v instanceof Set ? [...v] : v), 1)); process.exit(0); }

const today = new Date().toISOString().slice(0, 10);
const blocking = contrast.length + targetsMin.length + unnamed.length;
const L = [];
L.push(`# 접근성 점검 (자동) — ${today}`, '');
L.push(`대상: 3D 판 \`index.html\` · ${VIEWS.map((v) => v.name).join(', ')}${UI_SCALE ? ` · 글자 크기 ×${UI_SCALE}` : ''} · 화면 ${SCREENS.length}개 · 글자 ${texts}곳 · 기준 WCAG 2.1 AA (+ 2.2 SC 2.5.8)`, '');
L.push(`**결과: 필수(BLOCKING) ${blocking}건 · 권장(ADVISORY) ${targetsRec.length + small.length + (reduced ? 0 : 1)}건 · 판단 불가 ${unknown}곳**`, '');
L.push('| 항목 | 기준 | 등급 | 결과 |', '|---|---|---|---|');
L.push(`| 글자 명암 대비 | SC 1.4.3 (4.5:1, 큰 글자 3:1) | 필수 | ${contrast.length ? `❌ ${contrast.length}건` : '✅ 통과'} (배경을 잴 수 있는 ${texts - unknown}곳 기준) |`);
L.push(`| 터치 대상 최소 24px (폰) | SC 2.5.8 (WCAG 2.2 AA) | 필수 | ${targetsMin.length ? `❌ ${targetsMin.length}건` : '✅ 통과'} |`);
L.push(`| 버튼 이름 | SC 4.1.2 | 필수 | ${unnamed.length ? `❌ ${unnamed.length}건` : '✅ 통과'} |`);
L.push(`| 터치 대상 44px (폰) | SC 2.5.5 (AAA) | 권장 | ${targetsRec.length ? `⚠️ ${targetsRec.length}건` : '✅'} |`);
L.push(`| 작은 글자 (폰 11px·PC 12px 미만) | 게임 권장 | 권장 | ${small.length ? `⚠️ ${small.length}건` : '✅'} |`);
L.push(`| 움직임 줄이기 설정 따름 | SC 2.3.3 (AAA) | 권장 | ${reduced ? '✅ prefers-reduced-motion 대응' : '⚠️ 대응 없음'} |`);
L.push(`| 3D 화면 위 글자 | — | 판단 불가 | ${unknown}곳 (배경이 장면이라 자동으로 잴 수 없음 — 스크린샷으로 사람이 확인) |`);
L.push(`| 색만으로 전달하는 정보 | SC 1.4.1 | 필수 | 판단 불가 — 자동으로 알 수 없음, 스킬 문서의 수동 점검표로 확인 |`);
L.push(`| 실행 오류 | — | — | ${errors.length ? `❌ ${errors.length}건: ${errors.slice(0, 3).join(' / ')}` : '0건'} |`, '');
const sc = (s) => [...s].join(', ');
if (contrast.length) {
  L.push('## ❌ 명암 대비 부족', '', '| 글자 | 대비 | 필요 | 크기 | 글자색 / 배경 | 위치 | 화면 |', '|---|---|---|---|---|---|---|');
  for (const x of contrast) L.push(`| ${x.text} | ${x.ratio}:1 | ${x.need}:1 | ${x.px}px | ${x.fg} / ${x.bg} | \`${x.where}\` | ${sc(x.screens)} |`);
  L.push('');
}
if (targetsMin.length) {
  L.push('## ❌ 24px 보다 작은 터치 대상 (폰)', '', '| 대상 | 크기 | 위치 | 화면 |', '|---|---|---|---|');
  for (const x of targetsMin) L.push(`| ${x.text} | ${x.w}×${x.h} | \`${x.where}\` | ${sc(x.screens)} |`);
  L.push('');
}
if (unnamed.length) {
  L.push('## ❌ 이름 없는 버튼', '', '| 버튼 | 위치 | 화면 |', '|---|---|---|');
  for (const x of unnamed) L.push(`| ${x.text} | \`${x.where}\` | ${sc(x.screens)} |`);
  L.push('');
}
if (targetsRec.length) {
  L.push('## ⚠️ 44px 보다 작은 터치 대상 (폰, 권장)', '', '| 대상(예) | 크기 | 위치 | 개수 |', '|---|---|---|---|');
  for (const x of targetsRec.sort((a, b) => Math.min(a.w, a.h) - Math.min(b.w, b.h)).slice(0, 15)) L.push(`| ${x.text} | ${x.w}×${x.h} | \`${x.where}\` | ${x.n} |`);
  if (targetsRec.length > 15) L.push(`| … 외 ${targetsRec.length - 15}종 | | | |`);
  L.push('');
}
if (small.length) {
  L.push('## ⚠️ 작은 글자 (권장)', '', '| 글자(예) | 크기 | 위치 | 화면 |', '|---|---|---|---|');
  for (const x of small.sort((a, b) => a.px - b.px).slice(0, 15)) L.push(`| ${x.text} | ${x.px}px (${x.view === 'phone' ? '폰' : 'PC'}) | \`${x.where}\` | ${sc(x.screens)} |`);
  if (small.length > 15) L.push(`| … 외 ${small.length - 15}종 | | | |`);
  L.push('');
}
if (unknownSamples.length) {
  L.push('## 판단 불가 예 (3D 화면 위 글자)', '', '| 글자 | 그림자 | 위치 | 화면 |', '|---|---|---|---|');
  for (const x of unknownSamples) L.push(`| ${x.text} | ${x.shadow ? '있음' : '**없음**'} | \`${x.where}\` | ${x.screen} |`);
  L.push('');
}
const md = L.join('\n');
if (OUT) { mkdirSync(dirname(OUT), { recursive: true }); writeFileSync(OUT, md + '\n'); console.log(`보고서: ${OUT}`); }
console.log(md);
process.exit(errors.length ? 1 : 0);
