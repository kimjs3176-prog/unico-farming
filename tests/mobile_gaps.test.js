// 모바일 최적화 3차: main.js·boot.js·뷰 소스 연결, 스크린샷, 꾸미기 시작, 뒤에서 받는 동물 + 루프 오류 복구·부팅 오류 안내
// (모듈 단위 검사는 input_look·music_timer·fx_cap·pointer_static.test.js 로 나눔)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import * as THREE from 'three';

// 브라우저 없이: window·canvas 는 이벤트 등록만 받는 가짜
globalThis.window ??= { addEventListener() {} };
globalThis.window.innerWidth = 400;
globalThis.innerWidth = 400; globalThis.innerHeight = 800;

const { UI } = await import('../src/ui/ui.js');
const { DecorView } = await import('../src/game/view/decor_view.js');
const { probeWebGL2, bootCode, BOOT_ERR } = await import('../src/boot.js');
const { FailGate } = await import('../src/game/crash.js');

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');

// ---------------------------------------------------------------- 트랙터 시점 복귀
test('트랙터·낚시: 시점 판정을 input.looking 하나로', () => {
  assert.match(read('src/main.js'), /lookHold\(this\._lookHold, input\.looking, dt\)/);
  assert.match(read('src/game/view/ride_view.js'), /g\._lookHold = 0/);
  assert.match(read('src/game/view/nature_view.js'), /input\.looking \|\| input\.joy\.active/);
});

// ---------------------------------------------------------------- 한글 조합 Enter
test('닉네임 입력칸: Enter 는 isSubmitEnter 로 걸러 입장 (한글 조합 중 Enter 로 끝 글자가 빠지지 않게)', () => {
  assert.match(read('src/boot.js'), /nick\.addEventListener\('keydown', \(e\) => \{ if \(isSubmitEnter\(e\)\) start\(\); \}\)/);
});

// ---------------------------------------------------------------- 스크린샷
function shotRig(calls) {
  const cv = {
    toDataURL(t) { calls.push(`dataURL:${t}`); return 'data:image/png;base64,iVBORw0KGgo='; },
    toBlob(cb, t) { calls.push(`toBlob:${t}`); this.cb = cb; },
  };
  const self = {
    game: { renderer: { domElement: cv }, postfx: { render: () => calls.push('render') }, audio: { play() {} } },
    toast: (t) => calls.push(`toast:${t}`), _download: (url) => calls.push(`dl:${url}`),
  };
  return { cv, self };
}

test('스크린샷(PC·안드로이드): 그린 직후 toBlob 으로 비동기 인코딩, 내려받은 뒤 10초에 주소 해제', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const calls = [];
  const { cv, self } = shotRig(calls);
  const keep = [URL.createObjectURL, URL.revokeObjectURL];
  URL.createObjectURL = () => 'blob:shot';
  URL.revokeObjectURL = (u) => calls.push(`revoke:${u}`);
  try {
    UI.prototype.snapshot.call(self);
    assert.deepEqual(calls, ['render', 'toBlob:image/png'], '같은 태스크에서 그리고 바로 toBlob (동기 toDataURL 없음)');
    cv.cb(new Blob(['png']));
    assert.equal(calls.at(-1), 'dl:blob:shot');
    t.mock.timers.tick(9999);
    assert.ok(!calls.includes('revoke:blob:shot'));
    t.mock.timers.tick(1);
    assert.equal(calls.at(-1), 'revoke:blob:shot');
    calls.length = 0;
    UI.prototype.snapshot.call(self);
    cv.cb(null); // 인코딩 실패
    assert.ok(calls.at(-1).startsWith('toast:'), calls.at(-1));
  } finally {
    [URL.createObjectURL, URL.revokeObjectURL] = keep;
  }
});

test('스크린샷(iPhone): 누른 그 순간에 공유 시트 (동기로 파일을 만듦)', () => {
  const calls = [];
  const { self } = shotRig(calls);
  const nav = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X)', canShare: () => true, share: (d) => { calls.push(`share:${d.files[0].name.endsWith('.png')}`); return new Promise(() => {}); } },
  });
  try {
    UI.prototype.snapshot.call(self);
    assert.deepEqual(calls, ['render', 'dataURL:image/png', 'share:true']);
  } finally {
    if (nav) Object.defineProperty(globalThis, 'navigator', nav); else delete globalThis.navigator;
  }
});

// ---------------------------------------------------------------- 꾸미기 시작
test('꾸미기 시작: 그 전에 탭해 걷던 목표는 지움 (도착해서 주민 대화 등이 실행되지 않게)', () => {
  const g = { home: { inside: false }, ride: { driving: false }, ui: { closePanel() {}, toast() {} }, player: { moveTarget: { pos: () => null, stop: 1.9, interact: true, key: 'npc' } } };
  const dv = Object.assign(Object.create(DecorView.prototype), { game: g, mode: null, _bar() {}, _ghost: () => null });
  dv.start(null);
  assert.equal(g.player.moveTarget, null);
  assert.ok(dv.mode);
});

// ---------------------------------------------------------------- 뒤에서 받는 동물
test('입장 뒤: 목장 손님 동물은 플레이어 위치 없이 바로 넣지 않음 (ranch.update 가 화면 밖에 풀어 놓음), 셰이더는 미리 준비', () => {
  const main = read('src/main.js');
  const at = main.indexOf('  shown() {');
  const shown = main.slice(at, main.indexOf('\n  }\n', at));
  assert.ok(at > 0 && shown.length > 0);
  assert.ok(!/addVisitors/.test(shown), 'shown() 이 addVisitors() 를 부르지 않음');
  assert.match(shown, /loadDeferred\?\.\(\)\.then\(\(\) => this\.warmDeferred\(\)\)/);
  assert.match(read('src/game/game_gfx.js'), /compileAsync\(batch, this\.camera, this\.world\.scene\)/);
  assert.match(read('src/game/view/ranch_view.js'), /this\.addVisitors\(playerPos\)/);
});

test('뒤에서 받는 동물 셰이더: 도착한 것만 모델마다 한 번, 로딩 화면 뒤에서도 준비', () => {
  const main = read('src/main.js'), gfx = read('src/game/game_gfx.js');
  const at = gfx.indexOf('  warmDeferred() {');
  const src = gfx.slice(at, gfx.indexOf('\n  },', at) + 4).trim(); // 믹스인 객체의 메서드 하나 (끝 쉼표 빼고)
  const warm = new Function('THREE', 'DEFERRED_MODELS', `return function ${src}`)(THREE, [['q_horse', 'q_donkey'], ['q_wolf']]);
  const have = new Set(['q_horse']);
  const batches = [];
  const g = {
    camera: new THREE.PerspectiveCamera(), world: { scene: new THREE.Scene() }, postfx: null,
    assets: { deferredDone: false, has: (n) => have.has(n), anims: new Map(), clone: (n) => Object.assign(new THREE.Object3D(), { name: n }) },
    renderer: { compileAsync: (b) => { batches.push(b.children.map((o) => o.name)); return Promise.resolve(); }, getRenderTarget: () => null, setRenderTarget() {} },
  };
  assert.ok(warm.call(g) instanceof Promise, '기다릴 수 있게 약속을 돌려줌');
  assert.equal(warm.call(g), null, '이미 준비한 것은 다시 하지 않음');
  have.add('q_donkey'); have.add('q_wolf');
  warm.call(g);
  assert.deepEqual(batches, [['q_horse'], ['q_donkey', 'q_wolf']]);
  assert.equal(g._warmedDeferred, true, '다 왔으면 멈춤');
  // 입장 전 컴파일(5초 경주) 안에서 함께, 게임 루프에서는 도착하는 대로 (목장이 풀기 전에)
  assert.match(read('src/boot.js'), /Promise\.race\(\[Promise\.all\(\[R\.compileAsync\(sc, cm\), window\.game\.warmDeferred\(\)\]\)/);
  const logic = main.slice(main.indexOf('  stepLogic('), main.indexOf('this.ranch.update(dt, pw)'));
  assert.ok(logic.length > 0);
  assert.match(logic, /if \(!this\._warmedDeferred\) this\.warmDeferred\(\)/);
});

// ---------------------------------------------------------------- Game 믹스인 (main.js + src/game/game_*.js)
test('Game 믹스인: 메서드는 한 파일에만 있고, this.메서드() 호출은 모두 Game 에 있으며, 믹스인 파일은 모두 main.js 에서 붙임', () => {
  const main = read('src/main.js');
  const mixins = readdirSync(new URL('src/game/', root)).filter((f) => /^game_\w+\.js$/.test(f)).sort();
  assert.ok(mixins.length >= 5, mixins.join());
  const start = main.indexOf('class Game {');
  const cls = main.slice(start, main.indexOf('\n}\n', start));
  const defs = new Map(); // 메서드 이름 → 파일
  const add = (name, file) => { assert.ok(!defs.has(name), `${name} 이 ${defs.get(name)} 와 ${file} 에 둘 다 있음 (Object.assign 이 몰래 덮어씀)`); defs.set(name, file); };
  const METHOD = /^ {2}(?:async )?([a-zA-Z_]\w*)\(/gm, CALL = /this\.([a-zA-Z_]\w*)\??\.?\(/g;
  for (const m of cls.matchAll(METHOD)) add(m[1], 'main.js');
  const calls = [...cls.matchAll(CALL)].map((m) => [m[1], 'main.js']);
  for (const f of mixins) {
    const src = read(`src/game/${f}`);
    const name = src.match(/^export const (\w+) = \{$/m)?.[1];
    assert.ok(name, `${f}: export const <이름> = { … } 꼴`);
    assert.match(main, new RegExp(`import \\{ ${name} \\} from './game/${f}'`), `${f} 를 main.js 가 import`);
    assert.match(main, new RegExp(`Object\\.assign\\(Game\\.prototype,[^)]*\\b${name}\\b`), `${name} 을 Game.prototype 에 붙임`);
    assert.ok(!/^ {2}[a-zA-Z_]\w*\s*:\s*(?:async\s*)?(?:\([^)]*\)|\w+)\s*=>/m.test(src), `${f}: 화살표 함수 속성 없이 축약 메서드만 (this 가 Game 이 되게)`);
    for (const m of src.matchAll(METHOD)) add(m[1], f);
    for (const m of src.matchAll(CALL)) calls.push([m[1], f]);
  }
  for (const [n, f] of calls) assert.ok(defs.has(n), `${f}: this.${n}() 가 Game 에 없음`);
  for (const n of ['save', 'restore', 'introCutscene', 'teleport', 'onEvent', 'applyQuality', 'warmDeferred', 'loop', 'shown']) assert.ok(defs.has(n), n);
  // boot.js 는 Game 을 받아서 만듦 (main.js 를 import 하지 않음: 순환 없음)
  const boot = read('src/boot.js');
  assert.match(boot, /export async function boot\(Game\)/);
  assert.ok(!/from '\.\/main\.js'/.test(boot));
  assert.match(main, /\nboot\(Game\);\nexport \{ QUESTS \};\n$/);
});

// ---------------------------------------------------------------- 루프 오류 복구 (한 시스템의 오류가 게임을 영영 멈추지 않게)
/** main.js 의 Game 메서드 하나를 꺼내 함수로 (Game 은 import 하면 부팅이 돌아 직접 못 씀) */
function method(name, deps = {}) {
  const main = read('src/main.js');
  const at = main.indexOf(`\n  ${name}(`);
  assert.ok(at > 0, name);
  const src = main.slice(at + 3, main.indexOf('\n  }\n', at) + 4);
  return new Function(...Object.keys(deps), `return function ${src}`)(...Object.values(deps));
}

test('crash.js 를 main.js 맨 처음에 import (다른 모듈을 읽다 난 오류도 기록)', () => {
  const main = read('src/main.js');
  assert.match(main.split('\n').find((l) => l.startsWith('import ')), /from '\.\/game\/crash\.js'/);
});

test('루프: 로직이 던져도 그리기·자동 저장·입력 정리는 계속, 처음 보는 오류만 다시 알림, 10초에 5번이면 저장하고 멈춤', () => {
  const seen = new Set(), reported = [];
  const record = (e, where) => { const k = where + e.message; if (seen.has(k)) return false; seen.add(k); return true; };
  const loop = method('loop'), frameError = method('frameError', { record, rethrowLater: (e) => reported.push(e.message) });
  const calls = [];
  let now = 0;
  const g = {
    frameCap: null, saveTimer: 9.99, failGate: new FailGate(),
    timer: { update() {}, getDelta: () => 0.016 },
    stepLogic() { calls.push('logic'); throw new Error('bees 오류'); },
    stepRender() { calls.push('render'); },
    save() { calls.push('save'); this.saveTimer = 0; },
    input: { endFrame: () => calls.push('endFrame') },
    renderer: { setRenderTarget: (t) => calls.push(`rt:${t}`) },
    frameError, crashStop() { calls.push('crashStop'); },
  };
  loop.call(g, (now += 16));
  assert.deepEqual(calls, ['logic', 'render', 'save', 'endFrame'], '그리기·저장·입력 정리까지');
  assert.deepEqual(reported, ['bees 오류'], '한 번 다시 알림 (화면 점검 pageerror)');
  for (let i = 0; i < 3; i++) loop.call(g, (now += 16));
  assert.ok(!calls.includes('crashStop'), '네 번까지는 계속');
  assert.deepEqual(reported, ['bees 오류'], '같은 오류는 다시 알리지 않음');
  loop.call(g, (now += 16));
  assert.equal(calls.at(-1), 'crashStop', '다섯 번째에 멈춤');
  // 그리기 오류: 렌더 타깃을 화면으로 되돌림, 로직이 잘 돌면 연속 횟수는 0
  calls.length = 0;
  g.failGate = new FailGate();
  g.stepLogic = () => calls.push('logic');
  g.stepRender = () => { throw new Error('후처리 오류'); };
  loop.call(g, (now += 16));
  assert.deepEqual(calls, ['logic', 'rt:null', 'endFrame']);
  g.stepRender = () => {};
  loop.call(g, (now += 16));
  assert.equal(g.failGate.run, 0);
});

test('오류가 계속될 때: 루프를 멈추고 오류 직전 저장(crash) 뒤 안내 카드 — 한 번만', () => {
  const shown = [];
  const crashStop = method('crashStop', { showFatal: (k, o) => shown.push([k, o.saved]) });
  const opts = [];
  const g = { renderer: { setAnimationLoop: (f) => opts.push(['loop', f]) }, save: (o) => { opts.push(['save', o]); return true; }, music: { pause() {} } };
  crashStop.call(g);
  crashStop.call(g);
  assert.deepEqual(opts, [['loop', null], ['save', { crash: true }]]);
  assert.deepEqual(shown, [['loop', true]]);
});

test('발 먼지: 셋째 인자(달리기 섞임 r)가 오면 뛸 때만, 없으면 예전처럼 매 걸음', () => {
  // 발소리(audio.step)가 같은 함수에 붙어도 먼지 조건은 그대로
  assert.match(read('src/main.js'), /onStep = \(x, z, r\) => \{\s*if \(r === undefined \|\| r > 0\.5\) this\.fx\.dust\(x, z\);/);
});

// ---------------------------------------------------------------- 부팅 오류 안내 (멈춘 로딩 카드 대신)
test('WebGL2 확인: 버리는 캔버스로 (#game 은 건드리지 않음), 확인 뒤 컨텍스트를 놓음, 없으면 까닭', () => {
  const made = [];
  const doc = (gl, why) => ({
    createElement(tag) {
      const c = { tag, on: {}, addEventListener(k, f) { this.on[k] = f; }, getContext(kind) { made.push(kind); if (!gl) this.on.webglcontextcreationerror?.({ statusMessage: why }); return gl; } };
      return c;
    },
    getElementById() { throw new Error('#game 을 쓰면 안 됨'); },
  });
  let lost = 0;
  const gl = { getExtension: (n) => (n === 'WEBGL_lose_context' ? { loseContext: () => lost++ } : null) };
  assert.deepEqual(probeWebGL2(doc(gl)), { ok: true, why: '' });
  assert.equal(lost, 1);
  assert.deepEqual(probeWebGL2(doc(null, 'GPU 차단 목록')), { ok: false, why: 'GPU 차단 목록' });
  assert.deepEqual(made, ['webgl2', 'webgl2']);
  assert.equal(probeWebGL2({ createElement() { throw new Error('캔버스 없음'); } }).ok, false);
});

test('부팅 오류 코드: 망 끊김 E-NET · WebGL E-GL · 입장 중 E-START · 그 밖 E-BOOT (문구는 모두 있음)', () => {
  assert.equal(bootCode(Object.assign(new Error('x'), { code: 'E-NET' })), 'E-NET');
  assert.equal(bootCode(new Error('Error creating WebGL context.'), 'start'), 'E-GL');
  assert.equal(bootCode(new Error('undefined is not a function'), 'start'), 'E-START');
  assert.equal(bootCode(new Error('/models/unico_biped.bin: 404')), 'E-BOOT');
  for (const k of ['E-GL', 'E-NET', 'E-BOOT', 'E-START']) assert.ok(BOOT_ERR[k].text && BOOT_ERR[k].sub, k);
  assert.match(BOOT_ERR['E-GL'].text, /3D 화면을 켤 수 없어요/);
});

test('부팅: WebGL2 확인이 모델 받기보다 먼저, 받기·입장 실패는 안내 카드로, 입장 실패면 다시 누를 수 있게', () => {
  const boot = read('src/boot.js');
  const body = boot.slice(boot.indexOf('export async function boot(Game)'));
  assert.ok(body.indexOf('probeWebGL2()') < body.indexOf('assets.loadAll('), '3MB 를 받기 전에 확인');
  assert.match(body, /catch \(e\) \{\n\s+fail\(bootCode\(e, 'load'\), e\);\n\s+return;/);
  assert.match(body, /catch \(e\) \{[^}]*started = false;\n\s+btn\.disabled = false;\n\s+fail\(bootCode\(e, 'start'\), e\);/);
  assert.match(body, /onFetchRetry\(/, "느린 망: '연결이 느려요…' 문구");
  assert.match(boot, /btn\.onclick = \(\) => location\.reload\(\)/, '다시 시도는 새로고침 (반쯤 만든 게임을 다시 쓰지 않음)');
  assert.match(boot, /location\.href = '\.\/pixel\.html'/, 'WebGL2 가 없으면 도트 판으로');
});

/** 아주 작은 가짜 DOM (부팅 오류 카드 시험용) */
class El {
  constructor(tag, attrs = {}) {
    Object.assign(this, { tag, attrs, children: [], parent: null, style: { cssText: '', display: '' }, textContent: '', className: attrs.class || '', onclick: null, disabled: false });
    const cls = new Set();
    this.classList = { add: (c) => cls.add(c), remove: (c) => cls.delete(c), contains: (c) => cls.has(c) };
  }
  append(...ns) {
    for (let n of ns) {
      if (typeof n === 'string') { const t = new El('#text'); t.textContent = n; n = t; } // 글 조각
      n.parent = this; this.children.push(n);
    }
  }
  get text() { return this.tag === '#text' || !this.children.length ? this.textContent : this.children.map((c) => c.text).join(''); }
  after(...ns) { const s = this.parent.children; s.splice(s.indexOf(this) + 1, 0, ...ns); for (const n of ns) n.parent = this.parent; }
  remove() { const s = this.parent?.children; if (s) s.splice(s.indexOf(this), 1); this.parent = null; }
  closest(sel) { let n = this; while (n && !(sel === '.hint' && n.className === 'hint')) n = n.parent; return n; }
  all() { return [this, ...this.children.flatMap((c) => c.all())]; }
  querySelector(sel) {
    const m = { '.bar': (n) => n.className === 'bar', '.name-row': (n) => n.className === 'name-row', '.feature-row': (n) => n.className === 'feature-row', '.hint.keys': (n) => n.className === 'hint keys', 'a[href="./pixel.html"]': (n) => n.tag === 'a' && n.attrs.href === './pixel.html' }[sel];
    return this.all().slice(1).find(m) || null;
  }
}
function loadingCard() {
  const card = new El('div', { class: 'loading-card' });
  const lt = new El('p');
  lt.textContent = '농장 준비 중…';
  const bar = new El('div', { class: 'bar' }), row = new El('label', { class: 'name-row' }), btn = new El('button');
  btn.textContent = '입장하기';
  btn.disabled = true;
  const hint = new El('p', { class: 'hint' });
  hint.append(new El('a', { href: './pixel.html' }));
  const chips = new El('div', { class: 'feature-row' }), keys = new El('p', { class: 'hint keys' });
  card.append(chips, lt, bar, row, btn, hint, keys);
  const doc = { querySelector: (s) => (s === '#loading .loading-card' ? card : null), getElementById: (id) => ({ 'loading-text': lt, 'start-btn': btn })[id] || null, createElement: (t) => new El(t) };
  return { card, lt, bar, row, btn, hint, chips, keys, doc };
}

test('부팅 오류 카드: E-GL 은 큰 [도트(2.5D)] 단추 + 겹치는 작은 도트 링크·막대·닉네임·기능 칩·조작 안내 숨김, 코드는 단추 아래 알약, 되돌리면 원래대로', async () => {
  const { bootErrorCard } = await import('../src/boot.js');
  const D = loadingCard();
  const keep = [globalThis.document, globalThis.location];
  globalThis.document = D.doc;
  globalThis.location = { href: '/', reload() { this.reloaded = true; } };
  try {
    let tried = 0;
    const undo = bootErrorCard('E-GL', new Error('Error creating WebGL context.'), { onTry3d: () => tried++ });
    assert.equal(D.lt.textContent, '이 기기에서는 3D 화면을 켤 수 없어요');
    assert.deepEqual([D.bar, D.row, D.hint, D.chips, D.keys].map((e) => e.style.display), ['none', 'none', 'none', 'none', 'none']);
    assert.ok(D.card.classList.contains('boot-error'));
    assert.match(D.card.style.width, /100vw - 32px/, '좁은 화면도 양옆 16px');
    assert.equal(D.btn.textContent, '🎮 도트(2.5D) 버전으로 하기');
    assert.equal(D.btn.disabled, false);
    D.btn.onclick();
    assert.equal(location.href, './pixel.html');
    const sub = D.card.children[2];
    assert.equal(sub.text, BOOT_ERR['E-GL'].sub);
    const nw = sub.children.find((n) => n.tag === 'span');
    assert.equal(nw.textContent, '도트(2.5D) 버전');
    assert.equal(nw.style.whiteSpace, 'nowrap', '도트(2.5D) 가 줄 끝에서 쪼개지지 않게');
    const pill = D.card.all().find((n) => n.tag === 'span' && /^오류 코드/.test(n.textContent));
    assert.equal(pill.textContent, '오류 코드 E-GL');
    assert.ok(D.card.children.indexOf(pill.parent) > D.card.children.indexOf(D.btn), '코드는 단추 아래');
    const small = D.card.all().filter((n) => n.tag === 'button' && n.className === 'ghost');
    assert.deepEqual(small.map((b) => b.textContent), ['그래도 3D로 시도', '📋 진단 정보 복사']);
    small[0].onclick();
    assert.equal(tried, 1);
    undo();
    assert.equal(D.lt.textContent, '농장 준비 중…');
    assert.deepEqual([D.bar, D.row, D.hint, D.chips, D.keys].map((e) => e.style.display), ['', '', '', '', '']);
    assert.ok(!D.card.classList.contains('boot-error'));
    assert.equal(D.card.style.cssText, '');
    assert.equal(D.btn.textContent, '입장하기');
    assert.equal(D.btn.disabled, true);
    assert.equal(D.card.children.length, 7, '더한 줄은 모두 지움');
    // 그 밖의 오류: [다시 시도] = 새로고침, 도트 링크는 그대로 둠, [그래도 3D] 없음
    const D2 = loadingCard();
    globalThis.document = D2.doc;
    bootErrorCard('E-START', new Error('x'));
    assert.equal(D2.btn.textContent, '🔄 다시 시도');
    assert.equal(D2.hint.style.display, '');
    D2.btn.onclick();
    assert.ok(location.reloaded);
    assert.deepEqual(D2.card.all().filter((n) => n.className === 'ghost').map((b) => b.textContent), ['📋 진단 정보 복사']);
  } finally {
    [globalThis.document, globalThis.location] = keep;
  }
});

test('부팅 오류 카드 E-NET: 끊긴 동안 \'연결을 기다리는 중\' · 망이 돌아오면 새로고침 · 카드를 거두면(진행 재개) 듣기도 뗌', async () => {
  const { bootErrorCard } = await import('../src/boot.js');
  const D = loadingCard();
  const on = {};
  const keep = [globalThis.document, globalThis.location, globalThis.window, Object.getOwnPropertyDescriptor(globalThis, 'navigator')];
  globalThis.document = D.doc;
  globalThis.location = { reloads: 0, reload() { this.reloads++; } };
  globalThis.window = { addEventListener: (k, f) => { (on[k] ||= new Set()).add(f); }, removeEventListener: (k, f) => on[k]?.delete(f) };
  Object.defineProperty(globalThis, 'navigator', { value: { onLine: false, userAgent: 'test' }, configurable: true });
  const fire = (k) => [...(on[k] || [])].forEach((f) => f());
  try {
    let undo = bootErrorCard('E-NET', Object.assign(new Error('x'), { code: 'E-NET' }));
    assert.equal(D.lt.textContent, '농장을 불러오지 못했어요');
    assert.equal(D.card.children[2].text, BOOT_ERR['E-NET'].sub, '끊긴 동안은 저절로 다시 한다고 알림');
    const wait = D.card.all().find((n) => /연결을 기다리는 중/.test(n.textContent));
    assert.equal(wait.style.display, '');
    fire('online');
    assert.equal(location.reloads, 1, '망이 돌아오면 저절로 다시');
    // 잠깐 멈췄다가 다시 진행 → 카드를 거둠: 그 뒤 게임 중에 망이 끊겼다 돌아와도 새로고침하지 않음
    undo();
    assert.equal(on.online.size, 0);
    fire('online');
    assert.equal(location.reloads, 1);
    // 망은 잡혀 있는데 받다가 멈춤: 저절로 다시 한다는 말은 빼고, 끊기면 그때 기다림 줄
    navigator.onLine = true;
    const D2 = loadingCard();
    globalThis.document = D2.doc;
    undo = bootErrorCard('E-NET', Object.assign(new Error('x'), { code: 'E-NET' }));
    assert.equal(D2.card.children[2].text, BOOT_ERR['E-NET'].subOnline);
    const wait2 = D2.card.all().find((n) => /연결을 기다리는 중/.test(n.textContent));
    assert.equal(wait2.style.display, 'none');
    fire('offline');
    assert.equal(wait2.style.display, '');
    undo();
  } finally {
    [globalThis.document, globalThis.location, globalThis.window] = keep;
    if (keep[3]) Object.defineProperty(globalThis, 'navigator', keep[3]); else delete globalThis.navigator;
  }
});

test('멈춘 창(다른 창·치명 오류)은 boot 가 startLoop 를 불러도 루프를 다시 켜지 않음', () => {
  const startLoop = method('startLoop');
  const set = [];
  const g = { _stale: true, timer: { update() {} }, governor: { reset() {} }, renderer: { setAnimationLoop: (f) => set.push(f) } };
  startLoop.call(g);
  g._stale = false; g._crashed = true;
  startLoop.call(g);
  assert.deepEqual(set, []);
  g._crashed = false;
  startLoop.call(g);
  assert.equal(set.length, 1);
});

test('치명 오류가 인트로 전(저장 안 함)이면 \'저장해 두었어요\' 라고 하지 않음', () => {
  const shown = [];
  const crashStop = method('crashStop', { showFatal: (k, o) => shown.push(o.saved) });
  crashStop.call({ renderer: { setAnimationLoop() {} }, save: () => false });
  assert.deepEqual(shown, [false]);
});
