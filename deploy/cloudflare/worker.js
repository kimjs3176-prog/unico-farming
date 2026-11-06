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
const MAX_PER_IP = 6;           // 한 IP 동시 접속 수
const JOIN_MS = 10000;          // 접속 후 입장(join)까지 기다리는 시간 (Node 서버와 같음)
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
      // 다른 사이트가 방문자 브라우저로 방을 채우지 못하게: wrangler.toml [vars] ALLOWED_ORIGINS="https://내게임.vercel.app" (쉼표로 여러 개, 비우면 모두 허용)
      const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map((x) => x.trim()).filter(Boolean);
      if (allowed.length && !allowed.includes(req.headers.get('Origin'))) return new Response('forbidden origin', { status: 403 });
      // 원하는 방(있고 자리가 있으면) → 없으면 자리가 있는 가장 낮은 번호 방
      let name = url.searchParams.get('room');
      const valid = name && /^[1-9]\d?번 농장$/.test(name) && +name.split('번')[0] <= MAX_ROOMS; // 1~20번만 ('0번'·'01번' 같은 목록 밖 방 금지)
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

  pub(p) { return { id: p.id, name: p.name, x: p.x, z: p.z, f: p.f, a: p.a, l: p.l || '' }; }

  async fetch(req) {
    const url = new URL(req.url);
    // 인원은 입장(join)한 사람만 셈: 입장 안 한 빈 소켓으로 방을 '가득 참'으로 만들지 못하게
    if (url.pathname === '/count') return Response.json({ count: this.players().length });
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 });
    // 입장(join) 안 하고 JOIN_MS 넘게 붙어 있는 소켓은 정리: 빈 소켓으로 소켓 총량을 채워 방(특히 1번 방)을 막지 못하게
    const now = Date.now();
    const live = this.state.getWebSockets().filter((w) => {
      const a = w.deserializeAttachment();
      if (a && !a.name && now - (a.at || 0) > JOIN_MS) { try { w.close(1008, 'join timeout'); } catch { /* 이미 닫힘 */ } return false; }
      return true;
    });
    if (this.players().length >= MAX_PLAYERS || live.length >= MAX_PLAYERS * 2) return fullSocket();
    // 한 IP 동시 접속 제한
    const ip = req.headers.get('CF-Connecting-IP') || '';
    if (ip && live.filter((w) => w.deserializeAttachment()?.ip === ip).length >= MAX_PER_IP) return fullSocket();
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.state.acceptWebSocket(server);
    const room = decodeURIComponent(req.headers.get('X-Room') || '') || roomName(1);
    server.serializeAttachment({ id: this.nextId++, name: '', room, x: 0, z: 9, f: 0, a: '', chats: [], ip, at: now });
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
    if (!m || typeof m !== 'object') return; // null·숫자·문자열 JSON 무시
    const p = ws.deserializeAttachment();
    if (!p) return;
    if (m.t === 'join') {
      if (p.name) return; // 한 번만
      // 접속은 방 인원의 2배까지 받으므로, 입장 때 다시 확인 (동시에 붙은 소켓이 한꺼번에 입장해 50명을 넘지 않게)
      if (this.players().length >= MAX_PLAYERS) { try { ws.send(JSON.stringify({ t: 'full' })); ws.close(1013, 'full'); } catch { /* 이미 닫힘 */ } return; }
      p.name = String(m.name || '').replace(/[<>&"'`]/g, '').trim().slice(0, 12) || '유니코';
      p.l = String(m.l || '').replace(/[^a-z0-9.-]/g, '').slice(0, 48); // 옷차림
      ws.serializeAttachment(p);
      const n = this.players().length;
      ws.send(JSON.stringify({ t: 'welcome', id: p.id, room: p.room, count: n, players: this.players().filter((x) => x.id !== p.id).map((x) => this.pub(x)) }));
      this.broadcast({ t: 'joined', p: this.pub(p), count: n }, p.id);
      return;
    }
    if (!p.name) return; // 입장 전 메시지 무시
    if (m.t === 'pos') {
      const now = Date.now(); if (now - (p.lp || 0) < 100) return; p.lp = now; // 위치는 초당 10번까지 (방 전체로 퍼지므로)
      const num = (v, lim) => (Number.isFinite(+v) ? Math.max(-lim, Math.min(lim, +v)) : 0);
      Object.assign(p, { x: num(m.x, BOUND), z: num(m.z, BOUND), f: num(m.f, 20), a: String(m.a || '').replace(/[^a-z_]/gi, '').slice(0, 12) });
      ws.serializeAttachment(p);
      this.broadcast({ t: 'state', players: [this.pub(p)] }, p.id);
    } else if (m.t === 'look') {
      const now = Date.now(); if (now - (p.ll || 0) < 1000) return; p.ll = now; // 옷 갈아입기는 1초에 한 번까지
      p.l = String(m.l || '').replace(/[^a-z0-9.-]/g, '').slice(0, 48);
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
