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
import zlib from 'node:zlib';
import { WebSocketServer } from 'ws';
import { Rooms } from './rooms.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8787);
const MAX_PLAYERS_PER_ROOM = Number(process.env.MAX_PLAYERS_PER_ROOM || 50);
const MAX_ROOMS = Number(process.env.MAX_ROOMS || 20);
const TICK_MS = 100;
const DIST = path.join(__dirname, '..', 'dist');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
// 압축해서 보낼 형식 (이미지·소리·폰트는 이미 압축되어 있어 제외)
const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.json', '.svg', '.glb', '.bin']);
/** 정적 파일 캐시: 파일별로 한 번만 읽고 압축(br/gzip)해 메모리에 보관 (수정 시각이 바뀌면 다시) */
const fileCache = new Map();
function loadStatic(file, st) {
  const hit = fileCache.get(file);
  if (hit && hit.mtime === st.mtimeMs) return hit;
  const raw = fs.readFileSync(file);
  const ext = path.extname(file);
  const e = { mtime: st.mtimeMs, raw, etag: `"${st.size.toString(36)}-${Math.floor(st.mtimeMs).toString(36)}"` };
  if (COMPRESSIBLE.has(ext) && raw.length > 1024) {
    e.br = zlib.brotliCompressSync(raw, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 9, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: raw.length } });
    e.gz = zlib.gzipSync(raw, { level: 9 });
  }
  fileCache.set(file, e);
  return e;
}

const rooms = new Rooms({ maxPlayers: MAX_PLAYERS_PER_ROOM, maxRooms: MAX_ROOMS });

const server = http.createServer((req, res) => {
  // 어떤 요청이 와도 서버 전체가 죽지 않게 (잘못된 주소·인코딩 등)
  try { serve(req, res); } catch { try { res.writeHead(400); res.end(); } catch { /* 이미 응답 중 */ } }
});

function serve(req, res) {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/rooms') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    return res.end(JSON.stringify({ maxPlayers: MAX_PLAYERS_PER_ROOM, rooms: rooms.summary() }));
  }
  if (url.pathname === '/health') { res.writeHead(200); return res.end('ok'); }
  // 정적 파일 (빌드 결과물)
  let rel;
  try { rel = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname); } catch { res.writeHead(400); return res.end(); } // 잘못된 %인코딩
  let file = path.join(DIST, rel);
  if (file !== DIST && !file.startsWith(DIST + path.sep)) { res.writeHead(403); return res.end(); } // dist 밖(이웃 폴더 포함) 금지
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html');
  if (!fs.existsSync(file)) { res.writeHead(404); return res.end('빌드 결과가 없습니다. npm run build 를 먼저 실행하세요.'); }
  const st = fs.statSync(file);
  const e = loadStatic(file, st);
  // 해시가 붙은 빌드 결과(/assets/)는 영구 캐시, 나머지(모델·index.html)는 ETag 로 재검증(바뀌지 않았으면 304)
  const headers = {
    'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
    'Cache-Control': url.pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
    ETag: e.etag,
    Vary: 'Accept-Encoding',
  };
  if (req.headers['if-none-match'] === e.etag) { res.writeHead(304, headers); return res.end(); }
  const accept = String(req.headers['accept-encoding'] || '');
  let body = e.raw;
  if (e.br && /\bbr\b/.test(accept)) { body = e.br; headers['Content-Encoding'] = 'br'; }
  else if (e.gz && /\bgzip\b/.test(accept)) { body = e.gz; headers['Content-Encoding'] = 'gzip'; }
  headers['Content-Length'] = body.length;
  res.writeHead(200, headers);
  res.end(req.method === 'HEAD' ? undefined : body);
}

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4096 });

// 접속 제한: 한 IP 에서 동시 접속 MAX_PER_IP 개까지, 입장(join) 전 대기는 10초까지
const MAX_PER_IP = +(process.env.MAX_PER_IP || 6);
const perIp = new Map();
// 다른 사이트가 방문자 브라우저로 방을 채우지 못하게: ALLOWED_ORIGINS="https://a.com,https://b.com" 이면 그 주소에서만 접속 (비우면 모두 허용)
const ALLOWED = (process.env.ALLOWED_ORIGINS || '').split(',').map((x) => x.trim()).filter(Boolean);
// 리버스 프록시(nginx/Caddy 등) 뒤에서는 모든 접속이 프록시 주소 하나로 보여 6명만 들어오게 됨 →
// 같은 기계의 프록시(127.0.0.1·::1)에서 왔거나 TRUST_PROXY=1 이면 X-Forwarded-For 의 마지막 값(프록시가 직접 붙인 주소)을 씀.
// 맨 앞 값은 접속자가 마음대로 적을 수 있어 쓰지 않음
const TRUST_PROXY = process.env.TRUST_PROXY === '1';
function clientIp(peer, xff, trustProxy = TRUST_PROXY) {
  peer = peer || '?';
  if (!xff || !(trustProxy || /^(::1$|127\.|::ffff:127\.)/.test(peer))) return peer;
  return String(xff).split(',').pop().trim() || peer;
}

wss.on('connection', (ws, req) => {
  const ip = clientIp(req.socket.remoteAddress, req.headers['x-forwarded-for']);
  if (ALLOWED.length && !ALLOWED.includes(req.headers.origin)) return ws.close(1008, 'origin');
  if ((perIp.get(ip) || 0) >= MAX_PER_IP) return ws.close(1013, 'too many');
  perIp.set(ip, (perIp.get(ip) || 0) + 1);
  let url;
  try { url = new URL(req.url, 'http://x'); } catch { return ws.close(); }
  const wantRoom = url.searchParams.get('room');
  let player = null;
  const joinTimer = setTimeout(() => { if (!player) ws.terminate(); }, 10000);
  let lastPos = 0;
  ws.on('message', (raw) => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m !== 'object') return; // null·숫자·문자열 JSON 무시 (예전에는 여기서 서버가 죽었음)
    try { onMessage(m); } catch { /* 한 사람의 잘못된 메시지로 서버가 죽지 않게 */ }
  });
  function onMessage(m) {
    if (m.t === 'pos') { const t = Date.now(); if (t - lastPos < 100) return; lastPos = t; } // 위치는 초당 10번까지
    if (!player) {
      if (m.t !== 'join') return;
      player = rooms.join(ws, m.name, wantRoom);
      if (!player) { ws.send(JSON.stringify({ t: 'full' })); return ws.close(); }
      ws.send(JSON.stringify({ t: 'welcome', id: player.id, room: player.room.name, count: player.room.size, players: player.room.snapshot() }));
      player.room.broadcast({ t: 'joined', p: player.public(), count: player.room.size }, player.id);
      return;
    }
    rooms.handle(player, m);
  }
  ws.on('close', () => {
    clearTimeout(joinTimer);
    const n = (perIp.get(ip) || 1) - 1; if (n > 0) perIp.set(ip, n); else perIp.delete(ip);
    if (player) rooms.leave(player);
  });
  ws.on('error', () => {});
});

setInterval(() => rooms.tick(), TICK_MS);
setInterval(() => { for (const ws of wss.clients) { if (ws.isAlive === false) { ws.terminate(); continue; } ws.isAlive = false; ws.ping(); } }, 30000); // 응답 없는 접속 정리 (하나 끊고 멈추던 것 수정)
wss.on('connection', (ws) => { ws.isAlive = true; ws.on('pong', () => (ws.isAlive = true)); });

server.listen(PORT, () => console.log(`🦄 유니코 팜 서버 http://localhost:${PORT}  (방당 ${MAX_PLAYERS_PER_ROOM}명, 최대 ${MAX_ROOMS}방)`));
