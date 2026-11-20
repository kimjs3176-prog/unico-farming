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
const budgetEnv = () => ({ ROOM: { idFromName: (n) => n, get: () => ({ fetch: async () => RealResponse.json({ granted: true, requests: 256, awakeSec: 60 }) }) } });
const makeRoom = (state) => new FarmRoom(state, budgetEnv());
const CAP = MAX_PLAYERS * 2; // 방 하나 소켓 총량 (입장 전 포함)

function fakeState() {
  const sockets = [];
  return { sockets, getWebSockets: () => sockets.filter((w) => w.closed === null), acceptWebSocket: (w) => sockets.push(w) };
}
const upgrade = (ip) => ({ url: 'https://relay/ws', headers: new Headers({ Upgrade: 'websocket', 'CF-Connecting-IP': ip, 'X-Room': encodeURIComponent('1번 농장') }) });

test('릴레이: 입장 안 한 채 10초 넘은 빈 소켓은 정리되어 방을 막지 못함', async (t) => {
  const st = fakeState();
  const room = makeRoom(st);
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
  const room = makeRoom(st);
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
    get: (id) => ({ fetch: async (req) => { if (typeof req === 'string') return RealResponse.json({ count: 0, over: false }); asked.push([id, decodeURIComponent(req.headers.get('X-Room'))]); return { status: 101 }; } }),
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
  const room = makeRoom(st);
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
  const c = makeRoom(st);
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


test('방 목록: 1·2번이 비어 있어도 사용 중인 3번 방을 표시하고 15초 동안 조회를 합침', async () => {
  const asked = [];
  const env = { ROOM: { idFromName: (n) => n, get: (id) => ({ fetch: async () => {
    asked.push(id);
    return RealResponse.json(id === '__ledger__' ? { over: false } : { count: id === '3번 농장' ? 1 : 0 });
  } }) } };
  const req = new Request('https://relay/rooms');
  const result = await (await worker.fetch(req, env)).json();
  assert.deepEqual(result.rooms.map((r) => r.name), ['1번 농장', '3번 농장']);
  await worker.fetch(req, env);
  assert.equal(asked.length, MAX_ROOMS + 1);
});

test('사용량 조회 장애: 입장·방 메시지 모두 차단, 전달·재질문 없음', async () => {
  let calls = 0;
  const env = { ROOM: { idFromName: (n) => n, get: () => ({ fetch: async () => { calls++; throw new Error('ledger down'); } }) } };
  const res = await worker.fetch(new Request('https://relay/ws', { headers: { Upgrade: 'websocket' } }), env);
  assert.equal(res.status, 101);
  assert.equal(calls, 1);
  assert.equal(res.webSocket.sent.length, 0);
  const st = fakeState(), ws = new FakeWs();
  ws.att = { id: 1, name: '나' }; st.sockets.push(ws);
  const room = new FarmRoom(st, env);
  await room.webSocketMessage(ws, '{"t":"chat","text":"전해지면 안 됨"}');
  assert.equal(ws.closed, 1013);
  assert.ok(ws.sent.every((m) => m.t === 'quota'));
});

test('예산: 동시 첫 메시지는 한 번만 예약하고, 재생성 후에는 새 몫을 먼저 예약', async () => {
  let reserves = 0;
  const env = { ROOM: { idFromName: (n) => n, get: () => ({ fetch: async () => {
    reserves++; return RealResponse.json({ granted: true, requests: 2, awakeSec: 60 });
  } }) } };
  const st = fakeState();
  let room = new FarmRoom(st, env);
  assert.deepEqual(await Promise.all([room.ensureBudget(Date.now(), 'fetch'), room.ensureBudget(Date.now(), 'fetch')]), [true, true]);
  assert.equal(reserves, 1);
  await room.ensureBudget(Date.now(), 'msg'); assert.equal(reserves, 2);
  room = new FarmRoom(st, env);
  await room.ensureBudget(Date.now(), 'msg'); assert.equal(reserves, 3);
});

test('예산 소진: 이미 들어온 플레이어의 메시지도 전달하지 않고 닫음', async () => {
  const st = fakeState(), ws = new FakeWs();
  ws.att = { id: 1, name: '나' }; st.sockets.push(ws);
  const env = { ROOM: { idFromName: (n) => n, get: () => ({ fetch: async () => RealResponse.json({ granted: false }) }) } };
  await new FarmRoom(st, env).webSocketMessage(ws, '{"t":"ping"}');
  assert.equal(ws.closed, 1013);
  assert.deepEqual(ws.sent.map((m) => m.t), ['quota']);
});

test('영속 장부: 예약은 저장 후 승인, 한도 도달 후 반복 조회는 추가 쓰기 없음, 다음 날 재개', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.UTC(2026, 10, 15, 12) });
  let book, writes = 0;
  const tx = { get: async () => book, put: async (_k, v) => { book = structuredClone(v); writes++; } };
  const st = { getWebSockets: () => [], storage: { transaction: (fn) => fn(tx) } };
  const room = new FarmRoom(st, { BUDGET_REQUESTS: '260', BUDGET_AWAKE_SEC: '120' });
  const reserve = () => room.fetch(new Request('https://ledger/reserve', { method: 'POST' }));
  assert.equal((await (await reserve()).json()).granted, true);
  assert.equal((await (await reserve()).json()).granted, false);
  const n = writes;
  await room.fetch(new Request('https://ledger/status'));
  await reserve();
  assert.equal(writes, n);
  t.mock.timers.tick(12 * 3600 * 1000);
  assert.equal((await (await reserve()).json()).granted, true);
});


test('Cloudflare 선물: 식별자·번호를 유지해 전달하고 상대의 수신 확인을 전달', async (t) => {
  const { room, a, b } = await twoPlayers(t);
  const pa = a.deserializeAttachment(), pb = b.deserializeAttachment();
  pa.clientId = 'farm-sender-000000001'; pb.clientId = 'farm-receiver-0000001';
  a.serializeAttachment(pa); b.serializeAttachment(pb);
  const tx = `${pa.clientId}:1`;
  await room.webSocketMessage(a, JSON.stringify({ t: 'gift', to: pb.id, targetId: pb.clientId, tx, item: 'carrot', n: 2 }));
  assert.equal(b.sent.at(-1).tx, tx);
  await room.webSocketMessage(b, JSON.stringify({ t: 'gift_ack', to: pa.id, targetId: pa.clientId, tx }));
  assert.equal(a.sent.at(-1).fromClientId, pb.clientId);
});

/** 저장소까지 흉내 낸 방 (목표 저장 확인) */
function goalRoom(store = new Map()) {
  const st = fakeState();
  st.storage = { get: async (k) => structuredClone(store.get(k)), put: async (k, v) => { store.set(k, structuredClone(v)); } };
  const room = makeRoom(st);
  const timers = [];
  room.later = (fn, ms) => { const tm = { fn, ms }; timers.push(tm); return tm; };
  return { st, room, timers, store };
}

test('Cloudflare 함께 수확: welcome 에 목표, 기여는 타이머 하나로 묶어 저장·알림, 잘못된 값·입장 전·도배는 무시', async (t) => {
  // 준비
  const realNow = Date.now;
  t.after(() => { Date.now = realNow; });
  Date.now = () => Date.UTC(2026, 10, 20, 3);
  const { st, room, timers, store } = goalRoom();
  await room.fetch(upgrade('10.3.0.1'));
  await room.fetch(upgrade('10.3.0.2'));
  const [a, b] = st.getWebSockets();
  await room.webSocketMessage(a, JSON.stringify({ t: 'contrib', n: 5 })); // 입장 전
  await room.webSocketMessage(a, JSON.stringify({ t: 'join', name: 'a' }));
  await room.webSocketMessage(b, JSON.stringify({ t: 'join', name: 'b' }));
  assert.equal(a.sent[0].t, 'welcome');
  assert.equal(a.sent[0].goal.key, '2026-11-20#1');
  assert.equal(a.sent[0].goal.progress, 0, '입장 전 기여는 무시');
  // 실행
  for (const n of [1.5, '3', -1]) await room.webSocketMessage(a, JSON.stringify({ t: 'contrib', n }));
  for (let i = 0; i < 9; i++) await room.webSocketMessage(b, JSON.stringify({ t: 'contrib', n: 2 }));
  // 확인
  assert.equal(timers.length, 1, '타이머는 하나만 (setInterval 없음)');
  assert.ok(timers[0].ms >= 1000, `간격 ${timers[0].ms}`);
  assert.equal(store.size, 0, '타이머 전에는 저장하지 않음');
  await timers[0].fn();
  assert.equal(store.get('goal').goal.progress, 12, '10초에 6번까지만');
  assert.equal(a.sent.filter((m) => m.t === 'goal').at(-1).progress, 12);
});

test('Cloudflare 함께 수확: 잠들었다 깨어나도(새 객체) 저장소에서 목표를 이어 가고, 다 채우면 기여한 사람만 mine > 0', async (t) => {
  const realNow = Date.now;
  t.after(() => { Date.now = realNow; });
  Date.now = () => Date.UTC(2026, 10, 20, 3);
  const store = new Map([['goal', { goal: { key: '2026-11-20#1', date: '2026-11-20', seq: 1, target: 150, progress: 140, done: false }, tally: {} }]]);
  const { st, room, timers } = goalRoom(store);
  for (const ip of ['10.4.0.1', '10.4.0.2', '10.4.0.3']) await room.fetch(upgrade(ip));
  const socks = st.getWebSockets();
  for (const [i, ws] of socks.entries()) await room.webSocketMessage(ws, JSON.stringify({ t: 'join', name: `p${i}` }));
  assert.equal(socks[0].sent[0].goal.progress, 140);
  await room.webSocketMessage(socks[0], JSON.stringify({ t: 'contrib', n: 10 }));
  await timers.shift().fn();
  const done = socks.map((w) => w.sent.find((m) => m.t === 'goal_done'));
  assert.equal(done[0].mine, 10, '기여한 사람');
  assert.equal(done[1].mine, 0, '기여하지 않은 사람');
  assert.equal(store.get('goal').goal.key, '2026-11-20#2', '다음 목표를 저장');
});
