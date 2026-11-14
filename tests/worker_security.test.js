// Cloudflare 릴레이(deploy/cloudflare/worker.js) 점검: WebSocketPair·Durable Object 상태를 흉내 내어 실행
import test from 'node:test';
import assert from 'node:assert/strict';

class FakeWs {
  constructor() { this.att = null; this.sent = []; this.closed = null; }
  accept() {}
  serializeAttachment(a) { this.att = structuredClone(a); }
  deserializeAttachment() { return this.att && structuredClone(this.att); }
  send(s) { this.sent.push(JSON.parse(s)); }
  close(code) { this.closed = code; }
}
globalThis.WebSocketPair = class { constructor() { this[0] = new FakeWs(); this[1] = new FakeWs(); } };
// Node 의 Response 는 101 을 만들 수 없어 최소한만 흉내
const RealResponse = globalThis.Response;
globalThis.Response = class { constructor(body, init = {}) { this.status = init.status ?? 200; this.webSocket = init.webSocket; } static json(o) { return RealResponse.json(o); } };

const { FarmRoom, default: worker } = await import('../deploy/cloudflare/worker.js');
const { MAX_PLAYERS, MAX_ROOMS } = await import('../deploy/cloudflare/limits.js');
const CAP = MAX_PLAYERS * 2; // 방 하나 소켓 총량 (입장 전 포함)

function fakeState() {
  const sockets = [];
  return { sockets, getWebSockets: () => sockets.filter((w) => w.closed === null), acceptWebSocket: (w) => sockets.push(w) };
}
const upgrade = (ip) => ({ url: 'https://relay/ws', headers: new Headers({ Upgrade: 'websocket', 'CF-Connecting-IP': ip, 'X-Room': encodeURIComponent('1번 농장') }) });

test('릴레이: 입장 안 한 채 10초 넘은 빈 소켓은 정리되어 방을 막지 못함', async (t) => {
  const st = fakeState();
  const room = new FarmRoom(st);
  const realNow = Date.now;
  t.after(() => { Date.now = realNow; });
  let now = 1_000_000;
  Date.now = () => now;
  // 서로 다른 IP 들이 빈 소켓 CAP개 (소켓 총량 한도)
  for (let i = 0; i < CAP; i++) assert.equal((await room.fetch(upgrade(`10.0.${i >> 4}.${i & 15}`))).status, 101);
  // 바로 들어온 사람은 막힘 (가득 참 소켓이 돌아옴)
  await room.fetch(upgrade('9.9.9.9'));
  assert.equal(st.sockets.length, CAP, '빈 소켓 대기 중에는 받지 않음 (fullSocket)');
  assert.ok(st.sockets.every((w) => w.closed === null));
  // 10초 뒤: 입장 안 한 소켓은 닫히고 새 사람이 들어올 수 있음
  now += 10_001;
  const ok = await room.fetch(upgrade('9.9.9.9'));
  assert.equal(ok.status, 101);
  assert.equal(st.sockets.filter((w) => w.closed === 1008).length, CAP);
});

test('릴레이: 입장 때 인원을 다시 확인해 방 정원(MAX_PLAYERS)을 넘지 않음', async () => {
  const st = fakeState();
  const room = new FarmRoom(st);
  const N = MAX_PLAYERS + 10;
  for (let i = 0; i < N; i++) await room.fetch(upgrade(`10.1.${i >> 4}.${i & 15}`));
  const socks = st.getWebSockets();
  assert.equal(socks.length, N);
  for (const ws of socks) await room.webSocketMessage(ws, JSON.stringify({ t: 'join', name: 'x' }));
  assert.equal(room.players().length, MAX_PLAYERS);
  assert.equal(st.sockets.filter((w) => w.closed === 1013).length, 10);
});

test('릴레이: 목록 밖 방 이름(0번·01번·정원 밖 번호)은 가장 낮은 번호 방으로', async () => {
  const asked = [];
  const env = { ROOM: {
    idFromName: (n) => n,
    get: (id) => ({ fetch: async (req) => { if (typeof req === 'string') return RealResponse.json({ count: 0 }); asked.push([id, decodeURIComponent(req.headers.get('X-Room'))]); return { status: 101 }; } }),
  } };
  for (const bad of ['0번 농장', '01번 농장', '00번 농장', `${MAX_ROOMS + 1}번 농장`, '21번 농장']) {
    await worker.fetch(new Request(`https://relay/ws?room=${encodeURIComponent(bad)}`, { headers: { Upgrade: 'websocket' } }), env);
    assert.deepEqual(asked.pop(), ['1번 농장', '1번 농장'], bad);
  }
  const last = `${MAX_ROOMS}번 농장`;
  await worker.fetch(new Request(`https://relay/ws?room=${encodeURIComponent(last)}`, { headers: { Upgrade: 'websocket' } }), env);
  assert.deepEqual(asked.pop(), [last, last]);
});

test('릴레이: 오늘 무료 한도 안전선을 넘었으면 방을 찾지 않고 바로 quota 로 닫음', async () => {
  const asked = [];
  const env = { ROOM: {
    idFromName: (n) => n,
    get: (id) => ({ fetch: async (req) => { const u = typeof req === 'string' ? req : req.url; asked.push([id, u]); return RealResponse.json(u.includes('ledger') ? { over: true } : { count: 0 }); } }),
  } };
  const res = await worker.fetch(new Request('https://relay/ws', { headers: { Upgrade: 'websocket' } }), env);
  assert.equal(res.status, 101);
  assert.deepEqual(asked.map((a) => a[0]), ['__ledger__'], '방 개수 세기·입장 요청 없이 장부만 확인');
});

/** 방에 두 사람(a, b)을 들여보냄 */
async function twoPlayers(t) {
  const st = fakeState();
  const room = new FarmRoom(st);
  const realNow = Date.now;
  t.after(() => { Date.now = realNow; });
  const clock = { now: 5_000_000 };
  Date.now = () => clock.now;
  await room.fetch(upgrade('10.2.0.1'));
  await room.fetch(upgrade('10.2.0.2'));
  const [a, b] = st.getWebSockets();
  await room.webSocketMessage(a, JSON.stringify({ t: 'join', name: 'a', l: 'base' }));
  await room.webSocketMessage(b, JSON.stringify({ t: 'join', name: 'b' }));
  a.sent.length = b.sent.length = 0;
  return { st, room, a, b, clock, idA: a.att.id, idB: b.att.id };
}

test('릴레이: 1초 안에 또 바꾼 옷은 버리지 않고 1초가 지나면 마지막 것을 전함', async (t) => {
  const { room, a, b, clock, idA } = await twoPlayers(t);
  const timers = [];
  room.later = (fn, ms) => { const tm = { fn, ms }; timers.push(tm); return tm; };
  const looks = () => b.sent.filter((m) => m.t === 'state').map((m) => m.players.find((p) => p.id === idA).l);
  const say = (m) => room.webSocketMessage(a, JSON.stringify(m));
  await say({ t: 'look', l: 'hat1' });
  assert.deepEqual(looks(), ['hat1']);
  clock.now += 200; await say({ t: 'look', l: 'hat2' });
  clock.now += 200; await say({ t: 'look', l: 'hat3' });
  assert.deepEqual(looks(), ['hat1'], '1초 안에는 바로 퍼지지 않음');
  assert.equal(timers.length, 1, '타이머는 하나만');
  assert.ok(timers[0].ms >= 790 && timers[0].ms <= 820, `남은 시간만큼 기다림 (${timers[0].ms})`);
  clock.now += 600; timers.shift().fn();
  assert.deepEqual(looks(), ['hat1', 'hat3'], '마지막 옷만 전해짐');
  assert.equal(a.att.l, 'hat3');
  assert.equal(a.att.ln, undefined);
  // 타이머를 놓쳐도(객체가 내려갔다 올라옴) 다음 위치 메시지에 실려 감
  clock.now += 100; await say({ t: 'look', l: 'hat4' });
  timers.length = 0; room.lookTimer = 0;
  clock.now += 1000; await say({ t: 'pos', x: 1, z: 2, f: 0 });
  assert.equal(looks().at(-1), 'hat4');
  // 같은 옷으로 되돌리면 미뤄 둔 것은 취소
  clock.now += 100; await say({ t: 'look', l: 'hat5' });
  clock.now += 100; await say({ t: 'look', l: 'hat4' });
  b.sent.length = 0;
  assert.equal(timers.length, 1);
  clock.now += 1000; timers.shift().fn();
  assert.deepEqual(looks(), []);
  assert.equal(a.att.l, 'hat4');
});

test('릴레이: 선물을 전하지 못하면 번호(gid)로 알리고, ping 에는 pong', async (t) => {
  const { room, st, a, b, idB } = await twoPlayers(t);
  const say = (m) => room.webSocketMessage(a, JSON.stringify(m));
  const fails = () => a.sent.filter((m) => m.t === 'act_fail');
  await say({ t: 'act', k: 'gift', to: idB, item: 'carrot', n: 2, gid: 1 });
  assert.deepEqual(b.sent.at(-1), { t: 'act', from: a.att.id, name: 'a', k: 'gift', item: 'carrot', n: 2 }, '받는 사람에게 번호는 가지 않음');
  assert.equal(fails().length, 0);
  // 상대가 나감
  b.closed = 1000;
  await say({ t: 'act', k: 'gift', to: idB, item: 'carrot', n: 1, gid: 2 });
  assert.deepEqual(fails().at(-1), { t: 'act_fail', k: 'gift', gid: 2, why: 'gone' });
  await say({ t: 'act', k: 'gift', to: idB, item: 'carrot', n: 1 }); // 번호 없는 옛 클라이언트
  assert.equal(fails().length, 1);
  // 한도 초과
  b.closed = null;
  for (let i = 0; i < 8; i++) await say({ t: 'act', k: 'wave', to: idB });
  await say({ t: 'act', k: 'gift', to: idB, item: 'egg', n: 1, gid: 3 });
  assert.deepEqual(fails().at(-1), { t: 'act_fail', k: 'gift', gid: 3, why: 'busy' });
  // 받는 쪽 소켓이 보내다 끊김
  const c = new FarmRoom(st);
  st.sockets.length = 0;
  await c.fetch(upgrade('10.3.0.1')); await c.fetch(upgrade('10.3.0.2'));
  const [x, y] = st.getWebSockets();
  await c.webSocketMessage(x, JSON.stringify({ t: 'join', name: 'x' }));
  await c.webSocketMessage(y, JSON.stringify({ t: 'join', name: 'y' }));
  y.send = () => { throw new Error('끊김'); };
  await c.webSocketMessage(x, JSON.stringify({ t: 'act', k: 'gift', to: y.att.id, item: 'egg', n: 1, gid: 9 }));
  assert.deepEqual(x.sent.at(-1), { t: 'act_fail', k: 'gift', gid: 9, why: 'gone' });
  // ping → pong (잠든 채 답하는 자동 응답을 못 쓰는 환경에서도)
  await c.webSocketMessage(x, '{"t":"ping"}');
  assert.deepEqual(x.sent.at(-1), { t: 'pong' });
});

test('릴레이 진입 파일은 핸들러(default)·Durable Object 클래스만 내보냄 (상수를 내보내면 workerd 가 시작 거부)', async () => {
  const mod = await import('../deploy/cloudflare/worker.js');
  for (const [k, v] of Object.entries(mod)) assert.ok(k === 'default' ? typeof v === 'object' : typeof v === 'function', `내보낸 ${k}: ${typeof v}`);
});
