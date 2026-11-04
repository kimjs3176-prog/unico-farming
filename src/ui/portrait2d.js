import { PALETTES } from '../game/unico.js';

/**
 * 대화창 2D 초상화 (SVG 일러스트)
 *  - 캐릭터의 팔레트(몸·주둥이·갈기 색)와 옷차림(밀짚모자·안전모·고글·스카프·새싹)을 그대로 따라 그림
 *  - 3D 장면을 찍지 않으므로 가로등·나무에 가려지지 않고, 낮·밤과 상관없이 늘 같은 밝기
 *  - 말하는 동안 입이 열렸다 닫히고(.dlg:not(.done)), 가끔 눈을 깜빡임 (CSS)
 *  - 반려견 콩이(시바견) 초상화도 있음: portraitSVG(null, { kind: 'dog' })
 */
const OFFICIAL = { body: 0xffffff, snout: 0xf7e1ec, mane: 0x30b6aa, maneD: 0x249d92, hoof: 0x2aa79b };
const SCARF = { red: ['#e35d5d', '#c24444'], green: ['#7ac943', '#5ea72f'], blue: ['#4a90d9', '#3473b8'] };
const hex = (n) => `#${(n >>> 0).toString(16).padStart(6, '0')}`;
const LINE = '#5b4434';

/** 말하는 사람 색으로 배경 그라데이션 */
function bg(id, accent) {
  return `<defs>
    <radialGradient id="${id}bg" cx="45%" cy="36%" r="78%"><stop offset="0" stop-color="#fffdf6"/><stop offset="0.6" stop-color="${accent}" stop-opacity="0.3"/><stop offset="1" stop-color="${accent}" stop-opacity="0.62"/></radialGradient>
    <radialGradient id="${id}sh" cx="50%" cy="40%" r="60%"><stop offset="0.7" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.10"/></radialGradient>
    <pattern id="${id}dots" width="16" height="16" patternUnits="userSpaceOnUse"><circle cx="4" cy="4" r="1.6" fill="#fff" fill-opacity="0.35"/></pattern>
  </defs>
  <rect width="200" height="200" fill="url(#${id}bg)"/><rect width="200" height="200" fill="url(#${id}dots)"/>
  <ellipse cx="100" cy="214" rx="110" ry="52" fill="#fff" fill-opacity="0.22"/>`;
}

/** 눈 (깜빡임 그룹 · 반짝이 두 개) */
const eye = (x, y, rx = 9.5, ry = 12.5) => `<g class="p2-eye" style="transform-origin:${x}px ${y}px">
  <ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="#1d1512"/>
  <ellipse cx="${x + rx * 0.3}" cy="${y - ry * 0.38}" rx="${rx * 0.42}" ry="${ry * 0.36}" fill="#fff"/>
  <circle cx="${x - rx * 0.35}" cy="${y + ry * 0.42}" r="${rx * 0.2}" fill="#fff" fill-opacity="0.85"/></g>`;

/** 입: 닫힌 미소 + 말할 때 벌린 입 (CSS 로 번갈아 보임) */
const mouth = (x, y, w = 13) => `<path class="p2-mc" d="M${x - w} ${y - 2} Q${x} ${y + 9} ${x + w} ${y - 2}" fill="none" stroke="${LINE}" stroke-width="3.2" stroke-linecap="round"/>
  <g class="p2-mo"><path d="M${x - w * 0.8} ${y - 3} Q${x} ${y - 1} ${x + w * 0.8} ${y - 3} Q${x + w * 0.6} ${y + 12} ${x} ${y + 12} Q${x - w * 0.6} ${y + 12} ${x - w * 0.8} ${y - 3} Z" fill="#7a2f2f" stroke="${LINE}" stroke-width="2.6" stroke-linejoin="round"/>
  <ellipse cx="${x}" cy="${y + 8}" rx="${w * 0.42}" ry="3.2" fill="#f27c8c"/></g>`;

/** 유니코 (주인공·주민·체험관 담당) */
function unicoSVG(u, accent, id) {
  const P = PALETTES[u?.palette] || OFFICIAL;
  const f = u?.outfit || {};
  const body = hex(P.body), snout = hex(P.snout), mane = hex(P.mane), maneD = hex(P.maneD);
  const hat = f.hat, sprout = f.sprout && !hat;
  const sc = SCARF[f.scarf];
  let s = bg(id, accent);
  // 어깨·몸
  s += `<path d="M38 200 Q42 158 100 152 Q158 158 162 200 Z" fill="${body}" stroke="${LINE}" stroke-opacity="0.35" stroke-width="2.5"/>`;
  // 뒤 갈기 (오른쪽 뒤로 넘어감)
  s += `<path d="M128 58 Q170 62 166 104 Q164 132 146 146 Q154 116 140 98 Z" fill="${maneD}"/>
        <path d="M122 54 Q160 52 160 92 Q158 118 142 130 Q146 104 132 90 Z" fill="${mane}"/>`;
  // 귀
  const ear = (x, flip) => `<path d="M${x} 74 Q${x + 4 * flip} 34 ${x + 22 * flip} 38 Q${x + 30 * flip} 58 ${x + 22 * flip} 80 Z" fill="${body}" stroke="${LINE}" stroke-opacity="0.4" stroke-width="2.5"/>
        <path d="M${x + 5 * flip} 70 Q${x + 8 * flip} 46 ${x + 19 * flip} 47 Q${x + 23 * flip} 61 ${x + 18 * flip} 74 Z" fill="#f6b8c8"/>`;
  s += ear(58, -1) + ear(142, 1);
  // 머리 (둥근 큰 얼굴) + 그늘
  s += `<ellipse cx="100" cy="104" rx="60" ry="55" fill="${body}" stroke="${LINE}" stroke-opacity="0.45" stroke-width="2.8"/>
        <ellipse cx="100" cy="104" rx="60" ry="55" fill="url(#${id}sh)"/>`;
  // 주둥이 (아래쪽 연한 색) + 콧구멍
  s += `<ellipse cx="100" cy="130" rx="40" ry="24" fill="${snout}"/>
        <ellipse cx="88" cy="124" rx="3" ry="2.2" fill="${LINE}" fill-opacity="0.75"/><ellipse cx="112" cy="124" rx="3" ry="2.2" fill="${LINE}" fill-opacity="0.75"/>`;
  // 앞 갈기 (이마 위 몽글몽글)
  s += `<path d="M66 70 Q70 46 94 48 Q102 36 116 44 Q136 44 136 66 Q124 58 112 62 Q100 54 88 62 Q76 60 66 70 Z" fill="${mane}"/>
        <path d="M80 60 Q92 50 104 56" fill="none" stroke="#fff" stroke-opacity="0.45" stroke-width="3" stroke-linecap="round"/>`;
  // 볼·눈·입
  s += `<ellipse cx="62" cy="116" rx="11" ry="7" fill="#f7a1b5" fill-opacity="0.75"/><ellipse cx="138" cy="116" rx="11" ry="7" fill="#f7a1b5" fill-opacity="0.75"/>`;
  s += eye(78, 100) + eye(122, 100);
  if (f.goggles) s += `<g fill="none" stroke="#3b3f46" stroke-width="4.5"><circle cx="78" cy="100" r="17"/><circle cx="122" cy="100" r="17"/><path d="M95 99 Q100 95 105 99"/></g>
        <circle cx="78" cy="100" r="15" fill="#bfe6ff" fill-opacity="0.22"/><circle cx="122" cy="100" r="15" fill="#bfe6ff" fill-opacity="0.22"/>
        <path d="M66 92 L74 86" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-opacity="0.8"/><path d="M110 92 L118 86" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-opacity="0.8"/>`;
  s += mouth(100, 138);
  // 스카프 (턱 아래 삼각 + 매듭)
  if (sc) s += `<path d="M58 152 Q100 172 142 152 L134 166 Q100 180 66 166 Z" fill="${sc[0]}" stroke="${sc[1]}" stroke-width="2"/>
        <path d="M92 168 L100 198 L112 168 Z" fill="${sc[0]}" stroke="${sc[1]}" stroke-width="2" stroke-linejoin="round"/><circle cx="102" cy="168" r="6" fill="${sc[1]}"/>`;
  // 뿔 (금색 나선)
  const horn = `<path d="M90 52 L100 8 L110 52 Z" fill="#f2c23a" stroke="#b8860b" stroke-width="2.4" stroke-linejoin="round"/>
        <g stroke="#c9961a" stroke-width="2.6" stroke-linecap="round"><path d="M93 42 L107 37"/><path d="M95 31 L105 27"/><path d="M97 21 L103 18"/></g>
        <path d="M96 46 L100 14" stroke="#fff3b0" stroke-width="2" stroke-linecap="round" stroke-opacity="0.8"/>`;
  if (hat === 'straw') s += `<ellipse cx="100" cy="58" rx="74" ry="15" fill="#f1d27a" stroke="#b98d3a" stroke-width="2.6"/>
        <path d="M68 56 Q70 26 100 26 Q130 26 132 56 Z" fill="#f4da8a" stroke="#b98d3a" stroke-width="2.6"/>
        <path d="M69 50 Q100 58 131 50 L131 42 Q100 50 69 42 Z" fill="#8b5a2b"/>
        <path d="M80 36 Q100 32 120 36" fill="none" stroke="#c9a24a" stroke-width="2"/>` + horn.replace('M90 52 L100 8 L110 52', 'M93 30 L100 2 L107 30');
  else if (hat === 'helmet') s += `<path d="M58 64 Q60 22 100 20 Q140 22 142 64 Z" fill="#fac03e" stroke="#c48a12" stroke-width="2.6"/>
        <ellipse cx="100" cy="64" rx="50" ry="9" fill="#f0a91c" stroke="#c48a12" stroke-width="2.4"/><path d="M92 22 L92 62 M108 22 L108 62" stroke="#e8a114" stroke-width="5"/>
        <path d="M70 40 Q78 30 90 28" stroke="#fff" stroke-opacity="0.6" stroke-width="4" fill="none" stroke-linecap="round"/>`;
  else s += horn;
  if (sprout) s += `<path d="M118 50 Q120 40 124 34" stroke="#5ea72f" stroke-width="3" fill="none" stroke-linecap="round"/>
        <path d="M124 34 Q132 20 148 24 Q140 38 124 34 Z" fill="#8bd45a" stroke="#5ea72f" stroke-width="2"/>
        <path d="M123 36 Q112 24 102 30 Q110 40 123 36 Z" fill="#a6e07a" stroke="#5ea72f" stroke-width="2"/>`;
  return s;
}

/** 반려견 콩이 (시바견) */
function dogSVG(accent, id) {
  const fur = '#e39a4a', furD = '#c97c2e', cream = '#fff4e2';
  let s = bg(id, accent);
  s += `<path d="M40 200 Q46 156 100 150 Q154 156 160 200 Z" fill="${fur}" stroke="${LINE}" stroke-opacity="0.35" stroke-width="2.5"/>
        <path d="M74 200 Q80 166 100 162 Q120 166 126 200 Z" fill="${cream}"/>`;
  const ear = (x, flip) => `<path d="M${x} 82 L${x + 8 * flip} 30 L${x + 40 * flip} 62 Z" fill="${fur}" stroke="${LINE}" stroke-opacity="0.45" stroke-width="2.5" stroke-linejoin="round"/>
        <path d="M${x + 7 * flip} 72 L${x + 11 * flip} 44 L${x + 30 * flip} 63 Z" fill="#f6c7a8"/>`;
  s += ear(52, 1) + ear(148, -1);
  s += `<ellipse cx="100" cy="106" rx="60" ry="53" fill="${fur}" stroke="${LINE}" stroke-opacity="0.45" stroke-width="2.8"/>
        <path d="M44 118 Q60 96 84 102 Q100 92 116 102 Q140 96 156 118 Q150 156 100 158 Q50 156 44 118 Z" fill="${cream}"/>
        <ellipse cx="100" cy="106" rx="60" ry="53" fill="url(#${id}sh)"/>
        <ellipse cx="76" cy="84" rx="7" ry="4" fill="${cream}"/><ellipse cx="124" cy="84" rx="7" ry="4" fill="${cream}"/>
        <path d="M62 64 Q100 50 138 64" fill="none" stroke="${furD}" stroke-width="3" stroke-opacity="0.5" stroke-linecap="round"/>`;
  s += eye(78, 102, 8, 10) + eye(122, 102, 8, 10);
  s += `<ellipse cx="100" cy="122" rx="9" ry="6.5" fill="#2a1d18"/><ellipse cx="97" cy="120" rx="3" ry="2" fill="#fff" fill-opacity="0.7"/>
        <ellipse cx="62" cy="122" rx="9" ry="6" fill="#f7a1b5" fill-opacity="0.7"/><ellipse cx="138" cy="122" rx="9" ry="6" fill="#f7a1b5" fill-opacity="0.7"/>`;
  s += mouth(100, 136, 11);
  s += `<path d="M62 152 Q100 170 138 152 L132 164 Q100 178 68 164 Z" fill="#e35d5d" stroke="#c24444" stroke-width="2"/><circle cx="100" cy="172" r="7" fill="#fac03e" stroke="#c48a12" stroke-width="2"/>`;
  return s;
}

let seq = 0;
/**
 * @param unico Unico (palette·outfit 사용) 또는 null
 * @param o { accent, kind: 'unico'|'dog' }
 * @returns SVG 요소
 */
export function portraitSVG(unico, { accent = '#30b6aa', kind = 'unico' } = {}) {
  const id = `p2_${seq++}_`;
  const inner = kind === 'dog' ? dogSVG(accent, id) : unicoSVG(unico, accent, id);
  const wrap = document.createElement('div');
  wrap.innerHTML = `<svg class="p2" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-hidden="true">${inner}</svg>`;
  return wrap.firstChild;
}
