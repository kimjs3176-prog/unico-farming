import test from 'node:test';
import assert from 'node:assert/strict';
import { BattleSim, UNICO_SKILLS, PET_SKILLS, ENEMIES, BP_MAX } from '../src/pixel/battle_sim.js';

const fixed = (v = 0.5) => () => v;
const sk = (id) => UNICO_SKILLS.find((s) => s.id === id) || PET_SKILLS.find((s) => s.id === id);

test('배틀: 약점을 맞히면 방패가 깎이고 드러나며, 0 이 되면 브레이크(피해 2배·한 차례 쉼)', () => {
  const b = new BattleSim('crow', { rng: fixed() });
  b.enemy.hp = b.enemy.max = 200; // 이 시험은 방패만 보려고 체력을 넉넉히
  assert.equal(b.enemy.known.size, 0);
  const r1 = b.act(0, sk('wave'));
  assert.equal(r1[0].weak, false); assert.equal(b.enemy.shield, 3);
  const r2 = b.act(1, sk('bark')); // 까마귀는 소리에 약함
  assert.equal(r2[0].weak, true); assert.ok(b.enemy.known.has('sound')); assert.equal(b.enemy.shield, 2);
  b.enemyTurn();
  // BP 2 → 부스트 2 = 3번 공격: 약점(물)으로 방패 2 → 0, 브레이크
  assert.equal(b.party[0].bp, 2);
  const r3 = b.act(0, sk('water'), 2);
  assert.equal(r3.filter((e) => e.kind === 'hit').length, 3);
  assert.ok(r3.some((e) => e.broke));
  assert.ok(b.enemy.broken > 0);
  const hpBefore = b.enemy.hp;
  if (b.state === 'fight') {
    const st = b.enemyTurn();
    assert.equal(st[0].kind, 'stunned'); // 쉼
    assert.equal(b.enemy.hp, hpBefore);
  }
});

test('배틀: 부스트는 가진 BP 와 3 을 넘지 못하고, BP 는 라운드마다 1 씩 최대 5', () => {
  const b = new BattleSim('wolf', { rng: fixed() });
  assert.equal(b.maxBoost(0), 1);
  for (let i = 0; i < 8; i++) b.endRound();
  assert.equal(b.party[0].bp, BP_MAX);
  assert.equal(b.maxBoost(0), 3);
  const r = b.act(0, sk('wave'), 9);
  assert.equal(r.filter((e) => e.kind === 'hit').length, 4);
  assert.equal(b.party[0].bp, BP_MAX - 3);
});

test('배틀: HP 가 0 이면 이기고 보상, 유니코 기운이 0 이면 짐, 지키기는 피해 절반', () => {
  const b = new BattleSim('crow', { rng: fixed(0) });
  b.enemy.hp = 3;
  b.act(0, sk('wave'));
  assert.equal(b.state, 'win');
  assert.ok(b.reward() >= ENEMIES.crow.reward);

  const c = new BattleSim('wolf', { rng: fixed(0) }); // rng 0: 첫 기술 '물기' 최소 피해 9, 대상 콩이(35% 미만)
  c.act(1, sk('guard'));
  const e = c.enemyTurn();
  assert.equal(e[0].dmg, Math.ceil(9 / 2));
  c.party[0].hp = 1; c.party[1].hp = 0;
  c.enemyTurn();
  assert.equal(c.state, 'lose');
});

test('배틀: 도망은 브레이크 중이면 반드시 성공', () => {
  const b = new BattleSim('fox', { rng: fixed(0.99) });
  assert.equal(b.flee(), false);
  b.enemy.broken = 1;
  assert.equal(b.flee(), true);
  assert.equal(b.state, 'fled');
});
