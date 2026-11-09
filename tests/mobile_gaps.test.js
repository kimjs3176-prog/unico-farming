// 모바일 최적화 3차: main.js·boot.js·뷰 소스 연결, 스크린샷, 꾸미기 시작, 뒤에서 받는 동물
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

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');

// ---------------------------------------------------------------- 트랙터 시점 복귀
test('트랙터·낚시: 시점 판정을 input.looking 하나로', () => {
  assert.match(read('src/main.js'), /lookHold\(this\._lookHold, input\.looking, dt\)/);
  assert.match(read('src/game/view/tractor_view.js'), /g\._lookHold = 0/);
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
  const g = { home: { inside: false }, tractor: { driving: false }, ui: { closePanel() {}, toast() {} }, player: { moveTarget: { pos: () => null, stop: 1.9, interact: true, key: 'npc' } } };
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
  const loop = main.slice(main.indexOf('  loop(now'), main.indexOf('this.ranch.update(dt, pw)'));
  assert.match(loop, /if \(!this\._warmedDeferred\) this\.warmDeferred\(\)/);
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
