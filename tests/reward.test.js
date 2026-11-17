// 보상 등급: 수확 별·거대 작물, 미니게임 결과, 사기 소리, 등급별 동작·소리·반짝임
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { reward, TIERS, harvestTier, harvestSound, minigameTier, BUY_SOUND } from '../src/game/reward.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

function fakeGame(o = {}) {
  const log = { act: [], sound: [], burst: [], fb: [], duck: [] };
  const unico = { t: 10, happyUntil: 0, riding: false, swimming: false, playAction: (n, s) => log.act.push([n, s]) };
  const g = {
    player: { unico, position: { x: 1, y: 0, z: 2 } },
    quality: { level: o.low ? 'low' : 'high' },
    audio: { play: (n) => log.sound.push(n), duck: (a, b) => log.duck.push([a, b]) },
    fx: { burst: (x, y, z, c, n) => log.burst.push(n), pop() {} },
    juice: { feedback: (t) => log.fb.push(t) },
    cinema: { locked: !!o.cine },
  };
  return { g, log, unico };
}

test('수확 등급: 별 하나·둘은 1, 별 셋은 2, 거대 작물은 3 · 큰 팡파르는 거대 작물만', () => {
  assert.equal(harvestTier({ stars: 1 }), 1);
  assert.equal(harvestTier({ stars: 2 }), 1);
  assert.equal(harvestTier({ stars: 3 }), 2);
  assert.equal(harvestTier({ stars: 1, giant: true }), 3);
  assert.equal(harvestSound({ stars: 3 }), 'harvest');
  assert.equal(harvestSound({ stars: 2, giant: true }), 'levelup');
});

test('미니게임 결과: 실패 0 · 통과 2 · 별 셋이나 새 기록 3', () => {
  assert.equal(minigameTier(0, false), 0);
  assert.equal(minigameTier(0, true), 0);
  assert.equal(minigameTier(1, false), 2);
  assert.equal(minigameTier(2, false), 2);
  assert.equal(minigameTier(2, true), 3);
  assert.equal(minigameTier(3, false), 3);
});

test('등급별: 끄덕(pickup) · 주먹 불끈(win, 반짝 10) · 만세(levelup, 반짝 24, 손맛·배경음 낮춤)', () => {
  const a = fakeGame();
  reward(a.g, 1);
  assert.deepEqual(a.log.act, [['glad', 0.6]]);
  assert.deepEqual(a.log.sound, ['pickup']);
  assert.deepEqual(a.log.burst, []);
  assert.ok(a.unico.happyUntil >= 10 + 0.6 + 0.8 - 1e-9, '웃는 얼굴이 조금 더 남음');
  const b = fakeGame();
  reward(b.g, 2);
  assert.deepEqual(b.log.act, [['fistpump', 1]]);
  assert.deepEqual(b.log.sound, ['win']);
  assert.deepEqual(b.log.burst, [10]);
  assert.deepEqual(b.log.fb, []);
  const c = fakeGame();
  reward(c.g, 3);
  assert.equal(c.log.act[0][0], 'cheer');
  assert.deepEqual(c.log.sound, ['levelup']);
  assert.deepEqual(c.log.burst, [24]);
  assert.deepEqual(c.log.fb, [3], '3단계 손맛 (흔들림은 0.2 이상이어야 실제로 흔들림)');
  assert.deepEqual(c.log.duck, [[0.6, 1.5]]);
});

test('낮음 품질은 반짝임을 줄이고, 소리를 바꾸거나 끌 수 있고, 탈것·컷신 중에는 동작 없음', () => {
  const a = fakeGame({ low: true });
  reward(a.g, 2); reward(a.g, 3);
  assert.deepEqual(a.log.burst, [TIERS[2].burstLow, TIERS[3].burstLow]);
  assert.ok(TIERS[2].burstLow <= 6 && TIERS[3].burstLow <= 12);
  const b = fakeGame();
  reward(b.g, 1, { sound: null }); reward(b.g, 1, { sound: 'harvest' });
  assert.deepEqual(b.log.sound, ['harvest']);
  const c = fakeGame({ cine: true });
  reward(c.g, 3);
  assert.deepEqual(c.log.act, []);
  const d = fakeGame();
  d.unico.riding = true;
  reward(d.g, 2);
  assert.deepEqual(d.log.act, []);
  assert.deepEqual(d.log.sound, ['win'], '소리는 그대로');
});

test('사기·넓히기는 부드러운 buy 소리 (레벨업 팡파르를 쓰지 않음), 의상 사기는 2단계', () => {
  assert.equal(BUY_SOUND, 'buy');
  const market = read('src/ui/panels/market.js');
  assert.doesNotMatch(market, /play\('levelup'\)/, '장터: 스프링클러·장독·의상');
  assert.match(market, /g\.audio\.play\(BUY_SOUND\); reward\(g, 2\)/);
  const ranch = read('src/game/view/ranch_view.js');
  assert.doesNotMatch(ranch, /play\('levelup'/, '목장: 축사·가공소·가축 들이기');
  assert.equal((ranch.match(/play\(BUY_SOUND\)/g) || []).length, 3);
  assert.match(read('src/game/view/home_view.js'), /play\(BUY_SOUND\)/);
  // 소리 합성: 새 소리 이름이 있고, coin 은 음 높이를 받음
  const audio = read('src/game/audio.js');
  for (const n of ['pickup', 'buy', 'win', 'quest', 'levelup']) assert.match(audio, new RegExp(`case '${n}'`));
  assert.match(audio, /play\(name, vol = 1, opts = \{\}\)/);
  assert.match(audio, /opts\.freq/);
});

test('수확·보물 상자·꾸미기·주문·장터 보상은 등급 표로 (내 캐릭터의 만세 남발이 없음)', () => {
  const farm = read('src/game/view/farm_view.js');
  assert.match(farm, /reward\(g, harvestTier\(it\.r\), \{ sound: null \}\)/);
  assert.match(farm, /g\.audio\.play\(harvestSound\(r\)\)/);
  assert.match(read('src/ui/minigame_frame.js'), /minigameTier\(stars, isNew\)/);
  for (const p of ['src/game/view/farm_view.js', 'src/game/view/explore_view.js', 'src/game/view/decor_view.js', 'src/game/view/farmcraft_view.js', 'src/game/view/bees.js', 'src/ui/panels/market.js']) {
    const s = read(p).replace(/^.*\/\/ 전망.*$/gm, '');
    const n = (s.match(/playAction\('cheer', [1-9]/g) || []).length;
    assert.ok(n <= (p.includes('explore') ? 1 : 0), `${p}: 보상은 reward() 로 (만세 ${n}번)`);
  }
  const rice = read('src/game/view/rice_view.js');
  assert.doesNotMatch(rice, /u\.playAction\('cheer', 1\.5\)/, '벼 수확은 등급 표로');
});

test('주인공 동작: glad·fistpump 는 웃는 얼굴, 주기 동작이라 길게 받아도 같은 모양', () => {
  const src = read('src/game/unico.js');
  assert.match(src, /const HAPPY = new Set\(\[[^\]]*'glad'[^\]]*'fistpump'/);
  assert.match(src, /const OPEN_MOUTH = new Set\(\[[^\]]*'glad'/);
  assert.match(src, /const HERO_HAPPY = new Set\(\[[^\]]*'glad'[^\]]*'fistpump'/);
  assert.match(src, /case 'glad': \{[^}]*a % 0\.6/);
  assert.match(src, /case 'fistpump': \{[^}]*a % 1/);
  // 주민 동물(species) 이름표는 내 캐릭터 곁에서만 (줌과 상관없이), 다른 접속자는 예전처럼 카메라에서 22m
  assert.match(src, /this\.species \? THREE\.MathUtils\.clamp\(\(11 - \(HERO_POS \? HERO_POS\.distanceTo\(this\.group\.position\)/, '주민 이름표는 가까이에서만');
  assert.match(src, /: THREE\.MathUtils\.clamp\(\(22 - d\) \/ 7, 0, 1\)\) \* near/, '접속자 이름표는 멀리까지');
});
