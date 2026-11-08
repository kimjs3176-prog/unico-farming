// 멀티플레이 클라이언트(src/game/net.js) 다시 접속 흐름: 가짜 WebSocket·document·타이머로 실행
import test from 'node:test';
import assert from 'node:assert/strict';

const on = (target) => { target.ls = {}; target.addEventListener = (t, f) => (target.ls[t] ||= []).push(f); target.fire = (t, e = {}) => (target.ls[t] || []).forEach((f) => f(e)); return target; };
globalThis.document = on({ hidden: false });
globalThis.window = on({});
globalThis.location = { protocol: 'http:', host: 'farm.test' };

class FakeWS {
  constructor(url) { this.url = url; this.readyState = 0; this.sent = []; FakeWS.all.push(this); }
  send(s) { this.sent.push(JSON.parse(s)); }
  close() { if (this.readyState < 2) this.readyState = 2; }
  // 서버 쪽에서 일어나는 일
  open() { this.readyState = 1; this.onopen?.(); }
  recv(m) { this.onmessage?.({ data: JSON.stringify(m) }); }
  drop() { this.readyState = 3; this.onclose?.(); }
  welcome(room = '1번 농장') { this.open(); this.recv({ t: 'welcome', id: 1, room, count: 1, players: [] }); }
}
FakeWS.all = [];
globalThis.WebSocket = FakeWS;

const { Net } = await import('../src/game/net.js');

function setup(t) {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_000_000 });
  FakeWS.all.length = 0;
  document.hidden = false;
  document.ls = {}; window.ls = {};
  const toasts = [], fails = [], online = [];
  let look = 'a.b';
  const game = {
    playerName: '나', look: () => look,
    ui: { setOnline: (...a) => online.push(a), toast: (s) => toasts.push(s), chatLine() {} },
    world: { scene: { add() {}, remove() {} } },
    social: { isFriend: () => false },
    socialView: { onAct() {}, onActFail: (m) => fails.push(m) },
  };
  const net = new Net(game);
  return { net, toasts, fails, online, setLook: (l) => { look = l; }, last: () => FakeWS.all.at(-1), tick: (ms) => t.mock.timers.tick(ms) };
}

test('net: 끊겨서 기다리는 중에 방을 옮겨도, 그 뒤 끊기면 다시 접속함 (switching 이 굳지 않음)', (t) => {
  const { net, last, tick } = setup(t);
  net.connect();
  last().welcome();
  tick(20000);
  last().drop(); // 서버가 끊음 → 다시 접속 예약
  assert.equal(net.connected, false);
  net.switchRoom('2번 농장'); // 기다리는 중에 방 이동
  assert.equal(FakeWS.all.length, 2);
  assert.match(last().url, /room=2/);
  last().welcome('2번 농장');
  last().drop(); // 새 방에서 끊김
  tick(400000);
  assert.ok(FakeWS.all.length >= 3, '다시 접속함');
  assert.match(FakeWS.all[2].url, /room=2/, '가려던 방으로');
});

test('net: 옛 소켓의 늦은 close 가 새 방 상태를 지우지 않고, 소켓이 겹치지 않음', (t) => {
  const { net, last, tick } = setup(t);
  net.connect();
  const old = last();
  old.welcome();
  net.switchRoom('2번 농장');
  const cur = last();
  cur.welcome('2번 농장');
  old.drop(); // 옛 소켓 close 가 늦게 옴
  assert.equal(net.connected, true);
  assert.equal(net.ws, cur);
  tick(400000);
  assert.equal(FakeWS.all.length, 2, '재접속 타이머가 따로 생기지 않음');
});

test('net: 숨김 중 끊기면 기다렸다가, 화면으로 돌아오면 바로 다시 접속', (t) => {
  const { net, last, tick } = setup(t);
  net.connect();
  last().welcome();
  tick(30000);
  document.hidden = true; document.fire('visibilitychange');
  last().drop();
  tick(600000);
  assert.equal(FakeWS.all.length, 1, '숨김 중에는 접속하지 않음 (서버 요청 수 절약)');
  document.hidden = false; document.fire('visibilitychange');
  assert.equal(FakeWS.all.length, 2, '돌아오면 곧바로');
  last().welcome();
  assert.equal(net.connected, true);
});

test('net: 화면이 먼저 돌아오고 close 가 뒤에 와도 1초 안에 다시 접속 (예전에는 4~6초)', (t) => {
  const { net, last, tick } = setup(t);
  net.connect();
  last().welcome();
  tick(30000);
  document.hidden = true; document.fire('visibilitychange');
  tick(5000);
  document.hidden = false; document.fire('visibilitychange');
  last().drop();
  tick(1000);
  assert.equal(FakeWS.all.length, 2);
});

test('net: 오래 숨겼다 돌아오면 ping 으로 확인해 반쯤 끊긴 소켓을 바꿈 (pong 을 아는 서버에만)', (t) => {
  const { net, last, tick } = setup(t);
  net.connect();
  const ws = last();
  ws.welcome();
  assert.deepEqual(ws.sent.at(-1), { t: 'ping' }, '처음 한 번 ping 에 답하는지 확인');
  ws.recv({ t: 'pong' });
  tick(30000);
  document.hidden = true; document.fire('visibilitychange');
  tick(60000);
  document.hidden = false; document.fire('visibilitychange');
  assert.deepEqual(ws.sent.at(-1), { t: 'ping' });
  tick(3900);
  assert.equal(FakeWS.all.length, 1, '아직 기다림');
  tick(1200);
  assert.equal(net.connected, false, '답이 없으면 끊긴 것으로 봄');
  tick(1000);
  assert.equal(FakeWS.all.length, 2, '곧바로 다시 접속');
  // 답이 오면 그대로
  last().welcome();
  tick(30000);
  document.hidden = true; document.fire('visibilitychange');
  tick(60000);
  document.hidden = false; document.fire('visibilitychange');
  last().recv({ t: 'pong' });
  tick(10000);
  assert.equal(FakeWS.all.length, 2);
  assert.equal(net.connected, true);
});

test('net: pong 을 모르는 옛 서버에는 확인하지 않음, 망이 다시 잡히면(online) 바로 접속', (t) => {
  const { net, last, tick } = setup(t);
  net.connect();
  last().welcome(); // pong 이 오지 않음
  tick(30000);
  document.hidden = true; document.fire('visibilitychange');
  tick(60000);
  document.hidden = false; document.fire('visibilitychange');
  tick(10000);
  assert.equal(FakeWS.all.length, 1, '옛 서버와는 끊지 않음');
  last().drop();
  for (let i = 0; i < 3; i++) { tick(400000); last().drop(); } // 서버가 안 받아 백오프가 길어짐
  const n = FakeWS.all.length;
  window.fire('online');
  assert.equal(FakeWS.all.length, n + 1, 'online 이면 기다리지 않음');
});

test('net: 오늘 사용량이 다 찼으면 화면 복귀·방 이동에도 접속하지 않고, 초기화 뒤 고른 방으로', (t) => {
  const { net, last, tick, toasts } = setup(t);
  net.connect();
  const ws = last();
  ws.open();
  ws.recv({ t: 'quota', until: Date.now() + 3600000 });
  ws.drop();
  document.fire('visibilitychange');
  net.switchRoom('3번 농장');
  assert.equal(FakeWS.all.length, 1);
  assert.match(toasts.at(-1), /3번 농장/);
  tick(3600000 + 300001);
  assert.equal(FakeWS.all.length, 2);
  assert.match(last().url, /room=3/);
});

test('net: 다시 들어가면 서 있어도 첫 위치를 보내고, 같은 옷은 두 번 보내지 않음, 선물 실패는 화면에 넘김', (t) => {
  const { net, last, fails, setLook } = setup(t);
  const g = net.game;
  g.tractor = { driving: false }; g.home = { inside: false };
  g.player = { position: { x: 1, z: 2 }, unico: { facing: 0, action: '' } };
  g.followCam = {}; g.world.daylight = 1;
  net.connect();
  last().welcome();
  net.update(0.3);
  assert.equal(last().sent.filter((m) => m.t === 'pos').length, 1);
  net.switchRoom('2번 농장');
  last().welcome('2번 농장');
  net.update(0.3);
  assert.deepEqual(last().sent.filter((m) => m.t === 'pos').map((m) => [m.x, m.z]), [[1, 2]], '새 방에서도 첫 위치');
  assert.equal(last().sent[0].l, 'a.b', 'join 에 지금 옷');
  net.sendLook();
  setLook('c.d'); net.sendLook(); net.sendLook();
  assert.deepEqual(last().sent.filter((m) => m.t === 'look').map((m) => m.l), ['c.d']);
  last().recv({ t: 'act_fail', k: 'gift', gid: 3, why: 'gone' });
  assert.equal(fails[0].gid, 3);
  assert.equal(net.sendAct(5, 'wave'), true);
  last().drop();
  assert.equal(net.sendAct(5, 'wave'), false, '끊겼으면 false');
});

test('net: 서버에 한 번도 못 붙고 끊겨도 왼쪽 아래를 ⚪ 오프라인으로 바꿈 (VITE_WS_URL 점검용)', (t) => {
  const { net, last, online } = setup(t);
  net.connect();
  last().drop(); // 열리기 전에 닫힘 (서버 없음·주소 틀림)
  assert.deepEqual(online, [[0, '']]);
  assert.equal(net.connected, false);
});

test('net: 확인(ping) 중에 늦게 온 옛 메시지로는 살아 있다고 보지 않음, pong 이 와야 함', (t) => {
  const { net, last, tick } = setup(t);
  net.connect();
  const ws = last();
  ws.welcome();
  ws.recv({ t: 'pong' });
  tick(30000);
  document.hidden = true; document.fire('visibilitychange');
  tick(60000);
  document.hidden = false; document.fire('visibilitychange');
  assert.ok(net.probeTimer, '확인 시작');
  ws.recv({ t: 'state', players: [] }); // 끊기기 전에 쌓여 있던 메시지
  assert.ok(net.probeTimer, '옛 메시지로는 확인이 끝나지 않음');
  tick(4100);
  assert.equal(net.connected, false, 'pong 이 없으면 끊긴 것으로 봄');
  tick(1000);
  assert.equal(FakeWS.all.length, 2, '소켓을 바꿈');
});

test('net: 붙어 있지 않을 때는 확인(probe)하지 않음 (접속 중인 소켓·기다리는 재접속을 건드리지 않음)', (t) => {
  const { net, last, tick } = setup(t);
  net.connect();
  last().welcome();
  last().recv({ t: 'pong' });
  tick(20000);
  last().drop(); // 재접속 예약됨
  net.probe();
  assert.equal(net.probeTimer, 0);
  tick(1000);
  assert.equal(FakeWS.all.length, 2);
  net.probe(); // 접속 중 (아직 열리지 않음)
  assert.equal(net.probeTimer, 0);
  tick(10000);
  assert.equal(FakeWS.all.length, 2, '접속 중인 소켓을 끊지 않음');
  last().welcome();
  assert.ok(net.lastRecv > 0, '받은 시각을 기록');
});
