import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  FESTIVALS, FESTIVAL_IDS, festivalOf, festivalAt, festivalTomorrow, festivalKey, priceFestival, fixFestival,
  festState, actTokens, saleTokens, takeFood, STAR_TOKENS, ACT_TOKEN_CAP, SALE_COINS, SALE_TOKEN_CAP, FEST_OPEN_H,
} from '../src/game/sim/festival.js';
import { Economy, FESTIVAL_MULT } from '../src/game/sim/economy.js';
import { ITEMS } from '../src/game/sim/items.js';
import { FEST_SLOTS, slotAt, legOf, routineSpots, ROUTINE } from '../src/game/sim/routine.js';
import { FESTIVAL_LINES } from '../src/game/sim/villager_lines.js';
import { NavGrid } from '../src/game/sim/path.js';
import { LAYOUT, World } from '../src/game/world.js';
import { DecorSim } from '../src/game/sim/decor.js';

test('축제: 계절 7일째마다 그 계절 축제 (봄꽃·단오·한가위·동지), 이름에 축제, 음식·장터·놀이 그림이 있음', () => {
  assert.deepEqual(FESTIVAL_IDS, ['spring', 'summer', 'autumn', 'winter']);
  assert.equal(festivalOf(7).id, 'spring');
  assert.equal(festivalOf(14).id, 'summer');
  assert.equal(festivalOf(21).id, 'autumn');
  assert.equal(festivalOf(28).id, 'winter');
  assert.equal(festivalOf(35).id, 'spring', '다음 해 봄');
  for (const d of [1, 6, 8, 13, 27]) assert.equal(festivalOf(d), null, `${d}일`);
  assert.equal(festivalTomorrow(6).id, 'spring');
  assert.equal(festivalTomorrow(7), null);
  for (const f of Object.values(FESTIVALS)) {
    assert.match(f.name, /축제/);
    assert.ok(ITEMS[f.food], `${f.id} 음식`);
    assert.ok(f.fact.length > 20 && f.desc && f.skin.good.length === 2 && f.skin.gold && f.skin.bad, f.id);
    assert.ok(f.stall.length >= 1 && f.stall.length <= 2, `${f.id} 한정 꾸미기 1~2개`);
  }
  // Economy.isFestival(도트 판이 씀)과 같은 날
  for (let d = 1; d <= 60; d++) assert.equal(!!festivalOf(d), Economy.isFestival(d), `${d}일`);
});

test('축제 마당: 축제 날 6시부터 다음 날 6시까지 (밤엔 night), 해·계절마다 다른 열쇠', () => {
  const h = (x) => x / 24;
  assert.equal(festivalAt(7, h(FEST_OPEN_H - 0.1)), null, '축제 날 새벽은 아직');
  assert.equal(festivalAt(7, h(6)).id, 'spring');
  assert.equal(festivalAt(7, h(12)).night, false);
  assert.equal(festivalAt(7, h(22)).night, true);
  assert.equal(festivalAt(8, h(3)).id, 'spring', '다음 날 새벽까지');
  assert.equal(festivalAt(8, h(3)).day, 7);
  assert.equal(festivalAt(8, h(6.1)), null);
  assert.equal(festivalAt(1, h(2)), null, '첫날 새벽 (0일 없음)');
  assert.notEqual(festivalKey(7), festivalKey(14));
  assert.notEqual(festivalKey(7), festivalKey(35));
  assert.equal(festivalAt(8, h(3)).key, festivalKey(7));
});

test('장터 축제 값: { id, name(축제), mult 1.3 }, 축제 날 하루만, 예전 저장은 날짜로 id 채움', () => {
  const e = new Economy(() => 0.5);
  e.newDay(14);
  assert.deepEqual(Object.keys(e.festival).sort(), ['id', 'mult', 'name']);
  assert.equal(e.festival.id, 'summer');
  assert.equal(e.festival.mult, FESTIVAL_MULT);
  assert.match(e.festival.name, /단오 축제/);
  e.newDay(15);
  assert.equal(e.festival, null);
  // 예전 저장 (id 없음) → 불러온 날짜로
  const old = new Economy(() => 0.5);
  old.load({ money: 10, festival: { name: '🎉 유니코 수확 축제! 오늘은 모든 농산물·생산물 1.3배', mult: 1.3 } });
  assert.equal(old.festival.id, undefined);
  const fixed = fixFestival(old.festival, 21, FESTIVAL_MULT);
  assert.equal(fixed.id, 'autumn');
  assert.equal(fixed.mult, 1.3);
  assert.equal(fixFestival(null, 21, 1.3), null);
  assert.equal(fixFestival(e.festival, 3, 1.3), e.festival);
  // JSON 왕복
  e.newDay(28);
  const back = new Economy(() => 0.5);
  back.load(JSON.parse(JSON.stringify(e.toJSON())));
  assert.deepEqual(back.festival, priceFestival(28, FESTIVAL_MULT));
});

test('엽전: 놀이는 별만큼 (축제마다 상한), 판매는 200코인마다 1개 (상한), 음식은 축제마다 한 번', () => {
  let st = festState(null, '1-spring');
  assert.deepEqual(STAR_TOKENS.map((_, s) => actTokens(festState(null, 'x'), s)), STAR_TOKENS);
  let got = 0;
  for (let i = 0; i < 10; i++) got += actTokens(st, 3);
  assert.equal(got, ACT_TOKEN_CAP);
  assert.equal(actTokens(st, 3), 0, '상한 뒤엔 0');
  // 판매: 150 + 100 = 250 → 1개, 계속 팔아도 상한까지
  assert.equal(saleTokens(st, 150), 0);
  assert.equal(saleTokens(st, 100), 1);
  assert.equal(saleTokens(st, 0), 0);
  assert.equal(saleTokens(st, -5), 0);
  let sum = 1;
  for (let i = 0; i < 20; i++) sum += saleTokens(st, SALE_COINS);
  assert.equal(sum, SALE_TOKEN_CAP);
  // 음식
  assert.equal(takeFood(st, FESTIVALS.spring), 'fest_hwajeon');
  assert.equal(takeFood(st, FESTIVALS.spring), null);
  // 같은 열쇠는 그대로, 다음 축제는 새로
  assert.equal(festState(st, '1-spring'), st);
  st = festState(st, '1-summer');
  assert.equal(st.act, 0); assert.equal(st.food, false);
  assert.equal(takeFood(st, FESTIVALS.summer), 'fest_surichwi');
});

test('엽전·축제 음식 아이템: 엽전은 팔기·선물 목록에 안 나옴 (씨앗 칸), 판매 알림은 onSale', () => {
  assert.equal(ITEMS.fest_token.cat, 'seed');
  const e = new Economy(() => 0.5);
  const sold = [];
  e.onSale = (n) => sold.push(n);
  e.addItem('fest_token', 3);
  e.addItem('fest_songpyeon', 1);
  const total = e.sellAll();
  assert.equal(e.count('fest_token'), 3, '엽전은 다 팔기에서 빠짐');
  assert.equal(e.count('fest_songpyeon'), 0);
  assert.ok(total > 0 && sold.reduce((a, b) => a + b, 0) === total);
});

// ---- 주민 모이기: 축제 마당 자리 (sim/routine.js FEST_SLOTS) ----
const FX = JSON.parse(readFileSync(new URL('./fixtures/static_world.json', import.meta.url), 'utf8'));
const world = { obstacles: FX.obstacles, boxes: FX.boxes, waters: FX.waters };
world.inWater = World.prototype.inWater.bind(world);
world.isBlocked = World.prototype.isBlocked.bind(world);
const nav = new NavGrid((x, z) => world.isBlocked(x, z, 0.4), LAYOUT.bounds - 1, 0.5);
const FARM = { x: (LAYOUT.farm.cols * LAYOUT.farm.tile) / 2, z: (LAYOUT.farm.rows * LAYOUT.farm.tile) / 2 };

test('축제 모이기: 안내·연구원·할머니·꼬마만 (여우·낚시꾼은 가게), 축제가 열려 있으면 하루 종일·비가 와도 마당', () => {
  assert.deepEqual(Object.keys(FEST_SLOTS).sort(), ['granny', 'guide', 'kid', 'researcher']);
  for (const id of Object.keys(ROUTINE)) {
    for (const h of [0, 7, 12, 20, 23.5]) {
      const s = slotAt(id, h, true, 'autumn');
      if (FEST_SLOTS[id]) { assert.equal(s, FEST_SLOTS[id]); assert.ok(s.awake && s.fest); } else assert.notEqual(s, FEST_SLOTS[id]);
      assert.equal(slotAt(id, h, false, null)?.fest, undefined, '축제가 아니면 평소 일과');
    }
  }
  // 축제 자리도 장식 보호 구역에 들어감
  for (const s of Object.values(FEST_SLOTS)) assert.ok(routineSpots().some((o) => o.fest && o.x === s.at.x && o.z === s.at.z));
});

test('축제 모이기 길: 구간마다 NavGrid.lineFree, 밭·자전거 자리를 밟지 않고, 다른 주민 자리와 가판대를 스치지 않음', () => {
  const BOOTH = { x: 6.0, z: -6.6, r: 1.2 }; // festival_view.js BOOTH (가판대를 1.3배로 키움)
  const segD = (p, a, b) => { const dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz || 1; const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / l2)); return Math.hypot(p.x - a.x - dx * t, p.z - a.z - dz * t); };
  for (const [id, s] of Object.entries(FEST_SLOTS)) {
    const n = LAYOUT.npcs[id];
    assert.ok(!world.isBlocked(s.at.x, s.at.z, 0.4), `${id} 자리 막힘`);
    assert.ok(Math.hypot(s.at.x - BOOTH.x, s.at.z - BOOTH.z) > BOOTH.r + 1, `${id} 가판대 옆`);
    const pts = legOf({ x: n.x, z: n.z }, s);
    const from = n.wander ? 1 : 0;
    if (n.wander) for (const [x, z] of [[n.wander.x0 + 1, n.wander.z1 - 0.5], [n.wander.x1 - 1, n.wander.z1 - 0.5], [n.x, n.z]]) assert.ok(nav.lineFree({ x, z }, pts[1]), `${id} 들판 → 첫 경유점`);
    for (let i = from; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      assert.ok(nav.lineFree(a, b), `${id} (${a.x}, ${a.z}) → (${b.x}, ${b.z})`);
      for (let k = 0; k <= 40; k++) {
        const x = a.x + ((b.x - a.x) * k) / 40, z = a.z + ((b.z - a.z) * k) / 40;
        assert.ok(Math.abs(x) > FARM.x + 0.2 || Math.abs(z) > FARM.z + 0.2, `${id} 밭 위 (${x.toFixed(1)}, ${z.toFixed(1)})`);
        for (const bk of LAYOUT.rides.bike) assert.ok(Math.hypot(x - bk.x, z - bk.z) > 1.2, `${id} 자전거 자리`);
      }
      for (const [o, os] of Object.entries(FEST_SLOTS)) if (o !== id) assert.ok(segD(os.at, a, b) > 1.1, `${id} 길이 ${o} 자리를 스침`);
      assert.ok(segD(BOOTH, a, b) > BOOTH.r + 0.4, `${id} 길이 가판대를 스침`);
    }
  }
});

test('축제 첫마디: 주민마다 축제 4개, 반말 (할머니 해라체), 키 안내 없음', () => {
  for (const id of ['merchant', 'researcher', 'guide', 'granny', 'fisher', 'kid']) {
    for (const f of FESTIVAL_IDS) {
      const t = FESTIVAL_LINES[id]?.[f];
      assert.ok(t, `${id} ${f}`);
      assert.ok(!/(요|세요|니다)[.!?~… 💕🙏🐾🎣]*$/.test(t.trim()) || /삽니다~|팔아요!/.test(t), `${id} 해요체: ${t}`);
      assert.ok(!/\([A-Z]\)/.test(t));
      if (id === 'granny') assert.ok(/(단다|거라|니|구나|란다|지|마|게|다)[.!?~… 💕🙏]*$/.test(t.trim()), `할머니 해라체: ${t}`);
    }
  }
});

test('축제 꾸미기: 꾸미기 표에 등록되어 놓은 축제 소품이 저장·불러오기를 견딤 (보관함도)', async () => {
  const { FEST_DECOR } = await import('../src/ui/panels/festival.js');
  const D = await import('../src/game/sim/decor.js');
  for (const d of FEST_DECOR) { assert.equal(D.DECOR_BY_ID[d.id]?.model, d.model, d.id); assert.ok(D.DECOR.some((x) => x.id === d.id), d.id); }
  for (const f of Object.values(FESTIVALS)) for (const id of f.stall) assert.ok(D.DECOR_BY_ID[id], `${f.id} 장터 ${id}`);
  const sim = new DecorSim();
  sim.stored.fest_lantern = 1;
  assert.equal(sim.place('fest_lantern', 12.5, 15, 2, { money: 0, level: 1 }), 0, '보관함 것은 무료');
  sim.stored.fest_snowman = 2;
  const back = new DecorSim();
  back.load(JSON.parse(JSON.stringify(sim.toJSON())));
  assert.deepEqual(back.placed.map((p) => p.id), ['fest_lantern']);
  assert.equal(back.storedOf('fest_snowman'), 2);
  // 코인으로는 꾸미기 창에 안 나옴 (축제 장터에서만)
  assert.ok(!D.DECOR_CATS.some(([c]) => c === 'fest'));
});

test('축제 꾸미기: 엽전으로 바꾼 소품은 보관함 수만큼만 놓이고, 다 놓으면 더 놓을 수 없음 (공짜로 끝없이 놓이지 않음)', async () => {
  // 준비: 연등 하나를 엽전으로 바꿔 보관함에 넣음
  const { TOKEN_ONLY_WHY } = await import('../src/ui/panels/festival.js');
  const sim = new DecorSim();
  sim.stored.fest_lantern = 1;
  // 실행·확인: 첫 번째는 무료로 놓이고, 두 번째는 못 놓음
  assert.equal(sim.place('fest_lantern', 12.5, 15, 0, { money: 99999, level: 99 }), 0);
  assert.equal(sim.whyNot('fest_lantern', { money: 99999, level: 99 }), TOKEN_ONLY_WHY);
  assert.equal(sim.place('fest_lantern', 14, 15, 0, { money: 99999, level: 99 }), -1);
  assert.equal(sim.count, 1);
  // 치웠다 다시 놓기(옮기기)는 그대로 됨
  assert.equal(sim.move(0, 13, 16, 1), true);
  assert.equal(sim.count, 1);
  // 코인 소품은 그대로 코인으로
  assert.equal(sim.whyNot('bench', { money: 500, level: 99 }), null);
});

test('축제 낮음 품질: 마당에 모이는 주민은 안내 강아지 하나뿐이고, 번갈아 보는 곳은 가판대·마당 가운데', async () => {
  const { FEST_LOW, FEST_IDLE, FEST_LOOK_AT } = await import('../src/game/sim/routine.js');
  assert.deepEqual(FEST_LOW, ['guide']);
  for (const id of FEST_LOW) assert.ok(FEST_SLOTS[id], id);
  assert.equal(FEST_LOOK_AT.length, 2);
  assert.deepEqual(FEST_LOOK_AT[0], { x: 6.0, z: -6.6 }, '가판대');
  assert.ok(FEST_IDLE.length >= 3, `동작 ${FEST_IDLE.length}개`);
});

test('축제 음식·엽전 그림: 음식은 색 동그라미가 아닌 음식 그림, 엽전은 연등(🏮)과 다른 그림, 가을 놀이엔 봄꽃 대신 감', () => {
  for (const f of Object.values(FESTIVALS)) {
    assert.doesNotMatch(ITEMS[f.food].emoji, /[🟢🟠🟡🔴🟣🟤⚫⚪]/u, f.food);
    assert.doesNotMatch(f.skin.gold, /[🟢🟠🟡🔴🟣🟤]/u, `${f.id} 금빛 아이템`);
    assert.ok(['azalea', 'iris', 'persimmon', 'snow'].includes(f.skin.deco), `${f.id} 가지 장식 ${f.skin.deco}`);
  }
  assert.equal(FESTIVALS.autumn.skin.deco, 'persimmon');
  assert.notEqual(ITEMS.fest_token.emoji, '🏮');
});
