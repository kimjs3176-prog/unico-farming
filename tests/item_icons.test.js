// 아이템 아이콘(ui/item_icons.js): 가방·장터·선물·도감·주문에 쓰는 모든 열쇠가 그림을 찾고, 못 만난 칸은 그림자
import test from 'node:test';
import assert from 'node:assert/strict';
import { ITEMS } from '../src/game/sim/items.js';
import { CROPS, PRODUCTS } from '../src/game/sim/crops.js';
import { SHIP_IDS } from '../src/game/sim/collection.js';
import * as gen from '../src/ui/item_icons.gen.js';
import { iconCat, iconEmoji, itemIconHtml, canBake, canBakeAll, _setAtlasForTest } from '../src/ui/item_icons.js';

/** 화면이 itemIcon 으로 그리는 모든 열쇠 */
const ROUTED = [...Object.keys(ITEMS), ...Object.keys(CROPS), ...Object.keys(CROPS).map((k) => `seed:${k}`), ...Object.keys(PRODUCTS), 'feed', ...SHIP_IDS];

test('모든 열쇠가 분류와 이모지를 찾음 (❔ 없음)', () => {
  for (const k of ROUTED) {
    assert.ok(iconCat(k), `분류 없음: ${k}`);
    assert.notEqual(iconEmoji(k), '❔', `이모지 없음: ${k}`);
  }
  assert.equal(iconCat('seed:carrot'), 'crop');
  assert.equal(iconCat('decor:bench'), 'decor');
  assert.equal(iconCat('없는것'), null);
});

test('아틀라스가 없으면 이모지 칸, locked 면 그림자 클래스', () => {
  _setAtlasForTest(null, []);
  const html = itemIconHtml('fish_carp', { locked: true, size: 40 });
  assert.match(html, /class="ico locked em"/);
  assert.match(html, /font-size:40px/);
  assert.match(html, /data-ik="fish_carp"/);
  assert.equal(canBake('fish_carp'), false);
});

test('아틀라스가 오면 다 구운 분류의 모든 열쇠가 칸을 찾고, 그림자도 같은 칸', () => {
  _setAtlasForTest(gen, [0, 1]);
  try {
    for (const k of ROUTED) assert.ok(canBake(k), `구운 칸 없음: ${k}`);
    assert.ok(canBakeAll(ROUTED));
    const html = itemIconHtml('fish_carp', { locked: true });
    assert.match(html, /class="ico locked it"/);
    assert.match(html, /items\.webp/);
    const [c, r] = gen.CELLS.fish_carp;
    const x = ((c / (gen.COLS - 1)) * 100).toFixed(3);
    assert.ok(html.includes(`background-position:${x}%`), `칸 위치 ${x}%`);
    // 씨앗 봉투는 작물 칸
    assert.ok(itemIconHtml('seed:corn').includes(((gen.CELLS.corn[0] / (gen.COLS - 1)) * 100).toFixed(3)), 'seed:corn → corn 칸');
    assert.ok(r >= 0);
  } finally { _setAtlasForTest(null, []); }
});

test('묶음 결정: 하나라도 구울 수 없으면 묶음 전체가 이모지 (섞지 않음)', () => {
  _setAtlasForTest(gen, [0]); // 둘째 장(코스튬·꾸미기)은 아직
  try {
    assert.equal(canBakeAll(['fish_carp', 'carrot']), true);
    assert.equal(canBakeAll(['fish_carp', 'decor:bench']), false);
    const baked = canBakeAll(['fish_carp', 'decor:bench']);
    assert.match(itemIconHtml('fish_carp', { baked }), / em"/, 'baked:false 면 구울 수 있어도 이모지');
    assert.equal(canBakeAll([]), false);
  } finally { _setAtlasForTest(null, []); }
});
