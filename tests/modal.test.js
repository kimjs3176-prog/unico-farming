// 대화·컷신과 창 정리: 멈춤 까닭(hold)·대화 중 단축키/이동 막기·컷신 대기열·오류가 나도 풀림 (화면 없이)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';

const classes = new Set();
const el = () => ({ className: '', innerHTML: '', style: {}, classList: { add() {}, remove() {}, contains: () => false, toggle() {} }, querySelector: () => el(), querySelectorAll: () => [], append() {}, remove() {}, addEventListener() {}, setAttribute() {} });
globalThis.document ??= { createElement: el, getElementById: el, addEventListener() {} };
globalThis.document.body = { classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c) } };
globalThis.window ??= { addEventListener() {} };
globalThis.innerHeight ??= 800;
globalThis.requestAnimationFrame ??= (f) => setTimeout(() => f(performance.now()), 1);

const { Player } = await import('../src/game/player.js');
const { UI } = await import('../src/ui/ui.js');
const { Cinematics } = await import('../src/game/cutscene.js');
const { Dialogue } = await import('../src/ui/dialogue.js');
const { GameTravel, BUSY_TRAVEL } = await import('../src/game/game_travel.js');
const { Minimap } = await import('../src/ui/minimap.js');

/** 멈춤 까닭만 있는 플레이어 (Player 의 hold/frozen 그대로) */
const player = () => Object.assign(Object.create(Player.prototype), { unico: { playAction() {} }, group: { position: new THREE.Vector3() } });

function game(over = {}) {
  const g = {
    player: player(), input: { enabled: true }, toasts: [],
    ui: { closePanel() { g.ui.panel = null; g.player.unhold('panel'); }, toast: (t) => g.toasts.push(t), panel: null },
    camera: new THREE.PerspectiveCamera(45, 1.6, 0.1, 600), followCam: { smooth: new THREE.Vector3() },
    dialogue: { active: false, say: async () => null, skipAll() {} },
    governor: { reset() {} },
    ...over,
  };
  g.busy = () => !!(g.cinema?.locked || g.dialogue.active);
  return g;
}

test('멈춤 까닭: 창을 닫아도 대화·컷신·예전 방식(legacy) 멈춤은 그대로', () => {
  const p = player();
  assert.equal(p.frozen, false);
  p.frozen = true; // 낚시·잠수 등 예전 방식
  p.hold('dlg');
  const ui = Object.assign(Object.create(UI.prototype), { panel: null, game: { input: { enabled: false }, player: p } });
  ui.closePanel();
  assert.equal(p.frozen, true, '대화·legacy 가 남음');
  p.unhold('dlg');
  assert.equal(p.frozen, true, 'legacy 가 남음');
  p.frozen = false;
  assert.equal(p.frozen, false);
  // 창: 열면 멈추고 닫으면 풀림, 컷신 중이면 닫아도 멈춘 채
  p.hold('cine'); p.hold('panel');
  ui.closePanel();
  assert.equal(p.frozen, true, '컷신 중');
  p.unhold('cine');
  assert.equal(p.frozen, false);
});

test('컷신: 시작부터 끝까지 멈춤 (첫 줄 전 closePanel 이 풀지 않음), 끝나면 풀리고 띠도 걷힘', async () => {
  const g = game();
  const c = (g.cinema = new Cinematics(g, el()));
  const seen = [];
  const run = c.play([{ run: () => seen.push(['run1', g.player.frozen, c.locked, classes.has('cine')]) }, { wait: 0.01 }, { run: () => { g.ui.closePanel(); seen.push(['afterClose', g.player.frozen]); } }]);
  assert.equal(g.player.frozen, true, '바로 멈춤');
  await run;
  assert.deepEqual(seen, [['run1', true, true, true], ['afterClose', true]]);
  assert.equal(g.player.frozen, false);
  assert.equal(c.locked, false);
  assert.equal(classes.has('cine'), false);
});

test('컷신 대기열: 도는 중에 또 부르면 버리지 않고 끝난 뒤 이어서', async () => {
  const g = game();
  const c = (g.cinema = new Cinematics(g, el()));
  const order = [];
  const a = c.play([{ run: () => order.push('a1') }, { wait: 0.02 }, { run: () => order.push('a2') }]);
  const b = c.play([{ run: () => order.push(['b', c.locked, g.player.frozen]) }]);
  await Promise.all([a, b]);
  assert.deepEqual(order, ['a1', 'a2', ['b', true, true]]);
  assert.equal(c.locked, false);
  assert.equal(g.player.frozen, false);
});

test('컷신 도중 오류: 잠금·띠·멈춤이 풀리고 오류는 부른 쪽으로, 대기 중인 다음 컷신은 그대로 돎', async () => {
  const g = game();
  const c = (g.cinema = new Cinematics(g, el()));
  const a = c.play([{ run: () => { throw new Error('boom'); } }, { run: () => assert.fail('뒤 스텝은 안 돎') }]);
  let ranB = false;
  const b = c.play([{ run: () => { ranB = true; } }]);
  await assert.rejects(a, /boom/);
  await b;
  assert.ok(ranB);
  assert.equal(c.locked, false);
  assert.equal(g.player.frozen, false);
  assert.equal(classes.has('cine'), false);
});

test('컷신 ask: 건너뛰면 기본값으로 then, 아니면 대화창 입력값', async () => {
  const g = game();
  const c = (g.cinema = new Cinematics(g, el()));
  let got = null;
  g.dialogue.say = async (ln) => `${ln.input.value}!`;
  await c.play([{ ask: { text: '이름?', input: { value: '콩이', max: 6 } }, then: (v) => { got = v; } }]);
  assert.equal(got, '콩이!');
  c.play([{ wait: 5 }, { ask: { text: '이름?', input: { value: '콩이', max: 6 } }, then: (v) => { got = v; } }]);
  c.skipping = true;
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(got, '콩이');
});

test('대화: 진행 중에 또 say 하면 덮어쓰지 않고 끝난 뒤 이어서 · 대화 동안 talking 표시와 dlg 멈춤', async () => {
  const p = player();
  const d = Object.assign(Object.create(Dialogue.prototype), { game: { player: p, cinema: {} }, el: el() });
  const log = [];
  let release;
  d._lines = (lines) => {
    log.push(['start', lines[0], d.active, p.frozen, classes.has('talking')]);
    return lines[0] === 'A' ? new Promise((r) => { release = () => r('a'); }) : Promise.resolve('b');
  };
  const a = d.say('A');
  const b = d.say('B');
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(log.length, 1, 'B 는 기다림');
  release();
  assert.deepEqual(await Promise.all([a, b]), ['a', 'b']);
  assert.deepEqual(log, [['start', 'A', true, true, true], ['start', 'B', true, true, true]]);
  assert.equal(d.active, false);
  assert.equal(p.frozen, false);
  assert.equal(classes.has('talking'), false);
});

test('대화 중이면 체험관 이동·순간이동·지도 이동을 막고 알림', () => {
  const g = Object.assign(Object.create(GameTravel), game());
  g.dialogue.active = true;
  let moved = 0;
  g.home = { leave() {} }; g.fx = { burst() {} }; g.audio = { play() {} };
  g.ride = { driving: false }; g.smartfarm = {}; g.nature = {}; g.rice = {}; g.flags = {};
  g.player.position.set(0, 0, 0);
  const tp = g.teleport(5, 5);
  assert.equal(tp, false);
  g.goKoat();
  assert.equal(g.player.position.x, 0);
  const m = Object.assign(Object.create(Minimap.prototype), { game: Object.assign(g, { teleport: () => { moved++; }, findOpenSpot: (x, z) => ({ x, z }), farm: {}, lake: {} }) });
  m.travel(3, 3, '장터');
  m.openBig();
  assert.equal(moved, 0);
  assert.ok(g.toasts.length >= 4 && g.toasts.every((t) => t === BUSY_TRAVEL), g.toasts.join('/'));
  // 대화가 끝나면 다시 이동
  g.dialogue.active = false;
  m.travel(3, 3, '장터');
  assert.equal(moved, 1);
});

test('체험관 첫 방문: 도착 팡파르 없음, 표시는 컷신이 정함 (이동만으로는 koatIntro 가 켜지지 않음)', () => {
  const g = Object.assign(Object.create(GameTravel), game());
  const sounds = [];
  let cut = 0;
  Object.assign(g, { home: { leave() {} }, fx: { burst() {} }, audio: { play: (s) => sounds.push(s) }, ride: {}, smartfarm: {}, nature: {}, rice: {}, flags: {}, koatCutscene() { cut++; } });
  g.goKoat();
  assert.equal(cut, 1);
  assert.equal(g.flags.koatIntro, undefined);
  assert.ok(!sounds.includes('levelup'));
});

test('대화·컷신 중에는 I·Q·M·P·T 단축키로 창을 열지 않음 (Esc 로 닫기는 그대로)', () => {
  const src = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const i = src.indexOf('if (!this.busy()) {'), j = src.indexOf('\n    }\n', i);
  assert.ok(i > 0 && j > i);
  const block = src.slice(i, j);
  for (const k of ['KeyI', 'KeyQ', 'KeyM', 'KeyP', 'KeyT']) assert.ok(block.includes(`'${k}'`), k);
  assert.ok(src.indexOf("justPressed('Escape')") < i, 'Esc 는 막지 않음');
  assert.match(src, /busy\(\) \{ return !!\(this\.cinema\?\.locked \|\| this\.dialogue\?\.active\); \}/);
});
