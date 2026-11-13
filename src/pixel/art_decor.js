import { Spr, rng } from './pxl.js';

/**
 * 농장 꾸미기 소품 도트 (3D 판 sim/decor.js 의 20가지 중 도트판에 없던 것)
 * 이미 있는 그림(덤불·바위·그루터기·건초·상자·우물·가로등·울타리·나무)은 sprites.js 에서 그대로 씀
 */

export function bench() {
  const s = new Spr(44, 30);
  // 다리
  for (const x of [6, 36]) { s.rect(x, 16, 3, 12, 'iron', 2); s.vline(x, 16, 27, 'iron', 3); }
  // 등받이 널 2장
  for (const y of [4, 9]) { s.rect(3, y, 38, 4, 'wood', 3); s.hline(3, 40, y, 'wood', 4); s.hline(3, 40, y + 3, 'wood', 2); }
  // 앉는 판 (위에서 보임)
  s.rect(2, 16, 40, 6, 'wood', 3); s.hline(2, 41, 16, 'wood', 5); s.hline(2, 41, 18, 'wood', 4); s.hline(2, 41, 21, 'wood', 1);
  s.rect(4, 13, 2, 4, 'iron', 2); s.rect(38, 13, 2, 4, 'iron', 2);
  s.outline();
  return s;
}

export function scarecrow() {
  const s = new Spr(36, 58);
  s.rect(17, 18, 3, 38, 'wood', 2); s.vline(17, 18, 55, 'wood', 3);
  s.rect(3, 24, 30, 3, 'wood', 3); s.hline(3, 32, 24, 'wood', 4);
  // 셔츠 (체크) + 짚 손
  s.rect(8, 22, 21, 16, 'scarf', 2);
  for (let y = 22; y < 38; y += 4) s.hline(8, 28, y, 'scarf', 1);
  for (let x = 10; x < 29; x += 5) s.vline(x, 22, 37, 'scarf', 3);
  for (const x of [2, 31]) { s.rect(x, 23, 3, 5, 'hay', 3); s.set(x, 28, 'hay', 2); s.set(x + 2, 28, 'hay', 2); }
  s.rect(10, 37, 17, 4, 'hay', 2); for (let x = 10; x < 27; x += 2) s.set(x, 41, 'hay', 3);
  // 얼굴 (자루) + 밀짚모자
  s.ell(18.5, 14, 7, 6.5, 'cream', { lo: 1 });
  s.set(15, 13, 'eye', 0); s.set(16, 13, 'eye', 0); s.set(21, 13, 'eye', 0); s.set(22, 13, 'eye', 0);
  s.hline(15, 22, 17, 'eye', 1); for (const x of [16, 18, 20]) s.set(x, 18, 'eye', 1);
  s.ell(18.5, 8, 13, 2.6, 'hay', { lo: 2 }); s.ell(18.5, 5, 6.5, 3.6, 'hay', { lo: 1 }); s.hline(13, 24, 7, 'scarf', 2);
  s.outline();
  return s;
}

export function barrel() {
  const s = new Spr(26, 32);
  s.ell(13, 17, 11, 13, 'wood', { lo: 1, hi: 4 });
  for (let x = 4; x < 23; x += 4) s.vline(x, 6, 28, 'wood', 1);
  for (const y of [8, 17, 26]) s.hline(3, 23, y, 'iron', 2);
  s.ell(13, 5, 9, 3, 'wood', { level: 4 }); s.ell(13, 5, 6, 1.6, 'wood', { level: 2 });
  s.outline();
  return s;
}

export function sack() {
  const s = new Spr(24, 26);
  s.ell(12, 16, 10, 9, 'cream', { lo: 1, dither: 0.2 });
  s.ell(12, 6, 4, 3, 'cream', { lo: 1 }); s.hline(9, 15, 8, 'wood', 1);
  s.ell(10, 4, 2, 1.2, 'hay', { level: 3 }); s.ell(14, 3, 2, 1.2, 'hay', { level: 3 });
  // 벼 그림 도장
  s.vline(12, 13, 20, 'leaf', 2); s.set(11, 14, 'corn', 2); s.set(13, 15, 'corn', 2); s.set(11, 16, 'corn', 2); s.set(13, 17, 'corn', 2);
  s.outline();
  return s;
}

export function bucket() {
  const s = new Spr(20, 20);
  s.poly([3, 6, 17, 6, 15, 18, 5, 18], 'wood', { level: 3 });
  for (let x = 6; x < 15; x += 3) s.vline(x, 7, 17, 'wood', 2);
  s.hline(4, 16, 9, 'iron', 2); s.hline(5, 15, 16, 'iron', 2);
  s.ell(10, 6, 7, 2, 'water', { lo: 3, hi: 4 }); s.set(8, 5, 'water', 5);
  s.line(3, 6, 10, 1, 'iron', 2); s.line(17, 6, 10, 1, 'iron', 2);
  s.outline();
  return s;
}

export function cart() {
  const s = new Spr(46, 32);
  // 바퀴 (앞)
  s.ell(36, 24, 6, 6, 'wood', { lo: 1, hi: 2 }); s.ell(36, 24, 3.6, 3.6, 'wood', { level: 4 }); s.ell(36, 24, 1.4, 1.4, 'iron', { level: 2 });
  // 통
  s.poly([6, 8, 38, 8, 33, 22, 10, 22], 'wood', { level: 3 });
  s.poly([8, 8, 36, 8, 34, 11, 10, 11], 'wood', { level: 1 });
  for (let x = 12; x < 34; x += 6) s.vline(x, 12, 21, 'wood', 2);
  s.hline(6, 38, 8, 'wood', 4);
  // 손잡이·받침다리
  s.line(2, 16, 10, 20, 'wood', 2); s.line(2, 15, 10, 19, 'wood', 3);
  s.rect(11, 22, 2, 7, 'wood', 1);
  // 실린 호박·당근
  s.ell(20, 7, 4, 3, 'carrot', { lo: 1 }); s.ell(27, 6, 3.4, 2.8, 'cabbage', { lo: 1 });
  s.outline();
  return s;
}

export function planter() {
  const s = new Spr(34, 30);
  s.rect(3, 16, 28, 12, 'wood', 3); s.hline(3, 30, 16, 'wood', 5); s.hline(3, 30, 27, 'wood', 1);
  for (let x = 3; x < 31; x += 7) s.vline(x, 17, 26, 'wood', 2);
  s.rect(4, 15, 26, 2, 'soil', 2);
  const r = rng(5);
  for (let i = 0; i < 6; i++) {
    const x = 6 + i * 4.5 | 0, h = 6 + (r() * 6 | 0);
    s.vline(x, 16 - h, 15, 'leaf', 2); s.set(x - 1, 16 - h + 2, 'leaf', 3); s.set(x + 1, 16 - h + 3, 'leaf', 3);
    const R = ['flowr', 'flowy', 'flowp', 'floww'][i % 4];
    s.set(x, 15 - h, R, 2); s.set(x - 1, 16 - h, R, 1); s.set(x + 1, 16 - h, R, 1); s.set(x, 14 - h, R, 3);
  }
  s.outline();
  return s;
}

export function flowerbed() {
  const s = new Spr(36, 26);
  s.ell(18, 16, 16, 8, 'soil', { lo: 1, hi: 3 });
  for (let a = 0; a < 18; a++) { const t = (a / 18) * Math.PI * 2; s.set(Math.round(18 + Math.cos(t) * 16), Math.round(16 + Math.sin(t) * 8), 'stone', 3); }
  const r = rng(9);
  for (let i = 0; i < 14; i++) {
    const t = r() * Math.PI * 2, d = Math.sqrt(r()) * 0.8, x = Math.round(18 + Math.cos(t) * d * 14), y = Math.round(15 + Math.sin(t) * d * 6);
    const R = ['flowr', 'flowy', 'flowp', 'floww', 'rose'][i % 5];
    s.vline(x, y, y + 3, 'leaf', 2); s.set(x, y - 1, R, 3); s.set(x - 1, y, R, 2); s.set(x + 1, y, R, 2); s.set(x, y, 'flowy', 3);
  }
  s.outline();
  return s;
}

export function berrybush(base) {
  // 덤불 그림 위에 산딸기 점 (빨강·남색)
  const s = new Spr(40, 30);
  s.d.set(base.d);
  const r = rng(13);
  for (let i = 0; i < 12; i++) {
    const x = 7 + r() * 26 | 0, y = 6 + r() * 16 | 0;
    if (!s.get(x, y)) continue;
    const R = i % 3 ? 'scarf' : 'purple';
    s.set(x, y, R, 2); s.set(x + 1, y, R, 1); s.set(x, y - 1, R, 3);
  }
  return s;
}

export function birch() {
  const s = new Spr(48, 92);
  // 흰 줄기 + 검은 무늬
  s.rect(21, 34, 6, 56, 'white', 3); s.vline(21, 34, 89, 'white', 2); s.vline(26, 34, 89, 'white', 2);
  for (let y = 40; y < 88; y += 7) { s.hline(22, 24, y, 'ink', 1); s.set(25, y + 3, 'ink', 1); }
  s.line(24, 50, 34, 40, 'white', 3); s.line(23, 44, 14, 36, 'white', 3);
  // 잎 (가볍고 길쭉한 덩어리)
  const cl = [[24, 22, 14, 18], [14, 30, 9, 10], [35, 30, 9, 11], [24, 10, 9, 9]];
  for (const [x, y, rx, ry] of cl) s.ell(x + 1, y + 1, rx, ry, 'fol', { lo: 0, hi: 2 });
  for (const [x, y, rx, ry] of cl) s.ell(x, y, rx * 0.85, ry * 0.85, 'fol', { lo: 2, dither: 0.25 });
  s.outline();
  return s;
}

export function treeWhole(t) {
  // 나무 줄기 + 잎을 한 장으로 (꾸미기용)
  const c = document.createElement('canvas'); c.width = t.trunk.width; c.height = t.trunk.height;
  const g = c.getContext('2d'); g.drawImage(t.trunk, 0, 0); g.drawImage(t.crown, 0, 0);
  return c;
}
