import { definePalette } from './palette.js';
import { unico, shiba, cow, sheep, chicken } from './art_chars.js';
import * as W from './art_world.js';
import { Spr } from './pxl.js';
const both = (o) => { const s = new Spr(o.trunk.w, o.trunk.h); s.stamp(o.trunk, 0, 0); s.stamp(o.crown, 0, 0); return s; };

/** 개발용 도트 시트 (pixel-sheet.html) */
export function sheetGroups() {
  definePalette();
  const g = [];
  const dirs = ['down', 'right', 'up', 'left'];
  g.push(['player', dirs.flatMap((d) => [0, 1, 2, 3].map((f) => unico(d, f, { scarf: 'scarf' })))]);
  g.push(['npcs', [
    unico('down', 0, { mane: 'apron', apron: 'apron' }), unico('down', 0, { mane: 'purple', glasses: true }),
    unico('down', 0, { mane: 'leaf' }), unico('down', 0, { mane: 'silver', shawl: 'purple' }), unico('down', 0, { mane: 'rose', small: true }),
    unico('right', 0, { mane: 'purple', glasses: true }), unico('right', 0, { mane: 'apron', apron: 'apron' }),
  ]]);
  g.push(['animals', [...dirs.flatMap((d) => [shiba(d, 0), shiba(d, 1)]), cow(0), cow(1), cow(0, { eat: true }), cow(0, { baby: true }), sheep(0), sheep(1), sheep(0, { eat: true }), chicken(0), chicken(1), chicken(0, { eat: true })]]);
  g.push(['trees', [both(W.tree(1)), both(W.tree(2)), both(W.tree(3, { fruit: 'tomato' })), both(W.tree(4, { kind: 'autumn' })), W.pine(1), W.pine(2), W.bush(1), W.bush(3), W.rock(1), W.rock(2, true), W.stump(), W.flowers(1), W.flowers(2), W.reeds(1), W.lily(1)]]);
  g.push(['buildings', [W.house(), W.house(true), W.barn(), W.stall(), W.well(), W.lampPost(), W.lampPost(true), W.sign(), W.mailbox(), W.hay(), W.crate(), W.trough(true)]]);
  g.push(['fence', [0, 2, 8, 10, 1, 4, 5, 6, 12, 3, 9, 15].map(W.fence)]);
  g.push(['crops', [W.plotSoil(), W.plotSoil(true), W.weeds(), ...['carrot', 'cabbage', 'tomato', 'strawberry', 'corn'].flatMap((k) => [0, 1, 2].map((st) => W.crop(k, st))), W.crop('corn', 2, { giant: true })]]);
  g.push(['icons', ['coin', 'carrot', 'cabbage', 'tomato', 'strawberry', 'corn', 'egg', 'milk', 'wool', 'honey', 'seed', 'feed', 'treat', 'fish', 'compost', 'heart', 'star', 'sun', 'moon', 'rain', 'bag', 'quest', 'gift'].map(W.icon)]);
  g.push(['fx', [...['!', '?', 'heart', 'note', 'zz', 'dots'].map(W.bubble), ...[0, 1, 2, 3].map(W.sparkle), W.bobber()]]);
  g.push(['rice', [W.paddyBase('dry'), W.paddyBase('tilled'), W.paddyWater(0), ...[0, 1, 2, 3].map(W.ricePlants), W.thresher(0), W.fieldCell(false), W.fieldCell(true)]]);
  g.push(['tractor', [0, 4, 8, 12, 16, 20, 24, 28].map((k) => W.tractorStack((k / 32) * Math.PI * 2, k % 8 === 0)).concat([W.tractorStack(0.3, false)])]);
  return g;
}
