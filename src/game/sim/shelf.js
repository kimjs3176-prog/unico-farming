/**
 * 장터 '오늘의 특별 상품' 진열대 (렌더링 무관, 테스트: tests/shelf.test.js)
 *  - 날마다 색 바꾼 한정 소품 2개 + 색 바꾼 옷 1벌이 나옴 (같은 날이면 누가 봐도 같은 진열)
 *  - 소품은 사면 꾸미기 보관함으로 (놓을 때 무료), 옷은 옷장으로
 *  - 쌓인 코인을 쓰는 곳: 매일 바뀌어 다시 들르게 함 (수익을 늘리지 않는 꾸밈 상품만)
 */
import { DECOR_LIMITED } from './decor.js';
import { COSTUME_VARIANTS } from './costume.js';

export const SHELF_DECOR = 2, SHELF_COSTUME = 1;

/** 날짜로 정해지는 난수 (mulberry32) */
export function dayRng(day) {
  let a = (Math.imul((day | 0) + 0x9e37, 0x85ebca6b) ^ 0x5bd1e995) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (list, n, rng) => {
  const rest = [...list], out = [];
  while (out.length < n && rest.length) out.push(rest.splice(Math.floor(rng() * rest.length), 1)[0]);
  return out;
};

/** 그날 진열 → [{ kind: 'decor'|'costume', id, name, icon, price, lv }] */
export function todaySpecial(day) {
  const rng = dayRng(day);
  const item = (kind) => (d) => ({ kind, id: d.id, name: d.name, icon: d.icon, price: d.price, lv: d.lv });
  return [...pick(DECOR_LIMITED, SHELF_DECOR, rng).map(item('decor')), ...pick(COSTUME_VARIANTS, SHELF_COSTUME, rng).map(item('costume'))];
}
