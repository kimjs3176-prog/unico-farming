// 대화창: 잠긴 선택지는 읽히게(점선·자물쇠·진행 알약), 우정 하트는 그림, 선택지는 창 위에 띄움(가로로 눕힌 폰만 창 안), 말소리 고르기
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/** 아주 작은 가짜 DOM: 같은 선택자는 같은 요소, 부모·자식 추적 */
class El {
  constructor(tag = 'div') { this.tagName = tag.toUpperCase(); this.children = []; this.parentNode = null; this.cache = {}; this.className = ''; this.innerHTML = ''; this.textContent = ''; this.disabled = false; this.attrs = {}; this.offsetWidth = 0; this.scrollTop = 0;
    const set = new Set(); this.classList = { add: (c) => set.add(c), remove: (c) => set.delete(c), toggle: (c, on) => (on ?? !set.has(c)) ? set.add(c) : set.delete(c), contains: (c) => set.has(c) }; this.style = { setProperty() {} }; }
  querySelector(s) { return (this.cache[s] ||= new El()); }
  querySelectorAll() { return []; }
  append(...cs) { for (const c of cs) { c.parentNode?.children.splice(c.parentNode.children.indexOf(c), 1); c.parentNode = this; this.children.push(c); } }
  insertBefore(c) { this.append(c); }
  setAttribute(k, v) { this.attrs[k] = v; }
  addEventListener() {}
}
globalThis.document = { createElement: (t) => new El(t), body: new El('body') };
globalThis.window = { addEventListener() {} };
globalThis.Image ??= class {};

const { Dialogue, choiceView, heartsHTML, parseHeartsSub, choicesMode, voiceOf, lastRowSpan } = await import('../src/ui/dialogue.js');
const { choiceColumn } = await import('../src/game/cutscene.js');
const { SPECIES, VOICE_UNICO } = await import('../src/game/species.js');
const { contrast } = await import('../src/ui/contrast.js');

/** 최소 명암 대비 (WCAG 일반 글자) */
const AA = 4.5;

test('부탁을 아직 못 들어주면: 회색으로 지우지 않고 잠긴 줄(locked) + 자물쇠 + 설명의 0/3 을 진행 알약으로', () => {
  const v = choiceView({ label: '📝 부탁 들어주기', note: '붕어 3개만 가져다 줄래? 보상 150 · 보유 0/3 — 3개 모으면 가능', value: 'req', disabled: true }, 0);
  assert.equal(v.cls, 'locked has-note', '설명 줄이 있으면 has-note (:has() 없는 브라우저용)');
  assert.equal(v.disabled, true, '못 누르는 줄은 그대로 못 누름');
  assert.match(v.html, /<b class="pg">0\/3<\/b>/);
  assert.match(v.html, /class="lk"/, '자물쇠');
  assert.doesNotMatch(v.html, /보유 0\/3/, '알약과 같은 글은 설명에서 뺌');
  assert.match(v.html, /<small>붕어 3개만 가져다 줄래\? 보상 150 — 3개 모으면 가능<\/small>/);
  assert.match(v.html, /<span class="k">1<\/span>/);
  assert.match(v.html, /<span class="lb">부탁 들어주기<\/span>/, '잠긴 줄은 앞 이모지를 빼고 자물쇠 하나만');
});

test('잠긴 부탁 설명이 \'지금 2/3개 있어!\' 이면 그 구절을 알약으로 옮기고 설명에는 남기지 않음', () => {
  // 실행
  const v = choiceView({ label: '📝 부탁 들어주기', note: '붕어 3마리 지금 2/3개 있어!', value: 'req', locked: true }, 0);
  // 확인
  assert.match(v.html, /<b class="pg">2\/3<\/b>/);
  assert.match(v.html, /<small>붕어 3마리<\/small>/);
  assert.doesNotMatch(v.html, /2\/3개|지금/, '같은 진행 수를 두 번 보이지 않음');
});

test('격자 선택지 마지막 줄의 빈 칸은 마지막 선택지가 채움 (두 칸·세 칸, 잠긴 줄 두 칸)', () => {
  assert.equal(lastRowSpan([2, 2, 1, 1, 1, 1, 1], 2), 2, '세로 폰: 7개 중 마지막 \'안녕\' 이 혼자 → 한 줄 전체');
  assert.equal(lastRowSpan([2, 2, 1, 1, 1, 1], 2), 1, '짝이 맞으면 그대로');
  assert.equal(lastRowSpan([1, 2, 1, 1, 1, 1, 1], 3), 2, '가로 폰: [1,2] [1,1,1] [1,1] → 마지막이 두 칸');
  assert.equal(lastRowSpan([1, 2, 1, 1, 1, 1], 3), 3, '마지막 줄에 혼자 → 세 칸');
  assert.equal(lastRowSpan([1, 1, 1], 3), 1);
  assert.equal(lastRowSpan([1], 1), 1);
});

test('locked: true 는 누를 수 있는 잠긴 줄, 반려견 재주 잠금(disabled)은 계속 못 누름, 보통 줄은 잠금 모양 없음', () => {
  const opt = choiceView({ label: '📝 부탁 다시 듣기', value: 'req', locked: true, progress: '1/3' }, 1);
  assert.deepEqual([opt.cls, opt.disabled, opt.locked], ['locked', false, true]);
  assert.doesNotMatch(opt.html, /📝/, '자물쇠와 이모지를 나란히 두지 않음');
  assert.match(opt.html, /<b class="pg">1\/3<\/b>/);
  const trick = choiceView({ label: '🐾 손', value: 'trick:paw', disabled: true, note: '하트 2개가 되면 배워요' }, 0);
  assert.deepEqual([trick.cls, trick.disabled], ['locked has-note', true]);
  assert.doesNotMatch(trick.html, /class="pg"/, '진행 수가 없으면 알약 없음');
  const plain = choiceView({ label: '👋 안녕!', value: 'bye' }, 6);
  assert.deepEqual([plain.cls, plain.disabled, plain.locked], ['', false, false]);
  assert.doesNotMatch(plain.html, /class="lk"/);
  assert.match(choiceView({ label: '<b>', value: 'x' }, 0).html, /&lt;b&gt;/, '글은 이스케이프');
});

test('잠긴 줄 글자색은 바탕에서 4.5:1 이상 (예전 opacity·grayscale 없음), 선택지 그림자는 말하는 이 색에서', () => {
  const css = readFileSync(new URL('../src/ui/theme/dialogue.css', import.meta.url), 'utf8');
  const rule = /button\.locked:disabled \{([^}]*)\}/.exec(css)?.[1] || '';
  const fg = /[^-]color:\s*(#[0-9a-f]{6})/i.exec(rule)?.[1], bg = /background:\s*(#[0-9a-f]{6})/i.exec(rule)?.[1];
  assert.ok(fg && bg, `잠긴 줄 색 ${fg} / ${bg}`);
  assert.ok(contrast(fg, bg) >= AA, `글자 ${contrast(fg, bg).toFixed(2)}:1`);
  assert.match(rule, /opacity:\s*1/); assert.match(rule, /filter:\s*none/); assert.match(rule, /dashed/);
  const small = /button\.locked small \{[^}]*color:\s*(#[0-9a-f]{6})/.exec(css)?.[1];
  assert.ok(contrast(small, bg) >= AA, `설명 ${small} ${contrast(small, bg).toFixed(2)}:1`);
  const kc = /button\.locked \.k \{[^}]*background:\s*(#[0-9a-f]{6});\s*color:\s*(#[0-9a-f]{6})/.exec(css);
  assert.ok(contrast(kc[2], kc[1]) >= AA, `번호 ${contrast(kc[2], kc[1]).toFixed(2)}:1`);
  const lay = readFileSync(new URL('../src/ui/css/dialogue.css', import.meta.url), 'utf8');
  assert.match(lay, /\.dlg-choices button \{[^}]*box-shadow: inset 0 2px 0 #fff, 0 3px 0 color-mix\(in srgb, var\(--dlg-accent/);
  assert.match(lay, /\.dlg-text \{[^}]*min-height: calc\(2 \* 1\.55em\)/, '대사는 2줄 높이 (한 줄 대사에 빈 띠 없이, 더 길면 늘어남)');
  assert.doesNotMatch(lay + css, /:has\([^)]*\)\s*,|,\s*[^,{}]*:has\(/, ':has() 를 선택자 목록에 섞지 않음 (모르는 브라우저가 규칙 전체를 버림)');
  assert.doesNotMatch(lay, /\.dlg-text \{[^}]*[^-]height:\s*\d/, '고정 높이 없음 (긴 대사가 잘리지 않게)');
});

test('우정 하트: 이모지 대신 그림 하트 5개 (채운 수 = 우정), 예전 sub 글도 풀어서 하트로, 배부름 같은 나머지는 작은 글로', () => {
  const h = heartsHTML(2, 5);
  assert.equal((h.match(/<svg class="ht on"/g) || []).length, 2);
  assert.equal((h.match(/<svg class="ht"/g) || []).length, 3);
  assert.match(h, /aria-label="우정 2\/5"/);
  assert.equal((heartsHTML(9, 5).match(/ht on/g) || []).length, 5, '5개를 넘지 않음');
  assert.deepEqual(parseHeartsSub('우정 ❤️❤️❤️🤍🤍'), { hearts: 3, max: 5, label: '우정', rest: '' });
  assert.deepEqual(parseHeartsSub('애정 ❤️🤍🤍🤍🤍 · 배부름 80%'), { hearts: 1, max: 5, label: '애정', rest: '배부름 80%' });
  assert.equal(parseHeartsSub('오늘은 맑음'), null);
  assert.equal(parseHeartsSub(undefined), null);
});

test('선택지 자리: PC 는 창 위 오른쪽 기둥, 세로 폰은 창 위 전체 너비, 가로로 눕힌 폰·이름 카드는 창 안', () => {
  assert.equal(choicesMode(1280, 800, false), 'float');
  assert.equal(choicesMode(1024, 768, true), 'float', '태블릿');
  assert.equal(choicesMode(768, 1024, true), 'stack', '세운 태블릿은 세로 폰처럼');
  assert.equal(choicesMode(700, 900, false), 'stack', '세로로 긴 PC 창');
  assert.equal(choicesMode(412, 839, true), 'stack');
  assert.equal(choicesMode(844, 390, true), 'inbox');
  assert.equal(choicesMode(900, 480, false), 'float', '낮은 PC 창(마우스)은 띄움');
  assert.equal(choicesMode(1280, 800, false, true), 'inbox', '이름 카드는 창 안');
});

test('카메라 비키기(choiceColumn)는 선택지가 오른쪽 기둥(float)일 때만: 두 판단이 모든 크기에서 같음', () => {
  for (const [w, h, coarse] of [[1280, 800, false], [1024, 768, true], [768, 1024, true], [700, 900, false], [412, 839, true], [844, 390, true], [900, 480, false], [1920, 1080, false], [601, 600, false]]) {
    assert.equal(choiceColumn(w / h, w, h, coarse, 1) != null, choicesMode(w, h, coarse) === 'float', `${w}x${h} ${coarse ? '터치' : '마우스'}`);
  }
});

test('대화창이 화면 크기에 맞춰 선택지 목록을 창(.dlg) 바로 아래 또는 대사 칸(.dlg-main) 안에 둠', () => {
  const W = globalThis.innerWidth, H = globalThis.innerHeight;
  try {
    const d = new Dialogue({ player: {}, audio: {} }, new El());
    const box = d.choicesEl, main = d.$('.dlg-main');
    globalThis.innerWidth = 1280; globalThis.innerHeight = 800;
    d._placeChoices(false);
    assert.equal(box.parentNode, d.el); assert.ok(d.el.classList.contains('ch-float'));
    d._placeChoices(true);
    assert.equal(box.parentNode, main); assert.ok(d.el.classList.contains('ch-inbox') && !d.el.classList.contains('ch-float'));
    globalThis.innerWidth = 412; globalThis.innerHeight = 839;
    d._placeChoices(false);
    assert.equal(box.parentNode, d.el); assert.ok(d.el.classList.contains('ch-stack'));
  } finally { globalThis.innerWidth = W; globalThis.innerHeight = H; }
});

test('선택지가 열린 채 화면을 돌리면(resize) 선택지 자리를 다시 정함', () => {
  const W = globalThis.innerWidth, H = globalThis.innerHeight, win = globalThis.window;
  const ls = {};
  globalThis.window = { addEventListener: (k, f) => { (ls[k] ||= []).push(f); } };
  try {
    // 준비: 세로 폰에서 선택지가 열린 대화
    const d = new Dialogue({ player: {}, audio: {} }, new El());
    globalThis.innerWidth = 412; globalThis.innerHeight = 839;
    d.active = true; d._placeChoices(false);
    assert.ok(d.el.classList.contains('ch-stack'));
    // 실행: 가로 PC 크기로 돌림
    globalThis.innerWidth = 1280; globalThis.innerHeight = 800;
    for (const f of ls.resize || []) f();
    // 확인
    assert.ok(d.el.classList.contains('ch-float') && !d.el.classList.contains('ch-stack'), '기둥으로 바뀜');
    assert.ok((ls.orientationchange || []).length >= 1, '화면 돌림도 들음');
    // 대화가 끝난 뒤에는 바꾸지 않음
    d.active = false; globalThis.innerWidth = 412; globalThis.innerHeight = 839;
    for (const f of ls.resize || []) f();
    assert.ok(d.el.classList.contains('ch-float'));
  } finally { globalThis.innerWidth = W; globalThis.innerHeight = H; globalThis.window = win; }
});

test('하트가 대화 중 늘면 새로 채워진 하트만 pop (빈 하트는 연분홍 칸)', () => {
  const h = heartsHTML(3, 5, '우정', 1);
  assert.equal((h.match(/ht on pop/g) || []).length, 2, '2·3번째만');
  assert.equal((heartsHTML(3, 5).match(/pop/g) || []).length, 0, '처음 열 때는 없음');
  const css = readFileSync(new URL('../src/ui/theme/dialogue.css', import.meta.url), 'utf8');
  assert.match(css, /\.ht path \{[^}]*fill: #fde3ec/);
  assert.match(css, /prefers-reduced-motion[^{]*\{[^}]*\.ht\.pop \{ animation: none/);
  assert.doesNotMatch(css, /\.dlg-hearts em \{ display: none/, '가로 폰에서도 \'우정\' 글이 보임');
});

test('말소리 고르기: 줄의 voice → 주민 종 → 유니코 종소리, 해설·반려견은 말소리 없음', () => {
  assert.equal(voiceOf({ speaker: { species: SPECIES.bear } }), SPECIES.bear.voice);
  assert.equal(voiceOf({ speaker: { species: null } }), VOICE_UNICO);
  assert.equal(voiceOf({ speaker: null, portrait: 'dog' }), null);
  assert.equal(voiceOf({}), null);
  const own = { f0: 300 };
  assert.equal(voiceOf({ speaker: { species: SPECIES.cat }, voice: own }), own);
  assert.deepEqual(voiceOf({ voice: 500 }), { f0: 500 });
  assert.equal(voiceOf({ speaker: { species: null } }).greet, 'chime', '유니코·KOAT 주민의 첫인사는 종소리 (dialogue.js 가 voiceOf().greet 로 고름)');
});
