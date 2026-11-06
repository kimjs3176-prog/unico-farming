import test from 'node:test';
import assert from 'node:assert/strict';
import { SocialSim, validGift, FIVE_BONUS, GIFTS_PER_DAY, REQ_TTL } from '../src/game/sim/social.js';
import { sanitizeAct, Rooms } from '../server/rooms.js';

test('하이파이브 코인: 오늘 처음인 상대만, 하루 3명까지, 다음 날 새로', () => {
  const s = new SocialSim(); s.newDay(1);
  assert.equal(s.highFive('가'), FIVE_BONUS);
  assert.equal(s.highFive('가'), 0);
  assert.equal(s.highFive('나'), FIVE_BONUS);
  assert.equal(s.highFive('다'), FIVE_BONUS);
  assert.equal(s.highFive('라'), 0);
  s.newDay(2);
  assert.equal(s.highFive('가'), FIVE_BONUS);
});

test('요청은 12초 안에 받아야 인정, 한 번만', () => {
  const s = new SocialSim();
  s.request('five', 3, 100);
  assert.equal(s.accepted('five', 3, 100 + REQ_TTL + 1), false);
  s.request('five', 3, 200);
  assert.equal(s.accepted('five', 3, 205), true);
  assert.equal(s.accepted('five', 3, 206), false, '같은 수락 두 번은 무시');
  assert.equal(s.accepted('friend', 9, 0), false, '보낸 적 없는 수락은 무시');
});

test('선물: 하루 횟수·개수 제한, 받는 선물은 아는 물건만', () => {
  const s = new SocialSim();
  assert.equal(s.whyNotGift(3, 1), null);
  assert.match(s.whyNotGift(3, 6), /1~5/);
  assert.match(s.whyNotGift(1, 2), /모자라요/);
  for (let i = 0; i < GIFTS_PER_DAY; i++) s.noteGift();
  assert.match(s.whyNotGift(9, 1), /다 보냈어요/);
  const cat = { carrot: {}, egg: {} };
  assert.ok(validGift('carrot', 2, cat));
  assert.ok(!validGift('carrot', 9, cat));
  assert.ok(!validGift('gold_bar', 1, cat));
  assert.ok(!validGift('__proto__', 1, cat));
  assert.ok(!validGift('carrot', 1.5, cat));
});

test('친구: 이름으로 저장, 중복 없음, 불러올 때 이상한 값 거름', () => {
  const s = new SocialSim();
  assert.ok(s.addFriend('반짝이는 당근'));
  assert.ok(!s.addFriend('반짝이는 당근'));
  assert.ok(s.isFriend('반짝이는 당근'));
  const t = new SocialSim(); t.load({ friends: ['a', 5, 'x'.repeat(40), 'b'], gifts: 3 });
  assert.deepEqual(t.friends, ['a', 'b']); assert.equal(t.gifts, 3);
  assert.ok(t.removeFriend('a')); assert.deepEqual(t.friends, ['b']);
});

test('서버: 상호작용은 정해진 종류·값만, 같은 방 받는 사람에게만, 10초에 8번까지', () => {
  assert.deepEqual(sanitizeAct({ k: 'wave', to: 2 }), { to: 2, k: 'wave' });
  assert.deepEqual(sanitizeAct({ k: 'gift', to: 2, item: 'carrot', n: 3 }), { to: 2, k: 'gift', item: 'carrot', n: 3 });
  assert.equal(sanitizeAct({ k: 'gift', to: 2, item: '<img>', n: 1 }), null);
  assert.equal(sanitizeAct({ k: 'gift', to: 2, item: 'carrot', n: 99 }), null);
  assert.equal(sanitizeAct({ k: 'hack', to: 2 }), null);
  assert.equal(sanitizeAct({ k: 'wave', to: 'x' }), null);
  let now = 0;
  const fake = () => ({ readyState: 1, sent: [], send(s) { this.sent.push(JSON.parse(s)); } });
  const rooms = new Rooms({ maxPlayers: 10, now: () => now });
  const a = rooms.join(fake(), 'a'), b = rooms.join(fake(), 'b'), c = rooms.join(fake(), 'c');
  rooms.handle(a, { t: 'act', k: 'five', to: b.id });
  assert.deepEqual(b.ws.sent.at(-1), { t: 'act', from: a.id, name: 'a', k: 'five' });
  assert.equal(c.ws.sent.filter((m) => m.t === 'act').length, 0, '다른 사람에게는 안 감');
  rooms.handle(a, { t: 'act', k: 'wave', to: a.id });
  assert.equal(a.ws.sent.filter((m) => m.t === 'act').length, 0, '자기 자신에게는 안 감');
  for (let i = 0; i < 20; i++) rooms.handle(a, { t: 'act', k: 'wave', to: b.id });
  assert.equal(b.ws.sent.filter((m) => m.t === 'act').length, 7, '10초에 8번까지 (앞의 2번 포함)');
  now = 11000; rooms.handle(a, { t: 'act', k: 'wave', to: b.id });
  assert.equal(b.ws.sent.filter((m) => m.t === 'act').length, 8);
});
