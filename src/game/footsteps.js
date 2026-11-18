// 발소리 바닥 종류: 집 안 마루 · 부두 나무 · 눈 · KOAT 광장 돌 · 밭/흙길 흙 · 그 밖은 풀
import { LAYOUT } from './world.js';
import { SURF } from './surface.js';

const DOCK_R = 1.8; // 연못 낚시 데크 둘레
let SEGS = null;

/** 흙길 선분 (처음 한 번만 만듦): [ax, az, bx, bz, 반폭] */
function segments() {
  if (SEGS) return SEGS;
  SEGS = [];
  for (const p of LAYOUT.paths) {
    for (let i = 1; i < p.pts.length; i++) SEGS.push([p.pts[i - 1][0], p.pts[i - 1][1], p.pts[i][0], p.pts[i][1], p.w / 2 + 0.3]);
  }
  return SEGS;
}

const inRect = (x, z, x0, z0, x1, z1) => x >= x0 && x <= x1 && z >= z0 && z <= z1;

/** 점에서 선분까지 거리 제곱 */
function segDist2(x, z, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)) : 0;
  const px = ax + dx * t - x, pz = az + dz * t - z;
  return px * px + pz * pz;
}

/**
 * (x, z) 바닥 종류
 * @param g 게임 (g.home.inside 를 봄; 없어도 됨)
 * @param snow 눈 쌓임 0..1 (기본: 지금 화면의 SURF.snow)
 * @returns 'floor' | 'wood' | 'snow' | 'stone' | 'dirt' | 'grass'
 */
export function surfaceAt(g, x, z, snow = SURF.snow.value) {
  if (g?.home?.inside) return 'floor';
  const L = LAYOUT;
  for (const b of L.lake.pier) if (inRect(x, z, b.x0, b.z0, b.x1, b.z1)) return 'wood';
  if (Math.hypot(x - L.dock.x, z - L.dock.z) < DOCK_R) return 'wood';
  if (snow > 0.5) return 'snow';
  const kp = L.koat.plaza;
  if (inRect(x, z, kp[0], kp[1], kp[2], kp[3])) return 'stone';
  const F = L.farm, hw = (F.cols * F.tile) / 2, hh = (F.rows * F.tile) / 2;
  if (inRect(x, z, F.origin.x - hw, F.origin.z - hh, F.origin.x + hw, F.origin.z + hh)) return 'dirt';
  const T = L.field;
  if (inRect(x, z, T.x0, T.z0, T.x0 + T.cols * T.cell, T.z0 + T.rows * T.cell)) return 'dirt';
  for (const s of segments()) if (segDist2(x, z, s[0], s[1], s[2], s[3]) < s[4] * s[4]) return 'dirt';
  return 'grass';
}
