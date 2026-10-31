/**
 * Cloudflare Workers + Durable Objects 버전 릴레이 서버 (무료 플랜에서 WebSocket 가능)
 * - 방 하나 = Durable Object 하나 (WebSocket Hibernation API 사용)
 * - 클라이언트: VITE_WS_URL=wss://<worker>.workers.dev/ws
 * 배포: npx wrangler deploy  (wrangler.toml 참고)
 */
const MAX_PLAYERS = 50;
const MAX_ROOMS = 20;

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === '/rooms') {
      const rooms = [];
      for (let i = 1; i <= MAX_ROOMS; i++) {
        const name = `${i}번 농장`;
        const stub = env.ROOM.get(env.ROOM.idFromName(name));
        const r = await stub.fetch('https://room/count');
        const { count } = await r.json();
        if (count > 0 || i === 1) rooms.push({ name, count, max: MAX_PLAYERS });
      }
      return Response.json({ maxPlayers: MAX_PLAYERS, rooms }, { headers: { 'Access-Control-Allow-Origin': '*' } });
    }
    if (url.pathname === '/ws') {
      let name = url.searchParams.get('room');
      if (!name) {
        for (let i = 1; i <= MAX_ROOMS; i++) {
          const n = `${i}번 농장`;
          const r = await env.ROOM.get(env.ROOM.idFromName(n)).fetch('https://room/count');
          if ((await r.json()).count < MAX_PLAYERS) { name = n; break; }
        }
        if (!name) return new Response('full', { status: 503 });
      }
      return env.ROOM.get(env.ROOM.idFromName(name)).fetch(req);
    }
    return new Response('unico-farm relay', { status: 200 });
  },
};

export class FarmRoom {
  constructor(state) {
    this.state = state;
    this.nextId = 1;
  }

  players() {
    return this.state.getWebSockets().map((ws) => ws.deserializeAttachment()).filter(Boolean);
  }

  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === '/count') return Response.json({ count: this.state.getWebSockets().length });
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 });
    if (this.state.getWebSockets().length >= MAX_PLAYERS) return new Response('full', { status: 503 });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.state.acceptWebSocket(server);
    server.serializeAttachment({ id: this.nextId++, name: '', room: url.searchParams.get('room') || '', x: 0, z: 9, f: 0, a: '' });
    return new Response(null, { status: 101, webSocket: client });
  }

  broadcast(obj, exceptId = null) {
    const s = JSON.stringify(obj);
    for (const ws of this.state.getWebSockets()) {
      const p = ws.deserializeAttachment();
      if (p?.id !== exceptId) { try { ws.send(s); } catch {} }
    }
  }

  async webSocketMessage(ws, raw) {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    const p = ws.deserializeAttachment();
    if (!p) return;
    if (m.t === 'join') {
      p.name = String(m.name || '').replace(/[<>&"'`]/g, '').trim().slice(0, 12) || '유니코';
      ws.serializeAttachment(p);
      ws.send(JSON.stringify({ t: 'welcome', id: p.id, room: p.room || this.state.id.name || '농장', count: this.state.getWebSockets().length, players: this.players().filter((x) => x.name) }));
      this.broadcast({ t: 'joined', p, count: this.state.getWebSockets().length }, p.id);
    } else if (m.t === 'pos') {
      Object.assign(p, { x: +m.x || 0, z: +m.z || 0, f: +m.f || 0, a: String(m.a || '').slice(0, 12) });
      ws.serializeAttachment(p);
      this.broadcast({ t: 'state', players: [p] }, p.id);
    } else if (m.t === 'chat') {
      const text = String(m.text || '').replace(/[<>]/g, '').trim().slice(0, 80);
      if (text) this.broadcast({ t: 'chat', id: p.id, name: p.name, text });
    }
  }

  async webSocketClose(ws) { const p = ws.deserializeAttachment(); if (p) this.broadcast({ t: 'left', id: p.id, count: this.state.getWebSockets().length - 1 }, p.id); }
  async webSocketError(ws) { return this.webSocketClose(ws); }
}
