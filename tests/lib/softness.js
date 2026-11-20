// glTF 프리미티브 법선 부드러움 측정 (animal_normals·cc0_foliage 테스트 공용)
/** 부드러움: 모서리마다 (1 - |정점 법선·면 법선|) 평균. 면마다 법선이 같은(각진) 모델은 0 */
export function softness(prim) {
  const pos = prim.getAttribute('POSITION'), nor = prim.getAttribute('NORMAL'), I = prim.getIndices().getArray();
  const a = [], b = [], c = [], n = [];
  let sum = 0, cnt = 0;
  for (let t = 0; t < I.length; t += 3) {
    pos.getElement(I[t], a); pos.getElement(I[t + 1], b); pos.getElement(I[t + 2], c);
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const f = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]], fl = Math.hypot(...f);
    if (fl < 1e-9) continue;
    for (let k = 0; k < 3; k++) {
      nor.getElement(I[t + k], n);
      const nl = Math.hypot(...n) || 1;
      sum += 1 - Math.abs((n[0] * f[0] + n[1] * f[1] + n[2] * f[2]) / (nl * fl));
      cnt++;
    }
  }
  return sum / cnt;
}
