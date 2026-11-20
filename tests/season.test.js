import test from 'node:test';
import assert from 'node:assert/strict';
import { seasonOf, growthMult, priceMult, DAYS_PER_SEASON, SEASONS } from '../src/game/sim/season.js';
import { FarmSim } from '../src/game/sim/farm.js';
import { CROPS } from '../src/game/sim/crops.js';
import { rollBug, FishingSim } from '../src/game/sim/fishing.js';
import { ITEMS, itemsOf, seasonWeight, inSeason, treeStage, SEASON_IN, SEASON_OUT } from '../src/game/sim/items.js';
import { dailyRequest } from '../src/game/sim/angling.js';

/** 고정 rng (mulberry32): 씨앗이 작아도 첫 값이 고르게 */
const seededRng = (s) => () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

test('곤충: 계절을 안 주면 예전과 똑같은 결과 (도트 판), 같은 rng 는 같은 곤충', () => {
  for (let s = 1; s < 200; s++) for (const ctx of [{ night: false }, { night: true }, { night: false, raining: true }]) {
    assert.equal(rollBug(seededRng(s), ctx), rollBug(seededRng(s), { ...ctx, season: undefined }), `씨앗 ${s}`);
  }
});

test('곤충: 겨울엔 반딧불이·매미·호랑나비·고추잠자리·귀뚜라미가 안 나오고, 나는 곤충은 희귀한 것만', () => {
  const seen = new Set();
  for (let s = 1; s < 3000; s++) for (const night of [false, true]) { const b = rollBug(seededRng(s), { night, season: 'winter' }); if (b) seen.add(b); }
  for (const k of ['bug_firefly', 'bug_cicada', 'bug_swallowtail', 'bug_dragonfly', 'bug_cricket', 'bug_butterfly', 'bug_honeybee']) assert.ok(!seen.has(k), `겨울에 ${k}`);
  for (const k of seen) assert.ok(ITEMS[k].ground || ['bug_ladybug', 'bug_beetle'].includes(k) || ITEMS[k].rarity >= 3, `겨울 나는 곤충 ${k}`);
  assert.ok(seen.size >= 3, `겨울에도 몇 종은 (${[...seen]})`);
});

test('곤충: 여름 밤엔 반딧불이가 자주, 고추잠자리는 가을만 · 제철 ×3, 철 지남 ×0.25', () => {
  const count = (season, night, k) => { let n = 0; for (let s = 1; s <= 2000; s++) if (rollBug(seededRng(s), { night, season }) === k) n++; return n; };
  assert.ok(count('summer', true, 'bug_firefly') > 600, '여름 밤 반딧불이');
  assert.equal(count('spring', true, 'bug_firefly'), 0, '봄 밤 반딧불이 없음');
  assert.equal(count('summer', false, 'bug_dragonfly'), 0, '고추잠자리는 가을만');
  assert.ok(count('autumn', false, 'bug_dragonfly') > 0);
  assert.equal(seasonWeight('bug_mantis', 'autumn'), SEASON_IN);
  assert.equal(seasonWeight('bug_mantis', 'spring'), SEASON_OUT);
  assert.equal(seasonWeight('bug_cicada', 'spring'), 0);
  assert.equal(seasonWeight('bug_moth', 'winter'), 1, '사철 곤충');
  assert.equal(seasonWeight('bug_cicada'), 1, '계절 없음');
});

test('물고기: 겨울엔 빙어·열목어가 여름보다 훨씬 자주, 계절을 안 주면 예전 그대로', () => {
  const freq = (season, k) => { const f = new FishingSim(seededRng(7)); let n = 0; for (let i = 0; i < 4000; i++) if (f.cast({ lake: true, season }) === k) n++; return n; };
  assert.ok(freq('winter', 'fish_smelt') > freq('summer', 'fish_smelt') * 5, '빙어');
  assert.ok(freq('winter', 'fish_lenok') > freq('summer', 'fish_lenok') * 5, '열목어');
  assert.ok(freq('summer', 'fish_snakehead') > freq('winter', 'fish_snakehead') * 5, '가물치는 여름');
  const a = new FishingSim(seededRng(3)), b = new FishingSim(seededRng(3));
  for (let i = 0; i < 200; i++) assert.equal(a.cast({ lake: true }), b.cast({ lake: true, season: undefined }));
});

test('도감: 겨울에 만나는 것과 여름에 만나는 것이 다름 (반딧불이·매미는 여름에만)', () => {
  const met = (season) => { const f = new FishingSim(seededRng(11)), s = new Set(); for (let i = 0; i < 3000; i++) s.add(f.cast({ lake: true, season })); for (let i = 1; i < 2000; i++) s.add(rollBug(seededRng(i), { night: i % 3 === 0, season })); return s; };
  const w = met('winter'), su = met('summer');
  assert.ok(su.has('bug_firefly') && !w.has('bug_firefly'));
  assert.ok(su.has('bug_cicada') && !w.has('bug_cicada'));
});

test('과일나무: 복숭아 여름, 사과·배 가을, 감 가을·겨울 · 철 아니면 봄 꽃·여름 풋열매·빈 가지', () => {
  assert.equal(treeStage('fruit_peach', 'summer'), 'ripe');
  assert.equal(treeStage('fruit_peach', 'spring'), 'blossom');
  assert.equal(treeStage('fruit_peach', 'autumn'), 'bare');
  assert.equal(treeStage('fruit_apple', 'summer'), 'green');
  assert.equal(treeStage('fruit_apple', 'autumn'), 'ripe');
  assert.equal(treeStage('fruit_persimmon', 'winter'), 'ripe', '홍시 (까치밥)');
  assert.equal(treeStage('fruit_pear', 'winter'), 'bare');
  for (const k of itemsOf('fruit')) assert.ok(['spring', 'summer', 'autumn', 'winter'].some((s) => inSeason(k, s)), k);
});

test('낚시터 의뢰: 그 계절에 나는 물고기만 (28일 내내)', () => {
  for (let d = 1; d <= 28; d++) { const r = dailyRequest(d); assert.ok(inSeason(r.fish, seasonOf(d).id), `${d}일 ${r.fish}`); }
});

test('계절: 7일마다 봄→여름→가을→겨울, 28일 지나면 다음 해 봄', () => {
  assert.equal(seasonOf(1).id, 'spring'); assert.equal(seasonOf(1).dayIn, 1);
  assert.equal(seasonOf(7).id, 'spring'); assert.equal(seasonOf(7).dayIn, 7);
  assert.equal(seasonOf(8).id, 'summer'); assert.equal(seasonOf(8).dayIn, 1);
  assert.equal(seasonOf(15).id, 'autumn');
  assert.equal(seasonOf(22).id, 'winter');
  const next = seasonOf(1 + DAYS_PER_SEASON * 4);
  assert.equal(next.id, 'spring'); assert.equal(next.year, 2);
  assert.equal(seasonOf(0).id, 'spring', '잘못된 날짜도 안전');
  assert.equal(seasonOf(NaN).id, 'spring');
});

test('제철 작물: 25% 빨리 자라고 10% 비싸게, 겨울엔 ×0.6, 제철 작물은 모두 실제 작물', () => {
  const sp = seasonOf(1), wi = seasonOf(22);
  assert.equal(growthMult(sp, 'strawberry'), 1.25);
  assert.equal(growthMult(sp, 'corn'), 1);
  assert.equal(priceMult(sp, 'strawberry'), 1.1);
  assert.equal(priceMult(sp, 'corn'), 1);
  assert.equal(growthMult(wi, 'carrot'), 0.6);
  for (const s of SEASONS) for (const c of s.crops) assert.ok(CROPS[c], `${s.id}: ${c}`);
  // 모든 작물이 1년에 한 번 이상 제철
  for (const c of Object.keys(CROPS)) assert.ok(SEASONS.some((s) => s.crops.includes(c)), c);
});

test('밭: growthMult 를 주면 그만큼 빨리 자람 (주지 않으면 예전과 같음 — 도트판 호환)', () => {
  const grow = (mult) => {
    const f = new FarmSim(1);
    f.weedChance = 0;
    if (mult) f.growthMult = () => mult;
    f.till(0); f.plant(0, 'carrot'); f.water(0);
    f.tick(10);
    return f.plots[0].progress;
  };
  const base = grow(null);
  assert.ok(base > 0);
  assert.ok(Math.abs(grow(1.25) / base - 1.25) < 1e-9);
});
