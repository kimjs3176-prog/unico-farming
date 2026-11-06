import test from 'node:test';
import assert from 'node:assert/strict';
import { HomeSim, HOME_LEVELS, WAKE_AT, RESTED_SPEED } from '../src/game/sim/home.js';

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
