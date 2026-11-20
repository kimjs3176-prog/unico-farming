// 레벨 해금 목록: 씨앗·마을 건물·의상·꾸미기·집·낚싯대 표에서 바로 모음 (따로 적어 두지 않아 표와 어긋나지 않음)
import { CROPS } from './crops.js';
import { BUILDINGS } from './town.js';
import { COSTUMES, COSTUME } from './costume.js';
import { DECOR } from './decor.js';
import { HOME_LEVELS } from './home.js';
import { RODS } from './angling.js';
import { LEVELS } from './quests.js';
import { DECOR_BY_ID } from './decor.js';

/** 종류: 카드에서 묶는 순서와 이름, 눌렀을 때 열 곳 */
export const KINDS = [
  ['seed', '씨앗', 'market'],
  ['building', '마을 건물', 'town'],
  ['costume', '의상', 'market'],
  ['decor', '꾸미기', 'decor'],
  ['home', '집', 'home'],
  ['rod', '낚싯대', 'lake'],
  ['gift', '레벨 선물', 'decor'],
  ['title', '칭호', null],
];

/**
 * Lv.6~10 레벨 선물 (기존 표의 해금 레벨은 그대로 두고 여기에만): 꾸미기 소품은 보관함으로, 의상은 옷장으로, Lv.10 은 칭호
 * costume: 후보 중 아직 없는 첫 의상 (한복은 원래 축제 날에만 파는 옷)
 */
export const LEVEL_GIFTS = {
  6: { decor: { lamp: 2, planter: 2 } },
  7: { decor: { maple: 1 }, costume: ['hanbok', 'chef', 'beekeeper', 'raincoat'] },
  8: { decor: { birch: 2, bench: 1 } },
  9: { decor: { well: 1 } },
  10: { decor: { tree: 2, scarecrow: 1 }, title: '유니코 으뜸 농부' },
};

/** 레벨 선물 의상: 후보 중 표에 있고 아직 없는 첫 id (has: 가진 옷인지, 없으면 null) */
export function giftCostume(lv, has = null) {
  for (const id of LEVEL_GIFTS[lv]?.costume || []) if (COSTUME[id] && !has?.(id)) return id;
  return null;
}

/** 카드에서만 바꿔 쓰는 그림: 꾸미기 '외바퀴 수레'(🛒)가 장터 단추(🛒)와 겹치지 않게 */
export const CARD_ICON = { cart: '🪵' };

/** 플레이어 레벨 최고값 */
export const MAX_LEVEL = LEVELS.length;

/** lv 에서 새로 열리는 것 [{ icon, name, kind }] (종류 순서대로) */
export function unlocksAt(lv) {
  const out = [];
  for (const c of Object.values(CROPS)) if (c.unlockLevel === lv && lv > 1) out.push({ icon: c.emoji, name: `${c.name} 씨앗`, kind: 'seed' });
  for (const b of Object.values(BUILDINGS)) if (b.lv === lv && lv > 1) out.push({ icon: b.emoji, name: b.name, kind: 'building' });
  for (const c of COSTUMES) if (c.lv === lv && lv > 1 && c.unlock !== 'stamps' && !c.festival) out.push({ icon: c.icon, name: c.name, kind: 'costume' });
  for (const d of DECOR) if (d.lv === lv && lv > 1) out.push({ icon: CARD_ICON[d.id] || d.icon, name: d.name, kind: 'decor' });
  for (const h of HOME_LEVELS) if (h.lv === lv && lv > 1) out.push({ icon: '🏡', name: `${h.name} 넓히기`, kind: 'home' });
  for (const r of RODS) if (r.level === lv && lv > 1) out.push({ icon: r.emoji, name: r.name, kind: 'rod' });
  const G = LEVEL_GIFTS[lv];
  if (G) {
    for (const [id, n] of Object.entries(G.decor || {})) { const d = DECOR_BY_ID[id]; if (d) out.push({ icon: CARD_ICON[id] || d.icon, name: `${d.name}${n > 1 ? ` ×${n}` : ''}`, kind: 'gift' }); }
    const cid = giftCostume(lv), c = cid && COSTUME[cid];
    if (c && !out.some((u) => u.kind === 'costume' && u.name === c.name)) out.push({ icon: c.icon, name: c.name, kind: 'gift' });
    if (G.title) out.push({ icon: '🏅', name: `“${G.title}”`, kind: 'title' });
  }
  const order = KINDS.map((k) => k[0]);
  return out.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
}

/** lv 보다 높은 레벨 중 처음으로 해금이 있는 레벨 (없으면 null) */
export function nextUnlockLevel(lv) {
  for (let l = lv + 1; l <= MAX_LEVEL; l++) if (unlocksAt(l).length) return l;
  return null;
}

/** (before, after] 사이 모든 레벨의 해금을 종류별로 묶음 → [{ kind, label, open, items }] */
export function unlocksBetween(before, after) {
  const all = [];
  for (let l = before + 1; l <= after; l++) all.push(...unlocksAt(l));
  return KINDS.map(([kind, label, open]) => ({ kind, label, open, items: all.filter((u) => u.kind === kind) })).filter((g) => g.items.length);
}

/** 해금이 없을 때 카드에 쓸 한 줄: 다음 해금 레벨과 대표 두 개, 더 없으면 응원 */
export function nextUnlockLine(lv) {
  const n = nextUnlockLevel(lv);
  if (!n) return '최고 레벨! 이제 ⭐ 별 다섯 개 마을과 계절 도전에 힘써 봐요';
  const list = unlocksAt(n);
  const pick = list.slice(0, 2).map((u) => `${u.icon} ${u.name}`).join(' · ');
  return `다음 해금: Lv.${n} ${pick}${list.length > 2 ? ` 외 ${list.length - 2}개` : ''}`;
}

/** 카드 버튼 하나: 씨앗·의상이 있으면 장터, 꾸미기·레벨 선물만 있으면 꾸미기, 그 밖은 없음 */
export function cardAction(groups) {
  const kinds = new Set(groups.map((g) => g.kind));
  if (kinds.has('seed') || kinds.has('costume')) return { label: '🛒 장터 열기', open: 'market' };
  if (kinds.has('decor') || kinds.has('gift')) return { label: '🪑 꾸미기', open: 'decor' };
  return null;
}
