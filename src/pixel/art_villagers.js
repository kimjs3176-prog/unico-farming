import { Spr } from './pxl.js';
import { CW, CH } from './art_chars.js';

/**
 * 마을 주민 동물 6종 도트 (3D 판 docs/CHARACTERS.md 를 따름)
 *  두 발로 선 이등신 꼬마 동물 — 유니코와 같은 몸 틀(다리·몸통·팔·큰 머리), 뿔·갈기 없음
 *  종마다 '히어로 특징' 하나를 크게: 여우 붓꼬리·큰 귀 / 너구리 눈가 가면·고글 / 강아지 늘어진 귀·눈 얼룩 /
 *  곰 둥근 큰 몸·가슴 반달·머릿수건 / 고양이 뾰족 귀·줄무늬·밀짚모자 / 토끼 아주 긴 귀(한쪽 접힘)·솜꼬리
 *  모두 가슴에 작은 새싹 브로치
 */

const SP = {
  fox: { B: 'fox', C: 'furc', D: 'fdark', cloth: 'scarf', belt: 'roofb', hero: 'brush' },
  raccoon: { B: 'racc', C: 'furc', D: 'fdark', cloth: 'purple', hero: 'mask' },
  puppy: { B: 'dog', C: 'furc', D: 'spot', cloth: 'leaf', hero: 'flop' },
  bear: { B: 'bear', C: 'cream', D: 'fdark', cloth: 'rose', big: true, hero: 'moon' },
  cat: { B: 'cat', C: 'furc', D: 'cat', cloth: 'roofb', hero: 'stripe' },
  rabbit: { B: 'bun', C: 'furc', D: 'bun', cloth: 'rose', hero: 'longear' },
};
export const SPECIES_PIX = Object.keys(SP);

function contour(s, cx, cy, rx, ry, r, l) { s.ell(cx, cy, rx + 1, ry + 1, r, { level: l, clip: (x, y) => s.get(x, y) !== 0 }); }

function eye(s, x, y, flip = false) {
  s.grid(x, y, flip ? `
    .kk.
    kkwk
    kkkk
    kpkk
    .kk.` : `
    .kk.
    kwkk
    kkkk
    kkpk
    .kk.`, { k: ['eye', 0], w: ['white', 4], p: ['eye', 2] });
}

/** 새싹 브로치 */
function brooch(s, x, y) { s.set(x, y, 'leaf', 3); s.set(x + 1, y - 1, 'leaf', 4); s.set(x - 1, y - 1, 'leaf', 2); s.set(x, y + 1, 'gold', 3); }

/**
 * @param sp 'fox'|'raccoon'|'puppy'|'bear'|'cat'|'rabbit'
 * @param dir 'down'|'up'|'right'|'left', f 0..3
 */
export function villager(sp, dir, f = 0) {
  if (dir === 'left') return villager(sp, 'right', f).flipped();
  const P = SP[sp];
  const s = new Spr(CW, CH);
  const { B, C, D } = P;
  const step = f === 1 ? 1 : f === 3 ? -1 : 0;
  const hop = sp === 'rabbit' && step ? -1 : 0; // 토끼는 깡충
  const b = (step ? 1 : 0) + hop;
  const big = P.big ? 1.15 : 1;
  const hy = 21 + b + (sp === 'rabbit' ? 4 : 0); // 토끼: 머리를 낮춰 긴 귀 자리 + 꼬마 키

  if (dir === 'down' || dir === 'up') {
    const up = dir === 'up';
    // 꼬리 (앞을 볼 땐 몸 옆으로 비켜 보이게: 여우 붓꼬리·고양이 물음표)
    if (!up) tailFront(s, sp, P, b);
    // 다리 + 발
    const ly = (side) => 45 + (step === side ? 0 : step ? -1 : 0);
    for (const [x, side] of [[15.5 - (big - 1) * 8, 1], [24.5 + (big - 1) * 8, -1]]) {
      const legC = sp === 'bear' ? 'rose' : B;
      s.ell(x, ly(side), 3.4, 4.2, legC, { lo: 1 });
      const foot = sp === 'puppy' || sp === 'cat' ? C : D;
      s.rect(Math.round(x - 3), ly(side) + 2, 6, 2, foot, sp === 'puppy' || sp === 'cat' ? 2 : 1);
      s.hline(Math.round(x - 2), Math.round(x + 2), ly(side) + 2, foot, sp === 'puppy' || sp === 'cat' ? 3 : 2);
    }
    // 몸통
    s.ell(20, 37 + b, 8.5 * big, 7.8, B, { dither: 0.1 });
    if (sp === 'bear') { // 몸빼 (허리 아래) + 가슴 반달
      s.ell(20, 41 + b, 9.5, 5, 'rose', { lo: 1, clip: (x, y) => y >= 40 + b && s.get(x, y) !== 0 });
      if (!up) { for (let i = 0; i < 4; i++) s.set(14 + i * 4, 42 + b + (i % 2), 'scarf', 2); s.ell(20, 34 + b, 5, 2.4, C, { level: 3, clip: (x, y) => y >= 34 + b }); }
    } else if (!up) {
      s.ell(20, 39 + b, 4.6, 4.4, C, { level: 2, clip: (x, y) => s.get(x, y) !== 0 }); // 배
    }
    if (sp === 'fox' && !up) { s.hline(13, 27, 41 + b, P.belt, 2); s.hline(13, 27, 42 + b, P.belt, 1); s.ell(25, 43 + b, 1.8, 1.8, 'apron', { lo: 1 }); }
    if (sp === 'rabbit') { // 멜빵 + 앞판
      if (!up) { s.rect(16, 38 + b, 8, 5, P.cloth, 2); s.hline(16, 23, 38 + b, P.cloth, 3); } else s.rect(14, 39 + b, 12, 4, P.cloth, 1);
      s.vline(15, 32 + b, 39 + b, P.cloth, 2); s.vline(25, 32 + b, 39 + b, P.cloth, 2);
    }
    // 팔 (흔들기)
    for (const [x, side] of [[10.5 - (big - 1) * 10, 1], [29.5 + (big - 1) * 10, -1]]) {
      const ay = 36 + b + (step ? -step * side : 0);
      contour(s, x, ay, 3.1, 4.6, B, 1);
      s.ell(x, ay, 3.1, 4.6, B, { lo: 1 });
      if (sp !== 'puppy' && sp !== 'cat' && sp !== 'rabbit') s.ell(x, ay + 3.5, 2.2, 1.4, D, { lo: 1, clip: (xx, yy) => s.get(xx, yy) !== 0 });
    }
    // 목 둘레 옷 (스카프·목수건)
    if (sp === 'raccoon' || sp === 'puppy' || sp === 'cat') {
      s.ell(20, 30.5 + b, 9.5, 2.6, P.cloth, { lo: 1 });
      if (!up) s.poly([18, 31 + b, 22, 31 + b, 20, 35 + b], P.cloth, { level: 2 });
    }
    if (up) tailBack(s, sp, P, b);
    // 귀 (머리 뒤쪽 것 먼저)
    earsFront(s, sp, P, hy, up, f, true);
    // 머리
    const hr = sp === 'puppy' ? 13.4 : sp === 'bear' ? 13.2 : 12.6, vr = sp === 'cat' ? 10.2 : 10.6;
    contour(s, 20, hy, hr, vr, B, 1);
    s.ell(20, hy, hr, vr, B, { dither: 0.1 });
    earsFront(s, sp, P, hy, up, f, false);
    if (!up) {
      faceFront(s, sp, P, hy);
      if (sp !== 'bear') brooch(s, 25, 33 + b);
    } else {
      // 뒷모습 무늬: 고양이 줄무늬·너구리 꼬리는 따로
      if (sp === 'cat') for (const yy of [hy - 6, hy - 2, hy + 2]) s.hline(17, 23, yy, D, 1);
    }
    hats(s, sp, P, hy, up, 'front');
  } else {
    // ── 오른쪽 보기 ──
    tailSide(s, sp, P, b);
    const legs = [[20 - step * 2.5, 0], [20 + step * 2.5, 1]];
    for (const [x, near] of legs) {
      const legC = sp === 'bear' ? 'rose' : B;
      s.ell(x, 45, 3.3, 4.2, legC, { lo: near ? 1 : 0, hi: near ? 4 : 2 });
      const foot = sp === 'puppy' || sp === 'cat' ? C : D;
      s.rect(Math.round(x - 3), 47, 6, 2, foot, near ? 2 : 1);
    }
    s.ell(19.5, 37 + b, 8 * big, 7.8, B, { dither: 0.1 });
    if (sp === 'bear') s.ell(19.5, 41 + b, 9, 5, 'rose', { lo: 1, clip: (x, y) => y >= 40 + b && s.get(x, y) !== 0 });
    else s.ell(23, 39 + b, 3.6, 4.2, C, { level: 2, clip: (x, y) => s.get(x, y) !== 0 });
    if (sp === 'fox') { s.hline(12, 27, 41 + b, P.belt, 2); s.ell(25, 43 + b, 1.8, 1.8, 'apron', { lo: 1 }); }
    if (sp === 'rabbit') { s.rect(18, 38 + b, 8, 5, P.cloth, 2); s.vline(21, 32 + b, 38 + b, P.cloth, 2); }
    if (sp === 'raccoon' || sp === 'puppy' || sp === 'cat') { s.ell(20, 30.5 + b, 8.5, 2.6, P.cloth, { lo: 1 }); s.poly([22, 31 + b, 26, 31 + b, 24, 35 + b], P.cloth, { level: 2 }); }
    const ax = 20.5 - step * 2;
    contour(s, ax, 36 + b, 3, 4.5, B, 1);
    s.ell(ax, 36 + b, 3, 4.5, B, { lo: 1 });
    earsSide(s, sp, P, hy, f, true);
    const hr = sp === 'puppy' ? 12.4 : 11.8;
    contour(s, 20.5, hy, hr, 10.4, B, 1);
    s.ell(20.5, hy, hr, 10.4, B, { dither: 0.1 });
    earsSide(s, sp, P, hy, f, false);
    faceSide(s, sp, P, hy);
    if (sp !== 'bear') brooch(s, 25, 33 + b);
    hats(s, sp, P, hy, false, 'side');
  }
  s.outline();
  if (P.small) return shrink(s);
  return s;
}

/* ── 꼬리 ── */
function tailFront(s, sp, P, b) {
  const { B, C, D } = P;
  if (sp === 'fox') { // 붓꼬리를 몸 옆으로 비켜 (흰 끝이 어깨 옆으로)
    s.ell(32, 38 + b, 4.2, 6.5, B, { lo: 1 }); s.ell(34, 32 + b, 3.2, 3.4, 'furc', { lo: 1 });
  } else if (sp === 'cat') {
    s.line(30, 42 + b, 33, 36 + b, B, 2); s.line(31, 42 + b, 34, 36 + b, B, 3); s.line(33, 35 + b, 31, 32 + b, B, 3);
  } else if (sp === 'puppy') { s.ell(31, 40 + b, 2, 3, C, { lo: 1 }); }
  else if (sp === 'raccoon') { s.ell(31, 42 + b, 3, 4, B, { lo: 1 }); s.hline(29, 33, 42 + b, D, 1); s.hline(29, 33, 44 + b, D, 1); }
}
function tailBack(s, sp, P, b) {
  const { B, C, D } = P;
  if (sp === 'fox') { s.ell(20, 42 + b, 5, 6.5, B, { lo: 1 }); s.ell(20, 47 + b, 3.6, 2.6, 'furc', { lo: 1 }); }
  else if (sp === 'raccoon') { s.ell(20, 43 + b, 3.4, 5.5, B, { lo: 1 }); for (const yy of [40, 43, 46]) s.hline(17, 23, yy + b, D, 1); }
  else if (sp === 'puppy') { s.ell(20, 42 + b, 2.2, 3.4, B, { lo: 1 }); s.ell(20, 39.5 + b, 1.6, 1.4, C, { level: 3 }); }
  else if (sp === 'bear') s.ell(20, 43 + b, 2.4, 2, B, { lo: 1 });
  else if (sp === 'cat') { s.line(20, 44 + b, 21, 36 + b, B, 3); s.line(21, 44 + b, 22, 36 + b, B, 2); s.line(22, 36 + b, 24, 34 + b, B, 3); }
  else if (sp === 'rabbit') s.ell(20, 43 + b, 3.2, 3, C, { lo: 2 });
}
function tailSide(s, sp, P, b) {
  const { B, C, D } = P;
  if (sp === 'fox') { s.ell(8, 38 + b, 5.5, 4.6, B, { lo: 1 }); s.ell(4, 35 + b, 3, 3, 'furc', { lo: 1 }); }
  else if (sp === 'raccoon') { s.ell(9, 41 + b, 4.6, 3, B, { lo: 1 }); for (const xx of [6, 9, 12]) s.vline(xx, 39 + b, 43 + b, D, 1); }
  else if (sp === 'puppy') { s.line(11, 38 + b, 7, 33 + b, B, 3); s.line(12, 38 + b, 8, 33 + b, B, 2); s.set(7, 32 + b, C, 3); }
  else if (sp === 'bear') s.ell(11, 41 + b, 2.4, 2.2, B, { lo: 1 });
  else if (sp === 'cat') { s.line(11, 41 + b, 7, 36 + b, B, 3); s.line(7, 36 + b, 7, 31 + b, B, 3); s.line(7, 31 + b, 9, 29 + b, B, 3); s.line(8, 36 + b, 8, 31 + b, B, 2); }
  else if (sp === 'rabbit') s.ell(11, 41 + b, 3, 3, C, { lo: 2 });
}

/* ── 귀 (정면·뒷면) back=true 면 머리 뒤로 들어가는 부분만 ── */
function earsFront(s, sp, P, hy, up, f, back) {
  const { B, C, D } = P;
  for (const sx of [1, -1]) {
    const X = (v) => 20 + sx * v;
    if (sp === 'fox') {
      if (back) continue;
      s.poly([X(12.5), hy - 4, X(12), hy - 19, X(4.5), hy - 8], B, { level: 3 });
      s.poly([X(11.5), hy - 6, X(11.2), hy - 15, X(6.5), hy - 8.5], up ? B : C, { level: up ? 2 : 2 });
      s.poly([X(12.6), hy - 15, X(12), hy - 19.5, X(10), hy - 16], D, { level: 1 });
    } else if (sp === 'cat') {
      if (back) continue;
      s.poly([X(12), hy - 4, X(11), hy - 16, X(4.5), hy - 8], B, { level: 3 });
      s.poly([X(11), hy - 6, X(10.4), hy - 13, X(6.5), hy - 8.5], up ? B : 'pink', { level: 2 });
    } else if (sp === 'raccoon') {
      if (back) continue;
      s.ell(X(9), hy - 9, 3.6, 3.6, B, { lo: 2 }); s.ell(X(9), hy - 9, 2.2, 2.2, up ? D : C, { level: up ? 1 : 2 });
      s.ell(X(9), hy - 12, 2, 1, D, { level: 1 });
    } else if (sp === 'bear') {
      if (back) continue;
      s.ell(X(9.5), hy - 9, 3.4, 3.2, B, { lo: 2 }); if (!up) s.ell(X(9.5), hy - 9, 1.8, 1.6, C, { level: 1 });
    } else if (sp === 'puppy') {
      // 늘어진 밤색 귀: 머리 옆으로 축 (뿌리만 머리에 붙음)
      if (back) continue;
      s.ell(X(12.5), hy + 1, 3.6, 7, D, { lo: 1 }); s.ell(X(12), hy - 5, 3.4, 2.4, D, { level: 2 });
    } else if (sp === 'rabbit') {
      if (!back) continue;
      // 아주 긴 귀: 오른쪽은 똑바로, 왼쪽은 끝이 접힘
      const tall = sx === 1;
      const wob = f === 1 || f === 3 ? 1 : 0;
      s.ell(X(6), hy - 16 - wob, 3.2, tall ? 9 : 6.5, B, { lo: 2 });
      if (!up) s.ell(X(6), hy - 15 - wob, 1.6, tall ? 6.5 : 4.5, 'pink', { level: 2 });
      if (!tall) { s.ell(X(9.5), hy - 21, 3.6, 2.4, B, { lo: 2 }); s.ell(X(10.5), hy - 21, 1.6, 1, D, { level: 2 }); }
      else s.ell(X(6), hy - 24 - wob, 2.2, 1.4, D, { level: 1 });
    }
  }
}
function earsSide(s, sp, P, hy, f, back) {
  const { B, C, D } = P;
  if (sp === 'fox') { if (back) return; s.poly([13, hy - 5, 15, hy - 19, 20.5, hy - 8], B, { level: 3 }); s.poly([14.5, hy - 7, 15.5, hy - 15, 18.6, hy - 8.5], C, { level: 2 }); s.poly([14.5, hy - 15, 15, hy - 19.5, 16.5, hy - 16], D, { level: 1 }); }
  else if (sp === 'cat') { if (back) return; s.poly([13.5, hy - 5, 15, hy - 16, 20, hy - 8], B, { level: 3 }); s.poly([15, hy - 7, 15.6, hy - 13, 18.4, hy - 8.5], 'pink', { level: 2 }); }
  else if (sp === 'raccoon') { if (back) return; s.ell(15, hy - 9, 3.6, 3.6, B, { lo: 2 }); s.ell(15, hy - 9, 2.2, 2.2, C, { level: 2 }); s.ell(15, hy - 12, 2, 1, D, { level: 1 }); }
  else if (sp === 'bear') { if (back) return; s.ell(14, hy - 9, 3.4, 3.2, B, { lo: 2 }); s.ell(14, hy - 9, 1.8, 1.6, C, { level: 1 }); }
  else if (sp === 'puppy') { if (back) return; s.ell(13.5, hy + 0.5, 4, 7, D, { lo: 1 }); s.ell(14, hy - 5.5, 3.6, 2.4, D, { level: 2 }); }
  else if (sp === 'rabbit') {
    if (!back) return;
    const wob = f === 1 || f === 3 ? 1 : 0;
    s.ell(14, hy - 16 - wob, 3.2, 9, B, { lo: 2 }); s.ell(14.5, hy - 15 - wob, 1.4, 6, 'pink', { level: 2 });
    s.ell(17.5, hy - 15, 3, 7, B, { lo: 1 }); s.ell(20, hy - 21, 3.4, 2.2, B, { lo: 1 });
  }
}

/* ── 얼굴 ── */
function faceFront(s, sp, P, hy) {
  const { B, C, D } = P;
  // 무늬 먼저
  if (sp === 'fox') { // 크림 볼 갈기 (V 얼굴)
    s.poly([8, hy + 1, 20, hy + 10, 32, hy + 1, 26, hy + 9, 14, hy + 9], C, { level: 2 });
    s.ell(20, hy + 6, 6.5, 4, C, { level: 3 });
  } else if (sp === 'raccoon') { // 검은 눈가 가면 + 흰 미간·볼
    s.ell(13.5, hy - 1, 5.5, 3.8, D, { level: 1 }); s.ell(26.5, hy - 1, 5.5, 3.8, D, { level: 1 });
    s.vline(20, hy - 8, hy + 2, C, 2); s.vline(19, hy - 6, hy + 1, C, 2); s.vline(21, hy - 6, hy + 1, C, 2);
    s.ell(20, hy + 6, 7, 3.8, C, { level: 2 });
  } else if (sp === 'puppy') { // 한쪽 눈 얼룩 + 흰 주둥이
    s.ell(25.5, hy - 2.5, 5, 4.4, D, { level: 2 });
    s.ell(20, hy + 5.5, 7, 4.4, C, { level: 3 });
  } else if (sp === 'bear') { s.ell(20, hy + 5.5, 6, 4, C, { lo: 1, hi: 2 }); s.ell(13.5, hy - 2, 3.6, 3, D, { level: 3 }); s.ell(26.5, hy - 2, 3.6, 3, D, { level: 3 }); }
  else if (sp === 'cat') { for (const [x0, y0] of [[19, hy - 9], [17, hy - 8], [21, hy - 8]]) s.vline(x0 + 1, y0, y0 + 3, D, 1); s.ell(20, hy + 5.5, 5.6, 3.6, C, { level: 3 }); }
  else if (sp === 'rabbit') s.ell(20, hy + 5.5, 5, 3.4, C, { level: 3 });
  // 눈
  eye(s, 12, hy - 4); eye(s, 24, hy - 4, true);
  if (sp === 'cat') { s.set(13, hy - 2, 'leaf', 3); s.set(26, hy - 2, 'leaf', 3); } // 고양이만 홍채
  // 코·입
  const ny = hy + 3;
  if (sp === 'rabbit') { s.hline(19, 20, ny, 'pink', 1); s.set(19, ny + 2, 'eye', 2); s.set(20, ny + 2, 'eye', 2); }
  else { s.ell(20, ny, sp === 'puppy' || sp === 'bear' ? 2.2 : 1.8, 1.3, 'eye', { lo: 0, hi: 1 }); s.set(19, ny - 1, 'white', 3); }
  s.set(18, ny + 3, 'eye', 2); s.set(19, ny + 4, 'eye', 2); s.set(20, ny + 3, 'eye', 2); s.set(21, ny + 4, 'eye', 2); s.set(22, ny + 3, 'eye', 2);
  if (sp === 'cat') for (const yy of [ny, ny + 2]) { s.hline(5, 9, yy, 'white', 3); s.hline(31, 35, yy, 'white', 3); }
  // 볼 (너구리는 가면이라 없음)
  if (sp !== 'raccoon') { s.hline(8, 10, hy + 3, 'pink', 2); s.hline(30, 32, hy + 3, 'pink', 2); }
}
function faceSide(s, sp, P, hy) {
  const { B, C, D } = P;
  // 주둥이 (앞으로)
  const snoutC = sp === 'bear' ? C : sp === 'fox' || sp === 'raccoon' || sp === 'puppy' || sp === 'cat' || sp === 'rabbit' ? C : B;
  const long = sp === 'fox' ? 1.5 : sp === 'puppy' ? 1 : 0;
  if (sp === 'fox') s.poly([18, hy + 2, 30, hy + 9, 22, hy + 10], C, { level: 2 });
  if (sp === 'raccoon') { s.ell(25, hy - 1, 5, 3.6, D, { level: 1 }); }
  if (sp === 'puppy') s.ell(24, hy - 2.5, 4.4, 4, D, { level: 2 });
  contour(s, 28.5 + long, hy + 4.5, 5 + long, 3.6, snoutC, 1);
  s.ell(28.5 + long, hy + 4.5, 5 + long, 3.6, snoutC, { lo: 1, hi: sp === 'bear' ? 2 : 3 });
  s.ell(33 + long * 2, hy + 3, 1.6, 1.2, sp === 'rabbit' ? 'pink' : 'eye', { lo: sp === 'rabbit' ? 1 : 0, hi: 1 });
  s.hline(29, 32 + long, hy + 7, 'eye', 2);
  if (sp === 'cat') { s.hline(30, 36, hy + 3, 'white', 3); s.hline(30, 36, hy + 5, 'white', 3); for (const x0 of [14, 17]) s.vline(x0, hy - 9, hy - 6, D, 1); }
  eye(s, 22, hy - 4, true);
  if (sp === 'cat') s.set(24, hy - 2, 'leaf', 3);
  if (sp !== 'raccoon') s.hline(21, 23, hy + 3, 'pink', 2);
}

/* ── 모자·머리 소품 ── */
function hats(s, sp, P, hy, up, view) {
  const side = view === 'side';
  if (sp === 'fox') { // 빨강 머리띠
    if (side) s.line(13, hy - 6, 26, hy - 9, P.cloth, 2);
    else { s.hline(9, 31, hy - 8, P.cloth, 2); s.hline(10, 30, hy - 9, P.cloth, 3); }
  } else if (sp === 'raccoon') { // 이마 위로 올린 고글
    if (side) { s.ell(22, hy - 8, 2.6, 2.2, 'glass', { lo: 1 }); s.hline(12, 20, hy - 8, P.cloth, 2); }
    else if (!up) { for (const ex of [15, 25]) { s.ell(ex, hy - 8, 3, 2.4, 'iron', { level: 2 }); s.ell(ex, hy - 8, 2, 1.6, 'glass', { lo: 1, hi: 2 }); s.set(ex - 1, hy - 9, 'glass', 3); } }
    else s.hline(8, 32, hy - 8, P.cloth, 2);
  } else if (sp === 'bear') { // 머릿수건 + 금테 안경
    const cap = (x, y) => y <= hy - 4;
    if (side) s.ell(18.5, hy - 5, 11.5, 7, 'cream', { lo: 2, clip: cap });
    else s.ell(20, hy - 4, 13.5, 8, 'cream', { lo: 2, clip: cap });
    for (let i = 0; i < 6; i++) s.set((side ? 11 : 10) + i * 3, hy - 7 + (i % 2), 'rose', 2);
    if (!up) {
      if (side) { s.ell(24, hy - 3, 2.6, 2.4, 'gold', { level: 3, clip: (x, y) => { const u = (x + 0.5 - 24) / 2.6, v = (y + 0.5 - (hy - 3)) / 2.4; return u * u + v * v > 0.45; } }); }
      else for (const ex of [14, 26]) s.ell(ex, hy - 2, 3.2, 3, 'gold', { level: 3, clip: (x, y) => { const u = (x + 0.5 - ex) / 3.2, v = (y + 0.5 - (hy - 2)) / 3; return u * u + v * v > 0.5; } });
    }
  } else if (sp === 'cat') { // 밀짚모자 (귀가 앞으로 보이게 챙만 넓게)
    if (side) { s.ell(19, hy - 10, 13, 2.4, 'hay', { lo: 2 }); s.ell(18, hy - 13, 6.5, 3.5, 'hay', { lo: 1 }); s.hline(12, 24, hy - 11, P.cloth, 2); }
    else { s.ell(20, hy - 11, 15, 3, 'hay', { lo: 2 }); s.ell(20, hy - 14, 7, 3.6, 'hay', { lo: 1 }); s.hline(13, 27, hy - 12, P.cloth, 2); }
  } else if (sp === 'rabbit' && !up) { // 리본
    const x = side ? 17 : 24; s.ell(x - 2, hy - 9, 2, 1.4, P.cloth, { lo: 2 }); s.ell(x + 2, hy - 9, 2, 1.4, P.cloth, { lo: 2 }); s.set(x, hy - 9, P.cloth, 1);
  } else if (sp === 'puppy' && !up) { s.set(28, hy - 9, 'leaf', 3); s.set(29, hy - 10, 'leaf', 4); }
}

/** 꼬마(토끼): 몸통 줄 몇 개를 빼 키를 줄임 */
function shrink(s) {
  const out = new Spr(s.w, s.h);
  const drop = new Set([31, 34, 37]);
  let ty = s.h - 1;
  for (let y = s.h - 1; y >= 0; y--) {
    if (drop.has(y)) continue;
    for (let x = 0; x < s.w; x++) out.d[ty * s.w + x] = s.d[y * s.w + x];
    ty--;
  }
  return out;
}
