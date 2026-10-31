/**
 * 유니코 팜 멀티플레이 릴레이 서버 (Node.js + ws)
 * - 방(룸) 단위로 위치/포즈/채팅을 브로드캐스트. 방당 MAX_PLAYERS_PER_ROOM(기본 50)명, 방 자동 증설
 * - 10Hz 틱으로 변경된 플레이어 상태만 묶어 전송 (대역폭 절약)
 * - production 모드에서는 dist/ 정적 파일도 서빙
 * - GET /rooms : 방별 인원 (클라이언트 방 선택 UI)
 *
 * 실행: npm run server  (PORT=8787)
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { Rooms } from './rooms.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8787);
const MAX_PLAYERS_PER_ROOM = Number(process.env.MAX_PLAYERS_PER_ROOM || 50);
const MAX_ROOMS = Number(process.env.MAX_ROOMS || 20);
const TICK_MS = 100;
const DIST = path.join(__dirname, '..', 'dist');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.glb': 'model/gltf-binary', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp' };

const rooms = new Rooms({ maxPlayers: MAX_PLAYERS_PER_ROOM, maxRooms: MAX_ROOMS });

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/rooms') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    return res.end(JSON.stringify({ maxPlayers: MAX_PLAYERS_PER_ROOM, rooms: rooms.summary() }));
  }
  if (url.pathname === '/health') { res.writeHead(200); return res.end('ok'); }
  // 정적 파일 (빌드 결과물)
  let file = path.join(DIST, decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
  if (!file.startsWith(DIST)) { res.writeHead(403); return res.end(); }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html');
  if (!fs.existsSync(file)) { res.writeHead(404); return res.end('빌드 결과가 없습니다. npm run build 를 먼저 실행하세요.'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': file.endsWith('.glb') ? 'public, max-age=86400' : 'no-cache' });
  fs.createReadStream(file).pipe(res);
});

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4096 });

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, 'http://x');
  const wantRoom = url.searchParams.get('room');
  let player = null;
  ws.on('message', (raw) => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (!player) {
      if (m.t !== 'join') return;
      player = rooms.join(ws, m.name, wantRoom);
      if (!player) { ws.send(JSON.stringify({ t: 'full' })); return ws.close(); }
      ws.send(JSON.stringify({ t: 'welcome', id: player.id, room: player.room.name, count: player.room.size, players: player.room.snapshot() }));
      player.room.broadcast({ t: 'joined', p: player.public(), count: player.room.size }, player.id);
      return;
    }
    rooms.handle(player, m);
  });
  ws.on('close', () => { if (player) rooms.leave(player); });
  ws.on('error', () => {});
});

setInterval(() => rooms.tick(), TICK_MS);
setInterval(() => { for (const ws of wss.clients) { if (ws.isAlive === false) return ws.terminate(); ws.isAlive = false; ws.ping(); } }, 30000);
wss.on('connection', (ws) => { ws.isAlive = true; ws.on('pong', () => (ws.isAlive = true)); });

server.listen(PORT, () => console.log(`🦄 유니코 팜 서버 http://localhost:${PORT}  (방당 ${MAX_PLAYERS_PER_ROOM}명, 최대 ${MAX_ROOMS}방)`));
