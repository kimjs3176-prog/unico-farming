import { rng } from './pxl.js';

/**
 * 도트 버전 마을 지도 (타일 32px). 3D 버전과 같은 구성:
 * 가운데 마을(광장·집·밭·장터·목장·연못·논·트랙터 밭) + 동쪽 스마트팜 + 북동쪽 KOAT 체험관
 * + 남서쪽 낚시터 호수 + 남동쪽 새 마을 부지 + 언덕 4곳. 지역 사이는 숲 띠, 길로 이어짐
 */
export const MW = 100, MH = 86;
/** 바깥 지도는 0..OUT-1 줄. 그 아래는 바깥과 이어지지 않는 실내 칸 (검은 공간 + 유니코 집 안) */
export const OUT = 70;
export const G = { grass: 0, path: 1, soil: 2, water: 3, paddy: 4, field: 5, plaza: 6, hill: 7, cliff: 8, dock: 9, stairs: 10, floor: 11, wall: 12, void: 13 };
/** 유니코 집 안: 벽 포함 12×8칸 (윗벽 2줄, 옆벽 1칸, 아랫벽 1줄에 문 2칸) */
export const HOME = { x0: 44, y0: 75, x1: 55, y1: 82, door: [49, 50], spawn: { x: 49, y: 81 }, outDoor: { x: 25, y: 14 } };

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
/** 물: 연못(마을) + 낚시터 호수 */
export const LAKE = { cx: 22.5, cy: 56.5, rx: 13, ry: 7 };
export const WATERS = [POND, LAKE];
export const DOCK = { x: 22, y0: 49, y1: 53 }; // 호수로 뻗은 부두 (2칸 폭)
/** 스마트팜 비닐하우스 + 센서 폴(조작반) */
export const SMART = { x: 59, y: 17, w: 8, h: 4, pole: { x: 68, y: 17 } };
/** KOAT 체험관 광장 */
export const KOAT = { x0: 76, y0: 10, x1: 97, y1: 31, hq: { x: 81, y: 9, w: 10 }, desk: { x: 85, y: 12 } };
/** 본부 부스 6곳 (koat.js DIVISIONS 순서) */
export const BOOTHS = [[77, 14], [77, 20], [77, 26], [94, 14], [94, 20], [94, 26]].map(([x, y]) => ({ x, y }));
/** 새 마을 건설 부지 5곳 (4×3칸) */
export const SITES = [[50, 49], [57, 49], [64, 49], [53, 56], [60, 56]].map(([x, y]) => ({ x, y, w: 4, h: 3 }));
/** 언덕 4곳: 고원 [x0..x1, y0..y1-1], 남쪽 절벽 줄 y1, 계단 sx..sx+1, 전망대 */
export const HILLS = [
  { id: 'sunrise', name: '해돋이 언덕', x0: 57, y0: 27, x1: 68, y1: 34, sx: 62, look: { x: 62, y: 30 } },
  { id: 'wind', name: '바람 언덕', x0: 85, y0: 55, x1: 96, y1: 64, sx: 90, look: { x: 90, y: 58 } },
  { id: 'flower', name: '들꽃 언덕', x0: 37, y0: 58, x1: 46, y1: 65, sx: 41, look: { x: 41, y: 61 } },
  { id: 'west', name: '서쪽 전망 언덕', x0: 3, y0: 41, x1: 10, y1: 47, sx: 6, look: { x: 6, y: 43 } },
];
/** 숨은 보물 상자 (하루 한 번) */
export const CHESTS = [[4, 33], [50, 4], [58, 24], [95, 36], [47, 66], [80, 65]].map(([x, y]) => ({ x, y }));
export const FISH_SHOP = { x: 26, y: 47, w: 4 };
/** 양봉: 마을 서쪽 들꽃 옆 벌통 3개 */
export const HIVES = [{ x: 4, y: 15 }, { x: 6, y: 17 }, { x: 4, y: 18 }];
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
  // ── 새 지역 길 ──
  rect(52, 20, 97, 21, G.path);           // 동쪽 큰길 (스마트팜 → KOAT)
  rect(58, 18, 70, 19, G.path);           // 비닐하우스 앞
  rect(71, 22, 72, 44, G.path);           // 큰길 → 새 마을 (숲 띠 사이)
  rect(30, 36, 31, 44, G.path);           // 마을 남쪽 → 새 마을·호수
  rect(30, 43, 97, 44, G.path);           // 남쪽 큰길
  rect(13, 36, 16, 47, G.path);           // 마을 → 낚시터
  rect(10, 47, 33, 48, G.path);           // 호숫가 길
  rect(17, 43, 30, 44, G.path);           // 낚시터 ↔ 남쪽 큰길
  rect(48, 45, 70, 47, G.path);           // 건설 부지 앞길
  rect(48, 52, 70, 54, G.path);
  rect(48, 45, 49, 60, G.path); rect(69, 45, 70, 60, G.path);
  rect(KOAT.x0, KOAT.y0, KOAT.x1, KOAT.y1, G.plaza);
  rect(85, 8, 86, 9, G.plaza);            // 본관 입구
  for (const H of HILLS) {
    rect(H.x0, H.y0, H.x1, H.y1 - 1, G.hill);
    rect(H.x0, H.y1, H.x1, H.y1, G.cliff);
    rect(H.sx, H.y1, H.sx + 1, H.y1, G.stairs);
    block(H.x0, H.y1, H.sx - 1, H.y1); block(H.sx + 2, H.y1, H.x1, H.y1);
    rect(H.sx, H.y1 + 1, H.sx + 1, H.y1 + 1, G.path);
  }
  // ── 물 (연못·호수) + 부두 ──
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    for (const W of WATERS) {
      const u = (x + 0.5 - W.cx) / W.rx, v = (y + 0.5 - W.cy) / W.ry;
      if (u * u + v * v < 1) { G_(x, y, G.water); solid[y * MW + x] = 1; }
    }
  }
  for (let y = DOCK.y0; y <= DOCK.y1; y++) for (let x = DOCK.x; x <= DOCK.x + 1; x++) { G_(x, y, G.dock); solid[y * MW + x] = 0; }

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

  // ── 스마트팜 ──
  objs.push({ type: 'greenhouse', x: SMART.x, y: SMART.y, w: SMART.w, h: SMART.h }); block(SMART.x, SMART.y - SMART.h + 1, SMART.x + SMART.w - 1, SMART.y);
  objs.push({ type: 'sensor', x: SMART.pole.x, y: SMART.pole.y }); block(SMART.pole.x, SMART.pole.y, SMART.pole.x, SMART.pole.y);
  for (const x of [59, 63]) { objs.push({ type: 'solar', x, y: 12, w: 4, h: 1 }); block(x, 12, x + 3, 12); }
  objs.push({ type: 'sign', x: 57, y: 19, text: '스마트팜' }); block(57, 19, 57, 19);
  // ── KOAT 체험관 ──
  objs.push({ type: 'koat_hq', x: KOAT.hq.x, y: KOAT.hq.y, w: KOAT.hq.w, h: 4 }); block(KOAT.hq.x, KOAT.hq.y - 3, KOAT.hq.x + KOAT.hq.w - 1, KOAT.hq.y);
  objs.push({ type: 'desk', x: KOAT.desk.x, y: KOAT.desk.y, w: 2, h: 1 }); block(KOAT.desk.x, KOAT.desk.y, KOAT.desk.x + 1, KOAT.desk.y);
  BOOTHS.forEach((B, i) => { objs.push({ type: 'booth', x: B.x, y: B.y, w: 3, h: 2, div: i }); block(B.x, B.y - 1, B.x + 2, B.y); });
  objs.push({ type: 'fountain', x: 85, y: 21, w: 2, h: 2 }); block(85, 20, 86, 21);
  for (const [x, y] of [[80, 11], [91, 11], [80, 30], [91, 30], [76, 18], [76, 24]]) { objs.push({ type: 'lamp', x, y }); block(x, y, x, y); }
  for (const x of [79, 92]) { objs.push({ type: 'flag', x, y: 10 }); block(x, 10, x, 10); }
  // ── 낚시터 ──
  objs.push({ type: 'fishshop', x: FISH_SHOP.x, y: FISH_SHOP.y - 1, w: FISH_SHOP.w, h: 2 }); block(FISH_SHOP.x, FISH_SHOP.y - 2, FISH_SHOP.x + FISH_SHOP.w - 1, FISH_SHOP.y - 1);
  objs.push({ type: 'board', x: 31, y: 46 }); block(31, 46, 31, 46);
  objs.push({ type: 'boat', px: (LAKE.cx + 3.2) * 32, py: (LAKE.cy - 3.5) * 32 });
  objs.push({ type: 'sign', x: 12, y: 45, text: '유니코 낚시터' }); block(12, 45, 12, 45);
  for (const [x, y] of [[18, 46], [33, 46]]) { objs.push({ type: 'lamp', x, y }); block(x, y, x, y); }
  // ── 새 마을 부지 ──
  SITES.forEach((S, i) => { objs.push({ type: 'site', x: S.x, y: S.y + S.h - 1, w: S.w, h: S.h, site: i }); block(S.x, S.y, S.x + S.w - 1, S.y + S.h - 1); });
  objs.push({ type: 'sign', x: 47, y: 45, text: '새 마을 부지' }); block(47, 45, 47, 45);
  objs.push({ type: 'crate', x: 67, y: 57 }); block(67, 57, 67, 57); objs.push({ type: 'hay', x: 66, y: 58 }); block(66, 58, 66, 58);
  // ── 언덕 전망대·보물 상자 ──
  for (const H of HILLS) { objs.push({ type: 'lookout', x: H.look.x, y: H.look.y, w: 2, h: 1, hill: H.id }); block(H.look.x, H.look.y, H.look.x + 1, H.look.y); }
  // ── 실내: 검은 공간 + 유니코 집 안 ──
  for (let y = OUT; y < MH; y++) for (let x = 0; x < MW; x++) { ground[y * MW + x] = G.void; solid[y * MW + x] = 1; }
  for (let y = HOME.y0; y <= HOME.y1; y++) for (let x = HOME.x0; x <= HOME.x1; x++) {
    const wall = y <= HOME.y0 + 1 || x === HOME.x0 || x === HOME.x1 || (y === HOME.y1 && !HOME.door.includes(x));
    ground[y * MW + x] = wall ? G.wall : G.floor; solid[y * MW + x] = wall ? 1 : 0;
  }
  const H0 = HOME.x0, Y2 = HOME.y0 + 2; // 바닥 첫 줄
  objs.push({ type: 'bed', x: H0 + 1, y: Y2 + 1, w: 2, h: 2 }); block(H0 + 1, Y2, H0 + 2, Y2 + 1);
  objs.push({ type: 'calendar', x: H0 + 6, y: Y2 - 1 });
  objs.push({ type: 'shelf', x: H0 + 4, y: Y2, w: 2, h: 1 }); block(H0 + 4, Y2, H0 + 5, Y2);
  objs.push({ type: 'window', x: H0 + 7, y: Y2 - 1, w: 2, h: 1 });
  objs.push({ type: 'kitchen', x: H0 + 9, y: Y2, w: 2, h: 1 }); block(H0 + 9, Y2, H0 + 10, Y2);
  objs.push({ type: 'rug', x: H0 + 3, y: Y2 + 3, walk: true });
  objs.push({ type: 'table', x: H0 + 7, y: Y2 + 2, w: 2, h: 1 }); block(H0 + 7, Y2 + 2, H0 + 8, Y2 + 2);
  objs.push({ type: 'chair', x: H0 + 6, y: Y2 + 2, walk: true }); objs.push({ type: 'chair', x: H0 + 9, y: Y2 + 2, walk: true, flip: true });
  objs.push({ type: 'plant', x: H0 + 1, y: HOME.y1 - 1 }); block(H0 + 1, HOME.y1 - 1, H0 + 1, HOME.y1 - 1);
  objs.push({ type: 'plant', x: HOME.x1 - 1, y: HOME.y1 - 1 }); block(HOME.x1 - 1, HOME.y1 - 1, HOME.x1 - 1, HOME.y1 - 1);
  objs.push({ type: 'floorlamp', x: H0 + 3, y: Y2 }); block(H0 + 3, Y2, H0 + 3, Y2);

  // ── 가공: 밭 서쪽 장독대·퇴비통, 목장 앞 가공소 ──
  objs.push({ type: 'jars', x: 32, y: 15, w: 3, h: 2 }); block(32, 14, 34, 15);
  objs.push({ type: 'composter', x: 35, y: 13 }); block(35, 13, 35, 13);
  objs.push({ type: 'workshop', x: 46, y: 23, w: 3, h: 2 }); block(46, 22, 48, 23);
  HIVES.forEach((H, i) => { objs.push({ type: 'hive', x: H.x, y: H.y, hive: i }); block(H.x, H.y, H.x, H.y); });
  objs.push({ type: 'sign', x: 7, y: 19, text: '유니코 양봉장' }); block(7, 19, 7, 19);
  CHESTS.forEach((C, i) => { objs.push({ type: 'chest', x: C.x, y: C.y, chest: i }); block(C.x, C.y, C.x, C.y); });

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
  const strip = (x, y) =>
    (x >= 53 && x <= 55 && y <= 39 && !(y >= 19 && y <= 22)) ||                       // 마을 | 동쪽
    (y >= 37 && y <= 39 && x <= 55 && !(x >= 13 && x <= 16) && !(x >= 29 && x <= 32)) || // 마을 | 남쪽
    (y >= 37 && y <= 39 && x >= 56 && !(x >= 70 && x <= 73)) ||                         // 동쪽 | 새 마을
    (x >= 73 && x <= 74 && y <= 36 && !(y >= 19 && y <= 22));                            // 스마트팜 | KOAT
  const edge = (x, y) => y < OUT && (x < 3 || y < 3 || x >= MW - 3 || y >= OUT - 3 || strip(x, y));
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
    ['tree', 60, 6], ['pine', 66, 5], ['tree', 70, 9], ['bush', 58, 22], ['bush', 66, 23], ['tree', 69, 25], ['rock', 64, 24],
    ['tree', 59, 30], ['tree', 66, 29], ['pine', 58, 32], ['bush', 65, 32], // 해돋이 언덕 위
    ['tree', 78, 5], ['pine', 94, 6], ['bush', 79, 33], ['bush', 92, 33], ['tree', 96, 33],
    ['tree', 5, 52], ['pine', 4, 60], ['tree', 38, 49], ['bush', 36, 46], ['tree', 9, 64], ['pine', 33, 64], ['bigrock', 36, 53],
    ['tree', 39, 60], ['bush', 44, 59], ['pine', 45, 62], // 들꽃 언덕 위
    ['tree', 87, 57], ['pine', 95, 58], ['bush', 93, 61], ['tree', 86, 62], // 바람 언덕 위
    ['tree', 4, 42], ['pine', 9, 42], // 서쪽 전망 언덕 위
    ['tree', 76, 48], ['tree', 82, 52], ['pine', 78, 58], ['bush', 74, 50], ['tree', 52, 63], ['bush', 58, 64], ['rock', 75, 62], ['tree', 64, 63],
  ];
  for (const [t, x, y] of deco) if (isFree(x, y)) { objs.push({ type: t, x, y, seed: x * 13 + y * 7, kind: 'fol' }); block(x, y, x, y); }
  // 꽃밭 (지나갈 수 있음)
  const flowerSpots = [[5, 15], [3, 17], [5, 18], [6, 16], [3, 14], [6, 19], [40, 59], [43, 62], [38, 63], [45, 60], [42, 58], [88, 60], [92, 56], [60, 32], [65, 31], [7, 45], [78, 40], [84, 47], [90, 50], [36, 44], [62, 26], [20, 15], [21, 16], [29, 15], [30, 16], [19, 19], [35, 15], [17, 22], [28, 26], [32, 27], [24, 26], [11, 24], [18, 29], [9, 11], [12, 9], [47, 21], [51, 18]];
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
  { id: 'fisher', x: 27, y: 48, dir: 'down', look: { mane: 'roofb', apron: 'cloth' }, shop: 'fish', wander: 1 },
  { id: 'koat_desk', x: 85, y: 11, dir: 'down', look: { mane: 'leaf', scarf: 'roofb' }, koat: 'desk' },
  ...BOOTHS.map((B, i) => ({ id: `koat_${i}`, x: B.x + 1, y: B.y + 1, dir: 'down', look: { mane: ['apron', 'scarf', 'corn', 'mane', 'leaf', 'roofb'][i], scarf: ['band', 'scarf', 'gold', 'mane', 'leaf', 'roofb'][i] }, koat: i })),
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
