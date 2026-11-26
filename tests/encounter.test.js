import test from 'node:test';
import assert from 'node:assert/strict';
import { EncounterState, rollWild, wildLevel, recordWild, GRACE_STEPS, REPEL_STEPS, TABLE } from '../src/pixel/encounter_sim.js';
import { BattleSim, ENEMIES, UNICO_SKILLS } from '../src/pixel/battle_sim.js';

const seq = (...v) => { let i = 0; return () => v[i++ % v.length]; };
/** 고정 씨앗 rng (Park–Miller) */
const lcg = (seed = 1) => { let x = seed; return () => ((x = (x * 16807) % 2147483647) / 2147483647); };

test('인카운터: 풀숲 한 칸(32px)마다 한 번 추첨하고, 반 칸은 추첨하지 않음', () => {
  const s = new EncounterState();
  assert.equal(s.walk(16, () => 0), false); // 아직 한 칸이 안 됨
  assert.equal(s.walk(16, () => 0), true);  // 한 칸 → 0 < 확률 → 나옴
  assert.equal(s.steps, 1);
  assert.equal(s.walk(32, () => 0.99), false);
});

test('인카운터: 배틀 뒤 몇 칸은 안전하고, 쑥 향주머니는 그만큼 칸을 막음', () => {
  const s = new EncounterState();
  s.afterBattle();
  for (let i = 0; i < GRACE_STEPS; i++) assert.equal(s.walk(32, () => 0), false);
  assert.equal(s.walk(32, () => 0), true);
  s.useRepel();
  let n = 0; while (!s.walk(32, () => 0)) n++;
  assert.equal(n, REPEL_STEPS);
});

test('인카운터: 낮·밤 표에서만 나오고, 겨울엔 두더지가 드묾', () => {
  for (const night of [false, true]) {
    const kinds = new Set(TABLE[night ? 'night' : 'day'].map(([k]) => k));
    const r = lcg(7);
    for (let i = 0; i < 200; i++) { const k = rollWild(r, { night }); assert.ok(kinds.has(k), `${night ? '밤' : '낮'} 표에 없는 ${k}`); }
  }
  const count = (season) => { let n = 0; const r = lcg(1); for (let i = 0; i < 4000; i++) if (rollWild(r, { season }) === 'mole') n++; return n; };
  const w = count('winter'), sp = count('spring');
  assert.ok(w < sp / 2, `겨울 ${w} · 봄 ${sp}`);
  for (const k of Object.values(TABLE).flat().map(([x]) => x)) assert.ok(ENEMIES[k], k);
});

test('인카운터: 적 레벨은 플레이어 ±1, 1 아래로 안 감, 드문 녀석은 +1', () => {
  assert.equal(wildLevel(() => 0, 1, 'mole'), 1);
  assert.equal(wildLevel(() => 0.99, 5, 'mole'), 6);
  assert.equal(wildLevel(() => 0.5, 5, 'boar'), 6);
});

test('배틀: 적 레벨이 오르면 기운·보상이 커지고, 고라니는 회복·두더지는 방패를 채움', () => {
  const a = new BattleSim('gorani', { elv: 1, rng: () => 0.5 }), b = new BattleSim('gorani', { elv: 5, rng: () => 0.5 });
  assert.ok(b.enemy.max > a.enemy.max);
  a.enemy.hp = 10;
  const heal = ENEMIES.gorani.moves.findIndex((m) => m.fx === 'heal');
  a.rng = seq((heal + 0.1) / ENEMIES.gorani.moves.length);
  const ev = a.enemyTurn();
  assert.ok(ev[0].heal > 0 && a.enemy.hp > 10);
  const m = new BattleSim('mole', { rng: () => 0.5 });
  m.act(0, UNICO_SKILLS.find((s) => s.id === 'water')); // 약점 → 방패 -1
  const sh = m.enemy.shield;
  const dig = ENEMIES.mole.moves.findIndex((x) => x.fx === 'dig');
  m.rng = seq((dig + 0.1) / ENEMIES.mole.moves.length);
  m.enemyTurn();
  assert.equal(m.enemy.shield, sh + 1);
});

test('야생 도감: 처음 이긴 동물만 first', () => {
  const book = {};
  assert.equal(recordWild(book, 'boar', { won: false }).first, false);
  assert.equal(recordWild(book, 'boar', { won: true, level: 3 }).first, true);
  assert.equal(recordWild(book, 'boar', { won: true, level: 2 }).first, false);
  assert.deepEqual(book.boar, { seen: 3, won: 2, best: 3 });
});
