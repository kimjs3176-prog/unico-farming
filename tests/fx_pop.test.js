// 떠오르는 글자 길잡이: 가방에 실제로 들어온 물건만 가방으로, 코인은 지갑으로, 나머지(하트·별·음표·바람)는 떠오르기만
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import * as THREE from 'three';
import { FX } from '../src/game/fx.js';
import { SURF } from '../src/game/surface.js';

const ROOT = new URL('../', import.meta.url);

function withCanvas(fn) {
  const ctx = { measureText: (t) => ({ width: t.length * 20 }), clearRect() {}, beginPath() {}, moveTo() {}, arcTo() {}, closePath() {}, fill() {}, fillText() {} };
  const had = globalThis.document;
  globalThis.document = { createElement: () => ({ width: 300, height: 150, getContext: () => ctx }) };
  try { fn(); } finally { if (had) globalThis.document = had; else delete globalThis.document; }
}

test('FX.pop: to 없음 → 떠오르기만, bag → onPop, coin → onCoin(금액, 위치)', () => withCanvas(() => {
  SURF.seeCam.value.set(0, 5, 10);
  const fx = new FX(new THREE.Scene(), { level: 'high' });
  const bag = [], coin = [];
  fx.onPop = (t, p) => bag.push([t, p.y]);
  fx.onCoin = (n, p) => coin.push([n, p.x]);
  for (const t of ['💕', '💖', '🐾', '🎵', '✨', '🐑', '⭐⭐⭐', '🌿', '❤️', '💨']) fx.pop(0, 0, t);
  assert.deepEqual(bag, []);
  assert.deepEqual(coin, []);
  fx.pop(0, 0, '🌶️', { to: 'bag', y: 2 }); // 예전 정규식은 U+FE0F 때문에 김치를 빠뜨렸음
  fx.pop(3, 0, '💨', { to: 'coin', amount: 30 });
  assert.deepEqual(bag, [['🌶️', 2]]);
  assert.deepEqual(coin, [[30, 3]]);
  assert.equal(fx.items.filter((it) => !it.kind).length, 12, '글자는 모두 떠오름');
  const live = fx.live;
  fx.pop(0, 0, '🍯', { to: 'bag', burst: false });
  assert.equal(fx.live, live, 'burst:false 면 반짝임 없음');
}));

/** 길잡이 표: 파일 → [줄에 들어 있는 글, 'bag' | 'coin' | 'float' | 'any'] ('any' 는 다른 배치가 맡은 곳) */
const ROUTES = {
  'src/game/view/farm_view.js': [["'⭐'.repeat", 'float'], ["'🌿'", 'float']],
  'src/game/view/rice_view.js': [["'🌿'", 'float'], ["'🌾'", 'bag']],
  'src/game/view/bees.js': [["'🍯'", 'bag']],
  'src/game/view/nature_view.js': [['ITEMS[b.kind].emoji', 'bag']],
  'src/game/view/farmcraft_view.js': [['ITEMS[id].emoji', 'bag']],
  'src/game/view/ranch_view.js': [["'💕');", 'float'], ["'💖'", 'float'], ["'❤️'", 'float'], ['P.emoji', 'bag'], ['ITEMS[r.gold].emoji', 'bag']],
  'src/game/view/explore_view.js': [['icon, coins', 'both']],
  'src/game/view/pests.js': [["'💨'", 'coin']],
  'src/game/view/herding.js': [["'🐑'", 'float']],
  'src/game/view/ride_view.js': [["'🎉'", 'float'], ['PLOW_COIN', 'float']],
  'src/game/view/pet.js': [["'🐾'", 'any'], ["'🎵'", 'any'], ["'✨'", 'any'], ["'🪙'", 'any'], ['emoji)', 'any'], ["'💕'", 'any']],
  'src/game/view/lake_view.js': [["text.split(' ')[0]", 'any']],
  'src/game/reward.js': [['o.label', 'float']],
};

function* jsFiles(dir) {
  for (const f of readdirSync(new URL(dir, ROOT))) {
    const p = `${dir}/${f}`;
    if (p === 'src/pixel') continue;
    if (statSync(new URL(p, ROOT)).isDirectory()) yield* jsFiles(p);
    else if (p.endsWith('.js')) yield p;
  }
}

test('모든 fx.pop( 자리가 길잡이 표에 있고, 표대로 가방·지갑·떠오르기', () => {
  const found = [];
  for (const p of jsFiles('src')) {
    if (p === 'src/game/fx.js') continue;
    readFileSync(new URL(p, ROOT), 'utf8').split('\n').forEach((line, i) => {
      if (/fx\??\.pop\(/.test(line)) found.push({ p, line, n: i + 1 });
    });
  }
  assert.ok(found.length >= 20, `찾은 자리 ${found.length}`);
  for (const { p, line, n } of found) {
    const r = (ROUTES[p] || []).find(([s]) => line.includes(s));
    assert.ok(r, `${p}:${n} 가 길잡이 표에 없음: ${line.trim()}`);
    const [, to] = r;
    if (to === 'bag') assert.match(line, /to: 'bag'/, `${p}:${n} 는 가방으로`);
    if (to === 'coin') assert.match(line, /to: 'coin', amount:/, `${p}:${n} 는 지갑으로`);
    if (to === 'float') assert.doesNotMatch(line, /to: '/, `${p}:${n} 는 떠오르기만`);
    if (to === 'both') { assert.match(line, /to: 'coin'/); assert.match(line, /to: 'bag'/); }
  }
});

test('예전 정규식 가방 날리기를 HUD 가 명시적인 길로 바꿔 끼움 (onPop·onCoin)', () => {
  const hud = readFileSync(new URL('src/ui/hud.js', ROOT), 'utf8');
  assert.match(hud, /g\.fx\.onPop = \(t, p\) => this\.flyToBag\(t, p\)/);
  assert.match(hud, /g\.fx\.onCoin = \(n, p\) => this\.flyToCoin\(n, p\)/);
});
