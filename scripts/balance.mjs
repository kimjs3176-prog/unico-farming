/**
 * 경제 밸런스 점검 (vendored skill: claude-code-game-studios/balance-check 절차 적용)
 * - 자원 유입(faucet)·유출(sink) 지도와 분당 수익
 * - 지배 전략(다른 선택지를 모두 압도하는 작물) 탐지
 * - 무한 루프(구매가 < 판매가로 바로 되파는 차익) 탐지
 * 실행: node scripts/balance.mjs
 */
import { CROPS, PRODUCTS, FEED_PRICE } from '../src/game/sim/crops.js';
import { ITEMS, RICE_GRADE_MULT } from '../src/game/sim/items.js';
import { RICE_STAGES } from '../src/game/sim/rice.js';
import { LEVELS, QUESTS } from '../src/game/sim/quests.js';
import { BUILDINGS, tierPrice, tierLevel } from '../src/game/sim/town.js';
import { HOME_LEVELS, WALLPAPERS, FLOORS, FURNITURE } from '../src/game/sim/home.js';
import { COSTUMES, COSTUME_VARIANTS } from '../src/game/sim/costume.js';
import { DECOR, DECOR_ALL, DECOR_PREMIUM, DECOR_LIMITED } from '../src/game/sim/decor.js';
import { RODS } from '../src/game/sim/angling.js';
import { BARN, ANIMAL_PRICES } from '../src/game/sim/ranch.js';
import { JAR_PRICES, WORKSHOP_PRICES } from '../src/game/sim/farmcraft.js';
import { TOUR_REWARD } from '../src/game/sim/koat.js';

const rows = [];
const PLOTS = 18;
for (const [k, c] of Object.entries(CROPS)) {
  const profit = c.basePrice * c.yield - c.seedPrice;
  rows.push({ source: `밭 ${c.name} (물 줌)`, unlock: `Lv${c.unlockLevel}`, cycle_s: c.growTime, profit, perMin: (profit / c.growTime) * 60 });
}
const riceTime = RICE_STAGES.reduce((a, s) => a + s.time, 0);
for (const g of [2, 3, 5]) {
  const amount = 3 + (g >= 5 ? 2 : g >= 3 ? 1 : 0);
  const profit = amount * ITEMS.rice_1.price * RICE_GRADE_MULT[g] - ITEMS.rice_seed.price;
  rows.push({ source: `논 쌀 ★${g}`, unlock: 'Lv1', cycle_s: riceTime, profit: Math.round(profit), perMin: (profit / riceTime) * 60 });
}
for (const [k, p] of Object.entries(PRODUCTS)) {
  const profit = p.basePrice - FEED_PRICE;
  rows.push({ source: `목장 ${p.name}`, unlock: 'Lv1', cycle_s: p.time, profit, perMin: (profit / p.time) * 60 });
}
console.log('\n== 유입(faucet): 단위 시설 1칸/1마리당 ==');
console.table(rows.map((r) => ({ ...r, perMin: +r.perMin.toFixed(1) })));

// 지배 전략: 같은 해금 단계에서 분당 수익이 2위의 1.6배 이상이면 경고
const crops = rows.filter((r) => r.source.startsWith('밭'));
const sorted = [...crops].sort((a, b) => b.perMin - a.perMin);
const ratio = sorted[0].perMin / sorted[1].perMin;
console.log(`\n최고 효율 작물: ${sorted[0].source} (${sorted[0].perMin.toFixed(1)}/분), 2위 대비 ${ratio.toFixed(2)}배 ${ratio > 1.6 ? '⚠️ 지배 전략 의심' : '✅ 허용 범위'}`);

// 차익 루프: 판매가가 구매가보다 높은 아이템을 상점이 파는지
const loops = Object.entries(ITEMS).filter(([, it]) => it.cat === 'seed' && it.price * 0.5 >= it.price);
console.log(`차익 루프: ${loops.length ? loops.map(([k]) => k).join(', ') + ' ⚠️' : '없음 ✅ (씨앗 되팔기 50%)'}`);

// 진행 속도: 밭 18칸을 당근으로 채웠을 때 레벨 구간별 도달 시간(퀘스트 XP 제외, 수익 기준 참고치)
const best = sorted[sorted.length - 1];
console.log(`\n밭 ${PLOTS}칸 기준 시간당 수익: 최저 ${(best.perMin * PLOTS * 60).toFixed(0)} ~ 최고 ${(sorted[0].perMin * PLOTS * 60).toFixed(0)} 코인`);
console.log(`레벨 표: ${LEVELS.join(' → ')} XP`);

// ---- 소비처(sink): 코인을 쓰는 곳이 얼마나 오래 가나 (데이터 표에서 바로 읽음, 손으로 적지 않음)
// 30% 효율 = 최고 작물 시간당 수익의 30% (이동·대화·미니게임·쉬는 시간을 뺀 보통 놀이)
const sum = (a) => a.reduce((x, y) => x + y, 0);
const EFF = 0.3, perHour = sorted[0].perMin * PLOTS * 60 * EFF;
const SPRINKLERS = [400, 800, 1300]; // ui/panels/market.js 시설 탭
const before = {
  '집 넓히기': sum(HOME_LEVELS.map((x) => x.price)),
  '마을 건물': sum(Object.values(BUILDINGS).map((b) => b.price)),
  '코스튬': sum(COSTUMES.map((c) => c.price || 0)),
  '낚싯대': sum(RODS.map((r) => r.price)),
  '축사 넓히기': sum(BARN.map((b) => b.price)),
  '가축 채우기': 6 * ANIMAL_PRICES.cow + 6 * ANIMAL_PRICES.sheep + 6 * ANIMAL_PRICES.chicken,
  '장독·작업대': sum(JAR_PRICES) + sum(WORKSHOP_PRICES),
  '스프링클러': sum(SPRINKLERS),
  '꾸미기 소품 하나씩': sum(DECOR.map((d) => d.price)),
};
const added = {
  '벽지·바닥': sum(WALLPAPERS.map((x) => x.price)) + sum(FLOORS.map((x) => x.price)),
  '집 가구': sum(FURNITURE.map((x) => x.price)),
  '특별 소품 (Lv5~8)': sum(DECOR_PREMIUM.map((d) => d.price)),
  '한정 소품 (오늘의 특별 상품)': sum(DECOR_LIMITED.map((d) => d.price)),
  '색 바꾼 옷': sum(COSTUME_VARIANTS.map((c) => c.price)),
  '건물 등급 ★2·★3': sum(Object.keys(BUILDINGS).flatMap((t) => [2, 3].map((k) => tierPrice(t, k)))),
};
const hours = (n) => n / perHour;
const tb = sum(Object.values(before)), ta = sum(Object.values(added));
console.log(`\n== 소비처: 30% 효율(시간당 ${Math.round(perHour).toLocaleString()} 코인)로 다 사는 데 걸리는 시간 ==`);
console.table([...Object.entries(before).map(([k, v]) => ({ 구분: '기존', 소비처: k, 코인: v })), ...Object.entries(added).map(([k, v]) => ({ 구분: '새로', 소비처: k, 코인: v }))]);
console.log(`기존 ${tb.toLocaleString()} 코인 → ${hours(tb).toFixed(1)}시간`);
console.log(`새로 ${ta.toLocaleString()} 코인 (꾸밈 ${(ta - added['건물 등급 ★2·★3']).toLocaleString()} + 건물 등급 ${added['건물 등급 ★2·★3'].toLocaleString()})`);
const after = hours(tb + ta);
console.log(`합계 ${(tb + ta).toLocaleString()} 코인 → ${after.toFixed(1)}시간 ${after >= 6 ? '✅ 6시간 이상' : '⚠️ 6시간 미만'} (한정 소품은 날마다 다시 나와 끝없이 살 수 있음)`);

// 레벨 조건 점검: 모든 해금 레벨이 퀘스트·체험관 XP 만으로 닿는 레벨 이하인지 (행동 XP 를 빼도 막히지 않게)
const questXp = sum(QUESTS.map((x) => x.reward.xp || 0)) + TOUR_REWARD.xp;
const reach = LEVELS.filter((x) => x <= questXp).length;
const gates = [
  ...Object.values(CROPS).map((c) => ['작물', c.name, c.unlockLevel]),
  ...Object.values(BUILDINGS).map((b) => ['건물', b.name, b.lv]),
  ...Object.keys(BUILDINGS).flatMap((t) => [2, 3].map((k) => ['건물 등급', `${BUILDINGS[t].name} ★${k}`, tierLevel(t, k)])),
  ...HOME_LEVELS.map((x) => ['집', x.name, x.lv]),
  ...[...COSTUMES, ...COSTUME_VARIANTS].map((c) => ['옷', c.name, c.lv || 1]),
  ...RODS.map((r) => ['낚싯대', r.name, r.level]),
  ...DECOR_ALL.map((d) => ['소품', d.name, d.lv]),
  ...[...WALLPAPERS, ...FLOORS, ...FURNITURE].map((x) => ['집 꾸미기', x.name, x.lv]),
];
const over = gates.filter(([, , lv]) => lv > reach);
console.log(`\n퀘스트·체험관 XP ${questXp} → 닿는 레벨 Lv.${reach} · 가장 높은 해금 Lv.${Math.max(...gates.map((x) => x[2]))} ${over.length ? `⚠️ 닿지 못하는 해금: ${over.map((x) => `${x[1]}(Lv.${x[2]})`).join(', ')}` : '✅ 모든 해금에 닿음'}`);
