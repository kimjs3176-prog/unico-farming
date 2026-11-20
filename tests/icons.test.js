// 자체 SVG 아이콘: 코드가 부르는 이름이 모두 그림 묶음에 있음, UI 믹스인, 날씨·계절 고르기, 새 이모지 바꿔 쓰기, 캔버스용 그림
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ico, spriteNames, symbolSvg, weatherIco, SEASON_ICO, fixEmoji, emojiHtml, EMOJI_OVERRIDE, injectSprite, setSprite } from '../src/ui/icons.js';
import { HudUI } from '../src/ui/hud.js';
import { describeWeather, PRESETS } from '../src/game/sim/weather_codes.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const SVG = read('src/ui/icons.svg');
const NAMES = new Set(spriteNames(SVG));

test('ico(): <use href="#i-이름"> 한 줄, 화면 읽기에서 숨김', () => {
  assert.equal(ico('coin'), '<svg class="ico" aria-hidden="true" focusable="false"><use href="#i-coin"/></svg>');
  assert.match(ico('bag', 'big'), /class="ico big"/);
});

test('그림 묶음: 아이콘 30개 이상, 모두 24px 격자, CSS filter 를 쓰지 않음, 이름이 겹치지 않음', () => {
  const all = spriteNames(SVG);
  assert.ok(all.length >= 30, `아이콘 ${all.length}개`);
  assert.equal(new Set(all).size, all.length);
  assert.equal((SVG.match(/viewBox="0 0 24 24"/g) || []).length, all.length);
  assert.doesNotMatch(SVG, /filter|<image|<script|href="http/);
  assert.match(SVG, /<svg[^>]*id="unico-icons"[^>]*aria-hidden="true"/);
});

test("HUD·행동 막대·미니맵이 부르는 아이콘 이름이 모두 그림 묶음에 있음", () => {
  const src = ['src/ui/hud.js', 'src/ui/actionbar.js', 'src/ui/minimap.js'].map(read).join('\n');
  const used = new Set();
  for (const m of src.matchAll(/\bico\('([\w-]+)'/g)) used.add(m[1]);
  for (const m of src.matchAll(/\bmk\('([\w-]+)'/g)) used.add(m[1]);
  for (const m of src.matchAll(/\[\s*'([\w-]+)', '[^']+', \(\) =>/g)) used.add(m[1]); // ☰ 전용 [아이콘, 이름, 함수]
  for (const m of src.matchAll(/icoBitmap\(seen \? '([\w-]+)' : '([\w-]+)'/g)) { used.add(m[1]); used.add(m[2]); }
  for (const m of src.matchAll(/\{ all: '([\w-]+)', sfx: '([\w-]+)', off: '([\w-]+)' \}/g)) for (const n of m.slice(1)) used.add(n);
  assert.ok(used.size >= 20, `찾은 이름 ${used.size}개`);
  const miss = [...used].filter((n) => !NAMES.has(n));
  assert.deepEqual(miss, []);
  for (const n of [...Object.values(SEASON_ICO), 'moon', 'suncloud', 'cloud', 'fog', 'rain', 'snow', 'storm', 'lock', 'heart', 'heart-empty', 'close', 'menu']) assert.ok(NAMES.has(n), n);
  // 행동 막대·HUD 에 이모지 아이콘이 남지 않음 (🦄 행동 · 🤖 자동 · ❔ 도움말)
  assert.doesNotMatch(read('src/ui/actionbar.js'), /mk\('[^\w']/);
  assert.doesNotMatch(read('src/ui/hud.js'), /'❔'|'⚙️'|'🎒/);
});

test('ico 는 UI 믹스인 (다른 화면 코드가 this.ico?.(이름) 으로 씀)', () => {
  assert.equal(HudUI.ico, ico);
  assert.equal(HudUI.emojiHtml, emojiHtml);
  assert.match(read('src/ui/ui.js'), /Object\.assign\(UI\.prototype, HudUI/);
});

test('날씨 아이콘: 날씨 코드·낮밤으로 고름 (weather.js 의 이모지는 그대로)', () => {
  const k = (p, o = {}) => weatherIco(describeWeather({ ...PRESETS[p], ...o }));
  assert.equal(k('clear'), 'sun');
  assert.equal(k('clear', { isDay: 0 }), 'moon');
  assert.equal(weatherIco(describeWeather({ code: 1 })), 'suncloud');
  assert.equal(weatherIco(describeWeather({ code: 2 })), 'suncloud');
  assert.equal(k('cloudy'), 'cloud');
  for (const p of ['fog', 'rain', 'snow', 'storm']) assert.equal(k(p), p);
  assert.equal(weatherIco(null), 'sun');
});

test('새 이모지 바꿔 쓰기: 글자 자리는 옛 이모지, HTML 자리는 자체 아이콘이 있으면 아이콘', () => {
  assert.equal(fixEmoji('🫏 당나귀 · 🪷 연못 · 🫙 잼'), '🐴 당나귀 · 🌸 연못 · 🏺 잼');
  assert.equal(fixEmoji('🥕 당근'), '🥕 당근');
  assert.equal(emojiHtml('🪮 빗질'), `${ico('comb')} 빗질`);
  assert.equal(emojiHtml('🪱'), '🐛');
  for (const o of Object.values(EMOJI_OVERRIDE)) if (o.ico) assert.ok(NAMES.has(o.ico), o.ico);
});

test('캔버스용 그림: 아이콘 하나를 따로 된 SVG 로 (색은 그대로), 없는 이름은 null', () => {
  setSprite(SVG);
  const s = symbolSvg('pin-hill', 24);
  assert.match(s, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 24 24" width="24" height="24"/);
  assert.match(s, /#5fa846/);
  assert.equal(symbolSvg('없는-이름'), null);
  setSprite('');
});

test('그림 묶음 넣기: body 맨 앞에 한 번만', () => {
  const calls = [];
  const doc = { body: { insertAdjacentHTML: (w, s) => calls.push([w, s.length]) }, getElementById: () => (calls.length ? {} : null) };
  assert.equal(injectSprite(doc, SVG), true);
  assert.equal(injectSprite(doc, SVG), false);
  assert.deepEqual(calls, [['afterbegin', SVG.length]]);
  assert.match(read('src/ui/hud.js'), /injectSprite\(\)/);
});

test("달력 계절: 그림 칸(.cal-si)에는 계절 아이콘, 글 칸(.cal-st)에는 '가을 3일'", () => {
  const box = { '.cal-s': { textContent: '' }, '.cal-w': { textContent: '' }, '.cal-si': { innerHTML: '' }, '.cal-st': { textContent: '' } };
  const ui = { ...HudUI, calendar: { querySelector: (q) => box[q] || null } };
  ui.setSeason('🍁', '가을', 3);
  assert.equal(box['.cal-si'].innerHTML, ico('autumn'));
  assert.equal(box['.cal-st'].textContent, '가을 3일');
  assert.equal(box['.cal-w'].textContent, '3/7');
});

test('패널 ✕ 닫기는 CSS 마스크 그림, 도움말은 갈색 Jua "?" 글자', () => {
  const css = read('src/ui/css/panels.css');
  assert.match(css, /\.panel h2 button\.close::before \{[^}]*mask: url\("data:image\/svg\+xml/);
  assert.match(read('src/ui/css/hud.css'), /\.hud-btn \.help-q \{[^}]*font-family: var\(--display\);[^}]*color: var\(--brown\)/);
  assert.match(read('src/ui/css/base.css'), /\.ico \{[^}]*width: 1\.25em; height: 1\.25em;/);
});

/** 화면 글에 남은 그림 이모지 (글자·숫자·기호 ✕·→ 등은 제외) */
const EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

test('큰 지도: 장소 버튼 11개가 모두 자체 아이콘 + 이모지 없는 이름, 알림용 이름은 그대로', async () => {
  const { PLACES, placeLabel, placeChipHtml } = await import('../src/ui/minimap.js');
  assert.equal(PLACES.length, 11);
  for (const pl of PLACES) {
    assert.ok(NAMES.has(pl.ico), `${pl.id}: ${pl.ico}`);
    assert.doesNotMatch(placeLabel(pl), EMOJI_RE, pl.name);
    assert.equal(placeChipHtml(pl), `${ico(pl.ico)}<span>${placeLabel(pl)}</span>`);
  }
  assert.equal(placeLabel(PLACES.find((p) => p.id === 'koat')), 'KOAT 체험관');
  assert.match(read('src/ui/minimap.js'), /openPanel\(`\$\{ico\('map'\)\} 지도/);
});

test('날씨 창·행동 메뉴·카메라 단추: 이모지 대신 자체 아이콘 (같은 날씨 그림을 달력과 함께 씀)', async () => {
  const { WX_PRESETS } = await import('../src/ui/hud.js');
  assert.deepEqual(WX_PRESETS.map(([k]) => k), ['clear', 'cloudy', 'rain', 'storm', 'snow', 'fog']);
  for (const [k, label] of WX_PRESETS) { assert.doesNotMatch(label, EMOJI_RE); assert.ok(NAMES.has(weatherIco({ kind: k })), k); }
  const hud = read('src/ui/hud.js');
  const wx = hud.slice(hud.indexOf('openWeather() {'), hud.indexOf('_screenOf('));
  // 알림(toast) 글의 이모지는 알림 그림 칸에 쓰이므로 빼고 봄
  assert.doesNotMatch(wx.replace(/this\.toast\([^)]*\)/g, ''), EMOJI_RE);
  assert.match(hud, /'<b class="help-q" aria-hidden="true">\?<\/b>'\); \/\//, '세미콜론은 주석 앞');
  const ab = read('src/ui/actionbar.js');
  const em = ab.match(/const EMOTES = (\[.*\]);/)[1];
  for (const [, icon] of JSON.parse(em.replace(/'/g, '"'))) assert.ok(NAMES.has(icon), icon);
  assert.match(ab, /\$\{ico\('hat'\)\}<small>모자/);
  assert.match(ab, /cb\(ico\('cam-reset'\)/);
  assert.doesNotMatch(ab, /🎥|👒/);
});

test('제목 화면: 기능 칩·주사위·도트 판·조작법이 이모지 대신 #t- 아이콘, 빌드가 그 그림을 넣음', async () => {
  const { titleIconsSvg, TITLE_ICONS } = await import('../vite.config.js');
  const html = read('index.html');
  const card = html.slice(html.indexOf('<div class="loading-card">'), html.indexOf('<div class="title-friends"'));
  assert.doesNotMatch(card, EMOJI_RE);
  const used = [...card.matchAll(/href="#t-([\w-]+)"/g)].map((m) => m[1]);
  assert.equal(used.length, 7);
  for (const n of used) assert.ok(TITLE_ICONS.includes(n), n);
  assert.match(html, /<!--title-icons-->/);
  // 넣는 그림: id 가 게임 묶음(#i-)과 겹치지 않고, 원본과 같은 그림
  const svg = titleIconsSvg(SVG);
  assert.equal((svg.match(/<symbol id="t-/g) || []).length, TITLE_ICONS.length);
  assert.doesNotMatch(svg, /id="i-|id="unico-icons"/);
  assert.ok(svg.includes(symbolSvg('dice', 24, SVG).match(/<g[\s\S]*<\/g>/)[0]), '주사위 그림이 원본과 같음');
  assert.throws(() => titleIconsSvg(SVG, ['없는그림']), /없음/);
});

test('HUD 둥근 단추 아이콘은 단추 지름의 60% 넘게, 받을 보상 표시는 아이콘과 덜 겹치게', () => {
  const css = read('src/ui/css/hud.css');
  const px = (re) => +css.match(re)[1];
  assert.ok(px(/\n\.hud-right \.hud-btn \.ico \{ width: (\d+)px/) / 44 >= 0.6, '데스크톱');
  assert.ok(px(/\n {2}\.hud-right \.hud-btn \.ico \{ width: (\d+)px/) / 40 >= 0.6, '폰');
  assert.match(css, /\.hud-btn \.qbadge \{ position: absolute; top: -4px; right: -6px;/);
  // 나무 막대 위 아이콘은 밝은 테두리 한 겹
  assert.match(read('src/ui/css/actionbar.css'), /\.actionbar button span \.ico, \.bar-toggle \.ico, \.cam-pad button \.ico \{ filter: drop-shadow\(0 0 1px/);
});
