// 레벨 해금 목록: 씨앗·건물·의상·꾸미기·집·낚싯대 표에서 모음, 해금이 없는 레벨은 '다음 해금' 줄
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unlocksAt, nextUnlockLevel, unlocksBetween, nextUnlockLine, cardAction, MAX_LEVEL, KINDS } from '../src/game/sim/unlocks.js';
import { CROPS } from '../src/game/sim/crops.js';

test('Lv.2: 양배추·토마토 씨앗이 먼저, 직판장·비옷·꾸미기·아늑한 집', () => {
  const u = unlocksAt(2);
  assert.deepEqual(u.slice(0, 2).map((x) => x.name), ['양배추 씨앗', '토마토 씨앗']);
  assert.ok(u.some((x) => x.kind === 'building' && x.name === '농산물 직판장'));
  assert.ok(u.some((x) => x.kind === 'costume' && x.name === '노란 비옷'));
  assert.ok(u.some((x) => x.kind === 'decor'));
  assert.ok(u.some((x) => x.kind === 'home' && /아늑한 집/.test(x.name)));
  for (const x of u) assert.ok(x.icon && x.name && KINDS.some(([k]) => k === x.kind));
});

test('표와 어긋나지 않음: 작물 해금 레벨마다 그 씨앗이 들어 있음, Lv.1 은 비어 있음', () => {
  for (const c of Object.values(CROPS)) if (c.unlockLevel > 1) assert.ok(unlocksAt(c.unlockLevel).some((x) => x.name === `${c.name} 씨앗`), c.name);
  assert.deepEqual(unlocksAt(1), []);
});

test('Lv.2 ~ 최고 레벨: 모두 해금이 있거나 다음 해금 줄이 있음', () => {
  for (let lv = 2; lv <= MAX_LEVEL; lv++) {
    const has = unlocksAt(lv).length > 0;
    const line = nextUnlockLine(lv);
    assert.ok(has || line.length > 4, `Lv.${lv}`);
    if (!has && nextUnlockLevel(lv)) assert.match(line, /^다음 해금: Lv\.\d+ /);
  }
  assert.equal(nextUnlockLevel(1), 2);
  assert.equal(nextUnlockLevel(4), 5);
  assert.match(nextUnlockLine(4), /^다음 해금: Lv\.5 .*황금 낚싯대/);
  assert.equal(nextUnlockLevel(MAX_LEVEL), null);
});

test('여러 레벨을 한 번에 올라도 사이 레벨 해금을 모두 종류별로 묶음 + 버튼 하나', () => {
  const g = unlocksBetween(1, 3);
  const seeds = g.find((x) => x.kind === 'seed');
  assert.deepEqual(seeds.items.map((x) => x.name), ['양배추 씨앗', '토마토 씨앗', '딸기 씨앗']);
  assert.equal(new Set(g.map((x) => x.kind)).size, g.length, '종류마다 한 줄');
  assert.deepEqual(cardAction(g), { label: '🛒 장터 열기', open: 'market' });
  assert.deepEqual(cardAction([{ kind: 'decor' }]), { label: '🪑 꾸미기', open: 'decor' });
  assert.equal(cardAction([{ kind: 'rod' }]), null);
  assert.deepEqual(unlocksBetween(6, 7), []);
});
