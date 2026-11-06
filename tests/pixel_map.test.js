import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMap, MW, MH, G, PLOTS, RANCH, SPAWN, NPCS, ANIMAL_START } from '../src/pixel/map.js';
import { nightness, ambientAt } from '../src/pixel/render.js';

const map = buildMap();
const solid = (x, y) => x < 0 || y < 0 || x >= MW || y >= MH || map.solid[y * MW + x] === 1;

/** 시작점에서 걸어서 닿는 칸 */
function reachable(blockers = new Set()) {
  const seen = new Set([`${SPAWN.x},${SPAWN.y}`]);
  const q = [[SPAWN.x, SPAWN.y]];
  while (q.length) {
    const [x, y] = q.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, k = `${nx},${ny}`;
      if (seen.has(k) || solid(nx, ny) || blockers.has(k)) continue;
      seen.add(k); q.push([nx, ny]);
    }
  }
  return seen;
}

test('도트 지도: 시작점·주민·가축 자리는 막혀 있지 않음', () => {
  assert.equal(solid(SPAWN.x, SPAWN.y), false);
  for (const n of NPCS) assert.equal(solid(n.x, n.y), false, n.id);
  for (const a of ANIMAL_START) {
    assert.equal(solid(a.x, a.y), false, `${a.type} ${a.x},${a.y}`);
    assert.ok(a.x > RANCH.x0 && a.x < RANCH.x1 && a.y > RANCH.y0 && a.y < RANCH.y1, '가축은 울타리 안');
  }
});

test('도트 지도: 밭 24칸은 흙 위, 지나갈 수 있음', () => {
  for (let r = 0; r < PLOTS.rows; r++) for (let c = 0; c < PLOTS.cols; c++) {
    const x = PLOTS.x + c, y = PLOTS.y + r;
    assert.equal(map.ground[y * MW + x], G.soil);
    assert.equal(solid(x, y), false);
  }
});

test('도트 지도: 시작점에서 밭·장터·집·연못·목장 안까지 걸어갈 수 있음 (주민이 서 있어도)', () => {
  const npcTiles = new Set(NPCS.map((n) => `${n.x},${n.y}`));
  const R = reachable(npcTiles);
  const must = [
    ['밭', PLOTS.x, PLOTS.y + PLOTS.rows], ['장터 앞', 11, 19], ['집 앞', 25, 14], ['연못가', 14, 25], ['목장 안', RANCH.gate[0], RANCH.y0 + 1],
  ];
  for (const [name, x, y] of must) assert.ok(R.has(`${x},${y}`), name);
  // 물은 막혀 있음
  const water = [];
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) if (map.ground[y * MW + x] === G.water) water.push([x, y]);
  assert.ok(water.length > 40);
  assert.ok(water.every(([x, y]) => solid(x, y)));
});

test('도트 조명: 한낮은 밝고 한밤은 어두움', () => {
  assert.equal(nightness(0.5), 0);
  assert.equal(nightness(0.95), 1);
  assert.ok(ambientAt(0.5)[0] > 240 && ambientAt(0.0)[0] < 100);
});

test('도트 지도: 논 8마지기·트랙터 밭·차고가 걸어서 닿는 곳에 있음', async () => {
  const { PADDIES, FIELD, TRACTOR_HOME, THRESHER, paddyAt } = await import('../src/pixel/map.js');
  assert.equal(PADDIES.length, 8);
  for (const [i, P] of PADDIES.entries()) for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
    assert.equal(map.ground[(P.y + dy) * MW + P.x + dx], G.paddy);
    assert.equal(paddyAt(P.x + dx, P.y + dy), i);
  }
  for (let r = 0; r < FIELD.rows; r++) for (let c = 0; c < FIELD.cols; c++) assert.equal(map.ground[(FIELD.y + r) * MW + FIELD.x + c], G.field);
  const R = reachable(new Set(NPCS.map((n) => `${n.x},${n.y}`)));
  assert.ok(R.has(`${PADDIES[0].x},${PADDIES[0].y + 2}`), '논둑');
  assert.ok(R.has(`${THRESHER.x},${THRESHER.y}`), '탈곡기 앞');
  assert.ok(R.has(`${TRACTOR_HOME.x - 1},${TRACTOR_HOME.y}`), '트랙터 옆');
  assert.ok(R.has(`${FIELD.x},${FIELD.y}`), '밭');
});
