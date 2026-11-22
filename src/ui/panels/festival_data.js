// 축제 소품 표·엽전 규칙 (꾸미기 표 등록은 시작할 때 꼭 필요해 첫 화면에 작게 둠). 축제 창(festival.js)은 처음 열 때 받음
import * as D from '../../game/sim/decor.js';

/**
 * 축제 한정 꾸미기 (엽전으로 바꿈): 모델은 festival_view 가 만들어 등록 (풍년 허수아비는 있는 허수아비 모델)
 * 모듈을 읽을 때 꾸미기 표에 넣음 → main.js 가 Game 을 만들기 전에 읽으므로, 놓아 둔 축제 소품이 불러오기에서 지워지지 않음
 * 꾸미기 창 탭(cat 'fest')에는 안 나오고 이 창에서만 바꿈 (코인으로는 못 삼)
 */
export const FEST_DECOR = [
  { id: 'fest_lantern', name: '연등', icon: '🏮', tokens: 6, model: 'fest_lantern', scale: 1, r: 0.3 },
  { id: 'fest_azalea', name: '진달래 화분', icon: '🌺', tokens: 5, model: 'fest_azalea', scale: 1, r: 0.4 },
  { id: 'fest_kite', name: '방패연 장대', icon: '🪁', tokens: 6, model: 'fest_kite', scale: 1, r: 0.2 },
  { id: 'fest_scarecrow', name: '풍년 허수아비', icon: '🌾', tokens: 8, model: 'scarecrow', scale: 1.15, r: 0.4 },
  { id: 'fest_snowman', name: '눈사람', icon: '⛄', tokens: 6, model: 'fest_snowman', scale: 1, r: 0.5 },
].map((d) => ({ price: 0, lv: 1, cat: 'fest', ...d }));
export const FEST_DECOR_BY_ID = Object.fromEntries(FEST_DECOR.map((d) => [d.id, d]));

// 꾸미기 표에 넣기 (registerDecor 가 있으면 그것으로, 없으면 표에 바로)
const register = D['registerDecor'] || ((d) => { if (D.DECOR_BY_ID[d.id]) return; D.DECOR.push(d); D.DECOR_BY_ID[d.id] = d; });
for (const d of FEST_DECOR) if (!D.DECOR_BY_ID[d.id]) register(d);

/** 엽전으로만 바꾸는 소품은 보관함에 있을 때만 놓을 수 있음 (값 0 이라 그냥 두면 끝없이 공짜로 놓임) */
export const TOKEN_ONLY_WHY = '축제 장터에서 엽전으로 바꿔요';
const P = D.DecorSim?.prototype;
if (P && !P.whyNot.festGuard) {
  const base = P.whyNot;
  P.whyNot = function whyNot(id, ctx) {
    const why = base.call(this, id, ctx);
    if (why || this.storedOf(id) > 0) return why;
    return D.DECOR_BY_ID[id]?.tokens ? TOKEN_ONLY_WHY : null;
  };
  P.whyNot.festGuard = true;
}

/** 엽전 그림 (가운데 네모 구멍 난 둥근 동전, css/festival.css) — 글자만 쓰는 알림은 ITEMS.fest_token.emoji */
export const FEST_COIN = '<i class="fest-coin" aria-hidden="true"></i>';

