// 우리 마을 별점 (0~5개): 건물·집·꾸미기·주민 우정·도감·체험관 스탬프·농사 솜씨를 한 점수로 (three 없음, 테스트: tests/town_rating.test.js)
// 이벤트와 새 날에만 셈 (매 프레임 아님). 별은 올라가기만 함 (flags.townStar 에 가장 높은 별)
import { BOOK_CATS } from './collection.js';
import { itemsOf } from './items.js';

/** 별 문턱 (점수 0~1) */
export const STAR_AT = [0.06, 0.3, 0.5, 0.72, 0.92]; // 첫 별은 20분 안팎 (scripts/pacing.mjs)
export const MAX_STARS = STAR_AT.length;

/** 점수 칸: 무게·최댓값·한 칸 오를 때 대략 걸리는 분(다음 별 안내 순서) */
export const PARTS = [
  { key: 'built', w: 0.2, max: 5, min: 15, label: (n) => `마을 건물 ${n}채 더 짓기`, short: (n) => `건물 ${n}채 더`, icon: '🏗️' },
  { key: 'home', w: 0.1, max: 2, min: 30, label: (n) => `유니코 집 ${n}단계 넓히기`, short: (n) => `집 ${n}단계 더`, icon: '🏡' },
  { key: 'decor', w: 0.1, max: 20, min: 2, label: (n) => `꾸미기 소품 ${n}개 더 놓기`, short: (n) => `꾸미기 ${n}개 더`, icon: '🪑' },
  { key: 'hearts', w: 0.15, max: 5, min: 6, label: (n) => `주민과 우정 하트 ${n}개 더`, short: (n) => `하트 ${n}개 더`, icon: '💛' },
  { key: 'book', w: 0.25, max: 1, min: 4, label: (n) => `도감 ${n}종 더 채우기`, short: (n) => `도감 ${n}종 더`, icon: '📖' },
  { key: 'stamps', w: 0.1, max: 6, min: 6, label: (n) => `체험관 스탬프 ${n}개 더`, short: (n) => `스탬프 ${n}개 더`, icon: '🏢' },
  { key: 'skill', w: 0.1, max: 1, min: 12, label: (n) => `밭·논 솜씨 ${n}레벨 더 올리기`, short: (n) => `솜씨 ${n}레벨 더`, icon: '🌾' },
];

const FARM_TOP = 8, RICE_TOP = 6;

/** 게임 → 점수에 쓰는 값만 (없는 시스템은 0) */
export function snapshot(g) {
  const ids = g.villagers?.state ? Object.keys(g.villagers.state) : [];
  let got = 0, total = 0;
  for (const c of BOOK_CATS) {
    const p = g.collection?.progress ? g.collection.progress(c) : { got: 0, total: itemsOf(c).length };
    got += p.got; total += p.total;
  }
  return {
    built: g.town?.sim?.doneCount ?? g.town?.doneCount ?? 0,
    home: g.home?.sim?.level ?? g.home?.level ?? 0,
    decor: g.decor?.sim?.count ?? g.decor?.count ?? 0,
    hearts: ids.map((id) => g.villagers.hearts(id)),
    villagers: ids.length || 6,
    book: got, bookTotal: total || 1,
    stamps: g.koat?.book?.count ?? 0,
    farmLv: g.farm?.sim?.level ?? 1,
    riceLv: g.rice?.sim?.skillLevel ?? g.rice?.skillLevel ?? 1,
  };
}

/** 칸별 0~1 */
function fractions(s) {
  const heartSum = (s.hearts || []).reduce((a, b) => a + Math.min(5, b), 0);
  const nv = Math.max(1, s.villagers || (s.hearts || []).length || 6);
  return {
    built: Math.min(1, (s.built || 0) / 5),
    home: Math.min(1, (s.home || 0) / 2),
    decor: Math.min(20, s.decor || 0) / 20,
    hearts: Math.min(1, heartSum / (nv * 5)),
    book: Math.min(1, (s.book || 0) / Math.max(1, s.bookTotal || 1)),
    stamps: Math.min(1, (s.stamps || 0) / 6),
    skill: Math.min(1, ((Math.min(FARM_TOP, s.farmLv || 1) - 1) / (FARM_TOP - 1) + (Math.min(RICE_TOP, s.riceLv || 1) - 1) / (RICE_TOP - 1)) / 2),
  };
}

/** 칸마다 '한 단위'의 점수와 지금 값·최댓값 (다음 별 안내용) */
function units(s) {
  const nv = Math.max(1, s.villagers || (s.hearts || []).length || 6);
  const heartSum = (s.hearts || []).reduce((a, b) => a + Math.min(5, b), 0);
  return {
    built: { per: 0.2 / 5, have: s.built || 0, top: 5 },
    home: { per: 0.1 / 2, have: s.home || 0, top: 2 },
    decor: { per: 0.1 / 20, have: Math.min(20, s.decor || 0), top: 20 },
    hearts: { per: 0.15 / (nv * 5), have: heartSum, top: nv * 5 },
    book: { per: 0.25 / Math.max(1, s.bookTotal || 1), have: s.book || 0, top: s.bookTotal || 1 },
    stamps: { per: 0.1 / 6, have: s.stamps || 0, top: 6 },
    skill: { per: 0.1 / (FARM_TOP - 1 + RICE_TOP - 1), have: (Math.min(FARM_TOP, s.farmLv || 1) - 1) + (Math.min(RICE_TOP, s.riceLv || 1) - 1), top: FARM_TOP - 1 + RICE_TOP - 1 },
  };
}

/** 점수(0~1) → 별 수 */
export const starsFor = (points) => STAR_AT.filter((t) => points >= t - 1e-9).length;

/**
 * 마을 별점: { points, stars, frac, need, next: [{ key, label, short, icon, have, need }] }
 * next: 다음 별까지 모자란 점수를 한 칸만으로 채울 수 있으면 그 양, 아니면 그 칸의 남은 만큼 (걸리는 시간이 짧은 순)
 */
export function rating(s) {
  const f = fractions(s);
  let points = 0;
  for (const p of PARTS) points += p.w * f[p.key];
  points = Math.round(points * 1e4) / 1e4;
  const stars = starsFor(points);
  const lo = stars ? STAR_AT[stars - 1] : 0, hi = STAR_AT[stars] ?? 1;
  const frac = stars >= MAX_STARS ? 1 : Math.max(0, Math.min(1, (points - lo) / (hi - lo)));
  const gap = stars >= MAX_STARS ? 0 : hi - points;
  const U = units(s);
  const next = [];
  if (gap > 0) {
    for (const p of PARTS) {
      const u = U[p.key], left = u.top - u.have;
      if (left <= 0) continue;
      const n = Math.min(left, Math.max(1, Math.ceil(gap / u.per - 1e-9)));
      next.push({ key: p.key, label: p.label(n), short: p.short(n), icon: p.icon, have: u.have, need: u.have + n, n, cost: n * p.min, enough: n * u.per >= gap - 1e-9 });
    }
    // 혼자서 별을 채우는 칸이 먼저, 그 안에서는 빨리 끝나는 순
    next.sort((a, b) => Number(b.enough) - Number(a.enough) || a.cost - b.cost);
  }
  return { points, stars, frac, need: gap, next };
}

/** 별 줄: ★★☆☆☆ */
export const starLine = (n) => '★'.repeat(n) + '☆'.repeat(Math.max(0, MAX_STARS - n));

/** 별마다 보상 설명 (카드·편지) */
export const STAR_REWARDS = {
  1: { text: '마을 표지판 새 단장 + 알록달록 깃발', icon: '🚩' },
  2: { text: '꾸미기 꾸러미 (벤치·가로등·꽃밭)', icon: '🪑', decor: { bench: 1, lamp: 2, flowerbed: 2 } },
  3: { text: '마을 선물 의상', icon: '👗', costume: ['beekeeper', 'chef', 'raincoat', 'overalls'] },
  4: { text: '장터 옆 광장에 유니콘 동상', icon: '🗿' },
  5: { text: '칭호 “유니코 마을 이장”', icon: '🏅', title: '유니코 마을 이장' },
};

/**
 * 가장 높은 별 기록: 지금 별이 기록보다 높으면 { from, to } (새 별), 아니면 null
 * 처음(기록 없음)이면 조용히 맞춤 (예전 저장이 축하를 다시 보지 않게) → null
 */
export function latchStar(flags, stars) {
  if (typeof flags.townStar !== 'number') { flags.townStar = stars; return null; }
  if (stars <= flags.townStar) return null;
  const from = flags.townStar;
  flags.townStar = stars;
  return { from, to: stars };
}
