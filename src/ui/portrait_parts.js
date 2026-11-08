// 2D 초상화(SVG) 공통 부품: 선 색·배경·눈·입 (portrait2d.js 의 콩이, portrait_species.js 의 주민 동물이 같이 씀)

/** 윤곽선 색 */
export const LINE = '#5b4434';

/** 말하는 사람 색으로 배경 그라데이션 (+ 그늘 #sh, 물방울 무늬) */
export function bg(id, accent) {
  return `<defs>
    <radialGradient id="${id}bg" cx="45%" cy="36%" r="78%"><stop offset="0" stop-color="#fffdf6"/><stop offset="0.6" stop-color="${accent}" stop-opacity="0.3"/><stop offset="1" stop-color="${accent}" stop-opacity="0.62"/></radialGradient>
    <radialGradient id="${id}sh" cx="50%" cy="40%" r="60%"><stop offset="0.7" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.10"/></radialGradient>
    <pattern id="${id}dots" width="16" height="16" patternUnits="userSpaceOnUse"><circle cx="4" cy="4" r="1.6" fill="#fff" fill-opacity="0.35"/></pattern>
  </defs>
  <rect width="200" height="200" fill="url(#${id}bg)"/><rect width="200" height="200" fill="url(#${id}dots)"/>
  <ellipse cx="100" cy="214" rx="110" ry="52" fill="#fff" fill-opacity="0.22"/>`;
}

/** 눈 (깜빡임 그룹 · 반짝이 두 개) */
export const eye = (x, y, rx = 9.5, ry = 12.5) => `<g class="p2-eye" style="transform-origin:${x}px ${y}px">
  <ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="#1d1512"/>
  <ellipse cx="${x + rx * 0.3}" cy="${y - ry * 0.38}" rx="${rx * 0.42}" ry="${ry * 0.36}" fill="#fff"/>
  <circle cx="${x - rx * 0.35}" cy="${y + ry * 0.42}" r="${rx * 0.2}" fill="#fff" fill-opacity="0.85"/></g>`;

/** 말할 때 벌린 입 (p2-mo: 말하는 동안만 보임) */
export const mouthOpen = (x, y, w = 13) => `<g class="p2-mo"><path d="M${x - w * 0.8} ${y - 3} Q${x} ${y - 1} ${x + w * 0.8} ${y - 3} Q${x + w * 0.6} ${y + 12} ${x} ${y + 12} Q${x - w * 0.6} ${y + 12} ${x - w * 0.8} ${y - 3} Z" fill="#7a2f2f" stroke="${LINE}" stroke-width="2.6" stroke-linejoin="round"/>
  <ellipse cx="${x}" cy="${y + 8}" rx="${w * 0.42}" ry="3.2" fill="#f27c8c"/></g>`;

/** 입: 닫힌 미소 + 말할 때 벌린 입 (CSS 로 번갈아 보임) */
export const mouth = (x, y, w = 13) => `<path class="p2-mc" d="M${x - w} ${y - 2} Q${x} ${y + 9} ${x + w} ${y - 2}" fill="none" stroke="${LINE}" stroke-width="3.2" stroke-linecap="round"/>
  ${mouthOpen(x, y, w)}`;
