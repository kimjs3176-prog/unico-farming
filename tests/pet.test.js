import test from 'node:test';
import assert from 'node:assert/strict';
import { PetSim } from '../src/game/sim/pet.js';

test('배부름은 시간이 지나면 줄고, 간식을 먹으면 오른다', () => {
  const p = new PetSim();
  p.hunger = 80; p.tick(180);
  assert.ok(p.hunger < 35 && p.hunger > 25, `${p.hunger}`);
  const r = p.feed('treat');
  assert.equal(r.hunger, 45);
  assert.ok(p.hunger > 70);
});

test('쓰다듬기는 쿨타임이 있고 하트가 오르면 재주가 열린다', () => {
  const p = new PetSim();
  p.affection = 15;
  assert.equal(p.unlocked('sit'), false);
  assert.ok(p.pet() > 0);
  assert.equal(p.pet(), 0); // 쿨타임
  assert.equal(p.hearts, 1);
  assert.ok(p.unlocked('sit'));
  assert.equal(p.unlocked('jump'), false);
});

test('하트 3 이상·배부르면 가끔 땅을 판다', () => {
  const p = new PetSim();
  p.affection = 70; p.hunger = 100;
  let dug = false;
  for (let i = 0; i < 200 && !dug; i++) { p.hunger = 100; dug = p.tick(1) === 'dig'; }
  assert.ok(dug);
  assert.ok(['coin', 'seed', 'item'].includes(p.dig(() => 0.1).type));
  assert.ok(p.take());
  assert.equal(p.found, null);
});

test('저장·불러오기', () => {
  const p = new PetSim(); p.name = '두부'; p.affection = 55;
  const q = new PetSim(); q.load(JSON.parse(JSON.stringify(p.toJSON())));
  assert.equal(q.name, '두부'); assert.equal(q.affection, 55);
});
