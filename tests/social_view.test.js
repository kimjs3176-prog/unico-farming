// 선물 보내기 화면(src/game/view/social_view.js): 서버가 못 전했다고 알려 오면 가방에 돌려받음
import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.document = { getElementById: () => ({ append() {} }), createElement: () => ({ append() {}, remove() {}, classList: { add() {} } }) };
const { SocialView } = await import('../src/game/view/social_view.js');
const { Economy } = await import('../src/game/sim/economy.js');
const { SocialSim } = await import('../src/game/sim/social.js');

function setup({ connected = true, delivered = true } = {}) {
  const acts = [], toasts = [], messages = [], snapshots = [];
  const economy = new Economy();
  economy.addCrop('carrot', 5);
  const unico = () => ({ group: { position: { x: 0, z: 0 } }, playAction() {}, say() {} });
  const game = {
    economy, social: new SocialSim(),
    net: { connected, send: (m) => { messages.push(m); return delivered; }, remote: new Map([[2, { name: '친구', clientId: 'farm-receiver-0000001', giftV: 1, unico: unico() }]]), sendAct: (...a) => { acts.push(a); return delivered; }, labelOf() {} },
    player: { position: { x: 0, z: 1 }, unico: { ...unico(), facing: 0 } },
    save() { snapshots.push(structuredClone({ social: this.social.toJSON(), economy: this.economy.toJSON() })); return true; },
    audio: { play() {} }, ui: { toast: (s) => toasts.push(s), closePanel() {} }, onEvent() {},
  };
  return { sv: new SocialView(game), game, acts, toasts, messages, snapshots };
}

test('선물: 가방 차감·미완료 번호를 저장한 뒤 전송하고 상대의 수신 확인 뒤에만 완료', () => {
  const { sv, game, messages, snapshots } = setup();
  sv.sendGift(2, 'carrot', 2);
  assert.equal(game.economy.count('carrot'), 3);
  assert.equal(game.social.gifts, 1);
  const p = game.social.giftPending;
  assert.equal(messages[0].tx, p.tx);
  assert.equal(snapshots[0].social.giftPending.tx, p.tx);
  assert.equal(snapshots[0].economy.inventory.crops.carrot, 3);
  sv.onGiftAck({ tx: p.tx, fromClientId: 'farm-wrong-00000001' });
  assert.ok(game.social.giftPending, '다른 농장의 확인은 무시');
  sv.onGiftAck({ tx: p.tx, fromClientId: p.toClientId });
  assert.equal(game.social.giftPending, null);
  assert.equal(game.economy.count('carrot'), 3);
  sv.onGiftAck({ tx: p.tx, fromClientId: p.toClientId });
  assert.equal(game.economy.count('carrot'), 3);
});

test('선물: 오프라인이면 차감 안 함, 저장 실패면 전송 안 함, 전송 실패면 거래를 보존', () => {
  const off = setup({ connected: false });
  off.sv.sendGift(2, 'carrot', 2);
  assert.equal(off.game.economy.count('carrot'), 5);
  assert.equal(off.messages.length, 0);
  const noSave = setup(); noSave.game.save = () => false;
  noSave.sv.sendGift(2, 'carrot', 2);
  assert.equal(noSave.game.economy.count('carrot'), 5);
  assert.equal(noSave.game.social.giftPending, null);
  assert.equal(noSave.messages.length, 0);
  const lost = setup({ delivered: false });
  lost.sv.sendGift(2, 'carrot', 2);
  assert.equal(lost.game.economy.count('carrot'), 3);
  assert.ok(lost.game.social.giftPending, '성공으로 알리거나 미확인 거래를 잊지 않음');
});

test('선물: 연결 끊김·보낸 창 재시작·확인 패킷 유실 뒤 재전송해도 한 번만 지급', () => {
  const a = setup(), b = setup();
  b.game.social.giftClientId = 'farm-receiver-0000001';
  a.sv.sendGift(2, 'carrot', 2);
  const p = a.game.social.giftPending;
  const msg = { ...a.messages[0], from: 1, fromClientId: a.game.social.giftClientId, name: '보낸 사람' };
  b.sv.onGift(msg);
  assert.equal(b.game.economy.count('carrot'), 7);
  // 수신 확인 유실. 두 창 모두 마지막 저장으로 재시작한 상황.
  const resumedA = setup(), resumedB = setup();
  resumedA.game.social.load(a.snapshots.at(-1).social);
  resumedA.game.economy.load(a.snapshots.at(-1).economy);
  resumedB.game.social.load(b.snapshots.at(-1).social);
  resumedB.game.economy.load(b.snapshots.at(-1).economy);
  resumedA.sv.flushGift();
  assert.equal(resumedA.messages[0].tx, p.tx, '같은 거래 번호를 재전송');
  resumedB.sv.onGift(msg);
  assert.equal(resumedB.game.economy.count('carrot'), 7, '저장한 수령 번호로 중복 차단');
  const ack = resumedB.messages.at(-1);
  resumedA.sv.onGiftAck({ ...ack, fromClientId: resumedB.game.social.giftClientId });
  assert.equal(resumedA.game.social.giftPending, null);
  assert.equal(resumedA.game.economy.count('carrot'), 3);
});

test('선물: 수령 저장 실패면 지급·수령 번호를 되돌리고 확인을 보내지 않음', () => {
  const b = setup(); b.game.save = () => false;
  b.sv.onGift({ tx: 'farm-sender-000000001:1', fromClientId: 'farm-sender-000000001', from: 1, item: 'carrot', n: 2 });
  assert.equal(b.game.economy.count('carrot'), 5);
  assert.equal(b.game.social.giftReceipts['farm-sender-000000001'], undefined);
  assert.equal(b.messages.length, 0);
});

test('선물: 미완료 거래가 있으면 다음 선물 차단, 이름이 같아도 농장 식별자가 다르면 재전송 안 함', () => {
  const a = setup(); a.sv.sendGift(2, 'carrot', 2);
  a.sv.sendGift(2, 'carrot', 1);
  assert.equal(a.messages.length, 1);
  assert.equal(a.game.economy.count('carrot'), 3);
  a.game.net.remote.get(2).clientId = 'farm-other-000000001';
  a.sv.giftRetryAt = 0; a.sv.flushGift();
  assert.equal(a.messages.length, 1);
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
