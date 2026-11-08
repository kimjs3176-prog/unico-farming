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
const { Input } = await import('../src/game/input.js');
const { FollowCamera } = await import('../src/game/camera.js');
const { buildRoom, IO, ROOM } = await import('../src/game/view/home_interior.js');
const { HomeView, mergeByMaterial } = await import('../src/game/view/home_view.js');
const { canFullscreen, toggleFullscreen } = await import('../src/ui/ui.js');
const { SocialSim } = await import('../src/game/sim/social.js');

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

// ---------------------------------------------------------------- 집 안 가구 표시·합치기
const mats = () => ({ glass: new THREE.MeshStandardMaterial(), lampMat: new THREE.MeshStandardMaterial() });

test('집 안: 가구 메시마다 자리 표시, 재질별로 합쳐 메시 수가 절반 아래로', () => {
  for (let lv = 0; lv < ROOM.length; lv++) {
    const room = buildRoom(lv, mats());
    const tags = new Set();
    let n = 0;
    room.group.traverse((o) => { if (o.isMesh) { n++; if (o.userData.spot) tags.add(o.userData.spot); } });
    assert.deepEqual([...tags].sort(), room.spots.map((s) => s.key).sort(), `단계 ${lv} 모든 가구에 표시`);
    assert.ok(n < 55, `단계 ${lv} 메시 ${n}개 (합치기 전 100개 넘음)`);
    if (room.fire) assert.ok(room.group.children.includes(room.fire), '일렁이는 불꽃은 따로');
    // 같은 재질·같은 자리끼리는 하나뿐
    const keys = room.group.children.filter((o) => o.isMesh).map((o) => `${o.material.uuid}|${o.userData.spot || ''}`);
    assert.equal(new Set(keys).size, keys.length);
  }
});

test('집 안 PointerNav.pick: 실제 카메라(세로 폰)에서 책상 윗판·달력을 누르면 각자 그 가구', () => {
  globalThis.innerWidth = 390; globalThis.innerHeight = 844;
  for (let lv = 0; lv < ROOM.length; lv++) {
    const room = buildRoom(lv, mats());
    room.group.position.set(IO.x, IO.y, IO.z);
    room.group.updateMatrixWorld(true);
    const desk = room.spots.find((s) => s.key === 'desk'), cal = room.spots.find((s) => s.key === 'calendar');
    const camera = new THREE.PerspectiveCamera(56, 390 / 844, 0.1, 100);
    const tgt = new THREE.Vector3(IO.x + desk.x, IO.y + 1.1, IO.z + desk.z), dist = [9.5, 10.5, 12][lv];
    camera.position.copy(tgt).add(new THREE.Vector3(0, Math.sin(0.92), Math.cos(0.92)).multiplyScalar(dist));
    camera.lookAt(tgt);
    camera.updateMatrixWorld(true);
    const nav = new PointerNav({ world: { scene: new THREE.Scene() }, camera, home: { inside: true, room } });
    const tap = (x, y, z) => { const v = new THREE.Vector3(IO.x + x, IO.y + y, IO.z + z).project(camera); return nav.pick(((v.x + 1) / 2) * 390, ((1 - v.y) / 2) * 844, true); };
    // 책상 윗판 (자리에서 1.15m 뒤, 높이 0.78) — 예전에는 달력으로 가던 곳
    assert.equal(tap(desk.x - 0.4, 0.82, desk.z - 1.15).target?.key, 'home_desk', `단계 ${lv} 책상`);
    assert.equal(tap(cal.x, 1.85, -room.D / 2 + 0.07).target?.key, 'home_calendar', `단계 ${lv} 달력`);
  }
});

test('집 밖: 집·마당은 재질별로 합쳐도 굴뚝·지붕 높이는 그대로', () => {
  const g = new THREE.Group();
  const a = new THREE.MeshStandardMaterial(), b = new THREE.MeshStandardMaterial();
  const sub = new THREE.Group(); sub.position.set(2, 0, 0); sub.rotation.y = Math.PI / 2;
  sub.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), a));
  g.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), a), new THREE.Mesh(new THREE.SphereGeometry(0.5), b), sub);
  g.userData.chimney = new THREE.Vector3(1, 2, 3);
  const before = new THREE.Box3().setFromObject(g);
  mergeByMaterial(g);
  assert.equal(g.children.length, 2);
  assert.ok(g.userData.chimney.equals(new THREE.Vector3(1, 2, 3)));
  const after = new THREE.Box3().setFromObject(g);
  assert.ok(after.min.distanceTo(before.min) < 1e-6 && after.max.distanceTo(before.max) < 1e-6, '하위 묶음 위치까지 그대로');
});

// ---------------------------------------------------------------- 옷장 카메라 (세로 폰)
function homeGame() {
  return {
    world: { scene: new THREE.Scene(), obstacles: [], time: 0.5, day: 3, daylight: 1, clockText: () => '' },
    ui: { closePanel() {}, toast() {}, openPanel: () => el(), panel: null },
    audio: { play() {} },
    player: { frozen: false, position: new THREE.Vector3(), vel: new THREE.Vector3(), moveTarget: null, unico: { playAction() {}, floorY: null, facing: 0, group: new THREE.Group() } },
    followCam: { yaw: 0, pitch: 0.92, distance: 9.5, lookOffsetY: 0, first: false },
    costume: { wearing: null, has: () => false, sets: [] }, outfitNow: () => ({}), applyLook() {},
    tractor: { driving: false }, onEvent() {},
  };
}

test('옷장 (세로 폰): 물러나 바라보는 점을 낮추고, 지도로 바로 나가도 원래대로', () => {
  const g = homeGame(), h = new HomeView(g), cam = g.followCam;
  h.inside = true; h._cam = { yaw: 0.3, pitch: 0.45, distance: 9 };
  h.openWardrobe();
  assert.equal(cam.distance, 6.5);
  assert.equal(cam.lookOffsetY, -1.25);
  h.leave(true);
  assert.equal(cam.lookOffsetY, 0);
  assert.equal(h._wdCam, null, '다시 들어와도 옷장 시점이 되살아나지 않음');
  assert.equal(cam.distance, 9);
});

test('옷장 (세로 폰): 창을 닫으면 다음 프레임에 카메라가 원래대로', () => {
  const g = homeGame(), h = new HomeView(g), cam = g.followCam;
  h.inside = true;
  const p = el();
  g.ui.openPanel = () => p; g.ui.panel = p;
  h.openWardrobe();
  assert.equal(cam.lookOffsetY, -1.25);
  g.ui.panel = null; // 창 닫음
  h._updateInside(0.016, g.player.position);
  assert.equal(cam.lookOffsetY, 0);
  assert.equal(cam.distance, 9.5);
  assert.equal(h._wdCam, null);
});

test('따라가기 카메라: 바라보는 높이 보정', () => {
  const c = new FollowCamera(new THREE.PerspectiveCamera());
  c.update(0.016, null, new THREE.Vector3(0, 0, 0));
  assert.ok(Math.abs(c.smooth.y - 1.1) < 1e-9);
  c.lookOffsetY = -1.25; c.first = true;
  c.update(0.016, null, new THREE.Vector3(0, 0, 0));
  assert.ok(Math.abs(c.smooth.y + 0.15) < 1e-9);
});

// ---------------------------------------------------------------- 입력 정리
test('입력: reset 으로 눌린 것 모두 정리, 조이스틱 손가락을 잃어버려도 다음 터치에서 풀림', () => {
  const I = new Input({ addEventListener() {}, setPointerCapture() {} });
  const joy = [];
  I.onJoystick = (on) => joy.push(on);
  const t = (id, x, y) => ({ identifier: id, clientX: x, clientY: y });
  I.touchStart({ changedTouches: [t(1, 50, 600)], touches: [t(1, 50, 600)] }, 0);
  assert.equal(I.joy.active, true);
  // 손가락 1을 뗀 이벤트를 못 받은 채 새 손가락 2가 왼쪽에 닿음 → 1은 풀리고 2가 조이스틱
  I.touchStart({ changedTouches: [t(2, 60, 620)], touches: [t(2, 60, 620)] }, 1000);
  assert.equal(I.joy.id, 2);
  I.keys.add('KeyW'); I.clicks.push({ x: 1, y: 1 }); I.interactTap = true; I.virtual.y = -1;
  I.reset();
  assert.equal(I.joy.active, false);
  assert.equal(joy.at(-1), false);
  assert.deepEqual(I.axis(), { x: 0, y: 0 });
  assert.equal(I.clicks.length, 0);
  assert.equal(I.interact(), false);
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

// ---------------------------------------------------------------- 전체 화면·아이콘·서버
test('전체 화면: 휴대폰 + API 있을 때만, 누르면 켜고 다시 누르면 끔', () => {
  assert.equal(canFullscreen({ fullscreenEnabled: false }), false, 'iPhone 사파리 (API 없음)');
  assert.equal(canFullscreen({ fullscreenEnabled: true }), true);
  const calls = [];
  const doc = {
    fullscreenElement: null,
    documentElement: { requestFullscreen: (o) => { calls.push(['req', o]); return Promise.reject(new Error('거부')); } },
    exitFullscreen: () => { calls.push(['exit']); return Promise.resolve(); },
  };
  toggleFullscreen(doc);
  assert.deepEqual(calls[0], ['req', { navigationUI: 'hide' }]);
  doc.fullscreenElement = {};
  toggleFullscreen(doc);
  assert.deepEqual(calls[1], ['exit']);
  // 오래된 webkit 접두사만 있는 브라우저
  const wk = { documentElement: { webkitRequestFullscreen: () => calls.push(['wk']) } };
  toggleFullscreen(wk);
  assert.deepEqual(calls[2], ['wk']);
});

test('전체 화면 단추: 켜져도 오토플레이의 켜짐 표시(on: 강조·통통 튀기)를 쓰지 않음', () => {
  const src = read('src/ui/ui.js').toString();
  const a = src.indexOf('this.fsBtn = mk('), b = src.indexOf('root.append(this.bar)', a);
  assert.ok(a > 0 && b > a, '전체 화면 단추 코드를 찾음');
  const blk = src.slice(a, b);
  assert.doesNotMatch(blk, /classList\.(toggle|add)\(\s*'on'/);
  assert.match(blk, /창 모드/, '켜지면 이름만 바뀜');
});

test('홈 화면 아이콘: PNG 192·512(+maskable)·180 이 실제 크기로 있고 매니페스트·index.html 이 가리킴', () => {
  const size = (p) => { const b = read(p); assert.equal(b.toString('latin1', 1, 4), 'PNG', p); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };
  const m = JSON.parse(read('public/manifest.webmanifest'));
  for (const ic of m.icons) {
    assert.equal(ic.type, 'image/png');
    const [w, h] = size(`public/${ic.src}`);
    assert.equal(ic.sizes, `${w}x${h}`);
  }
  assert.ok(m.icons.some((i) => i.purpose === 'maskable' && i.sizes === '512x512'));
  assert.ok(m.icons.some((i) => i.purpose === 'any' && i.sizes === '192x192'));
  const html = read('index.html').toString();
  const apple = html.match(/rel="apple-touch-icon" href="\/([^"]+)"/);
  assert.ok(apple);
  assert.deepEqual(size(`public/${apple[1]}`), [180, 180]);
});

test('자체 서버: 매니페스트는 manifest+json 으로 보냄', () => {
  const src = read('server/index.js').toString();
  assert.match(src, /'\.webmanifest': 'application\/manifest\+json'/);
});

test('선물 되돌리기: 오늘 횟수·누적 기록이 0 아래로 내려가지 않음', () => {
  const s = new SocialSim();
  s.noteGift();
  s.undoGift(); s.undoGift();
  assert.equal(s.gifts, 0);
  assert.equal(s.stats.giftsSent, 0);
});
