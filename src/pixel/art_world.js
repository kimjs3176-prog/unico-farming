import { Spr, rng, bayer } from './pxl.js';

/** 배경 도트: 나무·건물·소품·작물·아이콘. 타일 한 칸 = 32px */
export const T = 32;

function contour(s, cx, cy, rx, ry, r, l) { s.ell(cx, cy, rx + 1, ry + 1, r, { level: l, clip: (x, y) => s.get(x, y) !== 0 }); }

/* ───────────── 나무 ───────────── */

/** 활엽수: 줄기·수관을 따로 (수관만 바람에 흔들림). fruit: 'tomato'(사과)·'apron'(감)·'rose'(복숭아) */
export function tree(seed = 1, { kind = 'fol', fruit = null } = {}) {
  const r = rng(seed * 7919);
  const trunk = new Spr(72, 104);
  // 뿌리 퍼짐 + 줄기 (나무껍질 세로 결)
  trunk.poly([30, 104 - 4, 27, 104, 45, 104, 42, 104 - 4, 41, 56, 31, 56], 'bark', { level: 2 });
  trunk.poly([24, 103, 30, 98, 33, 103], 'bark', { level: 1 }); trunk.poly([39, 103, 42, 98, 48, 103], 'bark', { level: 2 });
  for (let y = 64; y < 101; y++) { trunk.set(31, y, 'bark', 3); trunk.set(32, y, 'bark', y % 9 < 5 ? 3 : 2); trunk.set(40, y, 'bark', 1); trunk.set(41, y, 'bark', 0); }
  for (const x of [35, 38]) for (let y = 66 + (x % 5); y < 98; y += 11) trunk.vline(x, y, y + 5, 'bark', 1);
  trunk.line(36, 74, 26, 62, 'bark', 2); trunk.line(37, 74, 27, 62, 'bark', 1); // 가지
  trunk.outline();

  const crown = new Spr(72, 104);
  const clumps = [];
  // 뒤쪽(어두운) → 앞쪽(밝은) 순서로 덩어리
  const base = [[36, 34, 20], [20, 46, 14], [52, 46, 14], [26, 26, 13], [46, 26, 13], [36, 18, 12], [36, 58, 15], [16, 34, 10], [56, 34, 10]];
  for (const [x, y, rr] of base) clumps.push([x + (r() - 0.5) * 4, y + (r() - 0.5) * 4, rr * (0.9 + r() * 0.2)]);
  clumps.sort((a, b) => a[1] - b[1]);
  // 1) 뒤 덩어리: 어두운 실루엣
  for (const [x, y, rr] of clumps) crown.ell(x + 1, y + 2, rr, rr * 0.9, kind, { lo: 0, hi: 2, dither: 0.06 });
  // 2) 앞 덩어리: 왼쪽 위 빛 (덩어리마다 하이라이트 → 잎 뭉치)
  for (const [x, y, rr] of clumps) {
    contour(crown, x, y, rr * 0.82, rr * 0.74, kind, 1);
    crown.ell(x, y, rr * 0.82, rr * 0.74, kind, { lo: 1, hi: 4, dither: 0.07, gamma: 1.3 });
    // 잎 뭉치 결: 빛 받는 쪽에 작은 잎 모양 하이라이트, 그늘 쪽에 잎 그림자 (점 노이즈 대신 모양)
    for (let k = 0; k < 4; k++) {
      const a = -2.4 + r() * 1.4, d = rr * (0.25 + r() * 0.35);
      const lx = Math.round(x + Math.cos(a) * d), ly = Math.round(y + Math.sin(a) * d * 0.8);
      if (crown.get(lx, ly)) { crown.hline(lx - 1, lx + 1, ly, kind, 5); crown.set(lx, ly - 1, kind, 5); crown.set(lx + 1, ly + 1, kind, 3); }
      const b = 0.6 + r() * 1.2, e = rr * (0.4 + r() * 0.3);
      const sx = Math.round(x + Math.cos(b) * e), sy = Math.round(y + Math.sin(b) * e * 0.8);
      if (crown.get(sx, sy)) { crown.hline(sx - 1, sx + 1, sy, kind, 1); crown.set(sx, sy + 1, kind, 1); }
    }
  }
  // 잎 끝 톱니 (실루엣 가장자리를 들쭉날쭉하게)
  for (let i = 0; i < 46; i++) {
    const a = r() * Math.PI * 2, rr = 24 + r() * 8;
    const x = Math.round(36 + Math.cos(a) * rr * 1.05), y = Math.round(32 + Math.sin(a) * rr * 0.9);
    if (crown.get(x, y)) continue;
    const nb = crown.get(x + 1, y) || crown.get(x - 1, y) || crown.get(x, y + 1) || crown.get(x, y - 1);
    if (nb) crown.set(x, y, kind, y < 30 ? 3 : 1);
  }
  if (fruit) for (let i = 0; i < 9; i++) {
    const x = 16 + r() * 40, y = 20 + r() * 34;
    if (!crown.get(x | 0, y | 0)) continue;
    crown.ell(x, y, 2.2, 2.2, fruit, { lo: 1 }); crown.set((x | 0) - 1, (y | 0) - 1, fruit, 3);
  }
  crown.outline();
  return { trunk, crown };
}

/** 소나무: 층층이 쌓인 가지 */
export function pine(seed = 1) {
  const r = rng(seed * 131);
  const s = new Spr(56, 96);
  s.rect(25, 76, 6, 18, 'bark', 2); s.vline(25, 76, 93, 'bark', 3); s.vline(30, 76, 93, 'bark', 1);
  const tiers = 5;
  for (let i = 0; i < tiers; i++) {
    const y0 = 6 + i * 13, w = 9 + i * 4.6 + r() * 2, h = 22;
    s.poly([28 - w - 2, y0 + h, 28, y0 - 2, 28 + w + 2, y0 + h], 'pine', { level: 1 });
    // 빛 받는 왼쪽 면 / 그늘진 오른쪽 면
    s.poly([28 - w, y0 + h - 2, 28, y0, 28 + 1, y0 + h - 3], 'pine', { level: 3 });
    s.poly([28 + 1, y0 + h - 3, 28, y0, 28 + w, y0 + h - 2], 'pine', { level: 2 });
    // 가지 끝 잎 (아래 가장자리 톱니)
    for (let x = Math.round(28 - w); x < 28 + w; x += 3) { s.set(x, y0 + h - 1, 'pine', 1); s.set(x + 1, y0 + h, 'pine', 0); }
    s.line(28 - w + 3, y0 + h - 4, 28 - 2, y0 + 5, 'pine', 4);
  }
  s.outline();
  return s;
}

export function bush(seed = 1, kind = 'fol') {
  const r = rng(seed * 17);
  const s = new Spr(40, 30);
  const cl = [[20, 16, 10], [11, 19, 7], [29, 19, 7], [15, 12, 6], [25, 12, 6]];
  for (const [x, y, rr] of cl) s.ell(x + 1, y + 1, rr, rr * 0.85, kind, { lo: 0, hi: 2 });
  for (const [x, y, rr] of cl) s.ell(x, y, rr * 0.8, rr * 0.7, kind, { lo: 1, dither: 0.2 });
  if (seed % 3 === 0) for (let i = 0; i < 5; i++) { const x = 8 + r() * 24 | 0, y = 8 + r() * 14 | 0; if (s.get(x, y)) { s.set(x, y, 'floww', 2); s.set(x + 1, y, 'floww', 1); } }
  s.outline();
  return s;
}

export function rock(seed = 1, big = false) {
  const s = new Spr(big ? 44 : 26, big ? 34 : 20);
  const w = s.w, h = s.h;
  s.ell(w / 2, h * 0.58, w * 0.44, h * 0.4, 'stone', { lo: 1, dither: 0.15 });
  s.ell(w * 0.42, h * 0.5, w * 0.26, h * 0.26, 'stone', { lo: 2, clip: (x, y) => s.get(x, y) !== 0 });
  // 금 (모서리에서 시작)
  s.line(Math.round(w * 0.62), Math.round(h * 0.3), Math.round(w * 0.55), Math.round(h * 0.6), 'stone', 1);
  if (big) { s.ell(w * 0.3, h * 0.8, 6, 2, 'leaf', { lo: 1, hi: 2, clip: (x, y) => s.get(x, y) !== 0 }); } // 아래쪽 이끼
  s.outline();
  return s;
}

/* ───────────── 건물 ───────────── */

/** 기와·널판 지붕 (줄마다 어긋난 조각) */
function roofTiles(s, x0, y0, x1, y1, inset, R, rowH = 7) {
  const H = y1 - y0;
  s.poly([x0, y1, x0 + inset, y0, x1 - inset, y0, x1, y1], R, { level: 2 });
  for (let y = y0; y < y1; y++) {
    const t = (y - y0) / H;
    const xa = Math.round(x0 + inset * (1 - t)), xb = Math.round(x1 - inset * (1 - t));
    const row = Math.floor((y - y0) / rowH), ry = (y - y0) % rowH;
    for (let x = xa; x < xb; x++) {
      if (!s.get(x, y)) continue;
      let l = t < 0.5 ? 3 : 2; // 위쪽이 하늘빛을 받음
      if (ry === rowH - 1) l = 1;                 // 줄 아래 그림자
      else if (ry === 0) l = Math.min(4, l + 1);  // 줄 윗면 하이라이트
      if ((x + row * 5) % 10 === 0 && ry < rowH - 1) l = 1; // 조각 사이 틈
      if (x < xa + 2) l = Math.min(4, l + 1);
      if (x > xb - 3) l = 1;
      s.set(x, y, R, l);
    }
  }
  s.hline(x0 + inset, x1 - inset, y0, R, 4);
  s.hline(x0, x1, y1, R, 0); s.hline(x0 + 1, x1 - 1, y1 + 1, R, 1);
}

function planks(s, x, y, w, h, R, gap = 6) {
  s.rect(x, y, w, h, R, 3);
  for (let j = 0; j < h; j++) {
    const k = j % gap;
    if (k === gap - 1) s.hline(x, x + w - 1, y + j, R, 1);
    else if (k === 0) s.hline(x, x + w - 1, y + j, R, 4);
  }
  // 바닥에서 튀어 올라온 흙 얼룩 (아래쪽만, 위로 갈수록 성기게)
  for (let j = 0; j < 6; j++) for (let i = 0; i < w; i++) if (bayer(x + i, y + h - 1 - j) < 0.4 - j * 0.14) s.set(x + i, y + h - 1 - j, R, 2);
}

function window(s, x, y, w, h, night) {
  s.rect(x - 2, y - 2, w + 4, h + 4, 'wood', 2);
  s.hline(x - 2, x + w + 1, y - 2, 'wood', 4);
  if (night) {
    s.rect(x, y, w, h, 'win', 2);
    s.rect(x, y, w, 2, 'win', 3);
  } else {
    s.rect(x, y, w, h, 'glass', 1);
    s.line(x + 1, y + h - 2, x + w - 3, y + 1, 'glass', 2); s.line(x + 3, y + h - 2, x + w - 1, y + 2, 'glass', 2);
    s.set(x + 1, y + 1, 'glass', 3);
  }
  s.vline(x + (w >> 1), y, y + h - 1, 'wood', 1); s.hline(x, x + w - 1, y + (h >> 1), 'wood', 1);
  s.rect(x - 3, y + h + 2, w + 6, 3, 'wood', 1); // 창턱
}

/** 집 (5×3 타일 바닥, 지붕 포함 160×150). night: 창문 빛 버전 */
export function house(night = false) {
  const s = new Spr(160, 152);
  // 굴뚝
  s.rect(112, 14, 14, 30, 'stone', 2); s.rect(112, 14, 4, 30, 'stone', 3); s.rect(110, 10, 18, 5, 'stone', 3);
  for (let y = 18; y < 44; y += 5) s.hline(112, 125, y, 'stone', 1);
  // 벽 (널판)
  planks(s, 10, 72, 140, 72, 'wall');
  s.rect(10, 72, 140, 5, 'wall', 1); // 처마 그림자
  s.vline(10, 72, 143, 'wall', 4); s.vline(149, 72, 143, 'wall', 1);
  s.rect(8, 72, 4, 72, 'wood', 2); s.rect(148, 72, 4, 72, 'wood', 1); // 모서리 기둥
  // 지붕
  roofTiles(s, 0, 20, 160, 76, 22, 'roof');
  // 문
  s.rect(68, 100, 24, 44, 'wood', 1); s.rect(70, 102, 20, 42, 'wood', 3);
  for (let x = 74; x < 90; x += 5) s.vline(x, 102, 143, 'wood', 2);
  s.rect(85, 122, 2, 3, 'gold', 3);
  if (night) s.rect(73, 106, 14, 8, 'win', 2); else s.rect(73, 106, 14, 8, 'glass', 1);
  s.hline(73, 86, 110, 'wood', 1);
  // 창문 2
  window(s, 26, 92, 24, 20, night); window(s, 110, 92, 24, 20, night);
  // 꽃 상자
  for (const x of [24, 108]) {
    s.rect(x, 117, 28, 5, 'wood', 2);
    for (let i = 0; i < 7; i++) { s.ell(x + 2 + i * 4, 115, 1.8, 1.6, i % 2 ? 'flowr' : 'flowy', { lo: 1 }); }
    s.hline(x, x + 27, 117, 'leaf', 2);
  }
  // 계단
  s.rect(64, 144, 32, 4, 'stone', 3); s.rect(66, 148, 28, 3, 'stone', 2);
  s.outline();
  return s;
}

/** 빨간 헛간 (4×3 타일) */
export function barn(night = false) {
  const s = new Spr(132, 150);
  s.rect(8, 60, 116, 84, 'barn', 3);
  for (let x = 8; x < 124; x += 8) { s.vline(x, 60, 143, 'barn', 1); s.vline(x + 1, 60, 143, 'barn', 4); }
  for (let j = 0; j < 6; j++) for (let i = 8; i < 124; i++) if (bayer(i, 143 - j) < 0.4 - j * 0.14) s.set(i, 143 - j, 'barn', 2);
  s.rect(8, 60, 116, 5, 'barn', 1);
  // 박공 지붕 (삼각 + 처마)
  s.poly([0, 64, 66, 8, 132, 64], 'roofg', { level: 2 });
  for (let y = 10; y < 64; y++) for (let x = 0; x < 132; x++) {
    if (!s.get(x, y) || s.rampAt(x, y) !== s.rampAt(66, 30)) continue;
    const ry = (y - 8) % 6;
    s.set(x, y, 'roofg', ry === 5 ? 1 : x < 66 ? 3 : 2);
  }
  s.line(0, 64, 66, 8, 'roofg', 4); s.line(66, 8, 132, 64, 'roofg', 0);
  s.hline(0, 131, 65, 'roofg', 0);
  // 다락 창
  s.rect(56, 30, 20, 18, 'wood', 1); s.rect(58, 32, 16, 14, night ? 'win' : 'hay', 2);
  if (!night) for (let x = 58; x < 74; x += 3) s.vline(x, 40, 45, 'hay', 3);
  // 큰 문 (X 버팀대)
  s.rect(42, 88, 48, 56, 'cloth', 2);
  s.rect(45, 91, 42, 53, 'barn', 2);
  s.line(45, 91, 86, 143, 'cloth', 2); s.line(86, 91, 45, 143, 'cloth', 2);
  s.line(46, 91, 87, 143, 'cloth', 3); s.line(87, 91, 46, 143, 'cloth', 3);
  s.vline(66, 91, 143, 'barn', 0);
  s.outline();
  return s;
}

/** 장터 가판대 (4×3 타일): 줄무늬 차양 + 농산물 상자 */
export function stall() {
  const s = new Spr(128, 112);
  // 기둥
  for (const x of [10, 114]) { s.rect(x, 26, 5, 70, 'wood', 2); s.vline(x, 26, 95, 'wood', 4); }
  // 차양 (빨강·흰 줄무늬, 앞쪽 물결 끝)
  for (let y = 12; y < 40; y++) for (let x = 4; x < 124; x++) {
    const t = (y - 12) / 28, xa = 4 + (1 - t) * 8, xb = 124 - (1 - t) * 8;
    if (x < xa || x > xb) continue;
    const stripe = Math.floor((x - 4) / 12) % 2;
    let l = stripe ? 2 : 1; if (y < 16) l += 1;
    if (y > 36) l = stripe ? 1 : 0;
    s.set(x, y, 'cloth', Math.min(3, l));
  }
  for (let x = 4; x < 124; x++) { const k = (x - 4) % 12; const yy = 40 + (k < 6 ? k >> 1 : (11 - k) >> 1); s.vline(x, 40, yy, 'cloth', Math.floor((x - 4) / 12) % 2 ? 2 : 0); }
  s.hline(12, 116, 12, 'cloth', 3);
  // 계산대
  s.rect(6, 70, 116, 30, 'wood', 3);
  for (let y = 70; y < 100; y += 6) s.hline(6, 121, y, 'wood', 1);
  s.rect(4, 64, 120, 7, 'wood', 4); s.hline(4, 123, 70, 'wood', 1);
  // 상자 3개 + 농산물
  const crates = [[14, 'carrot'], [50, 'tomato'], [86, 'cabbage']];
  for (const [x, R] of crates) {
    s.rect(x, 52, 30, 14, 'wood', 2); s.hline(x, x + 29, 52, 'wood', 4); s.hline(x, x + 29, 58, 'wood', 1);
    for (let i = 0; i < 6; i++) s.ell(x + 4 + i * 4.4, 51 - (i % 2) * 2, 3.2, 3, R, { lo: 1 });
    for (let i = 0; i < 4; i++) s.ell(x + 7 + i * 5, 47, 3, 2.8, R, { lo: 1 });
  }
  // 간판
  s.rect(44, 0, 40, 12, 'wood', 3); s.hline(44, 83, 0, 'wood', 4); s.hline(44, 83, 11, 'wood', 1);
  s.ell(54, 6, 3, 3, 'carrot', { lo: 1 }); s.ell(64, 6, 3, 3, 'tomato', { lo: 1 }); s.ell(74, 6, 3, 3, 'cabbage', { lo: 1 });
  s.outline();
  return s;
}

export function well() {
  const s = new Spr(56, 72);
  for (const x of [6, 46]) { s.rect(x, 12, 4, 40, 'wood', 2); s.vline(x, 12, 51, 'wood', 4); }
  s.poly([0, 20, 10, 2, 46, 2, 56, 20], 'roof', { level: 2 });
  roofTiles(s, 0, 4, 56, 20, 10, 'roof', 5);
  s.hline(10, 46, 26, 'wood', 2); s.rect(26, 26, 4, 10, 'iron', 2); s.rect(23, 34, 10, 8, 'wood', 2);
  s.ell(28, 56, 24, 12, 'stone', { lo: 1 });
  for (let i = 0; i < 9; i++) s.vline(6 + i * 5, 50, 66, 'stone', 1);
  s.ell(28, 52, 18, 6, 'water', { lo: 0, hi: 2 });
  s.ell(28, 50, 22, 4, 'stone', { lo: 3, clip: (x, y) => y < 50 });
  s.outline();
  return s;
}

export function lampPost(night = false) {
  const s = new Spr(20, 64);
  s.rect(8, 16, 4, 44, 'iron', 2); s.vline(8, 16, 59, 'iron', 3);
  s.rect(5, 58, 10, 4, 'iron', 1);
  s.rect(4, 4, 12, 12, 'iron', 1);
  s.rect(5, 5, 10, 10, night ? 'lamp' : 'glass', night ? 3 : 1);
  if (night) s.rect(7, 7, 6, 6, 'lamp', 3); else s.set(6, 6, 'glass', 3);
  s.poly([2, 5, 10, 0, 18, 5], 'iron', { level: 2 });
  s.outline();
  return s;
}

export function sign(text = '') {
  const s = new Spr(36, 34);
  s.rect(16, 18, 4, 16, 'wood', 2);
  s.rect(2, 2, 32, 18, 'wood', 3); s.hline(2, 33, 2, 'wood', 5); s.hline(2, 33, 19, 'wood', 1);
  for (let y = 6; y < 18; y += 4) s.hline(6, 30, y, 'wood', 2);
  s.outline();
  return s;
}

export function fence(mask) {
  // mask: 1 북, 2 동, 4 남, 8 서 — 연결된 쪽으로 가로대
  const s = new Spr(32, 40);
  const post = () => { s.rect(13, 14, 6, 24, 'wood', 3); s.vline(13, 14, 37, 'wood', 4); s.vline(18, 14, 37, 'wood', 1); s.rect(13, 12, 6, 2, 'wood', 5); };
  if (mask & 1) { s.rect(14, 0, 4, 16, 'wood', 2); }
  if (mask & 8) { s.rect(0, 18, 14, 4, 'wood', 3); s.rect(0, 28, 14, 4, 'wood', 3); s.hline(0, 13, 18, 'wood', 4); s.hline(0, 13, 28, 'wood', 4); }
  if (mask & 2) { s.rect(18, 18, 14, 4, 'wood', 3); s.rect(18, 28, 14, 4, 'wood', 3); s.hline(18, 31, 18, 'wood', 4); s.hline(18, 31, 28, 'wood', 4); }
  if (mask & 4) { s.rect(14, 36, 4, 4, 'wood', 2); }
  post();
  s.outline();
  return s;
}

export function hay() { const s = new Spr(34, 26); s.ell(17, 14, 15, 10, 'hay', { lo: 1 }); for (let x = 5; x < 30; x += 4) s.vline(x, 7, 21, 'hay', 2); s.vline(12, 4, 24, 'wood', 1); s.vline(22, 4, 24, 'wood', 1); s.outline(); return s; }
export function crate() { const s = new Spr(26, 26); s.rect(2, 4, 22, 20, 'wood', 3); s.rect(2, 4, 22, 3, 'wood', 4); s.line(3, 7, 22, 22, 'wood', 2); s.rect(2, 4, 2, 20, 'wood', 2); s.rect(22, 4, 2, 20, 'wood', 1); s.hline(2, 23, 23, 'wood', 1); s.outline(); return s; }
export function trough(full = false) { const s = new Spr(60, 24); s.rect(2, 6, 56, 14, 'wood', 3); s.hline(2, 57, 6, 'wood', 4); s.rect(5, 8, 50, 5, full ? 'hay' : 'wood', full ? 3 : 1); s.rect(4, 19, 4, 4, 'wood', 1); s.rect(52, 19, 4, 4, 'wood', 1); s.outline(); return s; }
export function mailbox() { const s = new Spr(20, 34); s.rect(8, 14, 4, 20, 'wood', 2); s.rect(2, 4, 16, 12, 'roofb', 3); s.ell(10, 5, 8, 3, 'roofb', { lo: 3, clip: (x, y) => y < 6 }); s.rect(15, 2, 2, 7, 'scarf', 2); s.outline(); return s; }
export function lily(seed = 1) { const s = new Spr(18, 12); s.ell(9, 6, 7, 4.5, 'leaf', { lo: 2 }); s.line(9, 6, 14, 3, 'water', 2); if (seed % 2) { s.ell(7, 5, 2, 1.6, 'rose', { lo: 2 }); } s.outline({ soft: false }); return s; }
export function reeds(seed = 1) { const r = rng(seed); const s = new Spr(20, 30); for (let i = 0; i < 5; i++) { const x = 4 + i * 3 + (r() * 2 | 0); const h = 14 + r() * 12; s.line(x, 29, x + (r() - 0.5) * 4, 29 - h, 'leaf', 2 + (i % 2)); if (i % 2) s.rect(x - 1, 29 - h - 1, 2, 5, 'wood', 2); } return s; }
export function flowers(seed = 1) { const r = rng(seed * 3); const s = new Spr(28, 18); const R = ['flowp', 'flowy', 'floww', 'flowr'][seed % 4]; for (let i = 0; i < 6; i++) { const x = 3 + r() * 22 | 0, y = 4 + r() * 10 | 0; s.vline(x, y + 1, y + 4, 'leaf', 2); s.set(x - 1, y, R, 1); s.set(x + 1, y, R, 1); s.set(x, y - 1, R, 2); s.set(x, y + 1, R, 1); s.set(x, y, 'flowy', 3); } return s; }
export function stump() { const s = new Spr(26, 20); s.ell(13, 13, 11, 6, 'bark', { lo: 1 }); s.ell(13, 9, 10, 4.5, 'wood', { lo: 3 }); s.ell(13, 9, 6, 2.6, 'wood', { level: 4 }); s.ell(13, 9, 2.6, 1.2, 'wood', { level: 3 }); s.outline(); return s; }

/* ───────────── 밭·작물 ───────────── */

/** 갈아 둔 밭 한 칸: 이랑 3줄 (wet: 물 준 상태) */
export function plotSoil(wet = false) {
  const s = new Spr(32, 32);
  const R = 'soil', o = wet ? -1 : 0;
  s.rect(1, 2, 30, 28, R, 2 + o);
  for (let k = 0; k < 3; k++) {
    const y = 4 + k * 9;
    s.rect(3, y, 26, 5, R, 3 + o); s.hline(3, 28, y, R, 4 + o); s.hline(3, 28, y + 5, R, 1 + o); s.hline(3, 28, y + 6, R, 1 + o);
  }
  s.hline(1, 30, 2, R, 1 + o); s.hline(1, 30, 29, R, 3 + o);
  if (wet) for (const [x, y] of [[6, 5], [20, 14], [11, 23], [25, 6]]) { s.set(x, y, 'water', 3); s.set(x + 1, y, 'water', 4); }
  return s;
}

/** 작물 단계별 도트 (32×44, 바닥 기준) stage 0 새싹 / 1 자람 / 2 다 익음 */
export function crop(kind, stage, { giant = false } = {}) {
  const s = new Spr(32, 44);
  const sprout = (x, y, h = 5) => { s.vline(x, y - h, y, 'leaf', 2); s.set(x - 1, y - h, 'leaf', 3); s.set(x - 2, y - h - 1, 'leaf', 4); s.set(x + 1, y - h + 1, 'leaf', 3); s.set(x + 2, y - h, 'leaf', 2); };
  const rows = [12, 21, 30].map((y) => y + 12);
  if (stage === 0) { for (const y of rows) for (const x of [9, 22]) sprout(x, y - 2, 3); s.outline(); return s; }
  if (kind === 'carrot') {
    for (const y of rows) for (const x of [9, 22]) {
      for (let i = -2; i <= 2; i++) s.line(x, y - 2, x + i * 2, y - (stage === 2 ? 12 : 8) + Math.abs(i), 'leaf', 2 + (i < 0 ? 1 : 0) + (i === 0 ? 1 : 0));
      if (stage === 2) { s.ell(x, y - 1, 3, 2.4, 'carrot', { lo: 1 }); s.set(x - 1, y - 2, 'carrot', 3); }
    }
  } else if (kind === 'cabbage') {
    for (const y of rows) for (const x of [9, 22]) {
      const r = stage === 2 ? 6 : 4;
      s.ell(x, y - r * 0.6, r + 1.5, r * 0.85, 'cabbage', { lo: 0, hi: 2 });
      s.ell(x, y - r * 0.7, r * 0.75, r * 0.65, 'cabbage', { lo: 2 });
      if (stage === 2) { s.line(x, y - r * 1.2, x - 3, y - 2, 'cabbage', 1); s.line(x + 1, y - r * 1.2, x + 4, y - 2, 'cabbage', 1); }
    }
  } else if (kind === 'tomato' || kind === 'strawberry') {
    const berry = kind === 'strawberry';
    for (const y of rows) for (const x of [9, 22]) {
      if (!berry) { s.vline(x + 4, y - (stage === 2 ? 18 : 12), y, 'wood', 3); }
      const h = berry ? 6 : stage === 2 ? 14 : 10;
      for (let k = 0; k < (berry ? 3 : 4); k++) s.ell(x + (k % 2 ? 2 : -2), y - 2 - k * (h / 4), berry ? 4 : 3.4, 2.4, 'leaf', { lo: 1 });
      if (stage === 2) {
        const R = berry ? 'tomato' : 'tomato';
        const pts = berry ? [[x - 3, y], [x + 3, y - 1]] : [[x - 2, y - 6], [x + 2, y - 11], [x - 1, y - 2]];
        for (const [fx, fy] of pts) {
          if (berry) { s.poly([fx - 2.5, fy - 3, fx + 2.5, fy - 3, fx, fy + 2], R, { level: 2 }); s.set(fx - 1, fy - 2, 'corn', 3); s.set(fx + 1, fy - 1, 'corn', 3); s.set(fx, fy - 3, 'leaf', 3); }
          else { s.ell(fx, fy, 2.8, 2.6, R, { lo: 1 }); s.set(fx, fy - 3, 'leaf', 3); }
        }
      }
    }
  } else if (kind === 'corn') {
    for (const x of [9, 22]) {
      const top = stage === 2 ? 4 : 16, base = 42;
      s.vline(x, top, base, 'cabbage', 2); s.vline(x + 1, top, base, 'cabbage', 1);
      for (let k = 0; k < 4; k++) { const y = base - 6 - k * ((base - top) / 4.5); s.line(x, y, x - 6 + (k % 2) * 12, y + 4, 'cabbage', 3); s.line(x, y + 1, x - 5 + (k % 2) * 10, y + 5, 'cabbage', 1); }
      if (stage === 2) { s.ell(x + 3, 22, 2.4, 5, 'corn', { lo: 1 }); s.ell(x + 3, 22, 2.8, 5.5, 'cabbage', { lo: 2, clip: (px) => px > x + 3 }); s.line(x, top, x - 2, top - 3, 'corn', 2); s.line(x + 1, top, x + 3, top - 3, 'corn', 3); }
    }
  }
  s.outline();
  return giant ? big(s) : s;
}
function big(s) { const o = new Spr(s.w, s.h); for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) { const sx = Math.floor(16 + (x - 16) / 1.3), sy = Math.floor(s.h - 1 - (s.h - 1 - y) / 1.3); const v = s.get(sx, sy); if (v) o.d[y * s.w + x] = v; } return o; }

export function weeds() { const s = new Spr(32, 32); for (const [x, y] of [[6, 10], [24, 8], [14, 20], [26, 26], [5, 27]]) { for (let i = -1; i <= 1; i++) s.line(x, y + 3, x + i * 2, y - 1 - (i === 0 ? 2 : 0), 'grass', 3 + (i === 0 ? 1 : 0)); } s.outline(); return s; }

/* ───────────── 아이콘 16×16 ───────────── */
export function icon(id) {
  const s = new Spr(16, 16);
  switch (id) {
    case 'coin': s.ell(8, 8, 6.5, 6.5, 'gold', { lo: 1 }); s.ell(8, 8, 4, 4, 'gold', { level: 2 }); s.vline(8, 5, 11, 'gold', 4); s.vline(7, 5, 11, 'gold', 1); break;
    case 'carrot': s.poly([4, 6, 11, 4, 13, 7, 5, 14], 'carrot', { level: 2 }); s.line(5, 7, 10, 5, 'carrot', 3); s.line(7, 9, 9, 8, 'carrot', 1); s.line(11, 5, 14, 1, 'leaf', 3); s.line(12, 5, 15, 3, 'leaf', 2); s.line(11, 4, 11, 1, 'leaf', 4); break;
    case 'cabbage': s.ell(8, 9, 6.5, 5.5, 'cabbage', { lo: 1 }); s.ell(8, 8, 3.5, 3, 'cabbage', { lo: 3 }); s.line(8, 4, 5, 13, 'cabbage', 1); s.line(9, 4, 12, 13, 'cabbage', 1); break;
    case 'tomato': s.ell(8, 9, 6, 5.4, 'tomato', { lo: 1 }); s.set(5, 6, 'tomato', 4); s.set(6, 6, 'tomato', 3); s.hline(6, 10, 4, 'leaf', 2); s.vline(8, 2, 4, 'leaf', 3); break;
    case 'strawberry': s.poly([2.5, 5, 13.5, 5, 8, 15], 'tomato', { level: 2 }); s.ell(8, 6, 5.5, 2.6, 'tomato', { lo: 2 }); for (const [x, y] of [[5, 7], [8, 8], [11, 7], [7, 11], [9, 10], [6, 9]]) s.set(x, y, 'corn', 3); s.hline(5, 11, 3, 'leaf', 3); s.vline(8, 1, 3, 'leaf', 2); break;
    case 'corn': s.ell(8, 8, 3.5, 6.5, 'corn', { lo: 1 }); for (let y = 3; y < 14; y += 2) s.hline(6, 10, y, 'corn', 1); s.poly([3, 15, 8, 6, 7, 15], 'cabbage', { level: 2 }); s.poly([13, 15, 8, 6, 9, 15], 'cabbage', { level: 3 }); break;
    case 'egg': s.ell(8, 9, 5, 6, 'cream', { lo: 1 }); s.set(6, 6, 'white', 4); break;
    case 'milk': s.rect(4, 5, 8, 10, 'white', 3); s.poly([4, 5, 8, 1, 12, 5], 'white', { level: 4 }); s.rect(4, 8, 8, 4, 'roofb', 3); s.vline(4, 5, 14, 'white', 4); break;
    case 'wool': s.ell(8, 8, 6.5, 6, 'wool', { lo: 1 }); s.line(3, 6, 13, 10, 'wool', 1); s.line(3, 10, 12, 5, 'wool', 1); break;
    case 'honey': s.ell(8, 10, 5.5, 5, 'gold', { lo: 1 }); s.rect(4, 3, 8, 3, 'wood', 3); s.hline(5, 10, 9, 'gold', 4); break;
    case 'seed': s.ell(8, 9, 5.5, 5.5, 'cream', { lo: 1 }); s.rect(5, 3, 6, 3, 'cream', 2); s.hline(4, 11, 3, 'scarf', 2); s.ell(8, 10, 2, 2, 'leaf', { lo: 2 }); break;
    case 'feed': s.rect(3, 4, 10, 11, 'hay', 2); s.hline(3, 12, 4, 'hay', 4); s.rect(5, 8, 6, 4, 'wood', 2); break;
    case 'treat': s.rect(4, 7, 8, 3, 'cream', 3); for (const [x, y] of [[3, 6], [3, 10], [12, 6], [12, 10]]) s.ell(x, y, 1.8, 1.8, 'cream', { lo: 2 }); break;
    case 'fish': s.ell(7, 8, 5.5, 3.5, 'water', { lo: 2 }); s.poly([11, 8, 15, 4, 15, 12], 'water', { level: 3 }); s.set(4, 7, 'eye', 0); s.hline(4, 9, 10, 'white', 3); break;
    case 'compost': s.ell(8, 10, 6, 4.5, 'soil', { lo: 2 }); s.set(6, 8, 'leaf', 3); s.set(10, 9, 'leaf', 2); break;
    case 'heart': s.ell(5.5, 6, 3.2, 3.2, 'tomato', { lo: 2 }); s.ell(10.5, 6, 3.2, 3.2, 'tomato', { lo: 2 }); s.poly([2.3, 7, 13.7, 7, 8, 14], 'tomato', { level: 2 }); s.set(4, 5, 'white', 4); break;
    case 'star': s.poly([8, 1, 10, 6, 15, 6, 11, 9, 13, 15, 8, 11, 3, 15, 5, 9, 1, 6, 6, 6], 'gold', { level: 3 }); s.set(8, 4, 'gold', 4); break;
    case 'sun': s.ell(8, 8, 4.5, 4.5, 'gold', { lo: 2 }); for (const [x, y] of [[8, 1], [8, 14], [1, 8], [14, 8], [3, 3], [13, 3], [3, 13], [13, 13]]) s.set(x, y, 'gold', 3); break;
    case 'moon': s.ell(8, 8, 5.5, 5.5, 'corn', { lo: 3 }); s.ell(11, 6, 4.5, 4.5, 'corn', { clip: () => false }); for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if ((x - 11) ** 2 + (y - 6) ** 2 < 18) s.set(x, y, null); break;
    case 'rain': s.ell(8, 6, 6, 3.5, 'stone', { lo: 3 }); for (const x of [4, 8, 12]) s.line(x, 11, x - 1, 14, 'water', 4); break;
    case 'rice': for (let i = 0; i < 5; i++) s.line(4 + i * 2, 15, 3 + i * 2.4, 3, 'hay', 2 + (i % 2)); for (const [x, y] of [[3, 3], [6, 2], [9, 2], [12, 3], [5, 5], [11, 5]]) s.ell(x, y, 1.3, 1.6, 'corn', { lo: 2 }); s.hline(3, 12, 10, 'scarf', 2); break;
    case 'bag': s.ell(8, 10, 6, 5, 'wood', { lo: 2 }); s.rect(6, 3, 4, 3, 'wood', 3); s.hline(5, 10, 5, 'scarf', 2); break;
    case 'quest': s.rect(3, 2, 10, 13, 'cream', 3); s.rect(3, 2, 10, 2, 'wood', 3); for (let y = 6; y < 14; y += 3) s.hline(5, 11, y, 'wood', 2); break;
    case 'gift': s.rect(3, 6, 10, 9, 'rose', 2); s.rect(2, 5, 12, 3, 'rose', 3); s.vline(8, 5, 14, 'gold', 3); s.ell(6, 3.5, 2, 1.5, 'gold', { lo: 2 }); s.ell(10, 3.5, 2, 1.5, 'gold', { lo: 2 }); break;
    default: {
      if (id.startsWith('fish_')) return icon('fish');
      s.ell(8, 8, 5, 5, 'stone', { lo: 2 });
    }
  }
  s.outline({ soft: false });
  return s;
}

/* ───────────── 효과 ───────────── */
export function bubble(kind) {
  // 머리 위 말풍선 아이콘 (! ? ♥ … 💤)
  const s = new Spr(16, 18);
  s.ell(8, 7.5, 7, 7, 'white', { level: 4 });
  s.poly([5, 12, 8, 17, 9, 12], 'white', { level: 4 });
  if (kind === '!') { s.rect(7, 3, 2, 6, 'scarf', 2); s.rect(7, 10, 2, 2, 'scarf', 2); }
  else if (kind === '?') { s.grid(5, 3, `.kkk.\nk...k\n...k.\n..k..\n.....\n..k..`, { k: ['roofb', 2] }); }
  else if (kind === 'heart') { s.ell(6, 6, 2, 2, 'tomato', { level: 2 }); s.ell(10, 6, 2, 2, 'tomato', { level: 2 }); s.poly([4, 7, 12, 7, 8, 12], 'tomato', { level: 2 }); }
  else if (kind === 'note') { s.vline(9, 3, 9, 'eye', 1); s.ell(7, 10, 2, 1.6, 'eye', { level: 1 }); s.hline(9, 11, 3, 'eye', 1); s.set(11, 4, 'eye', 1); }
  else if (kind === 'zz') { s.grid(4, 3, `kkkk.\n..k..\n.k...\nkkkk.\n.....\n..kkk\n...k.\n..kkk`, { k: ['roofb', 2] }); }
  else if (kind === 'dots') { for (const x of [4, 8, 12]) s.set(x, 8, 'eye', 1); }
  s.outline({ ink: ['ink', 1] });
  return s;
}

export function sparkle(f) {
  const s = new Spr(11, 11);
  const r = [1, 3, 5, 3][f % 4];
  s.hline(5 - r, 5 + r, 5, 'spark', 1); s.vline(5, 5 - r, 5 + r, 'spark', 1); s.set(5, 5, 'spark', 2);
  if (r > 2) { s.set(4, 4, 'spark', 1); s.set(6, 6, 'spark', 1); s.set(4, 6, 'spark', 1); s.set(6, 4, 'spark', 1); }
  return s;
}

export function bobber() { const s = new Spr(8, 10); s.ell(4, 6, 3, 3, 'cloth', { lo: 2 }); s.ell(4, 4, 3, 2, 'tomato', { lo: 2, clip: (x, y) => y < 5 }); s.vline(4, 0, 2, 'iron', 2); s.outline({ soft: false }); return s; }

/* ───────────── 논 ───────────── */

/** 논 바닥 (64×64 = 2×2칸). state: dry 갈라진 마른 논 / tilled 써레질한 진흙 */
export function paddyBase(state) {
  const s = new Spr(64, 64);
  const r = rng(state === 'dry' ? 11 : 23);
  if (state === 'dry') {
    s.rect(0, 0, 64, 64, 'soil', 3);
    // 마른 논의 갈라짐 (모서리에서 뻗는 금)
    for (let k = 0; k < 7; k++) {
      let x = r() * 64, y = r() * 64, a = r() * 6.28;
      for (let i = 0; i < 14; i++) { const nx = x + Math.cos(a) * 3, ny = y + Math.sin(a) * 3; s.line(x | 0, y | 0, nx | 0, ny | 0, 'soil', 1); x = nx; y = ny; a += (r() - 0.5) * 1.4; }
    }
    // 지난해 벼 그루터기 (줄 맞춰)
    for (let y = 6; y < 64; y += 10) for (let x = 5; x < 64; x += 10) { s.set(x, y, 'hay', 1); s.set(x + 1, y, 'hay', 2); }
  } else {
    s.rect(0, 0, 64, 64, 'soil', 1);
    for (let y = 3; y < 64; y += 6) { s.hline(0, 63, y, 'soil', 2); s.hline(0, 63, y + 1, 'soil', 0); }
  }
  // 둑 쪽 가장자리 그림자
  s.hline(0, 63, 0, 'soil', 0); s.hline(0, 63, 1, 'soil', state === 'dry' ? 2 : 0); s.vline(0, 0, 63, 'soil', 0);
  return s;
}

/** 논물 한 장 (투명도는 물 높이로) */
export function paddyWater(f = 0) {
  const s = new Spr(64, 64);
  s.rect(0, 0, 64, 64, 'water', 3);
  for (let y = 0; y < 64; y += 8) for (let x = ((y / 8) % 2) * 8 + f * 4; x < 64; x += 16) s.hline(x, x + 3, y + 3, 'water', 5);
  return s;
}

/** 벼 포기들 (64×80, 바닥 기준). stage 0 모 · 1 분얼기 · 2 이삭 · 3 황금(익음) */
export function ricePlants(stage) {
  const s = new Spr(64, 84);
  const H = [7, 13, 19, 18][stage];
  const R = stage === 3 ? 'hay' : 'leaf';
  for (let row = 0; row < 4; row++) for (let col = 0; col < 4; col++) {
    const bx = 8 + col * 16, by = 26 + row * 16; // 포기 밑동 (줄 맞춰 심은 모)
    const n = stage === 0 ? 3 : 5;
    for (let i = 0; i < n; i++) {
      const spread = (i - (n - 1) / 2) * (stage === 0 ? 1 : 1.6);
      const tx = bx + spread * (stage >= 2 ? 1.8 : 1.2), ty = by - H + Math.abs(spread) * 1.5;
      // 잎줄기: 아래는 그늘, 위는 빛
      const mx = Math.round((bx + tx) / 2), my = Math.round((by + ty) / 2);
      s.line(bx, by, mx, my, R, 1); s.line(mx, my, Math.round(tx), Math.round(ty), R, i % 2 ? 3 : 4);
      if (stage >= 2 && i % 2 === 0) {
        // 이삭: 끝에서 고개를 숙임 (익으면 더)
        const droop = stage === 3 ? 4 : 2;
        s.line(Math.round(tx), Math.round(ty), Math.round(tx + Math.sign(spread || 1) * 2), Math.round(ty + droop), stage === 3 ? 'corn' : 'cabbage', 3);
        s.set(Math.round(tx), Math.round(ty) - 1, stage === 3 ? 'corn' : 'cabbage', 4);
      }
    }
    s.hline(bx - 1, bx + 1, by + 1, 'soil', 0); // 밑동 그림자
  }
  return s;
}

/** 탈곡기 (2칸): 나무 몸통 + 원통 드럼 + 깔때기. f 는 드럼 회전 프레임 */
export function thresher(f = 0) {
  const s = new Spr(70, 60);
  s.rect(6, 22, 58, 30, 'wood', 3); for (let y = 22; y < 52; y += 6) s.hline(6, 63, y, 'wood', 1); s.hline(6, 63, 22, 'wood', 5);
  for (const x of [8, 58]) s.rect(x, 50, 5, 8, 'wood', 1);
  // 드럼 (가로 원통, 이빨 줄이 돌아감)
  s.rect(14, 10, 38, 16, 'iron', 2); s.hline(14, 51, 10, 'iron', 3); s.hline(14, 51, 25, 'iron', 0);
  for (let x = 16 + (f % 3) * 2; x < 51; x += 6) { s.vline(x, 12, 23, 'stone', 4); s.set(x, 17, 'stone', 5); }
  // 깔때기·바퀴 손잡이
  s.poly([50, 6, 66, 0, 66, 10, 52, 14], 'wood', { level: 2 });
  s.ell(10, 18, 6, 6, 'iron', { lo: 1 }); s.line(10, 18, 10 + Math.round(Math.cos(f) * 5), 18 + Math.round(Math.sin(f) * 5), 'gold', 3);
  // 쌀 받는 자루
  s.ell(56, 48, 7, 6, 'cream', { lo: 1 }); s.hline(51, 61, 43, 'scarf', 2);
  s.outline();
  return s;
}

/** 트랙터 밭 한 칸: 갈기 전(풀 섞인 묵은 땅) / 쟁기로 간 이랑 */
export function fieldCell(plowed) {
  const s = new Spr(32, 32);
  if (!plowed) {
    s.rect(0, 0, 32, 32, 'path', 3);
    for (const [x, y] of [[5, 6], [20, 4], [12, 18], [26, 22], [6, 26], [17, 11]]) { s.set(x, y, 'grass', 4); s.set(x - 1, y + 1, 'grass', 3); s.set(x + 1, y + 1, 'grass', 3); }
    s.hline(0, 31, 0, 'path', 2); s.vline(0, 0, 31, 'path', 2);
  } else {
    s.rect(0, 0, 32, 32, 'soil', 2);
    for (let y = 2; y < 32; y += 5) { s.hline(0, 31, y, 'soil', 4); s.hline(0, 31, y + 1, 'soil', 3); s.hline(0, 31, y + 3, 'soil', 1); }
  }
  return s;
}

/* ───────────── 트랙터 (스프라이트 스태킹) ─────────────
 * 복셀 모델을 높이별 단면으로 잘라 1px 씩 올려 쌓으면, 어느 방향으로 돌려도 도트가 유지되는 2.5D 물체가 됨.
 * 모델 좌표: x 앞(+)·뒤, y 왼쪽·오른쪽, z 높이. 미리 32방향으로 구워 둠
 */
const TR = { L: 34, W: 20, H: 22 };
function tractorVoxel(x, y, z, plowDown) {
  const yc = y - TR.W / 2 + 0.5;
  const ay = Math.abs(yc);
  // 뒷바퀴 (큰 바퀴, 축은 y)
  { const dx = x - 9, dz = z - 7.5, rr = dx * dx + dz * dz; if (ay >= 6.5 && ay <= 10 && rr <= 56) return rr > 30 ? ['iron', ay > 9.2 || z > 12 ? 2 : 1] : ['gold', rr < 6 ? 4 : 2]; }
  // 앞바퀴
  { const dx = x - 27, dz = z - 4, rr = dx * dx + dz * dz; if (ay >= 5 && ay <= 7.5 && rr <= 17) return rr > 7 ? ['iron', 1] : ['gold', 3]; }
  // 차체 (보닛·몸통)
  if (x >= 13 && x <= 31 && ay <= 4.5 && z >= 5 && z <= 11) {
    if (x >= 30) return ['iron', 2]; // 앞 그릴
    if (z === 11) return ['barn', 4];
    return ['barn', ay > 3.5 ? 2 : 3];
  }
  // 엔진룸 옆 노랑 줄
  if (x >= 14 && x <= 29 && ay > 4.5 && ay <= 5 && z === 8) return ['gold', 3];
  // 운전석 바닥·좌석
  if (x >= 5 && x <= 13 && ay <= 6 && z >= 7 && z <= 8) return ['iron', 2];
  if (x >= 6 && x <= 9 && ay <= 2.5 && z >= 9 && z <= 12) return z === 12 || x === 6 ? ['scarf', 2] : ['scarf', 1];
  // 핸들
  if (x === 13 && ay <= 1 && z >= 9 && z <= 13) return ['iron', 1];
  if (x >= 12 && x <= 14 && ay <= 2.5 && z === 14) return ['iron', 3];
  // 굴뚝
  if (x >= 23 && x <= 24 && yc >= 2 && yc <= 3 && z >= 11 && z <= 17) return ['iron', z === 17 ? 0 : 2];
  // 안전 프레임 (ROPS): 뒤쪽 두 기둥 + 위 가로대
  if (x >= 3 && x <= 4 && ay >= 5.5 && ay <= 6.5 && z >= 8 && z <= 20) return ['iron', 3];
  if (x >= 3 && x <= 4 && ay <= 6.5 && z >= 20 && z <= 21) return ['gold', 3];
  // 쟁기 (뒤): 내리면 땅에 닿고, 올리면 위로
  const pz = plowDown ? 0 : 4;
  if (x >= -2 && x <= 2 && ay <= 8 && z >= pz && z <= pz + 2) return ['stone', z === pz + 2 ? 4 : 2];
  if (x >= 2 && x <= 4 && ay <= 1 && z >= pz + 2 && z <= 7) return ['iron', 2];
  return null;
}
export function tractorStack(angle, plowDown) {
  const K = 1.6; // 복셀 1칸 = 1.6px (캐릭터와 크기를 맞춤)
  const S = 96, HZ = Math.ceil(TR.H * K);
  const s = new Spr(S, S + HZ);
  const fx = Math.sin(angle), fy = Math.cos(angle); // 앞 방향 (화면 좌표: 아래가 +y)
  const cx = S / 2, cy = S / 2 + HZ - 6;
  for (let zz = 0; zz < HZ; zz++) {
    const z = Math.floor(zz / K);
    for (let v = -S / 2; v < S / 2; v++) for (let u = -S / 2; u < S / 2; u++) {
      // 화면 점 (u,v) → 모델 좌표 (앞=x, 옆=y), 모델 중심 x=15
      const mx = (u * fx + v * fy) / K + 15, my = (-u * fy + v * fx) / K + TR.W / 2;
      const vx = Math.round(mx), vy = Math.round(my - 0.5);
      if (vx < -3 || vx > TR.L || vy < 0 || vy >= TR.W) continue;
      const c = tractorVoxel(vx, vy, z, plowDown);
      if (!c) continue;
      // 위가 비어 있으면 윗면 (한 단계 밝게)
      const top = zz === HZ - 1 || Math.floor((zz + 1) / K) !== z ? !tractorVoxel(vx, vy, z + 1, plowDown) : false;
      s.set(cx + u, cy + v - zz, c[0], c[1] + (top ? 1 : 0));
    }
  }
  s.outline();
  return s;
}
export const TRACTOR_ANCHOR = { x: 48, y: 48 + Math.ceil(TR.H * 1.6) - 6 };

/* ───────────── 새 지역 ───────────── */

// 작은 픽셀 글꼴 (간판용 영문·숫자 3×5)
const FONT = { K: '101101110101101', O: '111101101101111', A: '010101111101101', T: '111010010010010', S: '111100111001111', M: '101111111101101', R: '110101110101101', F: '111100110100100', '-': '000000111000000' };
function pixText(s, x, y, text, R, l) {
  [...text].forEach((ch, i) => { const g = FONT[ch]; if (!g) return; for (let k = 0; k < 15; k++) if (g[k] === '1') s.set(x + i * 4 + (k % 3), y + Math.floor(k / 3), R, l); });
}

/** 스마트팜 비닐하우스 (8×4칸): 반원 지붕 비닐 + 갈빗대, 안에 비치는 작물 줄 */
export function greenhouse() {
  const s = new Spr(256, 168);
  const top = 20, bot = 150;
  // 지붕 몸체 (위에서 본 반원통: 가운데가 밝고 양끝이 어두움)
  for (let y = top; y < bot - 24; y++) for (let x = 4; x < 252; x++) {
    const u = (x - 128) / 124; const sh = 1 - u * u;
    // 비닐: 가운데가 하늘을 비춰 밝고, 양 끝으로 갈수록 안이 비쳐 어두움 (흰색은 갈빗대와 가는 반사선만)
    let l = sh > 0.55 ? 2 : 1;
    if ((x - 4) % 24 === 0) l = 3;
    else if (Math.abs(u) < 0.03 && (y & 3) !== 0) l = 3;
    s.set(x, y, 'glass', l);
  }
  // 안에 비치는 작물 줄 (비닐 너머라 흐릿하게)
  for (let row = 0; row < 4; row++) for (let x = 14; x < 244; x += 6) { const y = top + 18 + row * 22; if ((x + row) % 24 > 2) { s.set(x, y, 'cabbage', 2); s.set(x + 1, y, 'cabbage', 1); s.set(x + 2, y + 1, 'cabbage', 1); } }
  // 앞면 (아치 모양 마구리)
  for (let y = bot - 24; y < bot; y++) for (let x = 4; x < 252; x++) s.set(x, y, 'glass', 1);
  s.poly([4, bot - 24, 128, bot - 40, 252, bot - 24], 'glass', { level: 2 });
  s.rect(112, bot - 30, 32, 30, 'iron', 1); s.rect(114, bot - 28, 13, 28, 'glass', 0); s.rect(129, bot - 28, 13, 28, 'glass', 0); // 미닫이문
  s.hline(4, 251, bot - 24, 'stone', 4); s.hline(4, 251, bot - 1, 'stone', 1);
  for (let x = 4; x < 252; x += 24) s.vline(x, bot - 24, bot - 1, 'stone', 4);
  // 환기창 줄 (지붕 옆)
  s.rect(10, top + 2, 236, 3, 'stone', 3);
  s.outline();
  return s;
}
export function sensorPole(f = 0) {
  const s = new Spr(28, 74);
  s.rect(12, 14, 4, 58, 'stone', 3); s.vline(12, 14, 71, 'stone', 4);
  s.rect(3, 24, 22, 16, 'iron', 1); s.rect(5, 26, 18, 12, 'glass', 0); // 조작반 화면
  for (let i = 0; i < 3; i++) s.hline(7, 7 + 4 + ((i * 3 + f) % 9), 28 + i * 3, 'mane', 3);
  s.ell(14, 8, 5, 5, 'stone', { lo: 2 }); s.set(14, 3, 'tomato', 3); s.vline(14, 0, 3, 'iron', 2); // 센서·안테나
  s.rect(8, 70, 12, 4, 'stone', 1);
  s.outline();
  return s;
}
export function solar() {
  const s = new Spr(128, 44);
  for (const x0 of [2, 66]) {
    s.poly([x0, 34, x0 + 6, 6, x0 + 60, 6, x0 + 54, 34], 'roofb', { level: 2 });
    for (let k = 1; k < 4; k++) s.line(x0 + 6 + k * 13.5, 6, x0 + k * 13.5, 34, 'stone', 3);
    for (let k = 1; k < 3; k++) { const y = 6 + k * 9.3; s.hline(Math.round(x0 + 6 - k * 2), Math.round(x0 + 60 - k * 2), Math.round(y), 'stone', 3); }
    s.line(x0 + 8, 9, x0 + 18, 9, 'glass', 3);
    s.rect(x0 + 26, 34, 4, 10, 'iron', 2);
  }
  s.outline();
  return s;
}
export function drone(f = 0) {
  const s = new Spr(30, 14);
  s.rect(11, 5, 8, 5, 'stone', 4); s.rect(13, 10, 4, 2, 'iron', 1); s.set(15, 7, 'tomato', 3);
  for (const x of [3, 22]) { s.hline(x, x + 5, 4, 'iron', 2); const w = f % 2 ? 4 : 2; s.hline(x + 3 - w, x + 2 + w, 2, 'stone', 4); }
  s.outline();
  return s;
}

/** KOAT 본관 (10×4칸): 흰 벽·유리창 격자·청록 띠·입구 캐노피·간판 */
export function koatHQ(night = false) {
  const s = new Spr(320, 196);
  // 탑 (가운데)
  s.rect(120, 4, 80, 60, 'wall', 4); s.rect(120, 4, 80, 4, 'stone', 3); s.vline(199, 4, 63, 'wall', 2);
  // 본체
  s.rect(4, 56, 312, 136, 'wall', 4);
  s.rect(4, 56, 312, 6, 'stone', 4); s.hline(4, 315, 62, 'stone', 2);
  s.vline(315, 56, 191, 'wall', 2); s.vline(4, 56, 191, 'wall', 3);
  // 청록 띠
  s.rect(4, 140, 312, 8, 'mane', 3); s.hline(4, 315, 140, 'mane', 4); s.hline(4, 315, 147, 'mane', 1);
  // 창문 격자 (층마다)
  for (let fl = 0; fl < 2; fl++) for (let x = 16; x < 304; x += 28) {
    if (x > 124 && x < 190) continue;
    const y = 72 + fl * 34;
    s.rect(x, y, 20, 24, night ? 'win' : 'glass', night ? (x * 7 + fl) % 3 === 0 ? 1 : 2 : 1);
    if (!night) { s.line(x + 2, y + 20, x + 14, y + 4, 'glass', 2); s.set(x + 2, y + 2, 'glass', 3); }
    s.hline(x, x + 19, y + 12, 'stone', 3);
  }
  for (let fl = 0; fl < 2; fl++) for (let x = 132; x < 188; x += 14) s.rect(x, 14 + fl * 22, 10, 16, night ? 'win' : 'glass', night ? 2 : 1);
  // 간판 KOAT
  s.rect(128, 116, 64, 18, 'mane', 1); pixText(s, 145, 122, 'KOAT', 'gold', 4);
  // 입구 (유리문 + 캐노피)
  s.rect(140, 150, 40, 42, night ? 'win' : 'glass', night ? 2 : 1); s.vline(160, 150, 191, 'iron', 2);
  s.rect(124, 146, 72, 6, 'stone', 4); s.hline(124, 195, 151, 'stone', 1);
  for (const x of [128, 190]) s.rect(x, 152, 3, 40, 'stone', 3);
  // 화단
  for (const x0 of [16, 216]) { s.rect(x0, 180, 88, 12, 'wood', 2); for (let i = 0; i < 14; i++) s.ell(x0 + 4 + i * 6, 178, 3, 2.6, i % 3 ? 'leaf' : 'flowr', { lo: 1 }); }
  s.outline();
  return s;
}
export function koatDesk() {
  const s = new Spr(64, 40);
  s.rect(2, 12, 60, 26, 'wall', 4); s.rect(2, 8, 60, 6, 'stone', 4); s.hline(2, 61, 13, 'stone', 1);
  s.rect(2, 24, 60, 4, 'mane', 3); pixText(s, 24, 16, 'KOAT', 'mane', 1);
  s.outline();
  return s;
}
const BOOTH_RAMP = ['apron', 'scarf', 'hay', 'mane', 'leaf', 'roofb'];
const BOOTH_ICON = [
  '..kkk..\n.kwwwk.\n.kwwwk.\n.kwwwk.\n..kkk..\n..kgk..\n..kkk..', // 전구 (기술)
  '...k...\n..kwk..\n..kwk..\n.kwwwk.\n.kwwwk.\nkk.k.kk\n..rrr..', // 로켓 (창업)
  '...g...\n..ggg..\n.g.g.g.\n...g...\n..kkk..\n.kwwwk.\n..kkk..', // 새싹·씨앗 (종자)
  'k.....k\n.k...k.\n..kwk..\n...w...\n...k...\n..kkk..\n.kkkkk.', // 안테나 (스마트)
  '.kkk...\n.kwk...\nkkkkkk.\nkwwwwk.\nkkkkkkk\n.kk..kk\n.kk..kk', // 트랙터 (농기계)
  '..kkk..\n.kgwgk.\nkggwggk\nkwwggwk\nkggwggk\n.kgggk.\n..kkk..', // 지구 (환경)
];
/** 본부 부스 (3×2칸): 본부 색 지붕·간판·아이콘 */
export function booth(i) {
  const R = BOOTH_RAMP[i];
  const s = new Spr(96, 92);
  s.rect(6, 36, 84, 52, 'wall', 4); s.vline(89, 36, 87, 'wall', 2);
  s.rect(6, 64, 84, 24, 'wood', 3); s.hline(6, 89, 64, 'wood', 5); s.hline(6, 89, 87, 'wood', 1); // 안내 탁자
  // 지붕 (본부 색, 앞 물결)
  for (let y = 12; y < 36; y++) for (let x = 0; x < 96; x++) { const t = (y - 12) / 24; if (x < 6 * (1 - t) || x > 95 - 6 * (1 - t)) continue; s.set(x, y, R, y < 16 ? 3 : (Math.floor(x / 12) % 2 ? 2 : 1)); }
  for (let x = 0; x < 96; x++) { const k = x % 12; s.vline(x, 36, 36 + (k < 6 ? k >> 1 : (11 - k) >> 1), R, Math.floor(x / 12) % 2 ? 2 : 1); }
  // 간판 + 아이콘
  s.rect(30, 0, 36, 14, R, 2); s.hline(30, 65, 0, R, 3); s.hline(30, 65, 13, R, 0);
  s.ell(48, 50, 11, 11, R, { lo: 2 });
  s.grid(45, 47, BOOTH_ICON[i], { k: ['ink', 1], w: ['white', 4], g: ['leaf', 3], r: ['scarf', 2] });
  for (const x of [6, 86]) s.rect(x, 36, 4, 52, 'iron', 2);
  s.outline();
  return s;
}
export function fountain(f = 0) {
  const s = new Spr(64, 60);
  s.ell(32, 40, 30, 16, 'stone', { lo: 2 }); s.ell(32, 38, 24, 11, 'water', { lo: 2, hi: 4 });
  s.ell(32, 36, 22, 9, 'water', { lo: 3, clip: (x, y) => y < 34 });
  s.rect(28, 14, 8, 24, 'stone', 3); s.ell(32, 14, 10, 4, 'stone', { lo: 3 });
  for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI + (f % 2) * 0.25; s.line(32, 10, Math.round(32 + Math.cos(a) * 12), Math.round(10 - Math.sin(a) * 8), 'water', 5); }
  s.outline();
  return s;
}
export function flag(R = 'mane') { const s = new Spr(28, 84); s.rect(4, 4, 3, 80, 'stone', 4); s.ell(5.5, 3, 2.4, 2.4, 'gold', { lo: 2 }); s.poly([7, 8, 27, 12, 27, 30, 7, 28], R, { level: 2 }); s.line(8, 12, 26, 16, R, 3); s.rect(1, 80, 9, 4, 'stone', 2); s.outline(); return s; }

/** 낚시 가게 (4×2칸): 나무 오두막·파란 지붕·물고기 간판 */
export function fishShop() {
  const s = new Spr(128, 104);
  planks(s, 6, 44, 116, 58, 'wood');
  s.poly([0, 46, 14, 10, 114, 10, 128, 46], 'roofb', { level: 2 });
  roofTiles(s, 0, 12, 128, 46, 14, 'roofb', 6);
  s.rect(50, 64, 28, 38, 'wood', 1); s.rect(52, 66, 24, 36, 'wood', 2); s.rect(70, 82, 2, 3, 'gold', 3);
  window(s, 16, 60, 20, 16, false); window(s, 92, 60, 20, 16, false);
  // 물고기 간판
  s.rect(44, 0, 40, 14, 'wood', 3); s.ell(60, 7, 9, 4, 'water', { lo: 2 }); s.poly([68, 7, 75, 3, 75, 11], 'water', { level: 3 }); s.set(55, 6, 'eye', 0);
  // 그물·통
  s.rect(110, 86, 14, 16, 'wood', 2); s.hline(110, 123, 90, 'iron', 1); s.hline(110, 123, 97, 'iron', 1);
  s.outline();
  return s;
}
export function board() { const s = new Spr(40, 44); for (const x of [6, 31]) s.rect(x, 18, 3, 26, 'wood', 2); s.rect(2, 2, 36, 26, 'wood', 3); s.rect(5, 5, 30, 20, 'cream', 3); for (let y = 8; y < 23; y += 4) s.hline(8, 8 + ((y * 7) % 18) + 6, y, 'wood', 1); s.rect(24, 12, 8, 6, 'water', 3); s.outline(); return s; }
export function boat() { const s = new Spr(60, 28); s.poly([2, 10, 58, 10, 50, 24, 10, 24], 'wood', { level: 2 }); s.poly([5, 10, 55, 10, 50, 16, 10, 16], 'wood', { level: 1 }); s.hline(2, 57, 10, 'wood', 4); s.rect(26, 12, 8, 3, 'wood', 3); s.line(18, 6, 34, 20, 'wood', 3); s.outline(); return s; }

/** 건설 부지 (4×3칸): 빈 땅(말뚝·줄) / 비계 / 완성 건물 */
export function siteLot() {
  const s = new Spr(128, 100);
  s.rect(2, 8, 124, 90, 'path', 2);
  for (const [x, y] of [[4, 8], [122, 8], [4, 94], [122, 94]]) { s.rect(x - 1, y - 8, 3, 12, 'wood', 3); }
  for (let x = 6; x < 122; x += 4) { s.set(x, 4 + ((x >> 2) % 2), 'cloth', 1); s.set(x, 90 + ((x >> 2) % 2), 'cloth', 1); }
  for (let y = 8; y < 94; y += 4) { s.set(3 + ((y >> 2) % 2), y, 'cloth', 1); s.set(122 + ((y >> 2) % 2), y, 'cloth', 1); }
  for (let k = 0; k < 6; k++) s.rect(20 + k * 16, 60 + (k % 2) * 12, 6, 2, 'path', 4);
  s.outline();
  return s;
}
export function scaffold() {
  const s = new Spr(128, 132);
  for (const x of [8, 44, 84, 118]) s.rect(x, 8, 3, 122, 'wood', 3);
  for (let y = 20; y < 130; y += 26) { s.rect(6, y, 116, 3, 'wood', 4); s.line(8, y, 44, y + 26, 'wood', 2); s.line(84, y, 118, y + 26, 'wood', 2); }
  s.outline();
  return s;
}
/** 완성 건물 5종: pavilion 정자 · tank 물탱크 · stand 직판장 · glasshouse 유리 온실 · mill 풍차 방앗간 */
export function building(type, night = false) {
  const s = new Spr(128, 132);
  if (type === 'pavilion') {
    for (const x of [16, 52, 74, 108]) { s.rect(x, 58, 6, 66, 'barn', 2); s.vline(x, 58, 123, 'barn', 3); }
    s.rect(10, 112, 108, 14, 'wood', 3); s.hline(10, 117, 112, 'wood', 5);
    // 기와 지붕 (처마 끝이 살짝 올라감)
    s.poly([0, 62, 8, 52, 20, 24, 108, 24, 120, 52, 128, 62, 104, 58, 24, 58], 'stone', { level: 2 });
    roofTiles(s, 6, 26, 122, 58, 16, 'stone', 5);
    s.rect(14, 58, 100, 6, 'mane', 2); for (let x = 16; x < 112; x += 8) s.rect(x, 58, 4, 6, 'gold', 3); // 단청
    s.hline(20, 108, 24, 'stone', 4);
  } else if (type === 'tank') {
    for (const x of [30, 92]) { s.rect(x, 60, 5, 66, 'iron', 2); }
    s.line(34, 70, 92, 120, 'iron', 1); s.line(92, 70, 34, 120, 'iron', 1);
    s.rect(18, 14, 92, 54, 'roofb', 3); s.ell(64, 14, 46, 10, 'roofb', { lo: 3 }); s.ell(64, 68, 46, 8, 'roofb', { lo: 1, clip: (x, y) => y > 66 });
    for (let x = 22; x < 108; x += 12) s.vline(x, 18, 66, 'roofb', 2);
    s.rect(40, 30, 48, 14, 'white', 4); s.ell(64, 37, 4, 5, 'water', { lo: 3 }); // 물방울 표시
    s.line(110, 20, 110, 126, 'iron', 2); for (let y = 24; y < 126; y += 8) s.hline(106, 110, y, 'iron', 2); // 사다리
  } else if (type === 'stand') {
    planks(s, 6, 64, 116, 62, 'wood');
    for (let y = 34; y < 62; y++) for (let x = 0; x < 128; x++) s.set(x, y, 'cloth', Math.floor(x / 14) % 2 ? 2 : 1);
    for (let x = 0; x < 128; x++) { const k = x % 14; s.vline(x, 62, 62 + (k < 7 ? k >> 1 : (13 - k) >> 1), 'cloth', Math.floor(x / 14) % 2 ? 2 : 0); }
    s.rect(30, 12, 68, 20, 'leaf', 2); s.hline(30, 97, 12, 'leaf', 4); pixText(s, 50, 18, 'FARM', 'white', 4);
    for (let i = 0; i < 4; i++) { const x = 12 + i * 28; s.rect(x, 84, 22, 14, 'wood', 2); for (let k = 0; k < 4; k++) s.ell(x + 4 + k * 5, 82, 3, 2.6, ['carrot', 'tomato', 'cabbage', 'corn'][i], { lo: 1 }); }
  } else if (type === 'glasshouse') {
    s.rect(8, 44, 112, 82, 'glass', 2);
    s.poly([4, 46, 64, 8, 124, 46], 'glass', { level: 3 });
    for (let x = 8; x < 120; x += 14) s.vline(x, 44, 125, 'stone', 4);
    for (let y = 58; y < 126; y += 22) s.hline(8, 119, y, 'stone', 4);
    s.line(4, 46, 64, 8, 'stone', 4); s.line(64, 8, 124, 46, 'stone', 4);
    for (let k = 0; k < 10; k++) s.ell(16 + k * 10.5, 112, 4, 6, 'leaf', { lo: 2 }); // 안의 화분
    for (let k = 0; k < 6; k++) s.ell(20 + k * 17, 80, 5, 4, 'flowr', { lo: 1 });
    if (night) s.rect(10, 60, 108, 40, 'win', 1);
  } else if (type === 'mill') {
    s.poly([36, 128, 48, 28, 80, 28, 92, 128], 'wall', { level: 3 });
    for (let y = 40; y < 128; y += 12) s.hline(Math.round(36 + (128 - y) * 0.12), Math.round(92 - (128 - y) * 0.12), y, 'wall', 2);
    s.poly([42, 30, 64, 6, 86, 30], 'roof', { level: 2 });
    s.rect(56, 100, 16, 28, 'wood', 2); window(s, 58, 60, 12, 12, night);
  }
  s.outline();
  return s;
}
export function millBlades(f = 0) {
  const s = new Spr(96, 96);
  for (let k = 0; k < 4; k++) {
    const a = f * (Math.PI / 16) + k * (Math.PI / 2);
    const cx = 48, cy = 48, ex = cx + Math.cos(a) * 44, ey = cy + Math.sin(a) * 44;
    s.line(cx, cy, Math.round(ex), Math.round(ey), 'wood', 2);
    const px = -Math.sin(a), py = Math.cos(a);
    s.poly([cx + Math.cos(a) * 12, cy + Math.sin(a) * 12, ex, ey, ex + px * 9, ey + py * 9, cx + Math.cos(a) * 12 + px * 9, cy + Math.sin(a) * 12 + py * 9], 'cloth', { level: 2 });
  }
  s.ell(48, 48, 5, 5, 'wood', { lo: 1 });
  s.outline();
  return s;
}
export function lookout() {
  const s = new Spr(64, 60);
  s.rect(4, 30, 56, 14, 'wood', 3); for (let x = 4; x < 60; x += 8) s.vline(x, 30, 43, 'wood', 2); s.hline(4, 59, 30, 'wood', 5);
  for (const x of [4, 56]) s.rect(x, 42, 4, 16, 'wood', 1);
  s.rect(4, 18, 56, 3, 'wood', 4); for (let x = 6; x < 60; x += 10) s.vline(x, 18, 30, 'wood', 2); // 난간
  // 망원경
  s.vline(32, 10, 30, 'iron', 2); s.line(26, 8, 40, 4, 'gold', 3); s.line(26, 9, 40, 5, 'gold', 2); s.ell(41, 4, 2, 2, 'glass', { level: 2 });
  s.outline();
  return s;
}
export function chest(open = false) {
  const s = new Spr(30, 26);
  s.rect(3, 11, 24, 13, 'wood', 3); s.hline(3, 26, 23, 'wood', 1);
  if (open) { s.rect(3, 4, 24, 6, 'wood', 2); s.rect(5, 10, 20, 3, 'gold', 4); s.set(10, 9, 'spark', 2); }
  else { s.ell(15, 11, 12, 6, 'wood', { lo: 3, clip: (x, y) => y < 12 }); s.rect(3, 11, 24, 2, 'gold', 2); }
  for (const x of [8, 21]) s.vline(x, open ? 11 : 6, 23, 'gold', 2);
  s.rect(13, 13, 4, 4, 'gold', 4); s.set(15, 15, 'ink', 0);
  s.outline();
  return s;
}
