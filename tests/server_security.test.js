import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import { WebSocket } from 'ws';

const PORT = 18000 + Math.floor(Math.random() * 2000);
const get = (p) => new Promise((res) => { http.get({ host: '127.0.0.1', port: PORT, path: p }, (r) => { r.resume(); r.on('end', () => res(r.statusCode)); }).on('error', () => res(0)); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('서버: 잘못된 주소·null 메시지·숫자 메시지에도 죽지 않음, dist 밖 경로 막음', async (t) => {
  const srv = spawn(process.execPath, ['server/index.js'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
  t.after(() => srv.kill());
  for (let i = 0; i < 50 && (await get('/health')) !== 200; i++) await sleep(100);
  assert.equal(await get('/health'), 200);
  // 1) 잘못된 %인코딩 (예전에는 URIError 로 프로세스 종료)
  assert.equal(await get('/%E0%A4%A'), 400);
  assert.equal(await get('/health'), 200);
  // 2) dist 이웃 폴더로 빠져나가기
  assert.equal(await get('/..%2fdist-x/a.txt'), 403);
  // 3) WebSocket 으로 null / 숫자 / 문자열 JSON (예전에는 m.t 에서 TypeError 로 종료)
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
  await new Promise((r, j) => { ws.on('open', r); ws.on('error', j); });
  for (const bad of ['null', '123', '"x"', '[]', '{"t":"pos","x":"a"}']) ws.send(bad);
  ws.send(JSON.stringify({ t: 'join', name: '점검' }));
  const welcome = await new Promise((r) => ws.on('message', (d) => { const m = JSON.parse(d); if (m.t === 'welcome') r(m); }));
  assert.equal(welcome.t, 'welcome');
  ws.send('null');
  await sleep(200);
  assert.equal(await get('/health'), 200, '서버가 살아 있어야 함');
  ws.close();
  assert.equal(srv.exitCode, null, '프로세스가 종료되지 않음');
});
