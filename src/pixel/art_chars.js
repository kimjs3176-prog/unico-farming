import { Spr } from './pxl.js';

/**
 * 캐릭터 도트: 두 발 이등신 유니코 (4방향 × 걷기 4프레임), 반려견, 가축
 * 큰 머리(이등신)·흰 몸·청록 곱슬 갈기·주황 띠 금색 뿔·분홍 주둥이·큰 검은 눈·새싹 머리핀
 */
export const CW = 40, CH = 54;

/** 이미 칠한 곳 위에만 그리는 1px 윤곽 (부위가 겹치는 경계선) */
function contour(s, cx, cy, rx, ry, r, l) {
  s.ell(cx, cy, rx + 1, ry + 1, r, { level: l, clip: (x, y) => s.get(x, y) !== 0 });
}

function eye(s, x, y, flip = false) {
  // 5줄 세로 타원 눈 + 왼쪽 위 반짝임 2개
  s.grid(x, y, flip ? `
    .kk.
    kkwk
    kkkk
    kkkk
    kpkk
    .kk.` : `
    .kk.
    kwkk
    kkkk
    kkkk
    kkpk
    .kk.`, { k: ['eye', 0], w: ['white', 4], p: ['eye', 2] });
}

function curl(s, x, y, r, mane, opt = {}) { s.ell(x, y, r, r * (opt.sq ?? 0.95), mane, { dither: 0.18, ...opt }); }

/**
 * @param dir 'down' | 'up' | 'right' | 'left'
 * @param f 0..3 (0·2 서기, 1·3 디딤)
 * @param o { mane:'mane', body:'white', scarf:'scarf'|null, apron, glasses, shawl, small }
 */
export function unico(dir, f = 0, o = {}) {
  if (dir === 'left') return unico('right', f, o).flipped();
  const s = new Spr(CW, CH);
  const M = o.mane || 'mane', B = o.body || 'white';
  const step = f === 1 ? 1 : f === 3 ? -1 : 0;
  const b = step ? 1 : 0; // 디딤 프레임에서 1px 내려앉음
  const hy = 20 + b; // 머리 중심

  if (dir === 'down' || dir === 'up') {
    const up = dir === 'up';
    // 옆 갈기 (머리 뒤)
    curl(s, 7.5, hy + 1, 4, M); curl(s, 32.5, hy + 1, 4, M);
    curl(s, 8.5, hy + 8, 3.2, M); curl(s, 31.5, hy + 8, 3.2, M);
    // 다리 (디딤발은 앞으로 = 1px 길게, 다른 발은 들림)
    const ly = (side) => 45 + (step === side ? 0 : step ? -1 : 0);
    for (const [x, side] of [[15.5, 1], [24.5, -1]]) {
      s.ell(x, ly(side), 3.4, 4.2, B, { lo: 1 });
      s.rect(Math.round(x - 3), ly(side) + 2, 6, 2, 'mane', 1);
      s.hline(Math.round(x - 2), Math.round(x + 2), ly(side) + 2, 'mane', 2);
    }
    // 위를 볼 땐 꼬리가 앞(화면 쪽)으로
    // 몸통
    s.ell(20, 37 + b, 8.5, 7.8, B, { dither: 0.1 });
    if (!up) s.ell(20, 39 + b, 4.5, 4, B, { level: 4, clip: (x, y) => s.get(x, y) !== 0 }); // 배 하이라이트
    if (o.apron) { s.ell(20, 39 + b, 6.5, 5.5, o.apron, { lo: 1, clip: (x, y) => y > 34 + b }); s.hline(14, 26, 34 + b, o.apron, 1); }
    // 팔 (걸을 때 반대로 흔들기)
    for (const [x, side] of [[10.5, 1], [29.5, -1]]) {
      const ay = 36 + b + (step ? -step * side : 0);
      contour(s, x, ay, 3.1, 4.6, B, 1);
      s.ell(x, ay, 3.1, 4.6, B, { lo: 1 });
    }
    if (o.scarf) {
      s.ell(20, 30.5 + b, 9.5, 2.6, o.scarf, { lo: 1 });
      if (!up) { s.ell(25.5, 34 + b, 2.2, 3, o.scarf, { lo: 1 }); }
    }
    if (o.shawl) { s.ell(20, 31 + b, 10.5, 3.6, o.shawl, { lo: 1 }); }
    if (up) { // 꼬리
      curl(s, 20, 43 + b, 4.2, M); curl(s, 17.5, 46 + b, 2.6, M); curl(s, 22.5, 46.5 + b, 2.4, M);
    }
    // 머리
    contour(s, 20, hy, 12.8, 10.8, B, 1);
    s.ell(20, hy, 12.8, 10.8, B, { dither: 0.1 });
    // 귀
    for (const sx of [1, -1]) {
      const X = (v) => 20 + sx * v;
      s.poly([X(13), hy - 6, X(10), hy - 16, X(6), hy - 9], B, { level: 3 });
      s.poly([X(12), hy - 7.5, X(10), hy - 13, X(8), hy - 9], up ? B : 'pink', { level: up ? 2 : 2 });
    }
    if (up) {
      // 뒷모습: 정수리에서 목덜미까지 흘러내리는 곱슬 갈기 (머리 흰 부분이 둘레로 보임)
      curl(s, 15, hy - 8, 4.2, M); curl(s, 25, hy - 8, 4.2, M);
      curl(s, 20, hy - 6, 5.6, M);
      curl(s, 20, hy + 0.5, 6, M);
      curl(s, 16, hy + 5, 4.2, M); curl(s, 24, hy + 5, 4.2, M);
      curl(s, 20, hy + 8.5, 4.4, M);
    } else {
      // 앞머리
      curl(s, 13.5, hy - 8.5, 4.4, M); curl(s, 26.5, hy - 8.5, 4.4, M);
      curl(s, 9.5, hy - 4, 3.4, M); curl(s, 30.5, hy - 4, 3.4, M);
      curl(s, 18, hy - 10, 3.4, M); curl(s, 22.5, hy - 10, 3.2, M);
    }
    // 뿔 (주황 띠 2줄)
    s.poly([16.6, hy - 9, 20, hy - 20.5, 23.4, hy - 9], 'gold', { grad: 'y', lo: 1, hi: 4 });
    s.vline(19, hy - 17, hy - 10, 'gold', 4);
    s.hline(18, 21, hy - 12, 'band', 2); s.hline(19, 21, hy - 15, 'band', 2);
    s.set(21, hy - 12, 'band', 1); s.set(21, hy - 15, 'band', 1);
    if (!up) {
      // 새싹 머리핀
      s.ell(30.5, hy - 11, 2.4, 1.5, 'leaf', { lo: 2 }); s.ell(33.5, hy - 12.5, 2.2, 1.4, 'leaf', { lo: 2 });
      s.set(31, hy - 10, 'leaf', 1); s.set(32, hy - 10, 'leaf', 1);
      // 주둥이
      s.ell(20, hy + 6, 7, 4.3, 'pink', { lo: 1, hi: 3 });
      s.set(17, hy + 5, 'pink', 0); s.set(23, hy + 5, 'pink', 0);
      s.hline(19, 21, hy + 8, 'pink', 1);
      // 눈
      eye(s, 12, hy - 4); eye(s, 24, hy - 4, true);
      // 볼
      s.hline(8, 10, hy + 3, 'pink', 2); s.hline(30, 32, hy + 3, 'pink', 2);
      if (o.glasses) {
        for (const ex of [11, 23]) { s.hline(ex, ex + 5, hy - 5, 'iron', 1); s.vline(ex, hy - 5, hy + 2, 'iron', 1); s.vline(ex + 5, hy - 5, hy + 2, 'iron', 1); s.hline(ex, ex + 5, hy + 2, 'iron', 1); }
        s.hline(17, 22, hy - 3, 'iron', 1);
      }
    }
  } else {
    // ── 오른쪽 보기 ──
    // 꼬리 (뒤쪽)
    curl(s, 8.5, 39 + b, 4.4, M); curl(s, 5.5, 43 + b, 3, M); curl(s, 9.5, 45 + b, 2.6, M);
    // 뒷다리·앞다리 (걷기: 앞뒤로 벌림)
    const legs = [[20 - step * 2.5, 0], [20 + step * 2.5, 1]];
    for (const [x, near] of legs) {
      const ly = 45 + (step && ((x > 20) === (step > 0)) ? 0 : 0);
      s.ell(x, ly, 3.3, 4.2, B, { lo: near ? 1 : 0, hi: near ? 4 : 2 });
      s.rect(Math.round(x - 3), ly + 2, 6, 2, 'mane', near ? 1 : 0);
      s.hline(Math.round(x - 2), Math.round(x + 2), ly + 2, 'mane', near ? 2 : 1);
    }
    s.ell(19.5, 37 + b, 8, 7.8, B, { dither: 0.1 });
    if (o.apron) s.ell(22, 39 + b, 5.5, 5.5, o.apron, { lo: 1, clip: (x, y) => y > 34 + b && x > 17 });
    if (o.scarf) { s.ell(20, 30.5 + b, 8.5, 2.6, o.scarf, { lo: 1 }); s.ell(15, 34 + b, 2.2, 3.2, o.scarf, { lo: 1 }); }
    if (o.shawl) s.ell(19, 31 + b, 9.5, 3.6, o.shawl, { lo: 1 });
    // 팔 (앞뒤로 흔들기)
    const ax = 20.5 - step * 2;
    contour(s, ax, 36 + b, 3, 4.5, B, 1);
    s.ell(ax, 36 + b, 3, 4.5, B, { lo: 1 });
    // 뒤 갈기
    curl(s, 10.5, hy - 1, 4.8, M); curl(s, 10, hy + 6, 4, M); curl(s, 12.5, hy + 11, 3.2, M);
    // 머리
    contour(s, 20.5, hy, 11.8, 10.4, B, 1);
    s.ell(20.5, hy, 11.8, 10.4, B, { dither: 0.1 });
    // 귀
    s.poly([13, hy - 6, 14.5, hy - 16, 19, hy - 9], B, { level: 3 });
    s.poly([14.2, hy - 8, 15, hy - 13, 17.4, hy - 9], 'pink', { level: 2 });
    // 주둥이 (앞으로 튀어나옴)
    contour(s, 29.5, hy + 5, 6.2, 4.4, 'pink', 1);
    s.ell(29.5, hy + 5, 6.2, 4.4, 'pink', { lo: 1, hi: 3 });
    s.set(34, hy + 4, 'pink', 0); s.hline(30, 33, hy + 8, 'pink', 1);
    // 갈기 앞머리
    curl(s, 16, hy - 9, 4.4, M); curl(s, 21, hy - 10, 3.6, M); curl(s, 12.5, hy - 5, 3.6, M);
    // 뿔 (앞으로 기울어짐)
    s.poly([21.5, hy - 9, 27.5, hy - 20, 25.5, hy - 8], 'gold', { grad: 'y', lo: 1, hi: 4 });
    s.line(22, hy - 10, 26, hy - 18, 'gold', 4);
    s.line(22, hy - 12, 25, hy - 13, 'band', 2); s.line(24, hy - 15, 26, hy - 16, 'band', 2);
    // 새싹 머리핀 (뒤쪽)
    s.ell(14, hy - 12, 2.3, 1.4, 'leaf', { lo: 2 }); s.ell(11, hy - 13, 2.1, 1.4, 'leaf', { lo: 2 });
    // 눈·볼
    eye(s, 23, hy - 4, true);
    s.hline(22, 24, hy + 3, 'pink', 2);
    if (o.glasses) { s.hline(22, 28, hy - 5, 'iron', 1); s.vline(22, hy - 5, hy + 2, 'iron', 1); s.vline(28, hy - 5, hy + 2, 'iron', 1); s.hline(22, 28, hy + 2, 'iron', 1); s.hline(14, 22, hy - 4, 'iron', 1); }
  }
  s.outline();
  if (o.small) return shrink(s);
  return s;
}

/** 꼬마: 같은 그림을 세로로 살짝 눌러 키를 줄임 (머리는 유지, 몸통 줄 몇 개 제거) */
function shrink(s) {
  const out = new Spr(s.w, s.h);
  const drop = new Set([30, 33, 36, 39]);
  let ty = s.h - 1;
  for (let y = s.h - 1; y >= 0; y--) {
    if (drop.has(y)) continue;
    for (let x = 0; x < s.w; x++) out.d[ty * s.w + x] = s.d[y * s.w + x];
    ty--;
  }
  return out;
}

/** 시바견: 32x26, 방향 4 × 걷기 2 */
export function shiba(dir, f = 0) {
  if (dir === 'left') return shiba('right', f).flipped();
  const s = new Spr(32, 28);
  const b = f ? 1 : 0;
  if (dir === 'right') {
    // 말린 꼬리
    s.ell(7, 12 + b, 3.6, 3.4, 'shiba', { lo: 1 }); s.ell(7.5, 11.5 + b, 1.6, 1.4, 'cream', { level: 2 });
    // 다리
    for (const [x, near] of [[10 + (f ? 1 : -1), 0], [21 + (f ? -1 : 1), 0], [12 + (f ? -1 : 1), 1], [23 + (f ? 1 : -1), 1]]) {
      s.rect(x - 1, 19, 3, 6, 'shiba', near ? 2 : 1); s.rect(x - 1, 24, 3, 1, 'cream', near ? 2 : 1);
    }
    // 몸통
    s.ell(16, 16 + b, 9, 5.2, 'shiba');
    s.ell(17, 19 + b, 6, 2.4, 'cream', { lo: 1, clip: (x, y) => s.get(x, y) !== 0 });
    // 머리
    contour(s, 24, 10 + b, 5.6, 5.2, 'shiba', 1);
    s.ell(24, 10 + b, 5.6, 5.2, 'shiba');
    s.ell(27.5, 12.5 + b, 3, 2.3, 'cream', { lo: 1 });
    s.set(30, 11 + b, 'eye', 0); // 코
    s.poly([20, 6 + b, 21.5, 0 + b, 24, 5 + b], 'shiba', { level: 2 }); s.poly([24, 5 + b, 26, 0 + b, 27, 6 + b], 'shiba', { level: 3 });
    s.set(22, 3 + b, 'cream', 1);
    s.grid(25, 8 + b, `
      kk
      wk`, { k: ['eye', 0], w: ['white', 4] });
    s.set(23, 11 + b, 'pink', 2);
    s.hline(19, 21, 15 + b, 'scarf', 2); s.hline(19, 21, 16 + b, 'scarf', 1); // 빨간 목줄
  } else {
    const up = dir === 'up';
    for (const [x, sh] of [[11, f ? -1 : 0], [20, f ? 0 : -1]]) { s.rect(x - 1, 19 + sh, 3, 6, 'shiba', 1); s.rect(x - 1, 24 + sh, 3, 1, 'cream', 2); }
    s.ell(16, 17 + b, 7, 6, 'shiba');
    if (!up) s.ell(16, 19 + b, 3.8, 3.5, 'cream', { lo: 1, clip: (x, y) => s.get(x, y) !== 0 });
    if (up) { s.ell(16, 21 + b, 3.6, 3.2, 'shiba', { lo: 1 }); s.ell(16, 20.5 + b, 1.6, 1.4, 'cream', { level: 2 }); }
    contour(s, 16, 10 + b, 6.6, 5.8, 'shiba', 1);
    s.ell(16, 10 + b, 6.6, 5.8, 'shiba');
    for (const sx of [1, -1]) { const X = (v) => 16 + sx * v; s.poly([X(6), 7 + b, X(5), 0 + b, X(1.5), 5 + b], 'shiba', { level: 3 }); s.set(X(4.5) | 0, 4 + b, up ? 'shiba' : 'cream', 1); }
    if (!up) {
      s.ell(16, 13 + b, 3.8, 2.6, 'cream', { lo: 1 });
      s.set(15, 12 + b, 'eye', 0); s.set(16, 12 + b, 'eye', 0);
      s.grid(11, 8 + b, `kk\nwk`, { k: ['eye', 0], w: ['white', 4] });
      s.grid(19, 8 + b, `kk\nkw`, { k: ['eye', 0], w: ['white', 4] });
      s.hline(13, 18, 16 + b, 'scarf', 2);
    }
  }
  s.outline();
  return s;
}

/** 젖소 48x36 (오른쪽 보기; 왼쪽은 뒤집기), 걷기 2프레임, eat: 고개 숙임 */
export function cow(f = 0, { eat = false, baby = false } = {}) {
  const s = new Spr(48, 38);
  const st = f ? 1 : -1;
  // 다리 4
  for (const [x, near, ph] of [[12, 0, 1], [30, 0, -1], [15, 1, -1], [33, 1, 1]]) {
    const dx = st * ph;
    s.rect(x - 2 + dx, 24, 4, 9, 'white', near ? 2 : 1);
    s.rect(x - 2 + dx, 32, 4, 2, 'hoof', 1);
  }
  // 몸통 + 얼룩 (품종 무늬: 몸통 안에서만)
  s.ell(22, 19, 14.5, 8.8, 'white', { dither: 0.08 });
  const inBody = (x, y) => s.get(x, y) !== 0;
  s.ell(15, 15, 5, 4, 'patch', { clip: inBody }); s.ell(27, 21, 4.5, 3.6, 'patch', { clip: inBody }); s.ell(31, 13, 3.2, 2.6, 'patch', { clip: inBody });
  s.ell(10, 22, 2.6, 2.2, 'patch', { clip: inBody });
  s.ell(25, 27, 3.6, 2.2, 'pink', { lo: 1, clip: (x, y) => y >= 25 }); // 젖
  // 꼬리
  s.line(8, 14, 5, 24, 'white', 1); s.ell(5, 25, 1.6, 2, 'patch', { level: 1 });
  // 머리
  const hy = eat ? 22 : 12, hx = 39;
  contour(s, hx, hy, 6, 5.6, 'white', 1);
  s.ell(hx, hy, 6, 5.6, 'white');
  s.ell(hx + 3, hy + 3.5, 4, 3, 'pink', { lo: 1 });
  s.set(hx + 4, hy + 3, 'pink', 0); s.set(hx + 6, hy + 3, 'pink', 0);
  s.ell(hx - 2, hy - 2, 3, 2.6, 'patch', { clip: (x, y) => s.rampAt(x, y) === s.rampAt(hx, hy) });
  s.grid(hx + 1, hy - 2, `kk\nwk`, { k: ['eye', 0], w: ['white', 4] });
  s.poly([hx - 4, hy - 4, hx - 7, hy - 8, hx - 1, hy - 5], 'stone', { level: 4 }); // 뿔
  s.ell(hx - 6, hy - 1, 2.4, 1.4, 'white', { level: 2 }); // 귀
  s.outline();
  return baby ? half(s) : s;
}

export function sheep(f = 0, { eat = false, baby = false } = {}) {
  const s = new Spr(40, 34);
  const st = f ? 1 : -1;
  for (const [x, near, ph] of [[12, 0, 1], [24, 0, -1], [15, 1, -1], [27, 1, 1]]) s.rect(x - 1 + st * ph, 22, 3, 8, 'face', near ? 2 : 1);
  // 양털: 몽글한 덩어리 여러 개 (털 뭉치 = 표면 무늬의 이유)
  const blobs = [[12, 14, 6], [19, 11, 6.5], [26, 13, 6], [14, 20, 5.5], [22, 19, 6], [28, 19, 5], [8, 18, 4.5]];
  for (const [x, y, r] of blobs) s.ell(x, y, r, r * 0.9, 'wool', { dither: 0.16, lo: 1 });
  const hy = eat ? 21 : 14, hx = 33;
  contour(s, hx, hy, 4.4, 5, 'face', 0);
  s.ell(hx, hy, 4.4, 5, 'face');
  s.ell(hx - 1, hy - 4, 3.6, 2.6, 'wool', { lo: 2 });
  s.ell(hx - 4, hy - 1, 2.6, 1.3, 'face', { level: 1 });
  s.grid(hx + 1, hy - 1, `wk`, { k: ['eye', 0], w: ['white', 4] });
  s.outline();
  return baby ? half(s) : s;
}

export function chicken(f = 0, { eat = false } = {}) {
  const s = new Spr(22, 22);
  const st = f ? 1 : 0;
  s.line(9, 15, 9 - st, 19, 'corn', 1); s.line(12, 15, 12 + st, 19, 'corn', 1);
  s.hline(8 - st, 10 - st, 19, 'corn', 2); s.hline(11 + st, 13 + st, 19, 'corn', 2);
  s.ell(9, 11, 6, 4.8, 'white', { dither: 0.1 });
  s.ell(4, 8, 2.6, 3.5, 'white', { level: 2 }); // 꽁지
  s.ell(9, 12, 3.4, 2.4, 'white', { lo: 1, hi: 2, clip: (x, y) => s.get(x, y) !== 0 }); // 날개
  const hy = eat ? 13 : 6, hx = eat ? 15 : 14;
  s.ell(hx, hy, 3.2, 3.2, 'white');
  s.set(hx + 1, hy - 1, 'eye', 0);
  s.poly([hx + 2.5, hy - 0.5, hx + 5.5, hy + 0.5, hx + 2.5, hy + 1.6], 'corn', { level: 2 });
  s.ell(hx, hy - 3.5, 2, 1.3, 'tomato', { level: 2 }); s.set(hx + 2, hy + 2, 'tomato', 2);
  s.outline();
  return s;
}

/** 새끼: 가로세로 70% 로 줄여 다시 외곽선 (점을 골라 찍어 축소) */
function half(s) {
  const k = 0.7;
  const w = Math.round(s.w * k), h = Math.round(s.h * k);
  const o = new Spr(s.w, s.h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = s.d[Math.floor(y / k) * s.w + Math.floor(x / k)];
    if (v) o.d[(y + s.h - h) * s.w + x + Math.round((s.w - w) / 2)] = v;
  }
  return o;
}
