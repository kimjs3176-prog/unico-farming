// 아이템 아이콘: itemIcon(열쇠, { size, locked }) → 그림 한 칸 HTML
//  - 처음엔 이모지, 창을 처음 열 때 구운 아이콘 아틀라스(item_icons.gen.js + public/ui/items.webp)를 늦게 받아 옴 (첫 화면 비용 없음)
//  - 아틀라스가 오면 열린 창의 이모지 칸을 묶음째 바꿈 — 한 묶음(창) 안에 이모지와 구운 그림을 섞지 않음
//  - 구운 그림은 CATS_DONE 에 든 분류이고 칸(CELLS)이 있을 때만
//  - locked: 못 만난 도감 칸 → 같은 그림의 검은 그림자 (.ico.locked)
// UI 믹스인: BagPanel 에 합쳐져 this.itemIcon?.(…) 로 부름 (HUD 가방 날기 등)
import { ITEMS } from '../game/sim/items.js';
import { CROPS, PRODUCTS } from '../game/sim/crops.js';
import { COSTUME } from '../game/sim/costume.js';
import { DECOR_BY_ID } from '../game/sim/decor.js';

/** 열쇠 → 아틀라스 분류 (crop·product·feed·costume·decor 또는 ITEMS 의 cat) */
export function iconCat(key) {
  if (key === 'feed') return 'feed';
  if (typeof key !== 'string') return null;
  if (key.startsWith('costume:')) return COSTUME[key.slice(8)] ? 'costume' : null;
  if (key.startsWith('decor:')) return DECOR_BY_ID[key.slice(6)] ? 'decor' : null;
  if (key.startsWith('seed:')) return CROPS[key.slice(5)] ? 'crop' : null; // 씨앗 봉투: 작물 그림
  if (CROPS[key]) return 'crop';
  if (PRODUCTS[key]) return 'product';
  return ITEMS[key]?.cat ?? null;
}

/** 열쇠 → 이모지 (모르면 ❔) */
export function iconEmoji(key) {
  if (key === 'feed') return '🌾';
  if (typeof key !== 'string') return '❔';
  if (key.startsWith('costume:')) return COSTUME[key.slice(8)]?.icon ?? '❔';
  if (key.startsWith('decor:')) return DECOR_BY_ID[key.slice(6)]?.icon ?? '❔';
  if (key.startsWith('seed:')) return CROPS[key.slice(5)]?.emoji ?? '❔';
  return CROPS[key]?.emoji ?? PRODUCTS[key]?.emoji ?? ITEMS[key]?.emoji ?? '❔';
}

/** 아틀라스 열쇠 (씨앗 봉투는 작물 칸) */
const atlasKey = (key) => (typeof key === 'string' && key.startsWith('seed:') ? key.slice(5) : key);

// 아틀라스 상태: gen 모듈 + 장마다 받아 둔 그림 (ready[장] = true)
let atlas = null, loading = null;
const ready = [], sheetLoading = [];
const done = () => new Set(atlas?.CATS_DONE || []);

const baseUrl = () => {
  let b = '/';
  try { b = import.meta.env?.BASE_URL || '/'; } catch { /* node 시험 */ }
  return b.replace(/\/$/, '');
};

/** 이 열쇠를 구운 그림으로 그릴 수 있나 (아틀라스·그 장이 준비됐고 다 구운 분류) */
export function canBake(key) {
  if (!atlas) return false;
  const k = atlasKey(key), cell = atlas.CELLS?.[k];
  if (!cell || !done().has(iconCat(key))) return false;
  return !!ready[cell[2] || 0];
}
/** 묶음 전체를 구운 그림으로 그릴 수 있나 (하나라도 안 되면 묶음 모두 이모지) */
export const canBakeAll = (keys) => keys.length > 0 && keys.every(canBake);

/** 그림 한 칸 HTML. baked: 묶음 기준 결정을 넘겨받음 (없으면 이 열쇠만 보고 정함) */
export function itemIconHtml(key, { size = 0, locked = false, baked, cls = '' } = {}) {
  const st = size ? `font-size:${size}px;` : '';
  const c = `ico${locked ? ' locked' : ''}${cls ? ` ${cls}` : ''}`;
  const use = baked === undefined ? canBake(key) : baked && canBake(key);
  if (!use) return `<span class="${c} em" data-ik="${key}" aria-hidden="true"${st ? ` style="${st}"` : ''}>${iconEmoji(key)}</span>`;
  const [col, row, sheet = 0] = atlas.CELLS[atlasKey(key)];
  const rows = atlas.ROWS[sheet] || 1, cols = atlas.COLS;
  const x = cols > 1 ? (col / (cols - 1)) * 100 : 0, y = rows > 1 ? (row / (rows - 1)) * 100 : 0;
  const url = baseUrl() + atlas.URLS[sheet];
  return `<span class="${c} it" data-ik="${key}" aria-hidden="true" style="${st}background-image:url('${url}');background-size:${cols * 100}% ${rows * 100}%;background-position:${x.toFixed(3)}% ${y.toFixed(3)}%"></span>`;
}

/** 한 장 그림 받기 (브라우저에서만): 다 풀린 뒤 ready → 열린 창의 이모지 칸을 바꿈 */
function loadSheet(i) {
  if (ready[i] || sheetLoading[i] || !atlas || typeof Image === 'undefined') return;
  sheetLoading[i] = true;
  const img = new Image();
  img.src = baseUrl() + atlas.URLS[i];
  const ok = () => { ready[i] = true; refreshItemIcons(); };
  (img.decode ? img.decode() : new Promise((res, rej) => { img.onload = res; img.onerror = rej; })).then(ok, () => { sheetLoading[i] = false; });
}

/** 아틀라스 늦게 받기 (한 번만). 첫 장(아이템)만 바로, 둘째 장(코스튬·꾸미기)은 쓸 때 */
export function loadItemAtlas() {
  if (loading) return loading;
  loading = import('./item_icons.gen.js').then((m) => { atlas = m; loadSheet(0); return true; }, () => false);
  return loading;
}

/** 열린 화면의 이모지 칸을 구운 그림으로 (창·묶음마다 전부 되면 한꺼번에) */
export function refreshItemIcons(root = typeof document !== 'undefined' ? document : null) {
  if (!root?.querySelectorAll || !atlas) return 0;
  const groups = new Map();
  for (const el of root.querySelectorAll('.ico.em[data-ik]')) {
    const g = el.closest('[data-ico-set]') || el.closest('.panel') || root;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(el);
  }
  let n = 0;
  for (const list of groups.values()) {
    const keys = list.map((el) => el.dataset.ik);
    for (const k of keys) { const s = atlas.CELLS?.[atlasKey(k)]?.[2] || 0; if (!ready[s]) loadSheet(s); }
    if (!canBakeAll(keys)) continue;
    for (const el of list) {
      const size = parseFloat(el.style.fontSize) || 0;
      const extra = [...el.classList].filter((c) => !['ico', 'em', 'locked'].includes(c)).join(' ');
      el.outerHTML = itemIconHtml(el.dataset.ik, { size, locked: el.classList.contains('locked'), cls: extra, baked: true });
      n++;
    }
  }
  return n;
}

/** UI 믹스인 (BagPanel 에 합쳐 UI.prototype 으로) */
export const ItemIconUI = {
  /** this.itemIcon(열쇠, { size, locked, baked }) → HTML. 처음 부르면 아틀라스를 받기 시작 */
  itemIcon(key, opts = {}) {
    if (!loading) loadItemAtlas();
    else if (atlas) { const s = atlas.CELLS?.[atlasKey(key)]?.[2] || 0; if (!ready[s]) loadSheet(s); }
    return itemIconHtml(key, opts);
  },
  /** 묶음 결정: 이 열쇠들을 모두 구운 그림으로 그릴 수 있나 */
  itemIconsBaked(keys) { if (!loading) loadItemAtlas(); return canBakeAll(keys); },
};

/** 시험용: 아틀라스를 바로 넣기 (sheets: 준비된 장 번호) */
export function _setAtlasForTest(gen, sheets = [0, 1]) {
  atlas = gen; loading = Promise.resolve(!!gen);
  ready.length = 0; for (const s of sheets) ready[s] = true;
}
