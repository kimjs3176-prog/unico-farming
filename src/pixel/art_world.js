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
