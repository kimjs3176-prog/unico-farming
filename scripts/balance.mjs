/**
 * 경제 밸런스 점검 (vendored skill: claude-code-game-studios/balance-check 절차 적용)
 * - 자원 유입(faucet)·유출(sink) 지도와 분당 수익
 * - 지배 전략(다른 선택지를 모두 압도하는 작물) 탐지
 * - 무한 루프(구매가 < 판매가로 바로 되파는 차익) 탐지
 * 실행: node scripts/balance.mjs        (콘솔 표)
 *       node scripts/balance.mjs --md   (문서에 붙일 표: docs/GAME_DESIGN.md·BALANCE.md 의 <!-- gen:balance-* --> 칸, 검사 tests/gen/docs_balance.check.mjs)
 * 다른 파일에서 import 하면 아무것도 출력하지 않음 (balanceRows·balanceBlocks·balanceMarkdown 만 씀)
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
import { itemsOf, CATEGORY_NAMES } from '../src/game/sim/items.js';
import { BOOK_CATS_3D, COMPLETE_REWARD, MILESTONE_EVERY, listOf } from '../src/game/sim/collection.js';
import { fileURLToPath } from 'node:url';

const PLOTS = 18;
const DOMINANT = 1.6; // 같은 해금 단계에서 1위가 2위의 이만큼 넘으면 지배 전략 의심
const r1 = (x) => Math.round(x * 10) / 10;

/**
 * 단위 시설 1칸/1마리당 유입. 다시 열리는 작물(regrow r): 한 번 심어 1 + r 번 수확,
 * 한 주기 = 성장 × (1 + 0.5r) (다시 열리는 데는 처음의 절반쯤), 이익 = 판매가 × 수확량 × 수확 횟수 − 씨앗
 */
export function balanceRows() {
  const rows = [];
  for (const [k, c] of Object.entries(CROPS)) {
    const r = c.regrow || 0, harvests = 1 + r, cycle = c.growTime * (1 + 0.5 * r);
    const profit = c.basePrice * (c.yield + r * (c.regrowYield ?? c.yield)) - c.seedPrice; // 다시 열린 수확은 regrowYield 개
    rows.push({ kind: 'crop', id: k, source: `밭 ${c.name} (물 줌)`, unlock: `Lv${c.unlockLevel}`, lv: c.unlockLevel, regrow: r, cycle_s: cycle, profit, perMin: (profit / cycle) * 60 });
  }
  const riceTime = RICE_STAGES.reduce((a, s) => a + s.time, 0);
  for (const g of [2, 3, 5]) {
    const amount = 3 + (g >= 5 ? 2 : g >= 3 ? 1 : 0);
    const profit = amount * ITEMS.rice_1.price * RICE_GRADE_MULT[g] - ITEMS.rice_seed.price;
    rows.push({ kind: 'rice', id: `rice_${g}`, source: `논 쌀 ★${g}`, unlock: 'Lv1', lv: 1, regrow: 0, cycle_s: riceTime, profit: Math.round(profit), perMin: (profit / riceTime) * 60 });
  }
  for (const [k, p] of Object.entries(PRODUCTS)) {
    const feed = p.from === 'bee' ? 0 : FEED_PRICE; // 벌통은 사료를 먹지 않음
    const profit = p.basePrice - feed;
    rows.push({ kind: 'ranch', id: k, source: `${p.from === 'bee' ? '벌통' : '목장'} ${p.name}`, unlock: 'Lv1', lv: 1, regrow: 0, cycle_s: p.time, profit, feed, perMin: (profit / p.time) * 60 });
  }
  return rows;
}

/** 해금 단계마다 그때 고를 수 있는 작물 중 1·2위 비교 → 지배 전략 의심 목록 */
export function dominanceByTier(rows = balanceRows()) {
  const crops = rows.filter((r) => r.kind === 'crop');
  const tiers = [...new Set(crops.map((r) => r.lv))].sort((a, b) => a - b);
  return tiers.map((lv) => {
    const avail = crops.filter((r) => r.lv <= lv).sort((a, b) => b.perMin - a.perMin);
    const ratio = avail.length > 1 ? avail[0].perMin / avail[1].perMin : 1;
    return { lv, top: avail[0], second: avail[1] || null, ratio, dominant: ratio > DOMINANT };
  });
}

/** 문서 칸별 마크다운 (열쇠 = <!-- gen:balance-열쇠 --> 표시 이름) */
export function balanceBlocks() {
  const rows = balanceRows();
  const crop = ['| 작물 | 씨앗 | 판매(기준) | 성장(초) | 해금 | 수확량 | 다시 열림 | 한 주기(초) | 분당 수익(물 줄 때) |', '|---|---|---|---|---|---|---|---|---|'];
  for (const r of rows.filter((x) => x.kind === 'crop')) {
    const c = CROPS[r.id];
    crop.push(`| ${c.name} | ${c.seedPrice} | ${c.basePrice} | ${c.growTime} | Lv${c.unlockLevel} | ${c.yield} | ${r.regrow ? `+${r.regrow}번` : '-'} | ${r.cycle_s} | ${r1(r.perMin)} |`);
  }
  const dom = dominanceByTier(rows).filter((d) => d.dominant);
  crop.push('', dom.length
    ? `⚠️ 지배 전략 의심 (같은 해금 단계 2위의 ${DOMINANT}배 초과): ${dom.map((d) => `Lv${d.lv} ${CROPS[d.top.id].name} ${r1(d.top.perMin)}/분 (${CROPS[d.second.id].name} ${r1(d.second.perMin)}/분의 ${d.ratio.toFixed(2)}배)`).join(' · ')}`
    : `✅ 해금 단계마다 1위가 2위의 ${DOMINANT}배 이하`);
  const rice = ['| 논 | 주기(초) | 이익 | 분당 수익 |', '|---|---|---|---|'];
  for (const r of rows.filter((x) => x.kind === 'rice')) rice.push(`| ${r.source.replace('논 ', '')} | ${r.cycle_s} | ${r.profit} | ${r1(r.perMin)} |`);
  const ranch = ['| 생산물 | 판매(기준) | 주기(초) | 사료 | 이익 | 분당 수익 |', '|---|---|---|---|---|---|'];
  for (const r of rows.filter((x) => x.kind === 'ranch')) ranch.push(`| ${r.source} | ${PRODUCTS[r.id].basePrice} | ${r.cycle_s} | ${r.feed} | ${r.profit} | ${r1(r.perMin)} |`);
  const book = ['| 도감 탭 | 종 수 | 완성 보상 | 이정표 |', '|---|---|---|---|'];
  for (const c of BOOK_CATS_3D) {
    const n = listOf(c).length, ms = Math.max(0, Math.ceil(n / MILESTONE_EVERY) - 1);
    book.push(`| ${CATEGORY_NAMES[c]}${c === 'ship' ? ' (3D 판)' : ''} | ${n} | ${COMPLETE_REWARD[c].toLocaleString()}🪙 + 트로피 | ${ms ? `${MILESTONE_EVERY}종마다 ${ms}번` : '없음'} |`);
  }
  book.push('', `자연 도감(물고기·곤충·과일) ${['fish', 'bug', 'fruit'].map((c) => itemsOf(c).length).join('·')}종은 도트 판과 같음. 출하 탭은 장터 판매·주문 납품으로 채워짐.`);
  return { crops: crop.join('\n'), rice: rice.join('\n'), ranch: ranch.join('\n'), book: book.join('\n') };
}

/** 모든 칸을 표시와 함께 (node scripts/balance.mjs --md) — 늘 같은 결과 */
export function balanceMarkdown() {
  const b = balanceBlocks();
  return Object.entries(b).map(([k, v]) => `<!-- gen:balance-${k} -->\n${v}\n<!-- /gen:balance-${k} -->`).join('\n\n') + '\n';
}

/** 문서 속 <!-- gen:balance-열쇠 --> … <!-- /gen:balance-열쇠 --> 칸 내용 (없으면 null) */
export function docBlock(text, key) {
  const m = new RegExp(`<!-- gen:balance-${key} -->\\n([\\s\\S]*?)\\n<!-- /gen:balance-${key} -->`).exec(text);
  return m ? m[1] : null;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain && process.argv.includes('--md')) process.stdout.write(balanceMarkdown());
else if (isMain) report();

function report() {
const rows = balanceRows();
console.log('\n== 유입(faucet): 단위 시설 1칸/1마리당 (다시 열리는 작물은 한 번 심어 거두는 전부) ==');
console.table(rows.map(({ source, unlock, regrow, cycle_s, profit, perMin }) => ({ source, unlock, regrow, cycle_s, profit, perMin: +perMin.toFixed(1) })));

// 지배 전략: 해금 단계마다 그때 고를 수 있는 작물 중 1위가 2위의 1.6배 넘으면 경고 (자동으로 고치지 않고 경제 담당에게 알림)
const crops = rows.filter((r) => r.kind === 'crop');
const sorted = [...crops].sort((a, b) => b.perMin - a.perMin);
for (const d of dominanceByTier(rows)) console.log(`Lv${d.lv}: 1위 ${d.top.source} ${d.top.perMin.toFixed(1)}/분${d.second ? `, 2위 대비 ${d.ratio.toFixed(2)}배` : ''} ${d.dominant ? '⚠️ 지배 전략 의심' : '✅'}`);

// 차익 루프: 판매가가 구매가보다 높은 아이템을 상점이 파는지
const loops = Object.entries(ITEMS).filter(([, it]) => it.cat === 'seed' && it.price > 0 && it.price * 0.5 >= it.price); // 값 0 (축제 엽전) 은 상점이 팔지 않음
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
}
