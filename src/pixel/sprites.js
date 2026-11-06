import { definePalette } from './palette.js';
import { Spr } from './pxl.js';
import * as C from './art_chars.js';
import * as W from './art_world.js';

/** 모든 도트를 한 번 구워서 캔버스로 보관 */
export function buildSprites() {
  definePalette();
  const cv = (s) => s.toCanvas();
  const glow = (s) => { const c = s.toCanvas({ glowOnly: true }); return c.hasPixels ? c : null; };
  const S = { chars: new Map() };

  S.char = (key, look, dir, f) => {
    const k = `${key}|${dir}|${f}`;
    let c = S.chars.get(k);
    if (!c) { c = cv(C.unico(dir, f, look)); S.chars.set(k, c); }
    return c;
  };
  const dirs = ['down', 'up', 'left', 'right'];
  S.shiba = Object.fromEntries(dirs.map((d) => [d, [0, 1].map((f) => cv(C.shiba(d, f)))]));
  const both = (make) => { const s = make(); return [cv(s), cv(s.flipped())]; };
  S.pest = { crow: [0, 1, 2, 3].map((f) => both(() => C.crow(f))), fox: [0, 1].map((f) => both(() => C.fox(f))), wolf: [0, 1].map((f) => both(() => C.wolf(f))) };
  S.animal = {};
  for (const [type, fn] of [['cow', C.cow], ['sheep', C.sheep], ['chicken', C.chicken]]) {
    S.animal[type] = {};
    for (const pose of ['f0', 'f1', 'eat', 'baby0', 'baby1']) {
      const o = { eat: pose === 'eat', baby: pose.startsWith('baby') };
      S.animal[type][pose] = both(() => fn(pose.endsWith('1') ? 1 : 0, o));
    }
  }

  S.tree = { fol: [], autumn: [], fruit: {} };
  for (let i = 0; i < 6; i++) { const t = W.tree(i + 1); S.tree.fol.push({ trunk: cv(t.trunk), crown: cv(t.crown) }); }
  for (let i = 0; i < 3; i++) { const t = W.tree(i + 11, { kind: 'autumn' }); S.tree.autumn.push({ trunk: cv(t.trunk), crown: cv(t.crown) }); }
  for (const f of ['tomato', 'rose', 'apron']) { const t = W.tree(f.length * 3, { fruit: f }); S.tree.fruit[f] = { trunk: cv(t.trunk), crown: cv(t.crown) }; const b = W.tree(f.length * 3); S.tree.fruit[f + '_bare'] = { trunk: cv(b.trunk), crown: cv(b.crown) }; }
  S.pine = [1, 2, 3, 4].map((i) => cv(W.pine(i)));
  S.bush = [1, 2, 3, 4, 5, 6].map((i) => cv(W.bush(i)));
  S.rock = [1, 2].map((i) => cv(W.rock(i)));
  S.bigrock = cv(W.rock(3, true));
  S.stump = cv(W.stump());
  S.flowers = [1, 2, 3, 4, 5, 6, 7, 8].map((i) => cv(W.flowers(i)));
  S.reeds = [1, 2, 3].map((i) => cv(W.reeds(i)));
  S.lily = [1, 2].map((i) => cv(W.lily(i)));

  const house = W.house(false), houseN = W.house(true);
  S.house = { day: cv(house), night: glow(houseN) };
  S.barn = { day: cv(W.barn(false)), night: glow(W.barn(true)) };
  S.lamp = { day: cv(W.lampPost(false)), night: glow(W.lampPost(true)) };
  S.stall = cv(W.stall());
  S.well = cv(W.well());
  S.sign = cv(W.sign());
  S.mailbox = cv(W.mailbox());
  S.hay = cv(W.hay());
  S.crate = cv(W.crate());
  S.trough = [cv(W.trough(false)), cv(W.trough(true))];
  S.fence = Array.from({ length: 16 }, (_, m) => cv(W.fence(m)));

  S.soil = [cv(W.plotSoil(false)), cv(W.plotSoil(true))];
  S.weeds = cv(W.weeds());
  { const m = new Spr(32, 32); for (const [x, y] of [[2, 2], [29, 2], [2, 29], [29, 29]]) { m.set(x, y, 'soil', 1); m.set(x + (x < 16 ? 1 : -1), y, 'soil', 1); m.set(x, y + (y < 16 ? 1 : -1), 'soil', 1); } for (let x = 6; x < 26; x += 4) m.set(x, 16, 'soil', 3); S.plotMark = cv(m); }
  S.crop = {};
  for (const k of ['carrot', 'cabbage', 'tomato', 'strawberry', 'corn']) S.crop[k] = [0, 1, 2].map((st) => cv(W.crop(k, st))).concat([cv(W.crop(k, 2, { giant: true }))]);

  S.paddy = { dry: cv(W.paddyBase('dry')), tilled: cv(W.paddyBase('tilled')), water: [cv(W.paddyWater(0)), cv(W.paddyWater(1))], rice: [0, 1, 2, 3].map((k) => cv(W.ricePlants(k))) };
  S.thresher = [0, 1, 2].map((f) => cv(W.thresher(f * 2.1)));
  S.fieldCell = [cv(W.fieldCell(false)), cv(W.fieldCell(true))];
  // 트랙터 32방향 × 쟁기 2: 쓰는 방향부터 그때그때 굽고, 나머지는 쉬는 시간에 미리 구움 (첫 로딩을 가볍게)
  const tcache = [[], []];
  S.tractor = (down, k) => (tcache[down ? 1 : 0][k] ||= cv(W.tractorStack((k / 32) * Math.PI * 2, down)));
  S.tractor(true, 16);
  let warm = 0;
  const idle = window.requestIdleCallback || ((f) => setTimeout(f, 30));
  const step = () => { if (warm >= 64) return; S.tractor(warm >= 32, warm % 32); warm++; idle(step); };
  setTimeout(() => idle(step), 1500);
  S.tractorAnchor = W.TRACTOR_ANCHOR;
  // 새 지역
  S.greenhouse = cv(W.greenhouse());
  S.sensor = [0, 1, 2].map((f) => cv(W.sensorPole(f * 3)));
  S.solar = cv(W.solar());
  S.drone = [0, 1].map((f) => cv(W.drone(f)));
  S.hq = { day: cv(W.koatHQ(false)), night: glow(W.koatHQ(true)) };
  S.desk = cv(W.koatDesk());
  S.booth = [0, 1, 2, 3, 4, 5].map((i) => cv(W.booth(i)));
  S.fountain = [0, 1].map((f) => cv(W.fountain(f)));
  S.flag = cv(W.flag('mane'));
  S.fishshop = cv(W.fishShop());
  S.board = cv(W.board());
  S.boat = cv(W.boat());
  S.lot = cv(W.siteLot());
  S.scaffold = cv(W.scaffold());
  S.bld = Object.fromEntries(['pavilion', 'tank', 'stand', 'glasshouse', 'mill'].map((t) => [t, { day: cv(W.building(t, false)), night: glow(W.building(t, true)) }]));
  S.mill = Array.from({ length: 8 }, (_, f) => cv(W.millBlades(f)));
  S.lookout = cv(W.lookout());
  S.chest = [cv(W.chest(false)), cv(W.chest(true))];
  S.hive = cv(W.beehive());
  S.jarBase = cv(W.jarBase());
  S.onggi = [cv(W.onggi(false)), cv(W.onggi(true))];
  S.composter = [0, 0.25, 0.5, 0.75, 1].map((f) => cv(W.composter(f)));
  S.workshop = { day: cv(W.workshop(false)), night: glow(W.workshop(true)) };
  S.bubble = Object.fromEntries(['!', '?', 'heart', 'note', 'zz', 'dots', 'honey'].map((k) => [k, cv(W.bubble(k))]));
  S.sparkle = [0, 1, 2, 3].map((f) => cv(W.sparkle(f)));
  S.bobber = cv(W.bobber());
  S.iconCanvas = {};
  S.icon = (id) => { if (!S.iconCanvas[id]) S.iconCanvas[id] = cv(W.icon(id)); return S.iconCanvas[id]; };
  const urls = {};
  S.iconURL = (id) => (urls[id] ||= S.icon(id).toDataURL());

  // 발밑 그림자 (픽셀 타원)
  const shadow = (w, h) => { const s = new Spr(w, h); s.ell(w / 2, h / 2, w / 2 - 0.5, h / 2 - 0.5, 'ink', { level: 0 }); return cv(s); };
  S.shadow = { s: shadow(14, 5), m: shadow(22, 7), l: shadow(34, 9), xl: shadow(52, 13) };
  return S;
}
