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

test('서버: 같은 기계의 리버스 프록시 뒤에서는 X-Forwarded-For(마지막 값)로 IP당 접속 수를 셈', async (t) => {
  const port = PORT + 1;
  const srv = spawn(process.execPath, ['server/index.js'], { env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
  t.after(() => srv.kill());
  const getP = (p) => new Promise((res) => { http.get({ host: '127.0.0.1', port, path: p }, (r) => { r.resume(); r.on('end', () => res(r.statusCode)); }).on('error', () => res(0)); });
  for (let i = 0; i < 50 && (await getP('/health')) !== 200; i++) await sleep(100);
  // 결과: 'open' 이면 계속 열려 있음, 숫자면 서버가 그 코드로 닫음
  const open = (xff) => new Promise((res) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, { headers: { 'X-Forwarded-For': xff } });
    ws.on('close', (code) => res(code));
    ws.on('error', () => res('error'));
    ws.on('open', () => setTimeout(() => res(ws), 300));
  });
  // 서로 다른 접속자 7명 (예전에는 프록시 주소 하나로 보여 7번째부터 거절)
  const many = [];
  for (let i = 0; i < 7; i++) many.push(await open(`10.0.0.${i + 1}`));
  assert.ok(many.every((w) => typeof w === 'object'), '다른 IP 7명은 모두 접속');
  // 맨 앞 값을 바꿔 적어도(위조) 프록시가 붙인 마지막 값이 같으면 같은 사람
  const same = [];
  for (let i = 0; i < 7; i++) same.push(await open(`1.2.3.${i}, 10.9.9.9`));
  assert.equal(same.filter((w) => typeof w === 'object').length, 6, '같은 IP 는 6개까지');
  assert.equal(same[6], 1013);
  for (const w of [...many, ...same]) if (typeof w === 'object') w.close();
});

test('서버: 1초 안에 연달아 바꾼 옷도 마지막 것이 전해지고, 못 전한 선물은 알려 주고, ping 에 pong', async (t) => {
  const port = PORT + 2;
  const srv = spawn(process.execPath, ['server/index.js'], { env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
  t.after(() => srv.kill());
  const getP = (p) => new Promise((res) => { http.get({ host: '127.0.0.1', port, path: p }, (r) => { r.resume(); r.on('end', () => res(r.statusCode)); }).on('error', () => res(0)); });
  for (let i = 0; i < 50 && (await getP('/health')) !== 200; i++) await sleep(100);
  // 받은 메시지를 모아 두고, 조건에 맞는 것이 올 때까지 기다림
  const join = async (name, l) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    ws.got = [];
    ws.on('message', (d) => ws.got.push(JSON.parse(d)));
    await new Promise((r, j) => { ws.on('open', r); ws.on('error', j); });
    ws.send(JSON.stringify({ t: 'join', name, l }));
    for (let i = 0; i < 50 && !ws.got.some((m) => m.t === 'welcome'); i++) await sleep(20);
    ws.id = ws.got.find((m) => m.t === 'welcome').id;
    return ws;
  };
  const waitFor = async (ws, fn, ms = 3000) => { for (let i = 0; i < ms / 20; i++) { const m = ws.got.find(fn); if (m) return m; await sleep(20); } return null; };
  const a = await join('가', 'base'), b = await join('나', '');
  t.after(() => { a.close(); b.close(); });
  a.send(JSON.stringify({ t: 'look', l: 'hat1' }));
  a.send(JSON.stringify({ t: 'look', l: 'hat2' })); // 1초 안 → 예전에는 버려져 b 에게 hat1 이 계속 보였음
  const lookOf = (want) => (m) => m.t === 'state' && m.players.some((p) => p.id === a.id && p.l === want);
  assert.ok(await waitFor(b, lookOf('hat1')), '첫 옷은 바로');
  assert.ok(await waitFor(b, lookOf('hat2')), '1초 안에 바꾼 마지막 옷도 1초 뒤 전해짐');
  // 나간 사람에게 보낸 선물 → 번호로 알림
  a.send(JSON.stringify({ t: 'act', k: 'gift', to: 987654, item: 'carrot', n: 1, gid: 5 }));
  assert.deepEqual(await waitFor(a, (m) => m.t === 'act_fail'), { t: 'act_fail', k: 'gift', gid: 5, why: 'gone' });
  a.send(JSON.stringify({ t: 'ping' }));
  assert.ok(await waitFor(a, (m) => m.t === 'pong'), 'ping 에 pong (반쯤 끊긴 소켓 확인용)');
});
