// 튜토리얼 흐름: 첫 농사 자동 보상·완료 알림·장 완료 선물 (src/game/guide.js, game_progress.js)
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { QUESTS, Quests } from '../src/game/sim/quests.js';
import { FarmSim } from '../src/game/sim/farm.js';
import { CHAPTERS } from '../src/game/sim/chapters.js';
import { AUTO_CLAIM, Guide } from '../src/game/guide.js';
import { GameProgress } from '../src/game/game_progress.js';

function fakeGame() {
  const tiles = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 6; c++) tiles.push({ x: -6 + c * 2.4, z: -2.4 + r * 2.4 });
  const g = Object.assign(Object.create(GameProgress), {
    flags: {}, quests: new Quests(), saveTimer: 0,
    farm: { sim: new FarmSim(18), tiles, grace: true },
    player: { position: new THREE.Vector3(0, 0, -5), unico: { playAction() {} } },
    ride: { driving: false },
    economy: { inventory: { seeds: { carrot: 3 } }, count: () => 0, money: 0, earn(n) { this.money += n; }, addSeeds(k, n = 1) { this.inventory.seeds[k] = (this.inventory.seeds[k] || 0) + n; } },
    world: { scene: new THREE.Scene() },
    camera: new THREE.PerspectiveCamera(50, 1, 0.1, 100),
    followCam: { yaw: 0 },
    sounds: [], toasts: [], results: [],
    cinema: { locked: false }, dialogue: { active: false },
  });
  g.audio = { play: (s) => g.sounds.push(s) };
  g.ui = { panel: null, toast: (t) => g.toasts.push(t), setObjective(q) { g.obj = q; }, stamps: 0, stampObjective() { this.stamps++; }, result: (t, l) => g.results.push([t, l]) };
  g.guide = new Guide(g);
  return g;
}
const tick = (g, s) => { for (let t = 0; t < s; t += 0.15) g.guide.update(0.15); };

test('자동 보상 퀘스트는 모두 1장에 있는 실제 퀘스트', () => {
  const ids = new Set(QUESTS.map((q) => q.id));
  for (const id of AUTO_CLAIM) { assert.ok(ids.has(id), id); assert.ok(CHAPTERS[0].ids.includes(id), id); }
  assert.equal(AUTO_CLAIM.size, CHAPTERS[0].ids.length);
});

test('두 번 받아도 한 번만, 조용히 받으면 코인 알림 없음, 고정은 받으면 풀림', () => {
  const g = fakeGame();
  g.quests.progress.fish1 = 1;
  g.flags.pinQuest = 'fish1';
  assert.ok(g.claimQuest('fish1', { quiet: true }));
  assert.equal(g.claimQuest('fish1'), null);
  assert.equal(g.economy.money, QUESTS.find((q) => q.id === 'fish1').reward.money);
  assert.ok(!g.toasts.some((t) => t.startsWith('🎁')), '조용히');
  assert.equal(g.flags.pinQuest, undefined);
  g.quests.progress.bug1 = 1;
  g.claimQuest('bug1');
  assert.ok(g.toasts.some((t) => t.startsWith('🎁 +40')), '창에서 받으면 코인 알림');
  assert.ok(!g.toasts.some((t) => t.includes('레벨')), '예전 레벨 알림 없음');
});

test('완료 알림: 자동 보상은 금액, 아니면 받는 법. 완료 소리는 한 번, 보유 금액 퀘스트도 알림', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const g = fakeGame();
  g.onEvent('till');
  assert.deepEqual(g.toasts, ['✅ 첫 밭 갈기 완료! +30🪙']);
  t.mock.timers.tick(400);
  assert.deepEqual(g.sounds, ['win']);
  g.onEvent('fish');
  assert.match(g.toasts.at(-1), /Q 또는 목표 칩에서 보상 받기/);
  t.mock.timers.tick(400);
  assert.deepEqual(g.sounds, ['win'], '1.5초 안에는 한 번만');
  t.mock.timers.tick(2000);
  g.economy.money = 1200;
  g.onEvent('bug');
  assert.ok(g.toasts.some((x) => x.startsWith('✅ 천 원의 농부')), '보유 금액 퀘스트');
  t.mock.timers.tick(400);
  assert.equal(g.sounds.filter((s) => s === 'win').length, 2);
});

test('첫 농사: 도장 → 0.7초 뒤 저절로 받음 (대화 중에는 기다림) → 다음 목표', () => {
  const g = fakeGame();
  tick(g, 0.3);
  assert.equal(g.obj.id, 'till1');
  g.quests.report('till', 1);
  g.dialogue.active = true;
  tick(g, 2);
  assert.equal(g.guide.game.ui.stamps, 1, '도장 한 번');
  assert.ok(!g.quests.claimed.till1, '대화 중에는 안 받음');
  g.dialogue.active = false;
  tick(g, 0.3);
  assert.ok(g.quests.claimed.till1);
  assert.equal(g.obj.id, 'plant3', '창을 안 열어도 다음 목표');
  // 레벨 2 는 첫 수확에서 (20+30+25+60)
  for (const id of ['plant3', 'water3']) { g.quests.progress[id] = 9; tick(g, 1); }
  assert.equal(g.quests.level, 1);
  g.quests.progress.harvest5 = 5; tick(g, 1);
  assert.equal(g.quests.xp, 135);
  assert.equal(g.quests.level, 2);
});

test('1장을 끝내면 선물(코인·씨앗)과 카드 한 번, 창이 닫힌 다음에 보여 줌, 다음은 KOAT', () => {
  const g = fakeGame();
  for (const id of ['till1', 'plant3', 'water3', 'harvest5']) { g.quests.progress[id] = 99; g.quests.claim(id); }
  g.quests.progress.sell3 = 3;
  g.ui.panel = {}; // 장터 창에서 판 직후
  tick(g, 1.2);
  assert.ok(g.quests.claimed.sell3, '창이 열려 있어도 자동 보상');
  assert.ok(g.flags.chapterDone[1]);
  assert.equal(g.economy.inventory.seeds.carrot, 3 + CHAPTERS[0].reward.seeds.carrot);
  assert.equal(g.results.length, 0, '창이 떠 있으면 카드는 기다림');
  g.ui.panel = null;
  tick(g, 0.3);
  assert.equal(g.results.length, 1);
  assert.match(g.results[0][0], /1장/);
  assert.equal(g.obj.id, 'koat1');
  // 다시 받아도 선물은 한 번
  g.guide.onClaimed('sell3');
  tick(g, 0.5);
  assert.equal(g.results.length, 1);
});

test('길잡이 한마디와 어디로: 지금 퀘스트에 맞춤', () => {
  const g = fakeGame();
  tick(g, 0.3);
  assert.match(g.guide.hint(), /밭/);
  g.toasts.length = 0;
  g.player.position.copy(g.guide.target);
  assert.equal(g.guide.whereTo(), true);
  assert.match(g.toasts[0], /바로 여기야/);
  let went = null;
  g.minimap = { travel: (x, z) => { went = [x, z]; } };
  g.player.position.set(40, 0, 40);
  g.guide.whereTo();
  assert.deepEqual(went, [g.guide.target.x, g.guide.target.z]);
  g.quests.progress.till1 = 1;
  tick(g, 0.2);
  assert.match(g.guide.hint(), /보상/);
});

test('📌 다른 퀘스트를 고정해도 첫 농사 퀘스트는 저절로 받음 (알림에 적힌 코인이 실제로 들어옴)', () => {
  const g = fakeGame();
  g.quests.progress.till1 = 1; g.quests.claim('till1');
  g.flags.pinQuest = 'water3';
  g.quests.progress.plant3 = 3;
  tick(g, 1.2);
  assert.ok(g.quests.claimed.plant3);
  assert.equal(g.economy.money, QUESTS.find((q) => q.id === 'plant3').reward.money);
  assert.equal(g.flags.pinQuest, 'water3', '고정은 그대로');
});

test('레벨업: 보상 연출이 없으면 글 알림', () => {
  const g = fakeGame();
  g.quests.xp = 95; g.quests.progress.fish1 = 1;
  g.claimQuest('fish1');
  assert.ok(g.toasts.some((t) => /레벨 2 달성/.test(t)));
  const g2 = fakeGame();
  g2.ui.celebrateLevel = () => {};
  g2.quests.xp = 95; g2.quests.progress.fish1 = 1;
  g2.claimQuest('fish1');
  assert.ok(!g2.toasts.some((t) => /레벨/.test(t)), '연출이 있으면 그쪽에서');
});

test('장 카드는 저장(flags)에 남아 새로고침 뒤에도 뜸, 카드가 뜨기 전·뜬 동안은 다음 목표를 숨김', () => {
  const g = fakeGame();
  for (const id of CHAPTERS[0].ids) { g.quests.progress[id] = 99; g.quests.claim(id); }
  g.guide.onClaimed('sell3');
  assert.deepEqual(g.flags.chapterCard, [1]);
  g.ui.panel = {};
  tick(g, 0.3);
  assert.equal(g.obj, null, '카드 차례: 목표 숨김');
  // 새로고침: flags 만 남음
  g.guide = new Guide(g);
  g.ui.panel = null;
  tick(g, 0.3);
  assert.equal(g.results.length, 1);
  assert.equal(g.flags.chapterCard, undefined, '보여 준 카드는 지움');
  assert.equal(g.obj.id, 'koat1');
});

test('뒷장 핵심 퀘스트를 먼저 끝내도 그 장 선물은 앞 장을 마칠 때', () => {
  const g = fakeGame();
  const c2 = CHAPTERS[1];
  for (const id of c2.ids) { g.quests.progress[id] = 99; g.quests.claim(id); }
  g.guide.onClaimed(c2.ids[0]);
  assert.ok(!g.flags.chapterDone?.[2], '1장이 아직');
  const m0 = g.economy.money;
  for (const id of CHAPTERS[0].ids) { g.quests.progress[id] = 99; g.quests.claim(id); }
  g.guide.onClaimed('sell3');
  assert.ok(g.flags.chapterDone[1] && g.flags.chapterDone[2]);
  assert.equal(g.economy.money - m0, CHAPTERS[0].reward.money + c2.reward.money);
  assert.deepEqual(g.flags.chapterCard, [1, 2]);
});
