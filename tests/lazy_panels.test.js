// 창 코드 나중에 받기: ui.js 의 이름 목록이 실제 모듈의 메서드와 같은지 (빠진 이름이 있으면 그 메서드를 부를 때 undefined)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('나중에 받는 창: 이름 목록 = 실제 모듈의 메서드 전부', async () => {
  const src = readFileSync(new URL('../src/ui/ui.js', import.meta.url), 'utf8');
  const list = (key) => JSON.parse(src.match(new RegExp(`${key}: \\{ load: [^\\n]*names: (\\[[^\\]]*\\])`))[1].replace(/'/g, '"'));
  const mods = {
    market: (await import('../src/ui/panels/market.js')).MarketPanel,
    quests: (await import('../src/ui/panels/quests.js')).QuestsPanel,
    bag: (await import('../src/ui/panels/bag.js')).BagPanel,
    villager: (await import('../src/ui/panels/villager.js')).VillagerPanel,
    settings: (await import('../src/ui/panels/settings.js')).SettingsPanel,
  };
  const { ItemIconUI } = await import('../src/ui/item_icons.js'); // 아이콘 믹스인은 첫 화면에 따로 붙임
  for (const [k, mix] of Object.entries(mods)) assert.deepEqual(list(k).sort(), Object.keys(mix).filter((n) => typeof mix[n] === 'function' && !(n in ItemIconUI)).sort(), k);
  const { installKoatUI } = await import('../src/ui/koat_ui.js');
  const F = function () {}; installKoatUI(F);
  assert.deepEqual(list('koat').sort(), Object.keys(F.prototype).sort(), 'koat');
});

test('첫 화면 코드는 창 모듈을 정적으로 가져오지 않음 (boot 는 작은 farm_compare 만)', () => {
  const ui = readFileSync(new URL('../src/ui/ui.js', import.meta.url), 'utf8');
  assert.doesNotMatch(ui, /^import .*panels\/(market|quests|bag|villager|settings)\.js/m);
  assert.doesNotMatch(ui, /^import .*koat_ui\.js/m);
  const boot = readFileSync(new URL('../src/boot.js', import.meta.url), 'utf8');
  assert.doesNotMatch(boot, /panels\/settings\.js/);
});
