/**
 * 부호 거리 함수(SDF) 프리미티브 — three 없이 순수 함수. 안쪽이 음수, 단위 m.
 * 유니코 몸(unico_mesh.js)과 주민 동물 모양(scripts/lib/species_shapes.mjs)이 함께 씀.
 * 점은 [x, y, z] 배열, 반환은 (x, y, z) => 거리.
 */

export const sph = (c, r) => (x, y, z) => Math.hypot(x - c[0], y - c[1], z - c[2]) - r;

/** 회전 가능한 타원체 (근사 SDF) */
export function ell(c, rad, rotZ = 0, rotX = 0) {
  const cz = Math.cos(-rotZ), sz = Math.sin(-rotZ), cx = Math.cos(-rotX), sx = Math.sin(-rotX);
  return (x, y, z) => {
    let px = x - c[0], py = y - c[1], pz = z - c[2];
    const rx = px * cz - py * sz, ry = px * sz + py * cz; px = rx; py = ry; // z축 역회전
    const ry2 = py * cx - pz * sx, rz2 = py * sx + pz * cx; py = ry2; pz = rz2; // x축 역회전
    const k0 = Math.hypot(px / rad[0], py / rad[1], pz / rad[2]);
    const k1 = Math.hypot(px / (rad[0] * rad[0]), py / (rad[1] * rad[1]), pz / (rad[2] * rad[2]));
    return k1 === 0 ? -Math.min(...rad) : (k0 * (k0 - 1)) / k1;
  };
}

/** 캡슐: a → b, 반지름 r */
export function cap(a, b, r) {
  const bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2];
  const bb = bax * bax + bay * bay + baz * baz;
  return (x, y, z) => {
    const pax = x - a[0], pay = y - a[1], paz = z - a[2];
    const h = Math.max(0, Math.min(1, (pax * bax + pay * bay + paz * baz) / bb));
    return Math.hypot(pax - bax * h, pay - bay * h, paz - baz * h) - r;
  };
}

/** 둥근 원뿔: a(반지름 r1) → b(반지름 r2) 로 매끈하게 가늘어지는 캡슐 (Inigo Quilez sdRoundCone) */
export function rcone(a, b, r1, r2) {
  const ba = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const l2 = ba[0] * ba[0] + ba[1] * ba[1] + ba[2] * ba[2], rr = r1 - r2, a2 = l2 - rr * rr, il2 = 1 / l2;
  return (x, y, z) => {
    const pa = [x - a[0], y - a[1], z - a[2]];
    const yy = pa[0] * ba[0] + pa[1] * ba[1] + pa[2] * ba[2], zz = yy - l2;
    const xv = [pa[0] * l2 - ba[0] * yy, pa[1] * l2 - ba[1] * yy, pa[2] * l2 - ba[2] * yy];
    const x2 = xv[0] * xv[0] + xv[1] * xv[1] + xv[2] * xv[2], y2 = yy * yy * l2, z2 = zz * zz * l2;
    const k = Math.sign(rr) * rr * rr * x2;
    if (Math.sign(zz) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
    if (Math.sign(yy) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
    return (Math.sqrt(x2 * a2 * il2) + yy * rr) * il2 - r1;
  };
}

/** 둥근 원기둥 (발굽) */
export function rcyl(c, r, hh, round) {
  return (x, y, z) => {
    const dx = Math.hypot(x - c[0], z - c[2]) - r + round, dy = Math.abs(y - c[1]) - hh + round;
    return Math.min(Math.max(dx, dy), 0) + Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) - round;
  };
}

/** 앞뒤(z)로 납작하게: 근사 SDF (s<1) */
export const squashZ = (f, s) => (x, y, z) => f(x, y, z / s) * s;

/** 스무스 유니온 (k: 녹이는 정도) */
export const smin = (a, b, k) => {
  if (k <= 0) return Math.min(a, b);
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
};

const unit = (n) => { const l = Math.hypot(n[0], n[1], n[2]) || 1; return [n[0] / l, n[1] / l, n[2] / l]; };

/** 점 c 를 지나는 축 n 방향으로 두께를 s 배 (귀 같은 판): f(p + n·d·(1/s−1))·s */
export function flat(f, c, n, s) {
  const N = unit(n), k1 = 1 / s - 1;
  return (x, y, z) => {
    const d = ((x - c[0]) * N[0] + (y - c[1]) * N[1] + (z - c[2]) * N[2]) * k1;
    return f(x + N[0] * d, y + N[1] * d, z + N[2] * d) * s;
  };
}

/** 교집합 */
export const inter = (a, b) => (x, y, z) => Math.max(a(x, y, z), b(x, y, z));
/** 차집합 (a 에서 b 를 뺌) */
export const minus = (a, b) => (x, y, z) => Math.max(a(x, y, z), -b(x, y, z));

/** 축 n 에 수직인 두께 2·halfW 판을 반지름 R 구로 자름 (꼬리 고리·등 줄무늬 칠하기) */
export function band(c, n, halfW, R) {
  const N = unit(n);
  return (x, y, z) => {
    const px = x - c[0], py = y - c[1], pz = z - c[2];
    return Math.max(Math.abs(px * N[0] + py * N[1] + pz * N[2]) - halfW, Math.hypot(px, py, pz) - R);
  };
}

/** 반공간: n·p − o (n·p < o 쪽이 안) */
export const half = (n, o) => (x, y, z) => x * n[0] + y * n[1] + z * n[2] - o;

/** 앞쪽 반공간: off − n·(p−c) (판의 앞면만 칠할 때) */
export function front(n, c, off = 0) {
  const N = unit(n);
  return (x, y, z) => off - ((x - c[0]) * N[0] + (y - c[1]) * N[1] + (z - c[2]) * N[2]);
}

/** 점 c 를 중심으로 회전한 모양: m 은 3×3 회전 행렬(행 우선) — 로컬로 되돌려 f 를 계산 */
export function rotAbout(f, c, m) {
  return (x, y, z) => {
    const px = x - c[0], py = y - c[1], pz = z - c[2];
    // 역회전 = 전치 행렬
    return f(c[0] + m[0] * px + m[3] * py + m[6] * pz, c[1] + m[1] * px + m[4] * py + m[7] * pz, c[2] + m[2] * px + m[5] * py + m[8] * pz);
  };
}
