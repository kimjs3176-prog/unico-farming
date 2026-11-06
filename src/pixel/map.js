import { rng } from './pxl.js';

/**
 * 도트 버전 마을 지도 (타일 32px). 3D 버전과 같은 구성:
 * 가운데 광장·집, 동쪽 밭, 서쪽 장터, 남동쪽 목장, 남서쪽 연못, 가장자리 숲
 */
export const MW = 56, MH = 40;
export const G = { grass: 0, path: 1, soil: 2, water: 3, paddy: 4, field: 5 };

export const PLOTS = { x: 38, y: 13, cols: 6, rows: 4 }; // 밭 24칸
export const RANCH = { x0: 35, y0: 24, x1: 50, y1: 35, gate: [41, 42] }; // 울타리 (안쪽 x0+1..x1-1)
export const POND = { cx: 13.2, cy: 30.2, rx: 6.6, ry: 4.3 };
export const SPAWN = { x: 27, y: 22 };
/** 논 8마지기: 2×2칸씩, 사이는 걸어 다니는 둑 (북서쪽) */
export const PADDIES = [6, 9, 12, 15].flatMap((x) => [4, 7].map((y) => ({ x, y }))).sort((a, b) => a.y - b.y || a.x - b.x);
export const THRESHER = { x: 18, y: 6 };
/** 트랙터 밭갈이 밭 (남쪽): 9×6칸, 한 칸 = 2m (3D 판과 같은 칸 크기) */
export const FIELD = { x: 21, y: 28, cols: 9, rows: 6, rocks: [[2, 1], [6, 3], [4, 4], [7, 0]] };
export const TRACTOR_HOME = { x: 31, y: 34 };
export const paddyAt = (x, y) => PADDIES.findIndex((p) => x >= p.x && x < p.x + 2 && y >= p.y && y < p.y + 2);

export function buildMap() {
  const r = rng(2026);
  const ground = new Uint8Array(MW * MH);
  const solid = new Uint8Array(MW * MH);
  const objs = []; // { type, x, y (타일, 바닥 기준), ... }
  const G_ = (x, y, v) => { if (x >= 0 && y >= 0 && x < MW && y < MH) ground[y * MW + x] = v; };
  const rect = (x0, y0, x1, y1, v) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) G_(x, y, v); };
  const block = (x0, y0, x1, y1) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (x >= 0 && y >= 0 && x < MW && y < MH) solid[y * MW + x] = 1; };
  const isFree = (x, y) => !solid[y * MW + x] && ground[y * MW + x] === G.grass;

  // ── 길 ──
  rect(22, 18, 33, 23, G.path);           // 광장
  rect(25, 14, 26, 17, G.path);           // 집 앞
  rect(34, 20, 51, 21, G.path);           // 동쪽 길 (밭·목장)
  rect(41, 22, 42, 24, G.path);           // 목장 문
  rect(5, 20, 21, 21, G.path);            // 서쪽 길 (장터)
  rect(8, 18, 14, 19, G.path);            // 장터 앞
  rect(14, 22, 15, 25, G.path);           // 연못 가는 길
  rect(30, 24, 31, 35, G.path);           // 남쪽 산책길 (트랙터 차고까지)
  rect(5, 3, 17, 9, G.path);              // 논둑
  rect(16, 6, 22, 7, G.path);             // 논 → 탈곡기
  rect(21, 8, 22, 17, G.path);            // 탈곡기 → 마을
  for (const P of PADDIES) rect(P.x, P.y, P.x + 1, P.y + 1, G.paddy);
  rect(FIELD.x, FIELD.y, FIELD.x + FIELD.cols - 1, FIELD.y + FIELD.rows - 1, G.field);
  // ── 밭 ──
  rect(37, 12, 44, 19, G.soil);
  // ── 연못 ──
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    const u = (x + 0.5 - POND.cx) / POND.rx, v = (y + 0.5 - POND.cy) / POND.ry;
    if (u * u + v * v < 1) { G_(x, y, G.water); solid[y * MW + x] = 1; }
  }

  // ── 건물 ── (x,y = 바닥 왼쪽 아래 타일, w 칸)
  objs.push({ type: 'house', x: 23, y: 13, w: 5 }); block(23, 11, 27, 13);
  objs.push({ type: 'mailbox', x: 28, y: 13 }); block(28, 13, 28, 13);
  objs.push({ type: 'stall', x: 9, y: 17, w: 4 }); block(9, 15, 12, 17);
  objs.push({ type: 'crate', x: 13, y: 17 }); block(13, 17, 13, 17);
  objs.push({ type: 'crate', x: 8, y: 17 }); block(8, 17, 8, 17);
  objs.push({ type: 'well', x: 27, y: 20, w: 2, h: 2 }); block(27, 19, 28, 20);
  objs.push({ type: 'barn', x: 45, y: 28, w: 4, h: 4 }); block(45, 25, 48, 28);
  objs.push({ type: 'trough', x: 37, y: 26, w: 2, h: 1 }); block(37, 26, 38, 26);
  objs.push({ type: 'hay', x: 44, y: 32 }); block(44, 32, 44, 32);
  objs.push({ type: 'hay', x: 49, y: 33 }); block(49, 33, 49, 33);
  objs.push({ type: 'sign', x: 36, y: 19, text: '유니코 밭' }); block(36, 19, 36, 19);
  objs.push({ type: 'sign', x: 40, y: 23, text: '유니코 목장' }); block(40, 23, 40, 23);
  objs.push({ type: 'stump', x: 19, y: 24 }); block(19, 24, 19, 24);
  objs.push({ type: 'thresher', x: THRESHER.x, y: THRESHER.y - 1, w: 2, h: 1 }); block(THRESHER.x, THRESHER.y - 1, THRESHER.x + 1, THRESHER.y - 1);
  objs.push({ type: 'sign', x: 17, y: 9, text: '유니코 논' }); block(17, 9, 17, 9);
  objs.push({ type: 'sign', x: 20, y: 27, text: '트랙터 밭' }); block(20, 27, 20, 27);
  objs.push({ type: 'hay', x: 21, y: 5 }); block(21, 5, 21, 5);
  for (const [c, r] of FIELD.rocks) { objs.push({ type: 'rock', x: FIELD.x + c, y: FIELD.y + r, seed: c + r }); block(FIELD.x + c, FIELD.y + r, FIELD.x + c, FIELD.y + r); }
  for (const [x, y] of [[22, 17], [33, 17], [21, 23], [34, 23], [16, 19], [44, 22], [17, 26]]) { objs.push({ type: 'lamp', x, y }); block(x, y, x, y); }

  // ── 목장 울타리 ──
  const fence = new Set();
  for (let x = RANCH.x0; x <= RANCH.x1; x++) { fence.add(`${x},${RANCH.y0}`); fence.add(`${x},${RANCH.y1}`); }
  for (let y = RANCH.y0; y <= RANCH.y1; y++) { fence.add(`${RANCH.x0},${y}`); fence.add(`${RANCH.x1},${y}`); }
  for (const gx of RANCH.gate) fence.delete(`${gx},${RANCH.y0}`);
  // 밭 울타리 (북쪽·서쪽 반쪽만, 낮게)
  for (let x = 36; x <= 45; x++) fence.add(`${x},11`);
  for (const k of fence) {
    const [x, y] = k.split(',').map(Number);
    const m = (fence.has(`${x},${y - 1}`) ? 1 : 0) | (fence.has(`${x + 1},${y}`) ? 2 : 0) | (fence.has(`${x},${y + 1}`) ? 4 : 0) | (fence.has(`${x - 1},${y}`) ? 8 : 0);
    objs.push({ type: 'fence', x, y, mask: m }); block(x, y, x, y);
  }

  // ── 과일나무 (흔들기) ──
  const fruitTrees = [[18, 12, 'tomato', 'fruit_apple'], [20, 9, 'rose', 'fruit_peach'], [16, 15, 'apron', 'fruit_persimmon']];
  for (const [x, y, f, item] of fruitTrees) { objs.push({ type: 'tree', x, y, fruit: f, item, seed: x * 31 + y }); block(x, y, x, y); }

  // ── 숲 가장자리 (나무를 빽빽하게, 입구는 비움) ──
  const edge = (x, y) => x < 3 || y < 3 || x >= MW - 3 || y >= MH - 3;
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    if (!edge(x, y)) continue;
    if ((x + y * 3) % 2) continue;
    if (!isFree(x, y)) continue;
    const pineP = y > MH / 2 ? 0.55 : 0.25;
    objs.push({ type: r() < pineP ? 'pine' : 'tree', x, y, seed: x * 97 + y * 13, kind: r() < 0.12 ? 'autumn' : 'fol' });
    block(x, y, x, y);
  }
  // 가장자리 빈 곳 = 덤불로 막기
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) if (edge(x, y) && isFree(x, y)) { if (r() < 0.5) objs.push({ type: 'bush', x, y, seed: x + y * 7 }); block(x, y, x, y); }

  // ── 안쪽 장식: 나무·덤불·바위·꽃 ──
  const deco = [
    ['pine', 5, 12], ['tree', 3, 10], ['tree', 31, 7], ['tree', 34, 8], ['pine', 48, 7], ['tree', 51, 10], ['tree', 49, 15],
    ['tree', 6, 25], ['pine', 4, 34], ['tree', 19, 34], ['pine', 25, 35], ['tree', 52, 30], ['tree', 33, 33],
    ['bush', 21, 11], ['bush', 29, 11], ['bush', 30, 14], ['bush', 34, 26], ['bush', 7, 15], ['bush', 46, 11], ['bush', 33, 30],
    ['rock', 18, 33], ['bigrock', 8, 23], ['rock', 47, 18], ['rock', 33, 12],
  ];
  for (const [t, x, y] of deco) if (isFree(x, y)) { objs.push({ type: t, x, y, seed: x * 13 + y * 7, kind: 'fol' }); block(x, y, x, y); }
  // 꽃밭 (지나갈 수 있음)
  const flowerSpots = [[20, 15], [21, 16], [29, 15], [30, 16], [19, 19], [35, 15], [17, 22], [28, 26], [32, 27], [24, 26], [11, 24], [18, 29], [9, 11], [12, 9], [47, 21], [51, 18]];
  for (const [x, y] of flowerSpots) if (isFree(x, y)) objs.push({ type: 'flowers', x, y, seed: x + y, walk: true });
  // 연못 소품
  objs.push({ type: 'lily', px: (POND.cx - 2) * 32, py: (POND.cy - 0.8) * 32, seed: 1 });
  objs.push({ type: 'lily', px: (POND.cx + 2.5) * 32, py: (POND.cy + 1.2) * 32, seed: 2 });
  objs.push({ type: 'lily', px: (POND.cx + 0.4) * 32, py: (POND.cy + 2.3) * 32, seed: 3 });
  for (const [x, y] of [[7, 28], [19, 31], [8, 33], [17, 27]]) if (isFree(x, y)) objs.push({ type: 'reeds', x, y, seed: x * y, walk: true });

  return { ground, solid, objs };
}

/** 주민 위치 (3D 버전 주민과 같은 역할) */
export const NPCS = [
  { id: 'guide', x: 24, y: 21, dir: 'down', look: { mane: 'leaf' }, wander: 2 },
  { id: 'merchant', x: 11, y: 18, dir: 'down', look: { mane: 'apron', apron: 'apron' }, shop: true },
  { id: 'granny', x: 21, y: 15, dir: 'right', look: { mane: 'silver', shawl: 'purple' }, wander: 1 },
  { id: 'kid', x: 16, y: 24, dir: 'down', look: { mane: 'rose', small: true }, wander: 3 },
  { id: 'researcher', x: 46, y: 16, dir: 'left', look: { mane: 'purple', glasses: true }, wander: 1 },
];

/** 목장 동물 초기 배치 (RanchSim 순서와 같음) */
export const ANIMAL_START = [
  { type: 'cow', x: 39, y: 29 }, { type: 'cow', x: 42, y: 31 },
  { type: 'sheep', x: 44, y: 29 }, { type: 'sheep', x: 38, y: 32 },
  { type: 'chicken', x: 46, y: 31 }, { type: 'chicken', x: 47, y: 32 }, { type: 'chicken', x: 40, y: 33 },
];
