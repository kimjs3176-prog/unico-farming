/**
 * 계절 축제 (렌더링 무관, 테스트: tests/festival.test.js)
 *  - 계절마다 마지막 날(7일째)이 축제: 봄꽃·단오·한가위·동지
 *  - 축제 마당은 그날 아침 6시부터 다음 날 아침 6시까지 (밤엔 연등), 장터 1.3배 값은 그날 하루 (economy.js)
 *  - 축제 엽전: 놀이 점수(별)와 축제 날 판매로 받고, 축제 장터에서 한정 꾸미기로 바꿈
 *  - 축제 음식은 주민이 축제마다 한 번 나눠 줌
 * 플레이어 축제 기록(st)은 game.flags.fest 에 저장되는 보통 객체 { key, food, act, sale, saleTok }
 */
import { seasonOf, DAYS_PER_SEASON } from './season.js';

/** 축제 마당이 열리는 시각 (아침 6시 ~ 다음 날 아침 6시) */
export const FEST_OPEN_H = 6;
/** 놀이 결과 별 0~3개 → 엽전 */
export const STAR_TOKENS = [1, 2, 3, 5];
/** 축제 한 번에 놀이로 받는 엽전 상한 (되풀이해도 끝없이 늘지 않게) */
export const ACT_TOKEN_CAP = 15;
/** 축제 날 판매: 이만큼(코인) 팔 때마다 엽전 1개, 축제 한 번에 이만큼까지 */
export const SALE_COINS = 200, SALE_TOKEN_CAP = 5;

export const FESTIVALS = {
  spring: {
    id: 'spring', name: '🌸 봄꽃 축제', icon: '🌸', food: 'fest_hwajeon',
    desc: '진달래 핀 장터에서 꽃전을 부쳐 먹으며 봄을 맞아요',
    fact: '삼짇날(음력 3월 3일)엔 진달래꽃으로 화전을 부쳐 먹었어요. 이맘때 볍씨를 고르고 못자리를 준비해요',
    colors: [0xf28bb0, 0xfff1f5, 0xb6e07a, 0xffd6e4], lantern: 0xe2558a,
    stall: ['fest_lantern', 'fest_azalea'],
    skin: {
      title: '진달래 꽃잎 받기', icon: '🌸', sky: ['#ffe9f1', '#f9c7d8'], ground: '#a8d86a', branch: '#7a5236', bloom: '#f28bb0', deco: 'azalea', hills: '#c98fb0',
      good: ['🌸', '🌺'], gold: '🥞', bad: '🐝', goodName: '꽃잎', goldName: '화전', badName: '벌',
    },
  },
  summer: {
    id: 'summer', name: '🎐 단오 축제', icon: '🎐', food: 'fest_surichwi',
    desc: '창포물에 머리 감고 그네 뛰며 더위를 쫓는 날이에요',
    fact: '단오(음력 5월 5일)엔 창포물에 머리를 감고 수리취떡을 먹었어요. 모내기를 마치고 한숨 돌리는 때예요',
    colors: [0x3170c9, 0xffffff, 0x4fb06a, 0xf6c63c], lantern: 0x2f7fd0,
    stall: ['fest_kite', 'fest_lantern'],
    skin: {
      title: '앵두·창포 받기', icon: '🍒', sky: ['#dff4ff', '#a9dcf2'], ground: '#5fae4a', branch: '#5a3a22', bloom: '#4fb06a', deco: 'iris', hills: '#6fa8c8',
      good: ['🍒', '🌿'], gold: '🍡', bad: '🦟', goodName: '앵두·창포', goldName: '수리취떡', badName: '모기',
    },
  },
  autumn: {
    id: 'autumn', name: '🌕 한가위 축제', icon: '🌕', food: 'fest_songpyeon',
    desc: '보름달 아래 햅쌀 송편을 빚으며 한 해 농사에 고마워해요',
    fact: '한가위(음력 8월 15일)엔 햅쌀로 송편을 빚고 햇과일을 나누며 한 해 농사에 감사했어요',
    colors: [0xe0802c, 0xf6d64a, 0xd4372c, 0xfff3c4], lantern: 0xe8901c,
    stall: ['fest_scarecrow', 'fest_lantern'],
    skin: {
      title: '송편·밤 받기', icon: '🌰', sky: ['#2b2f5a', '#5a4a7a'], ground: '#c99a52', branch: '#5a3a22', bloom: '#e0802c', deco: 'persimmon', hills: '#1f2347', moon: true,
      good: ['🌰', '🍎'], gold: '🥟', bad: '🐛', goodName: '밤·햇과일', goldName: '송편', badName: '송충이',
    },
  },
  winter: {
    id: 'winter', name: '❄️ 동지 축제', icon: '❄️', food: 'fest_patjuk',
    desc: '밤이 가장 긴 날, 팥죽을 나눠 먹으며 새해 농사를 꿈꿔요',
    fact: '동지는 한 해 중 밤이 가장 긴 날이에요. 팥죽을 쑤어 나눠 먹고 이듬해 농사를 준비했어요',
    colors: [0x8e7cc3, 0xffffff, 0xd4372c, 0x6cc4ec], lantern: 0x7a5cc8,
    stall: ['fest_snowman', 'fest_kite'],
    skin: {
      title: '새알심 받기', icon: '⚪', sky: ['#e6eef7', '#b9cbe0'], ground: '#f4f7fb', branch: '#6a5a4a', bloom: '#ffffff', deco: 'snow', hills: '#9fb2cc',
      good: ['⚪', '❄️'], gold: '🥣', bad: '🧊', goodName: '새알심·눈송이', goldName: '팥죽', badName: '고드름',
    },
  },
};
export const FESTIVAL_IDS = Object.keys(FESTIVALS);

/** 이 날이 축제 날이면 그 축제 (계절 7일째), 아니면 null */
export function festivalOf(day) {
  const s = seasonOf(day);
  return s.dayIn === DAYS_PER_SEASON ? FESTIVALS[s.id] : null;
}

/** 내일이 축제인가 (D-1 알림) */
export const festivalTomorrow = (day) => festivalOf((Math.floor(day) || 0) + 1);

/** 축제 한 번을 가리키는 열쇠 (해·계절): 축제마다 음식·엽전 상한을 새로 셈 */
export const festivalKey = (day) => { const s = seasonOf(day); return `${s.year}-${s.id}`; };

/**
 * 지금(날짜·하루 진행 0..1) 축제 마당이 열려 있으면 { ...축제, day, key, night }, 아니면 null
 * 축제 날 6시부터 다음 날 6시까지
 */
export function festivalAt(day, time = 0.5) {
  const hour = (((time % 1) + 1) % 1) * 24;
  const d = hour >= FEST_OPEN_H ? day : day - 1;
  if (!(d >= 1)) return null;
  const f = festivalOf(d);
  return f ? { ...f, day: d, key: festivalKey(d), night: hour >= 19 || hour < FEST_OPEN_H } : null;
}

/** 장터 값 축제 (economy.festival): { id, name, mult } — name 에 '축제' 를 꼭 넣음 (도트 판·HUD 띠가 그대로 씀) */
export function priceFestival(day, mult) {
  const f = festivalOf(day);
  return f ? { id: f.id, name: `${f.name}! 오늘은 모든 농산물·생산물 ${mult}배`, mult } : null;
}

/** 예전 저장 ({ name, mult } 만 있음): 날짜로 id 를 채움. 축제 날이 아니면 그대로 */
export function fixFestival(fest, day, mult) {
  if (!fest || fest.id) return fest;
  return priceFestival(day, fest.mult || mult) || fest;
}

/** 이 축제 기록 (축제가 바뀌면 새로) */
export function festState(st, key) {
  if (!st || st.key !== key) return { key, food: false, act: 0, sale: 0, saleTok: 0 };
  return st;
}

/** 놀이 결과 → 받을 엽전 (상한까지). st 를 바꾸고 받은 개수를 돌려줌 */
export function actTokens(st, stars) {
  const want = STAR_TOKENS[Math.max(0, Math.min(3, stars | 0))];
  const n = Math.max(0, Math.min(want, ACT_TOKEN_CAP - st.act));
  st.act += n;
  return n;
}

/** 축제 날 판매 → 받을 엽전 (SALE_COINS 마다 1개, 상한까지). st 를 바꾸고 받은 개수를 돌려줌 */
export function saleTokens(st, coins) {
  if (!(coins > 0)) return 0;
  st.sale += coins;
  const n = Math.max(0, Math.min(SALE_TOKEN_CAP, Math.floor(st.sale / SALE_COINS)) - st.saleTok);
  st.saleTok += n;
  return n;
}

/** 축제 음식 받기: 이 축제에서 처음이면 음식 id, 이미 받았으면 null */
export function takeFood(st, fest) {
  if (!fest || st.food) return null;
  st.food = true;
  return fest.food;
}
