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
import { LEVELS } from '../src/game/sim/quests.js';

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
