// 자체 SVG 아이콘: 한 장짜리 그림 묶음(icons.svg)을 body 앞에 한 번 넣고 <use href="#i-이름"> 으로 씀
// (OS 마다 다르게 그려지는 이모지 대신 어디서나 같은 그림, 추가 내려받기·깜빡임 없음)
// 캔버스(미니맵·머리 위 이름표)는 icoBitmap 으로 그림 한 장(data: 주소)을 만들어 drawImage

/** 그림 묶음 원문: Vite 가 빌드 때 글자로 넣음. node 테스트에는 없음(빈 글) */
let SPRITE = '';
try {
  SPRITE = Object.values(import.meta.glob('./icons.svg', { query: '?raw', import: 'default', eager: true }))[0] || '';
} catch { SPRITE = ''; }

/** 테스트·다른 곳에서 그림 묶음 원문을 넣을 때 */
export function setSprite(src) { SPRITE = String(src || ''); BMP.clear(); }
export const spriteSource = () => SPRITE;

/** 그림 묶음 원문에서 아이콘 이름 목록 ('i-' 뺀 것) */
export function spriteNames(src = SPRITE) {
  return [...String(src).matchAll(/<symbol id="i-([\w-]+)"/g)].map((m) => m[1]);
}

/** 그림 묶음을 body 맨 앞에 한 번 넣음 (이미 있으면 그대로). 넣었으면 true */
export function injectSprite(doc = typeof document !== 'undefined' ? document : null, src = SPRITE) {
  if (!doc?.body || !src || doc.getElementById?.('unico-icons')) return false;
  doc.body.insertAdjacentHTML('afterbegin', src);
  return true;
}

/** 아이콘 하나의 HTML. cls 로 크기·색 조절 (.ico 는 글자 크기 1.25배) */
export function ico(name, cls = '') {
  return `<svg class="ico${cls ? ' ' + cls : ''}" aria-hidden="true" focusable="false"><use href="#i-${name}"/></svg>`;
}

/** 계절 이모지 → 아이콘 (season_view 는 이모지를 넘김) */
export const SEASON_ICO = { '🌸': 'spring', '☀️': 'sun', '☀': 'sun', '🍁': 'autumn', '❄️': 'winter', '❄': 'winter' };

/** 날씨 상태(describeWeather 결과) → 아이콘 (weather.js 의 이모지는 그대로 두고 코드·종류로 고름) */
export function weatherIco(w) {
  if (!w) return 'sun';
  const k = w.kind;
  if (k === 'clear') return w.isDay === false ? 'moon' : w.code === 1 ? 'suncloud' : 'sun';
  if (k === 'cloudy') return w.code === 2 ? 'suncloud' : 'cloud';
  return { fog: 'fog', rain: 'rain', snow: 'snow', storm: 'storm' }[k] || 'cloud';
}

/**
 * 오래된 기기(Windows 10·옛 안드로이드·iOS)에 없는 Emoji 13 이후 글자 → 옛 이모지 또는 자체 아이콘
 * items.js·decor.js 의 글자는 도트 판과 함께 쓰므로 고치지 않고, 3D 판 화면이 보여 줄 때만 바꿈
 * ico: 자체 아이콘 이름 (HTML 자리), alt: 글자만 쓸 수 있는 자리(알림·캔버스)
 */
export const EMOJI_OVERRIDE = {
  '🫏': { alt: '🐴' }, '🪷': { alt: '🌸' }, '🫙': { alt: '🏺' }, '🪴': { alt: '🌿' }, '🫐': { alt: '🍇' },
  '🪱': { alt: '🐛' }, '🪰': { alt: '🦟' }, '🪲': { alt: '🐞' }, '🛻': { alt: '🚚' }, '🪟': { alt: '🖼️' },
  '🪮': { ico: 'comb', alt: '🖌️' }, '🪣': { ico: 'bucket', alt: '🧺' }, '🪵': { ico: 'log', alt: '🌲' }, '🪨': { ico: 'rock', alt: '⛰️' },
};
const OVR_RE = new RegExp(Object.keys(EMOJI_OVERRIDE).join('|'), 'gu');

/** 글자만 쓰는 자리: 새 이모지를 옛 이모지로 */
export const fixEmoji = (s) => String(s ?? '').replace(OVR_RE, (c) => EMOJI_OVERRIDE[c].alt);
/** HTML 자리: 자체 아이콘이 있으면 아이콘, 없으면 옛 이모지 (s 는 이미 안전한 글이어야 함) */
export const emojiHtml = (s) => String(s ?? '').replace(OVR_RE, (c) => (EMOJI_OVERRIDE[c].ico ? ico(EMOJI_OVERRIDE[c].ico) : EMOJI_OVERRIDE[c].alt));

/** 그림 한 장(data: 주소)으로 만든 아이콘 캐시: 이름|크기 → { img, ready } */
const BMP = new Map();
/** 그림 묶음에서 아이콘 하나를 따로 된 SVG 글로 (없으면 null) */
export function symbolSvg(name, px = 24, src = SPRITE) {
  const m = String(src).match(new RegExp(`<symbol id="i-${name}" viewBox="([^"]+)">([\\s\\S]*?)</symbol>`));
  if (!m) return null;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${m[1]}" width="${px}" height="${px}" color="#4a2c18">${m[2]}</svg>`;
}
/**
 * 캔버스용 아이콘 그림: 처음 부르면 만들기 시작하고, 다 읽히면 onload(한 번) 를 부름
 * @returns { img, ready } 또는 null (그림 묶음·Image 가 없는 환경)
 */
export function icoBitmap(name, px = 24, onload) {
  const key = `${name}|${px}`;
  let e = BMP.get(key);
  if (!e) {
    const svg = symbolSvg(name, px);
    if (!svg || typeof Image === 'undefined') return null;
    const img = new Image(px, px);
    e = { img, ready: false, wait: [] };
    img.onload = () => { e.ready = true; const w = e.wait; e.wait = []; for (const f of w) { try { f(); } catch { /* 다시 그리기 실패는 무시 */ } } };
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    BMP.set(key, e);
  }
  if (!e.ready && onload) e.wait.push(onload);
  return e;
}
