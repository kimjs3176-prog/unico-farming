/**
 * 글자 명암 대비 (WCAG 2.1 SC 1.4.3) — 순수 함수, 테스트: tests/contrast.test.js
 * 점검 스크립트 scripts/a11y-check.mjs 와 같은 공식
 */
const lin = (v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);

/** '#rrggbb' → 상대 휘도 (0~1). 형식이 틀리면 null */
export function luminance(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return null;
  const [r, g, b] = [0, 2, 4].map((i) => lin(parseInt(m[1].slice(i, i + 2), 16) / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** 두 색의 명암 대비 (1~21) */
export function contrast(a, b) {
  const x = luminance(a), y = luminance(b);
  if (x === null || y === null) return null;
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

export const INK = '#231916';

/** 배경색 위에서 더 잘 읽히는 글자색: 흰색 또는 진한 갈색(INK) 중 대비가 큰 쪽 */
export function textOn(bg) {
  if (luminance(bg) === null) return '#fff';
  return contrast('#ffffff', bg) >= contrast(INK, bg) ? '#fff' : INK;
}
