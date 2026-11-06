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

const { FarmRoom, default: worker, MAX_PLAYERS, MAX_ROOMS } = await import('../deploy/cloudflare/worker.js');
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
