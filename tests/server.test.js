import test from 'node:test';
import assert from 'node:assert/strict';
import { Rooms, sanitizeName, sanitizeChat, randomName } from '../server/rooms.js';

const fakeWs = () => { const ws = { readyState: 1, sent: [] }; ws.send = (s) => ws.sent.push(JSON.parse(s)); return ws; };

test('rooms: cap per room and auto-create next room', () => {
  const rooms = new Rooms({ maxPlayers: 2, maxRooms: 2 });
  const a = rooms.join(fakeWs(), 'a'), b = rooms.join(fakeWs(), 'b'), c = rooms.join(fakeWs(), 'c');
  assert.equal(a.room.name, '1번 농장');
  assert.equal(b.room.name, '1번 농장');
  assert.equal(c.room.name, '2번 농장');
  rooms.join(fakeWs(), 'd');
  assert.equal(rooms.join(fakeWs(), 'e'), null, 'all rooms full');
  rooms.leave(a);
  assert.equal(rooms.join(fakeWs(), 'f').room.name, '1번 농장');
  assert.deepEqual(rooms.summary().map((r) => r.count), [2, 2]);
});

test('rooms: tick batches only dirty players and chat is rate limited', () => {
  let now = 0;
  const rooms = new Rooms({ maxPlayers: 10, now: () => now });
  const a = rooms.join(fakeWs(), 'a'), b = rooms.join(fakeWs(), 'b');
  rooms.tick(); // 초기 dirty 전송
  a.ws.sent.length = b.ws.sent.length = 0;
  rooms.handle(a, { t: 'pos', x: 1, z: 2, f: 0.5, a: 'cheer' });
  rooms.tick();
  assert.equal(b.ws.sent.length, 1);
  assert.equal(b.ws.sent[0].players.length, 1);
  assert.equal(b.ws.sent[0].players[0].x, 1);
  rooms.tick();
  assert.equal(b.ws.sent.length, 1, 'no resend when nothing changed');
  for (let i = 0; i < 7; i++) rooms.handle(a, { t: 'chat', text: `hi ${i}` });
  assert.equal(b.ws.sent.filter((m) => m.t === 'chat').length, 5);
  now = 6000;
  rooms.handle(a, { t: 'chat', text: '<b>x</b>' });
  assert.equal(b.ws.sent.at(-1).text, 'bx/b');
});

test('sanitize', () => {
  assert.equal(sanitizeName('<script>유니코</script>'), 'script유니코/script'.slice(0, 12));
  assert.ok(sanitizeName('').length > 0);
  assert.equal(sanitizeChat('  a<b>  '), 'ab');
  assert.match(randomName(() => 0), /^부지런한 당근$/);
});

test('rooms: 옷차림(look) 은 걸러서 퍼지고 1초에 한 번까지', async () => {
  const { sanitizeLook } = await import('../server/rooms.js');
  let now = 0;
  const rooms = new Rooms({ maxPlayers: 10, now: () => now });
  const a = rooms.join(fakeWs(), 'a', null, 'raincoat.straw.red.1.1'), b = rooms.join(fakeWs(), 'b');
  assert.equal(a.public().l, 'raincoat.straw.red.1.1');
  rooms.tick(); b.ws.sent.length = 0;
  rooms.handle(a, { t: 'look', l: 'hanbok.<img src=x>.-.0.1' });
  rooms.tick();
  assert.equal(b.ws.sent[0].players[0].l, 'hanbok.imgsrcx.-.0.1');
  now = 500; rooms.handle(a, { t: 'look', l: 'chef.-.-.0.1' });
  assert.equal(a.l, 'hanbok.imgsrcx.-.0.1', '1초 안에 다시 바꾸면 무시');
  now = 1600; rooms.handle(a, { t: 'look', l: 'chef.-.-.0.1' });
  assert.equal(a.l, 'chef.-.-.0.1');
  assert.equal(sanitizeLook('x'.repeat(100)).length, 48);
  assert.equal(sanitizeLook({ toString() { return 'A.B'; } }), '.');
});

test('rooms: 1초 안에 또 바꾼 옷은 버리지 않고, 1초가 지나면 마지막 것을 전함', () => {
  let now = 0;
  const rooms = new Rooms({ maxPlayers: 10, now: () => now });
  const a = rooms.join(fakeWs(), 'a', null, 'base'), b = rooms.join(fakeWs(), 'b');
  rooms.tick(); b.ws.sent.length = 0;
  const lastLook = () => b.ws.sent.filter((m) => m.t === 'state').at(-1)?.players.find((p) => p.id === a.id)?.l;
  rooms.handle(a, { t: 'look', l: 'hat1' }); rooms.tick();
  assert.equal(lastLook(), 'hat1');
  now = 200; rooms.handle(a, { t: 'look', l: 'hat2' });
  now = 400; rooms.handle(a, { t: 'look', l: 'hat3' });
  rooms.tick();
  assert.equal(a.l, 'hat1', '1초가 안 지났으면 아직 그대로');
  rooms.handle(a, { t: 'pos', x: 3, z: 4 }); rooms.tick();
  assert.equal(lastLook(), 'hat1', '위치 방송으로 1초 제한을 건너뛰지 않음');
  now = 999; rooms.tick();
  assert.equal(a.l, 'hat1');
  now = 1000; rooms.tick();
  assert.equal(a.l, 'hat3', '마지막 옷이 남아 있다가 전해짐');
  assert.equal(lastLook(), 'hat3');
  // 다음 1초 창도 지켜지고, 원래 옷으로 되돌리면 미뤄 둔 것은 취소
  now = 1100; rooms.handle(a, { t: 'look', l: 'hat4' });
  now = 1500; rooms.handle(a, { t: 'look', l: 'hat3' });
  b.ws.sent.length = 0;
  now = 2100; rooms.tick();
  assert.equal(a.l, 'hat3');
  assert.equal(b.ws.sent.length, 0, '같은 옷이면 다시 보내지 않음');
  // 같은 옷을 또 보내도 1초 창을 쓰지 않음 (세트 입기처럼 두 번 불릴 때)
  now = 2200; rooms.handle(a, { t: 'look', l: 'hat3' });
  now = 2300; rooms.handle(a, { t: 'look', l: 'hat5' });
  assert.equal(a.l, 'hat5');
  // 나간 사람의 미뤄 둔 옷은 그냥 버려짐 (오류 없음)
  now = 2400; rooms.handle(a, { t: 'look', l: 'hat6' });
  rooms.leave(a);
  now = 4000; rooms.tick();
});

test('rooms: 선물을 전하지 못하면(한도 초과·상대 없음) 번호(gid)로 보낸 사람에게 알림', async () => {
  const { sanitizeGid, ACT_LIMIT } = await import('../server/rooms.js');
  const rooms = new Rooms({ maxPlayers: 10, now: () => 0 });
  const a = rooms.join(fakeWs(), 'a'), b = rooms.join(fakeWs(), 'b');
  const fails = () => a.ws.sent.filter((m) => m.t === 'act_fail');
  // 전해지면 알림 없음, 받는 사람에게 번호는 가지 않음
  rooms.handle(a, { t: 'act', k: 'gift', to: b.id, item: 'carrot', n: 2, gid: 1 });
  assert.deepEqual(b.ws.sent.at(-1), { t: 'act', from: a.id, name: 'a', k: 'gift', item: 'carrot', n: 2 });
  assert.equal(fails().length, 0);
  // 상대가 없음 (나갔음)
  rooms.handle(a, { t: 'act', k: 'gift', to: 999, item: 'carrot', n: 1, gid: 2 });
  assert.deepEqual(fails().at(-1), { t: 'act_fail', k: 'gift', gid: 2, why: 'gone' });
  // 번호가 없는 옛 클라이언트·선물이 아닌 상호작용에는 알림 없음
  rooms.handle(a, { t: 'act', k: 'gift', to: 999, item: 'carrot', n: 1 });
  rooms.handle(a, { t: 'act', k: 'wave', to: 999, gid: 3 });
  assert.equal(fails().length, 1);
  // 한도 초과
  for (let i = 0; i < ACT_LIMIT; i++) rooms.handle(a, { t: 'act', k: 'wave', to: b.id });
  rooms.handle(a, { t: 'act', k: 'gift', to: b.id, item: 'egg', n: 1, gid: 4 });
  assert.deepEqual(fails().at(-1), { t: 'act_fail', k: 'gift', gid: 4, why: 'busy' });
  assert.equal(b.ws.sent.filter((m) => m.t === 'act' && m.k === 'gift').length, 1, '한도를 넘은 선물은 전해지지 않음');
  assert.equal(sanitizeGid('7'), 7);
  for (const bad of [0, -1, 1.5, 'x', null, undefined, 2e9]) assert.equal(sanitizeGid(bad), 0, String(bad));
});
