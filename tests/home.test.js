import test from 'node:test';
import assert from 'node:assert/strict';
import { HomeSim, HOME_LEVELS, WAKE_AT, RESTED_SPEED, WALLPAPERS, FLOORS, FURNITURE } from '../src/game/sim/home.js';

const at = (h) => h / 24;

test('잠은 저녁 6시~새벽 6시에만', () => {
  const h = new HomeSim();
  assert.equal(h.canSleep(at(12)), false);
  assert.equal(h.canSleep(at(17.9)), false);
  assert.equal(h.canSleep(at(18)), true);
  assert.equal(h.canSleep(at(23.5)), true);
  assert.equal(h.canSleep(at(3)), true);
  assert.equal(h.canSleep(at(6.1)), false);
  assert.equal(h.sleep(at(12), 3), null);
});

test('자정 전에 자면 다음 날 아침, 자정 뒤면 같은 날 아침', () => {
  const h = new HomeSim();
  assert.deepEqual(h.sleep(at(21), 3), { time: WAKE_AT, day: 4, newDay: true });
  assert.deepEqual(h.sleep(at(2), 5), { time: WAKE_AT, day: 5, newDay: false });
  assert.equal(h.sleeps, 2);
});

test('자고 일어난 날은 개운함(속도 +15%), 다음 날엔 사라짐', () => {
  const h = new HomeSim();
  h.sleep(at(22), 1);
  assert.equal(h.speedMult(2), RESTED_SPEED);
  assert.equal(h.speedMult(3), 1);
});

test('집 넓히기: 레벨·코인 조건, 3단계까지, 우편함 선물', () => {
  const h = new HomeSim();
  assert.equal(h.mail(), null);
  assert.match(h.whyNotUpgrade(100), /모자라요/);
  assert.match(h.whyNotUpgrade(99999, 1), /Lv\.2/);
  assert.equal(h.upgrade(99999, 2), HOME_LEVELS[1].price);
  assert.equal(h.mail().coins, 40);
  assert.equal(h.upgrade(99999, 9), HOME_LEVELS[2].price);
  assert.equal(h.mail().coins, 100);
  assert.match(h.whyNotUpgrade(99999, 9), /가장 큰 집/);
  assert.equal(h.upgrade(99999, 9), 0);
});

test('저장·불러오기 (이상한 값은 범위 안으로)', () => {
  const h = new HomeSim(); h.upgrade(99999, 9); h.sleep(at(20), 4);
  const g = new HomeSim(); g.load(JSON.parse(JSON.stringify(h.toJSON())));
  assert.equal(g.level, 1); assert.equal(g.restedDay, 5);
  g.load({ level: 99 }); assert.equal(g.level, HOME_LEVELS.length - 1);
});

test('옷차림 저장: 정해진 것만 받아들임', async () => {
  const { OUTFIT } = await import('../src/game/sim/home.js');
  const h = new HomeSim();
  h.load({ outfit: { hat: 'straw', scarf: 'blue', goggles: 1 } });
  assert.deepEqual([h.outfit.hat, h.outfit.scarf, h.outfit.goggles], ['straw', 'blue', true]);
  h.load({ outfit: { hat: 'crown', scarf: '<x>' } });
  assert.equal(h.outfit.hat, null); assert.equal(h.outfit.scarf, null);
  assert.ok(OUTFIT.hat.includes('helmet'));
});

test('집 꾸미기 목록: 벽지·바닥 8가지씩(300~2,000) + 기본, 가구 10가지 남짓(200~3,000)', () => {
  for (const list of [WALLPAPERS, FLOORS]) {
    assert.equal(list[0].price, 0, '첫 칸은 기본(무료)');
    assert.equal(list.length - 1, 8);
    for (const x of list.slice(1)) assert.ok(x.price >= 300 && x.price <= 2000, `${x.id} ${x.price}`);
  }
  assert.ok(FURNITURE.length >= 10 && FURNITURE.length <= 12, String(FURNITURE.length));
  for (const x of FURNITURE) assert.ok(x.price >= 200 && x.price <= 3000, `${x.id} ${x.price}`);
});

test('벽지 사기: 바로 입힘, 가진 것은 다시 바꿀 수 있고 두 번 사지 않음 · 레벨·코인 조건', () => {
  const h = new HomeSim();
  assert.match(h.whyNotStyle('wall', 'night', 99999, 1), /Lv\.6/);
  assert.equal(h.buyStyle('wall', 'peach', 100, 9), -1);
  assert.equal(h.buyStyle('wall', 'peach', 300, 9), 300);
  assert.equal(h.style.wall, 'peach');
  assert.equal(h.colors().wall, WALLPAPERS.find((x) => x.id === 'peach').wall);
  assert.equal(h.buyStyle('wall', 'peach', 9999, 9), -1, '이미 가짐');
  assert.ok(h.setStyle('wall', 'cream'));
  assert.equal(h.setStyle('wall', 'mint'), false, '안 가진 것으로는 못 바꿈');
  assert.equal(h.style.wall, 'cream');
});

test('집 꾸미기 저장·불러오기: 벽지·바닥·가구가 그대로, 옛 저장은 기본 방', () => {
  const h = new HomeSim();
  h.buyStyle('floor', 'check', 9999, 9); h.buyStyle('wall', 'sky', 9999, 9);
  assert.equal(h.buyFurniture('teddy', 9999, 9), 400);
  assert.equal(h.buyFurniture('teddy', 9999, 9), 0, '같은 가구는 하나만');
  assert.match(h.whyNotFurniture('statue', 99999, 3), /Lv\.6/);
  const back = new HomeSim(); back.load(JSON.parse(JSON.stringify(h.toJSON())));
  assert.deepEqual(back.style, { wall: 'sky', floor: 'check' });
  assert.deepEqual(back.styles.floor, ['oak', 'check']);
  assert.deepEqual(back.furniture, ['teddy']);
  const old = new HomeSim(); old.load({ level: 1, restedDay: 3, sleeps: 2, outfit: {} });
  assert.deepEqual(old.style, { wall: 'cream', floor: 'oak' });
  assert.deepEqual(old.furniture, []);
  const odd = new HomeSim(); odd.load({ style: { wall: 'night' }, styles: { wall: ['<x>'] }, furniture: ['sofa', 'clock', 'clock'] });
  assert.equal(odd.style.wall, 'cream', '안 가진 벽지는 입히지 않음');
  assert.deepEqual(odd.furniture, ['clock']);
});
