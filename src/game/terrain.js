/**
 * 지형 높이 (언덕·고지). 마을·밭·목장·체험관은 평지(높이 0)로 두고, 맵 가장자리에 오를 수 있는 언덕을 둠.
 * 순수 함수라 렌더링 없이 테스트 가능 (tests/terrain.test.js)
 */

/** 언덕: 중심(x,z), 반지름 r, 높이 h. 꼭대기에 전망대(lookout) */
export const HILLS = [
  { id: 'sunrise', name: '해돋이 언덕', x: -31, z: -27, r: 12, h: 5.5, lookout: { x: -31, z: -27, rot: 0.9 } },
  { id: 'wind', name: '바람 언덕', x: -32, z: 31, r: 9.5, h: 4.2, lookout: { x: -32.5, z: 31.5, rot: -0.7 } },
  { id: 'meadow', name: '들꽃 언덕', x: 7, z: 35.5, r: 9, h: 3.6, lookout: { x: 7, z: 36, rot: Math.PI } },
  { id: 'west', name: '서쪽 전망 언덕', x: -36, z: 0, r: 8, h: 3.2, lookout: { x: -36.5, z: 0, rot: Math.PI / 2 } },
];

/** 숨은 보물 상자 (언덕 비탈·숲 가장자리). 하루에 한 번씩 다시 채워짐 */
export const CHESTS = [
  { id: 'c1', x: -25.5, z: -33.5 }, { id: 'c2', x: -37, z: -20 }, { id: 'c3', x: -26.5, z: 36 },
  { id: 'c4', x: 13, z: 37.5 }, { id: 'c5', x: -37.5, z: 6.5 }, { id: 'c6', x: 1, z: 38 },
];

const smooth = (t) => t * t * (3 - 2 * t);

/** (x,z) 의 지면 높이(m) */
export function heightAt(x, z) {
  let h = 0;
  for (const H of HILLS) {
    const dx = x - H.x, dz = z - H.z, d2 = dx * dx + dz * dz;
    if (d2 >= H.r * H.r) continue;
    const t = 1 - Math.sqrt(d2) / H.r;
    // 둥근 언덕 + 꼭대기는 살짝 평평 (전망대 자리)
    h = Math.max(h, H.h * smooth(Math.min(1, t * 1.15)));
  }
  // 맵 바깥으로 갈수록 완만히 솟는 지형 (경계 너머 숲이 언덕 위로)
  const R = Math.hypot(x, z);
  if (R > 42) h += (R - 42) * 0.35;
  return h;
}

/** 지면 법선 (기울기 확인·소품 기울이기용) */
export function normalAt(x, z, e = 0.3) {
  const hx = heightAt(x + e, z) - heightAt(x - e, z), hz = heightAt(x, z + e) - heightAt(x, z - e);
  const n = [-hx / (2 * e), 1, -hz / (2 * e)];
  const l = Math.hypot(...n);
  return n.map((v) => v / l);
}

/** 가장 가까운 언덕과 꼭대기까지 거리 */
export function hillAt(x, z) {
  for (const H of HILLS) if (Math.hypot(x - H.x, z - H.z) < H.r) return H;
  return null;
}
