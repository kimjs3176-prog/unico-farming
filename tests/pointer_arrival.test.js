// 탭해서 걸어가기: 도착하면 누른 대상만 실행 (도착 안내·플레이어 도착 종류·도착 처리·꾸미기 중 탭·탭 대상 종류 약속)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import * as THREE from 'three';

// 브라우저 없이: 세로 터치 폰처럼 보이게 하는 최소 흉내 (각 시험 파일은 따로 실행됨)
const el = () => ({ className: '', innerHTML: '', style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {} }, remove() {}, append() {}, querySelector: () => null, querySelectorAll: () => [] });
globalThis.document ??= { createElement: el, getElementById: el };
globalThis.requestAnimationFrame ??= (f) => f();
globalThis.window ??= { addEventListener() {}, innerWidth: 390 };
globalThis.screen ??= { width: 390, height: 844 };
globalThis.matchMedia = (q) => ({ matches: /coarse|max-width: 600px/.test(q) });

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root));

const { PromptPick, PointerNav, arrivalStep } = await import('../src/game/pointer.js');
const { Player } = await import('../src/game/player.js');

// ---------------------------------------------------------------- 탭한 대상만 도착 시 실행
test('도착 안내: 탭한 종류가 있으면 더 가까운 옆 안내가 아니라 그 대상', () => {
  const orders = { d: 0.4, key: 'orders' }, compost = { d: 1.1, key: 'compost' };
  const c = new PromptPick('compost');
  c.add(orders); c.add(null); c.add(compost);
  assert.equal(c.prompt, orders, '말풍선은 그대로 가장 가까운 것');
  assert.equal(c.arrival(), compost, '도착하면 누른 퇴비통');
  // 여러 종류(벌통: 꿀 거두기·모으는 중) 중 하나면 됨, 같은 종류가 여럿이면 가까운 것
  const h = new PromptPick(['honey', 'hive']);
  h.add({ d: 0.3, key: 'workshop' }); h.add({ d: 1.4, key: 'hive' }); h.add({ d: 0.9, key: 'honey' });
  assert.equal(h.arrival().key, 'honey');
  // 누른 대상의 안내가 없으면(범위 밖) 옆 안내도 실행하지 않음
  const none = new PromptPick('trough');
  none.add({ d: 0.2, key: 'workshop' });
  assert.equal(none.arrival(), null);
});

test('도착 안내: 종류 없는 대상(밭·동물)은 예전처럼 가장 가까운 안내, 진행 중 미니게임(d<0)이 먼저', () => {
  const c = new PromptPick(null);
  const tile = { d: 0.5, key: 'hoeing' }, mg = { d: -1, key: 'fishing' };
  c.add(tile); c.add(mg);
  assert.equal(c.prompt, mg);
  assert.equal(c.arrival(), mg);
  const in1 = new PromptPick('home_desk');
  in1.add({ d: 0.1, key: 'npc' }); // 집 안에서는 바깥 안내를 버리고 가구 안내만
  in1.only({ d: 0.2, key: 'home_desk' });
  assert.equal(in1.prompt.key, 'home_desk');
  assert.equal(in1.arrival().key, 'home_desk');
  in1.only({ d: 0.2, key: 'home_calendar' });
  assert.equal(in1.arrival(), null, '책상을 눌렀는데 달력 앞이면 달력을 열지 않음');
});

/** Player.update 를 화면 없이 돌리는 가짜 플레이어 */
function fakePlayer(block = false) {
  const p = Object.create(Player.prototype);
  Object.assign(p, {
    group: { position: new THREE.Vector3(), visible: true }, unico: { update() {}, facing: 0 },
    world: { resolveCollision: (next) => { if (block) next.set(0, 0, 0); }, inSwimWater: () => false, daylight: 1 },
    ring: { scale: { set() {} } }, arrow: { position: { y: 0 }, rotation: { y: 0 } },
    markT: 0, speedMult: 1, swimming: false, frozen: false, hidden: false,
  });
  return p;
}
const cam = { basis: () => ({ fwd: new THREE.Vector3(0, 0, -1), right: new THREE.Vector3(1, 0, 0) }), camera: {} };
const still = { axis: () => ({ x: 0, y: 0 }) };

test('플레이어: 탭한 대상의 종류를 도착할 때 알려 줌 (막혀서 근처에서 멈춘 경우도)', () => {
  const p = fakePlayer();
  p.goTo(() => new THREE.Vector3(0, 0, 0.1), 0.2, true, 'npc');
  p.update(0.016, still, cam);
  assert.equal(p.arrivedInteract, true);
  assert.equal(p.arrivedKey, 'npc');
  // 그냥 걷기(상호작용 없음)는 종류 없음
  const w = fakePlayer();
  w.goTo(() => new THREE.Vector3(0, 0, 0.1), 0.2, false, 'npc');
  w.update(0.016, still, cam);
  assert.equal(w.arrivedKey, null);
  // 막힘: 대상 1m 앞에서 못 움직이면 도착으로 침
  const b = fakePlayer(true);
  b.goTo(() => new THREE.Vector3(0, 0, -1), 0.2, true, ['build', 'rush', 'building']);
  for (let i = 0; i < 12 && b.moveTarget; i++) b.update(0.1, still, cam);
  assert.equal(b.moveTarget, null);
  assert.equal(b.arrivedInteract, true);
  assert.deepEqual(b.arrivedKey, ['build', 'rush', 'building']);
});

test('도착 처리: 주문서 쪽에서 퇴비통을 누르면, 주문서가 더 가까워도 한 번 더 다가가 퇴비통을 엶', () => {
  // 퇴비통·주문서처럼 가까이 붙은 시설: 화면 안내는 둘 중 가까운 하나만 나옴 (farmcraft_view 와 같음)
  const C = { compost: { x: -9.7, z: -2.3 }, orders: { x: -10.3, z: -4.6 } };
  const opened = [];
  let closer = 0;
  const p = fakePlayer();
  p.group.position.set(-10.4, 0, -5.0); // 주문서 뒤에서 출발 → 처음 멈춘 곳(퇴비통 1.3m 안)에서는 주문서가 더 가까움
  p.goTo(() => new THREE.Vector3(C.compost.x, 0, C.compost.z), 1.3, true, 'compost');
  for (let i = 0; i < 600 && !opened.length; i++) {
    const cand = new PromptPick(p.arrivedKey), pos = p.position;
    let best = null;
    for (const [k, c] of Object.entries(C)) { const d = Math.hypot(c.x - pos.x, c.z - pos.z); if (d < 2 && (!best || d < best.d)) best = { d, key: k, onInteract: () => opened.push(k) }; }
    cand.add(best);
    const arrived = p.arrivedInteract, at = p.arrivedTarget;
    p.arrivedInteract = false; p.arrivedKey = p.arrivedTarget = null;
    const step = arrived ? arrivalStep(cand, at) : {};
    if (step.run) step.run.onInteract();
    else if (step.closer) { closer++; p.goTo(at.pos, Math.min(at.stop, 0.35), true, at.key); p.moveTarget.closer = true; }
    p.update(1 / 60, still, cam);
  }
  assert.deepEqual(opened, ['compost'], '주문서가 아니라 누른 퇴비통');
  assert.equal(closer, 1, '처음 도착했을 때는 주문서가 더 가까워 한 번 더 다가감');
  // 다가간 뒤에도 안 잡히면 더는 움직이지 않음, 꾸미기 안내는 도착해도 실행하지 않음
  const none = new PromptPick('compost');
  assert.deepEqual(arrivalStep(none, { key: 'compost', closer: true }), {});
  const deco = new PromptPick(null);
  deco.add({ d: -1, key: 'decor', onInteract() {} });
  assert.deepEqual(arrivalStep(deco, { key: null }), {});
});

test('꾸미기 중 탭: 걸어가기만 (도착해도 대상이 실행되지 않음)', () => {
  globalThis.innerWidth = 800; globalThis.innerHeight = 600;
  const calls = [];
  const nav = Object.create(PointerNav.prototype);
  nav.marker = { position: new THREE.Vector3(), visible: false };
  nav.pick = () => ({ target: { pos: () => new THREE.Vector3(1, 0, 1), stop: 1, key: 'npc' } });
  nav.game = {
    nature: {}, rice: {}, ui: {}, tractor: {}, smartfarm: {}, decor: { mode: { id: 'bench' } }, audio: { play() {} }, home: {},
    player: { goTo: (...a) => calls.push(a) },
  };
  nav.click(10, 10);
  assert.equal(calls[0][2], false);
  nav.game.decor.mode = null;
  nav.click(10, 10);
  assert.equal(calls[1][2], true);
  assert.equal(calls[1][3], 'npc');
});

// ---------------------------------------------------------------- 탭 대상 종류 ↔ 안내 종류 약속
// 도착하면 같은 종류의 안내만 실행하므로, 어느 쪽 이름이 바뀌면 휴대폰에서 탭해도 아무 일이 없음
test('탭 대상 종류: pointer.js 의 key 마다 같은 key 의 안내가 실제로 있음', () => {
  const src = read('src/game/pointer.js').toString();
  const a = src.indexOf('  targets() {'), b = src.indexOf('  click(sx, sy', a);
  assert.ok(a > 0 && b > a, 'targets()~pick() 부분을 찾음');
  const body = src.slice(a, b);
  const keys = new Set(), prefixes = new Set();
  const strs = (t) => [...t.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  // key: 'x' · key: ['x', 'y'] · key: 조건 ? 'x' : 'y' · key: 'home_' + 자리
  for (const m of body.matchAll(/key: (\[[^\]]*\]|[^,}\n]+)/g)) {
    const ex = m[1];
    if (/^'[a-z_]+' *\+/.test(ex)) { prefixes.add(strs(ex)[0]); continue; }
    for (const k of strs(ex)) keys.add(k);
  }
  // 상자 대상: add(near(...), x, z, stop, 'key' 또는 [...])
  for (const m of body.matchAll(/\badd\(near\(.*,\s*(\[[^\]]*\]|'[a-z_]+')\);/g)) for (const k of strs(m[1])) keys.add(k);
  for (const k of ['npc', 'pet', 'petfind', 'player', 'tractor', 'koat', 'bug', 'fish', 'eggcatch', 'barn', 'honey', 'hive', 'build', 'trough']) {
    assert.ok(keys.has(k), `pointer.js 에서 '${k}' 를 읽어 냄 (시험 정규식 확인)`);
  }
  assert.ok(prefixes.has('home_'));
  const files = [...readdirSync(new URL('src/game/view/', root)).filter((f) => f.endsWith('.js')).map((f) => `src/game/view/${f}`), 'src/game/net.js'];
  const texts = files.map((f) => read(f).toString());
  for (const k of keys) {
    const re = new RegExp(`key: ['"]${k}['"]`);
    assert.ok(texts.some((t) => re.test(t)), `탭 대상 '${k}' 의 안내(key: '${k}')가 view/·net.js 어디에도 없음`);
  }
  for (const pfx of prefixes) {
    const re = new RegExp(`key: ['"]${pfx}['"] *\\+`);
    assert.ok(texts.some((t) => re.test(t)), `'${pfx}' + 자리 안내가 없음`);
  }
});
