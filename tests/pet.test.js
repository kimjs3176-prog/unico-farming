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

test('재주는 하트 순서대로 열리고, 하트 4·5에 손!·춤추기', async () => {
  const { TRICKS, TRICK_TIME } = await import('../src/game/sim/pet.js');
  const hs = TRICKS.map((t) => t.hearts);
  assert.deepEqual(hs, [...hs].sort((a, b) => a - b));
  const p = new PetSim();
  p.affection = 79; // 하트 3
  assert.equal(p.unlocked('jump'), true);
  assert.equal(p.unlocked('paw'), false);
  p.affection = 80; // 하트 4
  assert.equal(p.unlocked('paw'), true);
  assert.equal(p.unlocked('dance'), false);
  p.affection = 100; // 하트 5
  assert.equal(p.unlocked('dance'), true);
  for (const t of TRICKS) assert.ok(TRICK_TIME[t.id] > 0, `${t.id} 길이`);
});

test('강아지 땅 파기 간격은 주입한 rng 로 정해짐 (rng 0 → 90초, 0.999… → 150초 미만)', () => {
  // 준비: 하트 3개·배부름 충분, 다음 땅 파기까지 남은 시간 0 직전
  const p = new PetSim(() => 0);
  p.affection = 60; p.hunger = 100; p.digTimer = 0.01;
  // 실행
  const r = p.tick(0.05);
  // 확인
  assert.equal(r, 'dig');
  assert.equal(p.digTimer, 90);
  const q = new PetSim(() => 0.9999);
  q.affection = 60; q.hunger = 100; q.digTimer = 0.01; q.tick(0.05);
  assert.ok(q.digTimer > 149 && q.digTimer < 150, `digTimer ${q.digTimer}`);
});
