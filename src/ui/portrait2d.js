import { PALETTES } from '../game/unico.js';

/**
 * 대화창 2D 초상화
 *  - 유니코: 처음 받은 캐릭터 원본 그림(포즈별, public/portraits/*.webp)에서 얼굴·상반신을 잘라 씀
 *    역할·감정에 맞는 포즈 (안내 = 확성기, 연구원 = 실험복, 안내데스크 = 발표 …)
 *    주민·체험관 담당은 원본 그림 그대로 갈기 색만 그 캐릭터 색으로 바꿔 구분 (주인공은 원본 색 그대로)
 *  - 3D 장면을 찍지 않으므로 가로등·나무에 가려지지 않고, 낮·밤과 상관없이 늘 같은 밝기
 *  - 반려견 콩이(시바견): 원본 그림이 없어 SVG 로 그림 (말할 때 입이 움직이고 눈을 깜빡임)
 */
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

/** 원본 그림 포즈: 감정표현 → 포즈, 역할(팔레트) → 기본 포즈 */
const POSES = ['front', 'wave', 'cheer', 'heart', 'think', 'megaphone', 'lab', 'idle', 'safety', 'tablet', 'phone', 'water', 'present', 'side'];
const BY_EMOTE = { wave: 'wave', cheer: 'cheer', heart: 'heart', think: 'think', megaphone: 'megaphone', present: 'present', safety: 'safety', water: 'water', lab: 'lab', phone: 'phone', tablet: 'tablet' };
const BY_ROLE = {
  official: 'front', guide: 'megaphone', merchant: 'idle', researcher: 'lab', granny: 'heart', kid: 'cheer', fisher: 'side',
  koat_desk: 'present', koat_tech: 'present', koat_venture: 'phone', koat_seed: 'idle', koat_smart: 'tablet', koat_machine: 'safety', koat_env: 'lab',
};
export function poseFor(palette, emote) { return BY_EMOTE[emote] || BY_ROLE[palette] || 'front'; }

const BASE = (import.meta.env?.BASE_URL || '/') + 'portraits/';
const imgs = new Map();
function load(pose) {
  if (!imgs.has(pose)) {
    const im = new Image();
    im.decoding = 'async';
    im.src = `${BASE}${pose}.webp`;
    imgs.set(pose, im);
  }
  return imgs.get(pose);
}
/** 처음 대화가 뜨기 전에 미리 받아 둠 */
export function preloadPortraits() { for (const p of POSES) load(p); }

/** 갈기(청록) 색만 바꾸기: 색상·채도는 목표 색으로, 밝기는 원본 비율 유지 */
function toHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}
function fromHsl(h, s, l) {
  if (!s) return [l, l, l].map((v) => Math.round(v * 255));
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = (t) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)].map((v) => Math.round(v * 255));
}
const TEAL_L = 0.45; // 원본 갈기 밝기 (#30b6aa 부근)
function recolor(ctx, size, mane) {
  const [th, ts, tl] = toHsl((mane >> 16) & 255, (mane >> 8) & 255, mane & 255);
  const img = ctx.getImageData(0, 0, size, size), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 8) continue;
    const [h, s, l] = toHsl(d[i], d[i + 1], d[i + 2]);
    if (s < 0.3 || h < 0.42 || h > 0.56) continue; // 청록 계열만
    const [r, g, b] = fromHsl(th, Math.min(1, ts * (s / 0.6)), Math.min(0.95, l * (tl / TEAL_L)));
    d[i] = r; d[i + 1] = g; d[i + 2] = b;
  }
  ctx.putImageData(img, 0, 0);
}

/** 말하는 사람 색 배경 + 원본 그림 (그림이 아직 안 왔으면 받는 대로 그림) */
function unicoCanvas(u, accent, emote) {
  const size = 256;
  if (!/^#[0-9a-f]{6}$/i.test(accent)) accent = '#30b6aa';
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  cv.className = 'p2';
  const ctx = cv.getContext('2d');
  const grad = ctx.createRadialGradient(size * 0.45, size * 0.36, size * 0.04, size * 0.5, size * 0.5, size * 0.78);
  grad.addColorStop(0, '#fffdf6'); grad.addColorStop(0.6, `${accent}4d`); grad.addColorStop(1, `${accent}9e`);
  const pal = u?.palette || 'official';
  const im = load(poseFor(pal, emote));
  const draw = () => {
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = grad; ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.beginPath(); ctx.ellipse(size / 2, size * 1.07, size * 0.56, size * 0.27, 0, 0, Math.PI * 2); ctx.fill();
    if (!im.complete || !im.naturalWidth) return;
    const mane = PALETTES[pal]?.mane;
    if (mane === undefined) { ctx.drawImage(im, 0, 0, size, size); return; }
    // 그림만 따로 색을 바꾼 뒤 배경 위에 얹음
    const tmp = document.createElement('canvas'); tmp.width = tmp.height = size;
    const tc = tmp.getContext('2d'); tc.drawImage(im, 0, 0, size, size);
    try { recolor(tc, size, mane); } catch { /* 색 바꾸기 실패 시 원본 */ }
    ctx.drawImage(tmp, 0, 0);
  };
  draw();
  if (!im.complete) im.addEventListener('load', draw, { once: true });
  return cv;
}

/**
 * @param unico Unico (palette 사용) 또는 null
 * @param o { accent, kind: 'unico'|'dog', emote }
 * @returns 초상화 요소 (canvas 또는 SVG)
 */
export function portraitSVG(unico, { accent = '#30b6aa', kind = 'unico', emote } = {}) {
  if (kind !== 'dog') return unicoCanvas(unico, accent, emote);
  const id = `p2_${seq++}_`;
  const wrap = document.createElement('div');
  wrap.innerHTML = `<svg class="p2" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-hidden="true">${dogSVG(accent, id)}</svg>`;
  return wrap.firstChild;
}
