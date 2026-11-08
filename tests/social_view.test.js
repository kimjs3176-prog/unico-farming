// 선물 보내기 화면(src/game/view/social_view.js): 서버가 못 전했다고 알려 오면 가방에 돌려받음
import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.document = { getElementById: () => ({ append() {} }), createElement: () => ({ append() {}, remove() {}, classList: { add() {} } }) };
const { SocialView } = await import('../src/game/view/social_view.js');
const { Economy } = await import('../src/game/sim/economy.js');
const { SocialSim } = await import('../src/game/sim/social.js');

function setup({ connected = true, delivered = true } = {}) {
  const acts = [], toasts = [];
  const economy = new Economy();
  economy.addCrop('carrot', 5);
  const unico = () => ({ group: { position: { x: 0, z: 0 } }, playAction() {}, say() {} });
  const game = {
    economy, social: new SocialSim(),
    net: { connected, remote: new Map([[2, { name: '친구', unico: unico() }]]), sendAct: (...a) => { acts.push(a); return delivered; }, labelOf() {} },
    player: { position: { x: 0, z: 1 }, unico: { ...unico(), facing: 0 } },
    audio: { play() {} }, ui: { toast: (s) => toasts.push(s), closePanel() {} }, onEvent() {},
  };
  return { sv: new SocialView(game), game, acts, toasts };
}

test('선물: 서버가 못 전했다고(act_fail) 알려 오면 한 번만 돌려받고 오늘 횟수도 되돌림', () => {
  const { sv, game, acts, toasts } = setup();
  sv.sendGift(2, 'carrot', 2);
  assert.equal(game.economy.count('carrot'), 3);
  assert.equal(game.social.gifts, 1);
  const gid = acts[0][2].gid;
  assert.ok(Number.isInteger(gid) && gid > 0, '선물에 번호를 붙여 보냄');
  sv.onActFail({ t: 'act_fail', k: 'gift', gid: gid + 100, why: 'gone' }); // 내가 보낸 적 없는 번호는 무시
  assert.equal(game.economy.count('carrot'), 3);
  sv.onActFail({ t: 'act_fail', k: 'gift', gid, why: 'gone' });
  assert.equal(game.economy.count('carrot'), 5);
  assert.equal(game.social.gifts, 0);
  assert.equal(game.social.stats.giftsSent, 0);
  assert.match(toasts.at(-1), /돌려놨어요/);
  sv.onActFail({ t: 'act_fail', k: 'gift', gid, why: 'gone' }); // 두 번 와도 한 번만
  assert.equal(game.economy.count('carrot'), 5);
  // 한도 초과
  sv.sendGift(2, 'carrot', 1);
  sv.onActFail({ t: 'act_fail', k: 'gift', gid: acts[1][2].gid, why: 'busy' });
  assert.equal(game.economy.count('carrot'), 5);
  assert.match(toasts.at(-1), /너무 빨리/);
});

test('선물: 끊겨 있으면 가방에서 빼지 않음, 보내기에 실패하면 바로 돌려놓음', () => {
  const off = setup({ connected: false });
  off.sv.sendGift(2, 'carrot', 2);
  assert.equal(off.game.economy.count('carrot'), 5);
  assert.equal(off.acts.length, 0);
  const lost = setup({ delivered: false });
  lost.sv.sendGift(2, 'carrot', 2);
  assert.equal(lost.game.economy.count('carrot'), 5);
  assert.equal(lost.game.social.gifts, 0, '보내지 못했으면 오늘 횟수도 그대로');
});

test('친구 신청 자동 수락은 같은 사람에게 잠깐 사이 한 번만 (연타로 내 상호작용 한도를 다 쓰지 않게)', () => {
  const { sv, game, acts } = setup();
  game.social.addFriend('친구');
  for (let i = 0; i < 5; i++) sv.onAct({ t: 'act', k: 'friend', from: 2, name: '친구' });
  assert.equal(acts.filter((a) => a[1] === 'friend_ok').length, 1);
});

test('선물: 연결을 확인하는 중(probe)이거나 인터넷이 끊겼으면 가방에서 빼지 않음 (반쯤 끊긴 소켓이면 돌려받을 수 없어서)', (t) => {
  const { sv, game, acts, toasts } = setup();
  game.net.probeTimer = 7;
  sv.sendGift(2, 'carrot', 2);
  assert.equal(game.economy.count('carrot'), 5);
  assert.equal(acts.length, 0);
  assert.equal(game.social.gifts, 0);
  assert.match(toasts.at(-1), /확인하는 중/);
  game.net.probeTimer = 0;
  const nav = Object.getOwnPropertyDescriptor(globalThis, 'navigator'); // t.mock.property 는 테스트 실행기를 멈추게 해서 직접 바꿨다 되돌림
  t.after(() => (nav ? Object.defineProperty(globalThis, 'navigator', nav) : delete globalThis.navigator));
  Object.defineProperty(globalThis, 'navigator', { value: { onLine: false }, configurable: true, writable: true });
  sv.sendGift(2, 'carrot', 2);
  assert.equal(game.economy.count('carrot'), 5);
  assert.equal(acts.length, 0);
  assert.match(toasts.at(-1), /인터넷 연결이 끊겨서/);
});

test('상호작용 창을 열 때 한동안 받은 게 없으면 미리 연결을 확인함 (물건을 고르는 사이 끊긴 소켓을 바꿈)', () => {
  const { sv, game } = setup();
  let probes = 0;
  game.net.probe = () => probes++;
  game.ui.openPanel = () => ({ classList: { add() {} }, append() {} });
  game.net.lastRecv = Date.now() - 60000;
  sv.open(2);
  assert.equal(probes, 1);
  game.net.lastRecv = Date.now();
  sv.open(2);
  assert.equal(probes, 1, '방금 받았으면 확인하지 않음');
});
