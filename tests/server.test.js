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
