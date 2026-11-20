import { TOUR_REWARD } from './koat.js';
import { VILLAGER_HEART_REWARDS } from './villagers.js';
import { STAR_REWARDS } from './town_rating.js';

/**
 * 칭호 모음: 이름표·프로필에 다는 짧은 칭호
 *  - test(ctx) 가 있는 칭호는 모은 기록으로 저절로 열림 (game_progress 가 ctx 를 만들어 checkTitles)
 *  - test 가 없는 칭호는 다른 곳에서 줌 (KOAT 투어 완주·레벨 10 선물·마을 별 다섯·주민 ♥5)
 *  - unlocks.js 는 가져오지 않음 (costume.js 가 이 파일을 읽으므로 돌고 도는 import 를 피함, 이름이 같은지는 시험이 봄)
 *  - id 는 다른 접속자에게 보내는 모습 문자열의 6번째 칸 → 영문 소문자·숫자·하이픈만 (서버 sanitizeLook 통과)
 * ctx: { nature 자연 도감 종 수, done 다 채운 도감 탭 배열, shipped 출하 종 수, rice5 ★5 쌀 출하, farmLv·farmMax 밭농사 숙련도, ranchHeart5, villagerHeart5 }
 */
export const TITLES = [
  { id: 'rookie', name: '새내기 농부', icon: '🌱', desc: '처음으로 농산물을 팔거나 납품하기', test: (c) => c.shipped >= 1 },
  { id: 'naturalist', name: '꼬마 박물학자', icon: '🔎', desc: '도감에 물고기·곤충·과일 10종 등록', test: (c) => c.nature >= 10 },
  { id: 'fish-doctor', name: '물고기 박사', icon: '🐟', desc: '물고기 도감 완성', test: (c) => c.done.includes('fish') },
  { id: 'bug-doctor', name: '곤충 박사', icon: '🦋', desc: '곤충 도감 완성', test: (c) => c.done.includes('bug') },
  { id: 'orchard', name: '과수원 지기', icon: '🍎', desc: '과일 도감 완성', test: (c) => c.done.includes('fruit') },
  { id: 'shipper', name: '장터의 큰손', icon: '📦', desc: '출하 도감 완성', test: (c) => c.done.includes('ship') },
  { id: 'rice-master', name: '명품 쌀 장인', icon: '🍚', desc: '밭농사 숙련도 최고 + 쌀 ★5 출하', test: (c) => c.rice5 && c.farmLv >= c.farmMax },
  { id: 'ranch-buddy', name: '목장 단짝', icon: '🐄', desc: '목장 동물 하나와 ♥5', test: (c) => c.ranchHeart5 },
  { id: 'town-buddy', name: '마을의 단짝', icon: '💕', desc: '주민 한 명과 ♥5', test: (c) => c.villagerHeart5 },
  { id: 'koat', name: TOUR_REWARD.title, icon: '🏢', desc: 'KOAT 체험관 스탬프 6개 완주' },
  { id: 'top-farmer', name: '유니코 으뜸 농부', icon: '🏆', desc: 'Lv.10 달성' },
  { id: 'mayor', name: STAR_REWARDS[5]?.title || '유니코 마을 이장', icon: '⭐', desc: '마을 별점 ★5' },
  // 주민이 ♥5 에 붙여 주는 칭호
  ...Object.entries(VILLAGER_HEART_REWARDS).flatMap(([vid, list]) => {
    const t = list.find((r) => typeof r.title === 'string')?.title;
    return t ? [{ id: `v-${vid.toLowerCase().replace(/[^a-z0-9]/g, '')}`, name: t, icon: '💌', desc: '주민과 ♥5' }] : [];
  }),
];
// 프로토타입 없는 객체: 'constructor'·'toString' 같은 물려받은 이름을 칭호로 치지 않게
export const TITLE_BY_ID = Object.freeze(Object.assign(Object.create(null), Object.fromEntries(TITLES.map((t) => [t.id, t]))));
/** 정해진 칭호 id 인가 (문자열이고 TITLE_BY_ID 에 제 것으로 있을 때만) */
export const isTitleId = (id) => typeof id === 'string' && Object.hasOwn(TITLE_BY_ID, id);
const BY_NAME = new Map(TITLES.map((t) => [t.name, t]));

/** 칭호 이름 → id (모르는 이름이면 null: 다른 접속자에게 보내지 않음) */
export const titleIdOf = (name) => BY_NAME.get(name)?.id ?? null;
/** id → 칭호 (모르는 id 는 null) */
export const titleById = (id) => (isTitleId(id) ? TITLE_BY_ID[id] : null);

/** 기록으로 새로 열린 칭호 이름 목록 (owned: 이미 가진 이름 배열) */
export function checkTitles(ctx, owned = []) {
  const have = new Set(owned), out = [];
  const c = { nature: 0, done: [], shipped: 0, rice5: false, farmLv: 0, farmMax: 99, ranchHeart5: false, villagerHeart5: false, ...ctx };
  for (const t of TITLES) if (t.test && !have.has(t.name) && t.test(c)) out.push(t.name);
  return out;
}
