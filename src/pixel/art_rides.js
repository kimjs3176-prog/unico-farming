import { Spr } from './pxl.js';

/**
 * 마을 탈것 도트 (3D 판 ride_models.js 를 따라): 자전거 · 농장 카트
 * 트랙터와 같은 '복셀 쌓기' — 모델 좌표(앞 = x, 옆 = y, 위 = z)를 32방향으로 돌려 층마다 찍음
 */
const K = 1.6;

const BIKE = { L: 30, W: 8, H: 20, cx: 15 };
function bikeVoxel(x, y, z) {
  const yc = y - BIKE.W / 2 + 0.5, ay = Math.abs(yc);
  // 바퀴 둘 (가는 테 + 바큇살)
  for (const wx of [5, 25]) {
    const dx = x - wx, dz = z - 5, rr = dx * dx + dz * dz;
    if (ay <= 0.6 && rr <= 30 && rr >= 18) return ['iron', z > 7 ? 2 : 1];
    if (ay <= 0.6 && rr < 18 && (Math.abs(dx) < 0.7 || Math.abs(dz) < 0.7)) return ['silver', 3];
  }
  if (ay <= 0.6) {
    // 뼈대: 안장 기둥 → 아래 → 핸들 기둥 (하늘색 프레임)
    if (x >= 9 && x <= 21 && Math.abs(z - (5 + (x - 9) * 0.45)) < 0.8) return ['roofb', 3];
    if (x >= 10 && x <= 22 && z === 11) return ['roofb', 4];
    if (x === 10 && z >= 5 && z <= 13) return ['roofb', 3];
    if (x >= 22 && x <= 24 && z >= 5 && z <= 14 && Math.abs(x - (24 - (z - 5) * 0.2)) < 0.9) return ['roofb', 2];
    if (x >= 5 && x <= 10 && z === 5) return ['iron', 2]; // 뒤 체인 받침
  }
  // 안장
  if (x >= 8 && x <= 12 && ay <= 1.5 && z >= 14 && z <= 15) return ['wood', z === 15 ? 2 : 1];
  // 핸들 (옆으로 넓게)
  if (x >= 22 && x <= 23 && ay <= 3.5 && z >= 15 && z <= 16) return ay > 2.6 ? ['scarf', 2] : ['iron', 2];
  // 앞 바구니
  if (x >= 25 && x <= 29 && ay <= 2.5 && z >= 11 && z <= 14) return z === 14 || x === 25 || x === 29 || ay > 2 ? ['hay', 3] : ['hay', 1];
  // 페달
  if (x >= 14 && x <= 16 && ay >= 1.5 && ay <= 2.5 && z >= 4 && z <= 5) return ['iron', 1];
  return null;
}

const CART = { L: 34, W: 20, H: 30, cx: 17 };
function cartVoxel(x, y, z) {
  const yc = y - CART.W / 2 + 0.5, ay = Math.abs(yc);
  // 바퀴 넷
  for (const wx of [7, 27]) { const dx = x - wx, dz = z - 3.5, rr = dx * dx + dz * dz; if (ay >= 7.5 && ay <= 9.5 && rr <= 14) return rr > 5 ? ['iron', 1] : ['silver', 3]; }
  // 차체 (초록 + 흰 줄)
  if (x >= 2 && x <= 32 && ay <= 8 && z >= 4 && z <= 8) {
    if (x >= 31) return ['iron', 2];
    if (z === 7) return ['white', 4];
    return ['roofg', ay > 7 ? 2 : 3];
  }
  // 짐칸 (뒤): 나무 판 + 실린 상자·채소
  if (x >= 2 && x <= 11 && ay <= 8 && z >= 9 && z <= 11) {
    if (ay > 7 || x === 2) return ['wood', z === 11 ? 4 : 2];
    if (z === 9) return ['wood', 1];
    if (x >= 4 && x <= 7 && ay <= 4 && z <= 11) return ['carrot', 2];
    return null;
  }
  if (x >= 4 && x <= 8 && yc >= 1 && yc <= 6 && z >= 9 && z <= 13) return ['wood', z === 13 ? 4 : 3]; // 상자
  // 좌석 2개 (등받이)
  if (x >= 13 && x <= 20 && ay <= 7 && z >= 9 && z <= 10) return ['cream', 2];
  if (x >= 13 && x <= 14 && ay <= 7 && z >= 10 && z <= 14) return ['cream', 3];
  // 핸들
  if (x >= 24 && x <= 25 && ay <= 1 && z >= 9 && z <= 13) return ['iron', 1];
  if (x >= 23 && x <= 25 && ay <= 2.5 && z === 14) return ['iron', 3];
  // 지붕 기둥 4개 + 줄무늬 차양
  if ((x === 12 || x === 26) && ay >= 7 && ay <= 8 && z >= 9 && z <= 26) return ['silver', 3];
  if (x >= 11 && x <= 28 && ay <= 9 && z >= 27 && z <= 28) return [Math.floor((yc + 9) / 3) % 2 ? 'scarf' : 'white', z === 24 ? 3 : 2];
  return null;
}

function stack(M, voxel, angle, zFrom = 0, zTo = 99) {
  const S = 96, HZ = Math.ceil(M.H * K);
  const s = new Spr(S, S + HZ);
  const fx = Math.sin(angle), fy = Math.cos(angle);
  const cx = S / 2, cy = S / 2 + HZ - 6;
  for (let zz = 0; zz < HZ; zz++) {
    const z = Math.floor(zz / K);
    for (let v = -S / 2; v < S / 2; v++) for (let u = -S / 2; u < S / 2; u++) {
      const mx = (u * fx + v * fy) / K + M.cx, my = (-u * fy + v * fx) / K + M.W / 2;
      const vx = Math.round(mx), vy = Math.round(my - 0.5);
      if (vx < -1 || vx > M.L || vy < 0 || vy >= M.W) continue;
      if (z < zFrom || z > zTo) continue;
      const c = voxel(vx, vy, z);
      if (!c) continue;
      const top = zz === HZ - 1 || Math.floor((zz + 1) / K) !== z ? !voxel(vx, vy, z + 1) : false;
      s.set(cx + u, cy + v - zz, c[0], c[1] + (top ? 1 : 0));
    }
  }
  s.outline();
  return s;
}

export const bikeStack = (angle) => stack(BIKE, bikeVoxel, angle);
/** part: 'body'(지붕 아래) | 'roof'(차양) — 운전하는 유니코를 둘 사이에 그리려고 나눔 */
export const cartStack = (angle, part = 'all') => stack(CART, cartVoxel, angle, part === 'roof' ? 27 : 0, part === 'body' ? 26 : 99);
export const RIDE_ANCHOR = { bike: { x: 48, y: 48 + Math.ceil(BIKE.H * K) - 6 }, cart: { x: 48, y: 48 + Math.ceil(CART.H * K) - 6 } };
