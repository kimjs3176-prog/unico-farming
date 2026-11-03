/**
 * Cloudflare Workers + Durable Objects 버전 릴레이 서버 (무료 플랜에서 WebSocket 가능)
 * - 방 하나 = Durable Object 하나 (WebSocket Hibernation API: 조용할 때는 잠들어 요금이 거의 안 나옴)
 * - 클라이언트 빌드: VITE_WS_URL=wss://<worker>.workers.dev/ws
 * - 프로토콜은 Node 서버(server/index.js)와 같음: join → welcome / joined / state / chat / left / full
 * 배포: cd deploy/cloudflare && npx wrangler deploy  (docs/DEPLOY.md 참고)
 */
const MAX_PLAYERS = 50;
const MAX_ROOMS = 20;
const MAX_MSG = 4096;           // 메시지 최대 길이(바이트)
const CHAT_LIMIT = 5;           // 10초에 채팅 5번까지
const BOUND = 80;               // 위치 좌표 범위 (맵 밖 값 무시)
const roomName = (i) => `${i}번 농장`;
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS' };

/** 접속을 받아 '가득 참'을 알리고 닫음 (클라이언트가 오프라인 모드로 전환) */
function fullSocket() {
  const pair = new WebSocketPair();
  const [client, server] = Object.values(pair);
  server.accept();
  server.send(JSON.stringify({ t: 'full' }));
  server.close(1013, 'full');
  return new Response(null, { status: 101, webSocket: client });
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const count = async (name) => (await (await env.ROOM.get(env.ROOM.idFromName(name)).fetch('https://room/count')).json()).count;

    // 방 목록 (방 선택 창): 사람이 있는 방 + 1번 방. 빈 방이 두 번 연속이면 그 뒤는 보지 않음(요청 수 절약)
    if (url.pathname === '/rooms') {
      const rooms = [];
      let empty = 0;
      for (let i = 1; i <= MAX_ROOMS && empty < 2; i++) {
        const c = await count(roomName(i));
        if (c > 0 || i === 1) rooms.push({ name: roomName(i), count: c, max: MAX_PLAYERS });
        empty = c > 0 ? 0 : empty + 1;
      }
      return Response.json({ maxPlayers: MAX_PLAYERS, rooms }, { headers: { ...CORS, 'Cache-Control': 'no-store' } });
    }

    if (url.pathname === '/ws') {
      if (req.headers.get('Upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 });
      // 원하는 방(있고 자리가 있으면) → 없으면 자리가 있는 가장 낮은 번호 방
      let name = url.searchParams.get('room');
      const valid = name && /^\d{1,2}번 농장$/.test(name) && +name.split('번')[0] <= MAX_ROOMS;
      if (!valid || (await count(name)) >= MAX_PLAYERS) {
        name = null;
        for (let i = 1; i <= MAX_ROOMS; i++) if ((await count(roomName(i))) < MAX_PLAYERS) { name = roomName(i); break; }
      }
      if (!name) return fullSocket();
      // 방 이름은 머리글로 넘김 (Durable Object 안에서는 자기 이름을 알 수 없음)
      const fwd = new Request(req, { headers: new Headers(req.headers) });
      fwd.headers.set('X-Room', encodeURIComponent(name));
      return env.ROOM.get(env.ROOM.idFromName(name)).fetch(fwd);
    }

    if (url.pathname === '/health') return new Response('ok');
    return new Response('unico-farm relay', { status: 200 });
  },
};

export class FarmRoom {
  constructor(state) {
    this.state = state;
    // 잠들었다 깨어나면 생성자가 다시 불리므로, 남아 있는 접속의 id 다음 번호부터 (id 중복 방지)
    this.nextId = 1 + Math.max(0, ...state.getWebSockets().map((ws) => ws.deserializeAttachment()?.id || 0));
  }

  players() {
    return this.state.getWebSockets().map((ws) => ws.deserializeAttachment()).filter((p) => p?.name);
  }

  pub(p) { return { id: p.id, name: p.name, x: p.x, z: p.z, f: p.f, a: p.a }; }

  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === '/count') return Response.json({ count: this.state.getWebSockets().length });
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 });
    if (this.state.getWebSockets().length >= MAX_PLAYERS) return fullSocket();
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.state.acceptWebSocket(server);
    const room = decodeURIComponent(req.headers.get('X-Room') || '') || roomName(1);
    server.serializeAttachment({ id: this.nextId++, name: '', room, x: 0, z: 9, f: 0, a: '', chats: [] });
    return new Response(null, { status: 101, webSocket: client });
  }

  broadcast(obj, exceptId = null) {
    const s = JSON.stringify(obj);
    for (const ws of this.state.getWebSockets()) {
      const p = ws.deserializeAttachment();
      if (p?.name && p.id !== exceptId) { try { ws.send(s); } catch { /* 끊긴 접속 */ } }
    }
  }

  async webSocketMessage(ws, raw) {
    if (typeof raw !== 'string' || raw.length > MAX_MSG) return;
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    const p = ws.deserializeAttachment();
    if (!p) return;
    if (m.t === 'join') {
      if (p.name) return; // 한 번만
      p.name = String(m.name || '').replace(/[<>&"'`]/g, '').trim().slice(0, 12) || '유니코';
      ws.serializeAttachment(p);
      const n = this.players().length;
      ws.send(JSON.stringify({ t: 'welcome', id: p.id, room: p.room, count: n, players: this.players().filter((x) => x.id !== p.id).map((x) => this.pub(x)) }));
      this.broadcast({ t: 'joined', p: this.pub(p), count: n }, p.id);
      return;
    }
    if (!p.name) return; // 입장 전 메시지 무시
    if (m.t === 'pos') {
      const num = (v, lim) => (Number.isFinite(+v) ? Math.max(-lim, Math.min(lim, +v)) : 0);
      Object.assign(p, { x: num(m.x, BOUND), z: num(m.z, BOUND), f: num(m.f, 20), a: String(m.a || '').replace(/[^a-z_]/gi, '').slice(0, 12) });
      ws.serializeAttachment(p);
      this.broadcast({ t: 'state', players: [this.pub(p)] }, p.id);
    } else if (m.t === 'chat') {
      const text = String(m.text || '').replace(/[<>]/g, '').trim().slice(0, 80);
      if (!text) return;
      const now = Date.now();
      p.chats = (p.chats || []).filter((t) => now - t < 10000);
      if (p.chats.length >= CHAT_LIMIT) return; // 도배 방지
      p.chats.push(now);
      ws.serializeAttachment(p);
      this.broadcast({ t: 'chat', id: p.id, name: p.name, text });
    }
  }

  async webSocketClose(ws) {
    const p = ws.deserializeAttachment();
    if (p?.name) this.broadcast({ t: 'left', id: p.id, count: Math.max(0, this.players().length - 1) }, p.id);
    try { ws.close(1000, 'bye'); } catch { /* 이미 닫힘 */ }
  }

  async webSocketError(ws) { return this.webSocketClose(ws); }
}
