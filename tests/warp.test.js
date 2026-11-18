// 지도·체험관 이동 전환 (src/game/game_travel.js warpTo + src/ui/wipe.js)
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

const { GameTravel, BUSY_TRAVEL, NO_TRAVEL, WARP_DOLLY } = await import('../src/game/game_travel.js');
const { irisSize, irisFor, Wipe } = await import('../src/ui/wipe.js');

/** 막(wipe)을 손으로 진행하는 가짜: run 이 받은 mid·done 을 시험이 부름 */
function stubWipe() {
  const w = { runs: [], run(at, mid, done, opts) { w.runs.push({ at, mid, done, opts }); return true; } };
  return w;
}

function game(over = {}) {
  const log = [];
  const holds = new Set();
  const g = Object.assign(Object.create(GameTravel), {
    log, toasts: [],
    player: { position: new THREE.Vector3(), vel: new THREE.Vector3(), unico: {}, hold: (k) => holds.add(k), unhold: (k) => holds.delete(k), get frozen() { return holds.size > 0; } },
    followCam: { distance: 9, curDist: 9 },
    ui: { closePanel() { log.push('close'); }, toast: (t) => { g.toasts.push(t); log.push('toast'); } },
    audio: { play: (s) => log.push(`sound:${s}`) },
    fx: { burst: () => log.push('burst') },
    home: { leave() {} }, ride: {}, smartfarm: {}, nature: {}, rice: {}, flags: { koatIntro: true },
    dialogue: { active: false },
    camera: new THREE.PerspectiveCamera(),
    wipe: stubWipe(),
    ...over,
  });
  g.busy = () => !!g.dialogue.active;
  return g;
}

test('warpTo: 위치는 막이 다 덮였을 때(mid)만 바뀌고, after 는 막이 다 열린 뒤 마지막에', () => {
  const g = game();
  const order = [];
  assert.equal(g.warpTo(5, -7, {}, { after: () => order.push('after') }), true);
  assert.equal(g.player.position.x, 0, '누른 순간에는 그대로');
  assert.equal(g.player.frozen, true, '전환 동안 멈춤');
  assert.ok(g.log.includes('sound:warp'));
  assert.ok(!g.log.includes('sound:levelup'), '팡파르 없음');
  const r = g.wipe.runs[0];
  r.mid();
  assert.deepEqual([g.player.position.x, g.player.position.z], [5, -7]);
  assert.equal(g.followCam.curDist, 9 + WARP_DOLLY, '살짝 멀리서 다가옴');
  assert.deepEqual(order, [], 'after 는 아직');
  r.done();
  assert.deepEqual(order, ['after']);
  assert.equal(g.player.frozen, false);
});

test('warpTo: 전환 중에 또 누르면 무시, 막이 덮이는 사이 대화가 시작되면 이동하지 않고 알림', () => {
  const g = game();
  let after = 0;
  g.warpTo(5, 5, {}, { after: () => after++ });
  assert.equal(g.warpTo(9, 9), false, '겹친 전환');
  g.dialogue.active = true;
  g.wipe.runs[0].mid();
  g.wipe.runs[0].done();
  assert.equal(g.player.position.x, 0);
  assert.equal(after, 0);
  assert.deepEqual(g.toasts, [BUSY_TRAVEL]);
  assert.equal(g.player.frozen, false, '멈춤은 풀림');
});

test('warpTo: 운전·낚시·밭일 중이면 시작하지 않음', () => {
  for (const over of [{ ride: { driving: true } }, { nature: { fishing: true } }, { farm: { job: {} } }]) {
    const g = game(over);
    assert.equal(g.warpTo(1, 1), false);
    assert.deepEqual(g.toasts, [NO_TRAVEL]);
    assert.equal(g.wipe.runs.length, 0);
  }
});

test('goKoat: 체험관 도착 알림은 막이 열린 뒤', () => {
  const g = game();
  g.goKoat();
  assert.equal(g.toasts.length, 0);
  g.wipe.runs[0].mid(); g.wipe.runs[0].done();
  assert.deepEqual([g.player.position.x, g.player.position.z], [25, -24]);
  assert.equal(g.toasts.length, 1);
});

test('막 크기는 화면 어느 점에서 커져도 화면을 다 덮음, 화면이 없으면 바로 처리하도록 false', () => {
  assert.ok(irisSize(412, 839) / 2 >= Math.hypot(412, 839));
  assert.equal(new Wipe({}).run(null, () => {}, () => {}), false);
});

test('덮인 동안 가는 곳 이름표: 체험관은 KOAT 체험관, 지도 장소는 그 이름', () => {
  const g = game();
  g.goKoat();
  assert.equal(g.wipe.runs[0].opts.label, '🏢 KOAT 체험관');
  const g2 = game();
  g2.warpTo(1, 1, {}, { label: '🛒 장터' });
  assert.equal(g2.wipe.runs[0].opts.label, '🛒 장터');
});

test('구멍 지름: 캐릭터 자리에서 가장 먼 모서리까지 딱 덮을 만큼 (너무 크면 좁히는 앞쪽 시간 동안 아무것도 안 보임)', () => {
  // 폰 412x839 가운데
  const d = irisFor(206, 420, 412, 839);
  assert.ok(d / 2 >= Math.hypot(206, 420), '모서리까지 열림');
  assert.ok(d < irisSize(412, 839) * 0.6, `지름 ${d}`);
  // 모서리 가까운 점은 반대쪽 모서리까지
  assert.ok(irisFor(0, 0, 412, 839) / 2 >= Math.hypot(412, 839));
});
