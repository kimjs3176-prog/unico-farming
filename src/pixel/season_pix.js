import { rampRGB, rampLen } from './pxl.js';

/**
 * 계절 화면 (도트판): 3D 판 sim/season.js 의 look 을 도트답게 '팔레트 바꾸기'로
 *  - 풀·잎·솔잎 램프의 색만 계절 색으로 바꿈 (모양은 그대로, 팔레트 밖 색 없음)
 *  - 봄: 연둣빛 풀 + 나무 셋 중 하나는 벚꽃 분홍 / 여름: 그대로 / 가을: 누런 풀 + 단풍(주황·빨강)
 *  - 겨울: 눈 덮인 땅, 서리 낀 나무, 눈 쌓인 솔잎·지붕
 */
const SWAP = {
  spring: {
    grass: ['#1a4232', '#285f3a', '#3a8442', '#56a24a', '#7fc05a', '#b6de74'],
    fol: ['#123224', '#1f5432', '#2f7a3a', '#4e9e44', '#82c45a', '#c0e47a'],
  },
  springAlt: { fol: ['#4a1a34', '#86305a', '#c45a88', '#e888ae', '#f8b6cf', '#ffe0ec'] },
  summer: {},
  autumn: {
    grass: ['#3a3420', '#5a5228', '#7e7234', '#9c8c40', '#bca652', '#dcc674'],
    fol: ['#3a160c', '#7a3214', '#b8561e', '#e0802c', '#f6aa48', '#ffd27a'],
  },
  autumnAlt: { fol: ['#38100e', '#701c18', '#a8302a', '#d4502e', '#ee7a48', '#ffb27a'] },
  winter: {
    grass: ['#4a5a7a', '#7d8cb0', '#a9b8d6', '#cdd8ec', '#e8eef8', '#ffffff'],
    fol: ['#2a3440', '#4a5a62', '#6e8086', '#98aaae', '#c8d6d8', '#eef4f6'],
    autumn: ['#2a3440', '#4a5a62', '#98aaae', '#c8d6d8', '#eef4f6'],
    pine: ['#0e2028', '#1a3a3a', '#3a5a58', '#c4d4dc', '#f2f6fa'],
    path: ['#4a3a38', '#7a6458', '#a08a7a', '#c4b4a6', '#e2d8ce', '#f4eee8'], // 눈 녹은 흙길
    // 지붕: 밝은(위를 향한) 두 단계에 눈
    roof: { 3: '#e8eef8', 4: '#ffffff' }, roofb: { 3: '#e8eef8', 4: '#ffffff' }, roofg: { 3: '#e8eef8', 4: '#ffffff' }, barn: { 3: '#e8eef8', 4: '#ffffff' },
    hay: { 4: '#ffffff' },
  },
};

const hexRGB = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const key = (r, g, b) => (r << 16) | (g << 8) | b;

/** 계절(+변형) → 색 바꾸기 표 Map(원래 rgb → 새 rgb) */
const MAPS = new Map();
export function seasonMap(season, alt = false) {
  const id = alt && SWAP[season + 'Alt'] ? season + 'Alt' : season;
  if (MAPS.has(id)) return MAPS.get(id);
  const tbl = { ...SWAP[season], ...(id !== season ? SWAP[id] : {}) };
  const m = new Map();
  for (const [rampName, to] of Object.entries(tbl)) {
    if (!to) continue;
    const n = rampLen(rampName);
    for (let l = 0; l < n; l++) {
      const dst = Array.isArray(to) ? to[Math.min(to.length - 1, Math.round((l / Math.max(1, n - 1)) * (to.length - 1)))] : to[l];
      if (!dst) continue;
      const [r, g, b] = rampRGB(rampName, l);
      m.set(key(r, g, b), hexRGB(dst));
    }
  }
  const out = m.size ? m : null;
  MAPS.set(id, out);
  return out;
}

/** 캔버스 픽셀 색 바꾸기 (제자리) */
export function swapCanvas(c, map) {
  if (!map) return c;
  const g = c.getContext('2d', { willReadFrequently: true });
  const img = g.getImageData(0, 0, c.width, c.height), d = img.data;
  let hit = false;
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    const to = map.get(key(d[i], d[i + 1], d[i + 2]));
    if (to) { d[i] = to[0]; d[i + 1] = to[1]; d[i + 2] = to[2]; hit = true; }
  }
  if (hit) g.putImageData(img, 0, 0);
  return c;
}

/** 그림 한 장의 계절판 (바뀐 곳이 없으면 원본 그대로) */
const CACHE = new Map();
export function seasonImg(img, season, alt = false) {
  if (!img || season === 'summer') return img;
  let per = CACHE.get(img);
  if (!per) { per = {}; CACHE.set(img, per); }
  const k = season + (alt ? '+' : '');
  if (per[k] !== undefined) return per[k];
  const map = seasonMap(season, alt);
  if (!map) return (per[k] = img);
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  c.getContext('2d').drawImage(img, 0, 0);
  swapCanvas(c, map);
  return (per[k] = c);
}

/** 들꽃 남길 비율 · 날리는 것 */
export const SEASON_FX = {
  spring: { flowers: 1, fall: 'petal' },
  summer: { flowers: 0.75, fall: null },
  autumn: { flowers: 0.3, fall: 'leaf' },
  winter: { flowers: 0, fall: 'snow' },
};
