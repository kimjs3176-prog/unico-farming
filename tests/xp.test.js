// 플레이어 경험치: gainXp 한 곳으로, 행동 경험치, 레벨 선물, 최고 레벨 표시
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Quests, QUESTS, LEVELS, actionXp, harvestXp, CATCH_XP, FLAT_CATCH, MG_XP_PER_STAR } from '../src/game/sim/quests.js';
import { unlocksAt, MAX_LEVEL, LEVEL_GIFTS } from '../src/game/sim/unlocks.js';
import { xpText, xpPct } from '../src/ui/hud.js';
import { GameProgress } from '../src/game/game_progress.js';
import { DecorSim } from '../src/game/sim/decor.js';
import { CostumeSim } from '../src/game/sim/costume.js';

test('gainXp: 한 번에 두 레벨을 넘어도 from·to 가 맞음', () => {
  const q = new Quests();
  const r = q.gainXp(260);
  assert.deepEqual(r, { levelUp: true, from: 1, to: 3, level: 3 });
  assert.deepEqual(q.gainXp(0), { levelUp: false, from: 3, to: 3, level: 3 });
  q.gainXp(-50); q.gainXp(NaN);
  assert.equal(q.xp, 260, '음수·숫자 아님은 무시');
});

test('claim 은 gainXp 를 거치고 합계는 그대로', () => {
  const q = new Quests();
  let calls = 0;
  const orig = q.gainXp.bind(q);
  q.gainXp = (n) => { calls++; return orig(n); };
  q.report('till', 1);
  const r = q.claim('till1');
  assert.equal(calls, 1);
  assert.equal(q.xp, QUESTS.find((x) => x.id === 'till1').reward.xp);
  assert.equal(r.levelUp, false);
  assert.equal(r.from, 1);
  assert.equal(q.claim('till1'), null);
});

const mockGame = () => {
  const g = {
    quests: new Quests(), flags: {}, decor: { sim: new DecorSim() }, costume: new CostumeSim(), saveTimer: 0, world: { day: 1 },
    ui: { toast() {}, xpFloat() {} }, npcs: { grantTitle(t) { g.flags.title = t; } }, autoplay: { on: false },
  };
  return Object.assign(g, GameProgress);
};

test('KOAT 투어 경험치도 레벨업: game.addXp → 레벨 선물 (한 번씩)', () => {
  const g = mockGame();
  g.quests.xp = LEVELS[4] - 10; // Lv.5 바로 앞
  const r = g.addXp(700, { float: false });
  assert.equal(r.levelUp, true);
  assert.equal(r.to, 6);
  for (const [id, n] of Object.entries(LEVEL_GIFTS[6].decor)) assert.equal(g.decor.sim.storedOf(id), n, id);
  g.levelGifts(5, 6);
  for (const [id, n] of Object.entries(LEVEL_GIFTS[6].decor)) assert.equal(g.decor.sim.storedOf(id), n, id);
  g.addXp(LEVELS[9]); // 최고 레벨까지
  assert.equal(g.flags.title, LEVEL_GIFTS[10].title);
  assert.equal(g.flags.lvGift, MAX_LEVEL);
});

test('Lv.2 ~ 최고 레벨: 레벨마다 해금이나 선물이 있음, 최고 레벨은 10', () => {
  assert.equal(MAX_LEVEL, 10);
  for (let lv = 2; lv <= MAX_LEVEL; lv++) assert.ok(unlocksAt(lv).length > 0, `Lv.${lv}`);
  assert.ok(unlocksAt(10).some((u) => u.kind === 'title'));
});

test('최고 레벨: 배지 글이 MAX, 고리는 가득', () => {
  const q = new Quests();
  q.xp = LEVELS[LEVELS.length - 1] + 1234;
  assert.equal(q.maxed, true);
  assert.match(xpText(q), /^MAX/);
  assert.equal(xpPct(q), 100);
  const q2 = new Quests(); q2.xp = 50;
  assert.equal(xpText(q2), '50/100 XP');
});

test('행동 경험치: 수확은 작물 성장 시간, 잡은 것은 희귀도, 미니게임은 별', () => {
  assert.equal(harvestXp('carrot'), 2);
  assert.equal(harvestXp('corn'), 6);
  assert.equal(actionXp('harvest', 3, 'corn'), 18);
  assert.equal(actionXp('harvest', 2), 2, '작물을 모르면 개수만큼');
  assert.equal(actionXp('fish', 1, 'fish_carp'), CATCH_XP[2]);
  assert.equal(actionXp('fish', 1), FLAT_CATCH);
  assert.equal(actionXp('lakefish', 1, 'fish_carp'), 0, '낚시터는 fish 에서 한 번만');
  assert.equal(actionXp('mgstars', 3, 'egg'), 3 * MG_XP_PER_STAR);
  assert.equal(actionXp('thresh'), 15);
  assert.equal(actionXp('order'), 10);
  assert.equal(actionXp('till'), 0);
});

test('미니게임 경험치: 게임마다 하루 3판까지, 자동 진행은 반, 대왕 작물은 두 배', () => {
  const g = mockGame();
  for (let i = 0; i < 5; i++) g._actionXp('mgstars', 2, 'egg');
  assert.equal(g.quests.xp, 3 * 2 * MG_XP_PER_STAR);
  g._actionXp('mgstars', 2, 'herd');
  assert.equal(g.quests.xp, 4 * 2 * MG_XP_PER_STAR, '다른 게임은 따로');
  g.world.day = 2; g._actionXp('mgstars', 1, 'egg');
  assert.equal(g.quests.xp, 9 * MG_XP_PER_STAR, '다음 날 다시');
  g.autoplay.on = true;
  const x0 = g.quests.xp; g._actionXp('harvest', 3, 'corn');
  assert.equal(g.quests.xp - x0, 9);
  g.autoplay.on = false;
  const x1 = g.quests.xp; g._actionXp('harvest', 2, 'carrot'); g._actionXp('giant', 1);
  assert.equal(g.quests.xp - x1, 8);
});

test('Lv.7 선물 의상: 표에 있는 옷 중 아직 없는 첫 것 (한복 → 요리사 …)', async () => {
  const { giftCostume } = await import('../src/game/sim/unlocks.js');
  const { COSTUME } = await import('../src/game/sim/costume.js');
  for (const id of LEVEL_GIFTS[7].costume) assert.ok(COSTUME[id], `${id} 는 의상 표에 있음`);
  assert.equal(giftCostume(7), 'hanbok');
  assert.equal(giftCostume(7, (id) => id === 'hanbok'), 'chef');
  assert.equal(giftCostume(7, () => true), null);
  assert.ok(unlocksAt(7).some((u) => u.kind === 'gift' && u.name === COSTUME.hanbok.name), 'Lv.7 해금 카드에 의상 선물');
  const g = mockGame();
  g.levelGifts(6, 7, { quiet: true });
  assert.ok(g.costume.has('hanbok'), '레벨 선물로 한복이 옷장에');
});

test('따라갈 목표 없을 때 목표: 바뀔 때만 새로 만듦 (매 프레임 같은 객체)', () => {
  const g = mockGame();
  g.world = { day: 3 };
  const a = g.fallbackGoal(), b = g.fallbackGoal();
  assert.ok(a, '계절 도전이 목표');
  assert.equal(a, b, '변화 없으면 같은 객체');
  g._fbDirty = true;
  assert.notEqual(g.fallbackGoal(), a, '진행이 바뀌면 새로');
  g.world.day = 4;
  const c = g.fallbackGoal();
  assert.equal(g.fallbackGoal(), c);
  assert.match(c.desc, /^🗓️ 계절 도전 · /);
});

test('체험관 결과는 별 경험치 이벤트를 보냄 (koat_ui)', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../src/ui/koat_ui.js', import.meta.url), 'utf8');
  assert.match(src, /onEvent\?\.\('mgstars', stars, 'koat'\)/);
});
