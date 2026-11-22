import test from 'node:test';
import assert from 'node:assert/strict';
import { FarmSim } from '../src/game/sim/farm.js';
import { Economy } from '../src/game/sim/economy.js';
import { Quests, QUESTS } from '../src/game/sim/quests.js';
import { FieldSim, FreeField, Vehicle, RIDE_SPECS } from '../src/game/sim/tractor.js';
import { SmartFarmSim } from '../src/game/sim/smartfarm.js';
import { RanchSim } from '../src/game/sim/ranch.js';
import { CROPS } from '../src/game/sim/crops.js';

test('farm: till -> plant -> water -> ready -> harvest', () => {
  const f = new FarmSim(2);
  f.rng = () => 0.99; // 대왕 작물 확률 배제
  assert.equal(f.actionFor(0, false).type, 'till');
  assert.ok(f.till(0));
  assert.equal(f.actionFor(0, false).type, 'need_seed');
  assert.ok(f.plant(0, 'carrot'));
  assert.equal(f.actionFor(0, true).type, 'water');
  assert.ok(f.water(0));
  f.tick(CROPS.carrot.growTime * 0.5);
  assert.equal(f.stage(0), 1);
  f.tick(CROPS.carrot.growTime);
  assert.equal(f.plots[0].state, 'ready');
  const r = f.harvest(0);
  assert.equal(r.crop, 'carrot');
  assert.equal(r.stars, 3, '물이 계속 있었으면 특상품');
  assert.equal(r.amount, CROPS.carrot.yield + 1);
  assert.equal(f.plots[0].state, 'tilled');
});

test('farm: unwatered crops grow slower, boost speeds up', () => {
  const a = new FarmSim(1), b = new FarmSim(1);
  for (const f of [a, b]) { f.till(0); f.plant(0, 'tomato'); }
  b.water(0);
  a.tick(10); b.tick(10);
  assert.ok(b.plots[0].progress > a.plots[0].progress * 2.5);
  const c = new FarmSim(1); c.till(0); c.plant(0, 'tomato'); c.water(0); c.boost = 2; c.tick(10);
  assert.ok(Math.abs(c.plots[0].progress - b.plots[0].progress * 2) < 1e-9);
});

test('economy: buy/sell/prices within bounds', () => {
  const rng = seeded(1);
  const e = new Economy(rng);
  const m0 = e.money;
  assert.ok(e.buySeed('carrot', 2));
  assert.equal(e.money, m0 - CROPS.carrot.seedPrice * 2);
  assert.equal(e.inventory.seeds.carrot, 5);
  assert.ok(!e.buySeed('corn', 100));
  e.addCrop('carrot', 4);
  const got = e.sell('carrot', 10);
  assert.equal(got, e.sellPrice('carrot') * 4);
  assert.equal(e.inventory.crops.carrot, 0);
  for (let d = 0; d < 200; d++) e.newDay();
  for (const p of Object.values(e.prices)) assert.ok(p.mult >= 0.55 && p.mult <= 1.7);
});

test('economy: demand event doubles price', () => {
  const e = new Economy(() => 0.1); // rng<0.3 => 이벤트 발생
  e.newDay();
  assert.ok(e.event);
  const base = e.basePrice(e.event.item) * e.prices[e.event.item].mult;
  assert.equal(e.sellPrice(e.event.item), Math.round(base * 2));
});

test('quests: progress, claim, level up', () => {
  const q = new Quests();
  assert.equal(q.report('till').length, 1);
  assert.equal(q.claim('till1').reward.money, 30);
  assert.equal(q.claim('till1'), null);
  q.report('money', 5000);
  assert.ok(q.isComplete(QUESTS.find((x) => x.id === 'rich')));
  for (const x of QUESTS) q.progress[x.id] = x.goal;
  let lv = 1;
  for (const x of QUESTS) { const r = q.claim(x.id); if (r?.levelUp) lv = r.level; }
  assert.ok(lv >= 4, 'all quests should reach level 4+');
});

test('tractor: field plowing, rocks, timer', () => {
  const f = new FieldSim(4, 2, 2, 0, 0, [[1, 0]]);
  f.start();
  assert.equal(f.plowAt(1, 1), 0);
  assert.equal(f.plowAt(1, 1), -1, 'already plowed');
  assert.equal(f.plowAt(3, 1), -1, 'rock');
  assert.ok(f.isRock(3, 1));
  assert.equal(f.plowAt(100, 1), -1, 'outside');
  assert.equal(f.score, 1);
  assert.ok(!f.tick(1));
  assert.ok(f.tick(100));
  assert.equal(f.running, false);
  const v = new Vehicle(0, 0, 0);
  v.step(1, 1, 0);
  assert.ok(v.speed > 0 && v.z > 0);
});

test('tractor field: free plowing, rocks, regrow', () => {
  const f = new FreeField(4, 2, 2, 0, 0, [[1, 0]]);
  assert.equal(f.open, 7);
  assert.equal(f.plowAt(1, 1, 10), 0);
  assert.equal(f.plowAt(1, 1, 11), -1, 'already plowed');
  assert.equal(f.plowAt(3, 1), -1, 'rock');
  assert.ok(f.isRock(3, 1));
  assert.equal(f.plowAt(100, 1), -1, 'outside');
  assert.equal(f.total, 1);
  assert.equal(f.plowedCount, 1);
  assert.deepEqual(f.regrow(100, 240), [], 'not yet');
  assert.deepEqual(f.regrow(250, 240), [0], 'grass grows back');
  assert.equal(f.plowAt(1, 1, 251), 0, 'can plow again');
  assert.equal(f.total, 2);
  const v = new Vehicle(0, 0, 0);
  v.step(1, 1, 0);
  assert.ok(v.speed > 0 && v.z > 0);
});

test('rides: bike is quicker and turns tighter than the tractor', () => {
  const run = (spec) => { const v = new Vehicle(0, 0, 0, spec); for (let i = 0; i < 300; i++) v.step(1 / 60, 1, 1); return v; };
  const t = run(RIDE_SPECS.tractor), b = run(RIDE_SPECS.bike), c = run(RIDE_SPECS.cart);
  assert.ok(b.speed > t.speed && c.speed > t.speed);
  assert.ok(Math.abs(b.heading) > Math.abs(t.heading));
  for (const k of Object.keys(RIDE_SPECS)) assert.ok(RIDE_SPECS[k].R > 0 && RIDE_SPECS[k].MAX > 0, k);
});

test('tractor: smooth start, no sudden acceleration, gentle stop', () => {
  const v = new Vehicle(0, 0, 0);
  for (let i = 0; i < 15; i++) v.step(1 / 60, 1, 0); // 0.25초
  assert.ok(v.speed < 0.6, `0.25s 후 속도 ${v.speed.toFixed(2)} (급발진 아님)`);
  let maxJerk = 0, prevV = v.speed;
  v.step(1 / 60, 1, 0);
  let prevA = (v.speed - prevV) * 60; prevV = v.speed;
  for (let i = 0; i < 300; i++) { v.step(1 / 60, 1, 0); const a = (v.speed - prevV) * 60; maxJerk = Math.max(maxJerk, Math.abs(a - prevA) * 60); prevA = a; prevV = v.speed; }
  assert.ok(v.speed > 4 && v.speed <= 5.5, `5초 후 ${v.speed.toFixed(2)}`);
  assert.ok(maxJerk < 30, `가가속도 ${maxJerk.toFixed(1)}`);
  // 손을 떼면 1초 안에 급정거하지 않음
  const s0 = v.speed;
  for (let i = 0; i < 60; i++) v.step(1 / 60, 0, 0);
  assert.ok(v.speed > s0 * 0.4 && v.speed < s0, `관성 감속 ${s0.toFixed(2)} → ${v.speed.toFixed(2)}`);
  // 브레이크 후 후진
  for (let i = 0; i < 240; i++) v.step(1 / 60, -1, 0);
  assert.ok(v.speed < 0 && v.speed >= -2.2);
});

test('smartfarm: actions move values, score from time in range', () => {
  const s = new SmartFarmSim(() => 0.5);
  s.start();
  const t0 = s.vars.temp.value;
  s.act('heater');
  assert.ok(s.vars.temp.value > t0);
  for (let i = 0; i < 5; i++) s.tick(1);
  assert.ok(s.good > 0);
  s.tick(30);
  assert.equal(s.running, false);
  assert.ok(s.result().score >= 0 && s.result().score <= 100);
});

test('ranch: feed -> product after time -> collect', () => {
  const r = new RanchSim([{ type: 'chicken' }]);
  const a = r.animals[0];
  assert.equal(r.actionFor(a).type, 'feed');
  assert.ok(r.feed(a));
  assert.ok(!r.feed(a));
  r.tick(30);
  assert.equal(r.actionFor(a).type, 'wait');
  assert.equal(r.tick(40).length, 1);
  assert.equal(r.collect(a), 'egg');
  assert.equal(r.collect(a), null);
});

function seeded(s) { return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }

test('수확 축제: 7일마다 작물·생산물 1.3배, 저장·불러오기', async () => {
  const { Economy, FESTIVAL_EVERY, FESTIVAL_MULT } = await import('../src/game/sim/economy.js');
  assert.equal(Economy.isFestival(FESTIVAL_EVERY), true);
  assert.equal(Economy.isFestival(FESTIVAL_EVERY * 2), true);
  assert.equal(Economy.isFestival(0), false);
  assert.equal(Economy.isFestival(FESTIVAL_EVERY + 1), false);
  const e = new Economy(() => 0.5); // 시세 변동 0 (0.5 → 배수 1)
  e.newDay(FESTIVAL_EVERY - 1);
  const base = e.sellPrice('carrot'), milk = e.sellPrice('milk');
  e.newDay(FESTIVAL_EVERY);
  assert.ok(e.festival);
  assert.equal(e.sellPrice('carrot'), Math.round(base * FESTIVAL_MULT));
  assert.equal(e.sellPrice('milk'), Math.round(milk * FESTIVAL_MULT));
  const f = new Economy(); f.load(JSON.parse(JSON.stringify(e.toJSON())));
  assert.equal(f.festival.mult, FESTIVAL_MULT);
  e.newDay(FESTIVAL_EVERY + 1);
  assert.equal(e.festival, null);
  assert.equal(e.sellPrice('carrot'), base);
});

test('자전거: 트랙터와 다른 조작감 (가벼운 출발·프리휠·손 브레이크·기울여 돌기·서서 방향 바꾸기)', () => {
  const B = RIDE_SPECS.bike, T = RIDE_SPECS.tractor;
  const go = (spec, s) => { const v = new Vehicle(0, 0, 0, spec); for (let i = 0; i < s * 60; i++) v.step(1 / 60, 1, 0); return v; };
  const b1 = go(B, 1), t1 = go(T, 1);
  assert.ok(b1.speed > 4 && b1.speed > t1.speed * 2, `1초 뒤 자전거 ${b1.speed.toFixed(2)} · 트랙터 ${t1.speed.toFixed(2)}`);
  const b = go(B, 4);
  assert.ok(b.speed > 8.5, `달리기(4.6)보다 훨씬 빠름: ${b.speed.toFixed(2)}`);
  // 페달 박자: 밟는 동안 가속이 출렁임
  const acc = []; let prev = 0; const p = new Vehicle(0, 0, 0, B);
  for (let i = 0; i < 60; i++) { p.step(1 / 60, 1, 0); acc.push(p.speed - prev); prev = p.speed; }
  assert.ok(Math.max(...acc.slice(10)) > Math.min(...acc.slice(10)) * 1.5, '박자에 따라 가속이 달라짐');
  // 프리휠: 손을 떼면 2초 뒤에도 대부분의 속도가 남음 (트랙터는 더 많이 줄어듦)
  const keep = (v) => { const s0 = v.speed; for (let i = 0; i < 120; i++) v.step(1 / 60, 0, 0); return v.speed / s0; };
  assert.ok(keep(go(B, 3)) > 0.75 && keep(go(B, 3)) > keep(go(T, 3)));
  // 손 브레이크: 1초 안에 멈추고, 계속 누르면 잠깐 뒤에야 아주 천천히 뒤로
  const k = go(B, 3);
  for (let i = 0; i < 60; i++) k.step(1 / 60, -1, 0);
  assert.equal(k.speed, 0);
  for (let i = 0; i < 90; i++) k.step(1 / 60, -1, 0);
  assert.ok(k.speed < 0 && k.speed >= -B.REV_MAX);
  // 기울여 돌기: 돌면 기울고, 빠를수록 넓게 돎
  const turn = (s) => { const v = go(B, s); const h0 = v.heading; for (let i = 0; i < 30; i++) v.step(1 / 60, s ? 1 : 0, 1); return { d: Math.abs(v.heading - h0), lean: v.lean, r: v.speed / (Math.abs(v.heading - h0) * 2) }; };
  const slow = turn(0.4), fast = turn(4);
  assert.ok(fast.lean > 0.2, '돌면 몸이 기울어짐');
  assert.ok(fast.r > slow.r, `빠를수록 넓게: 반지름 ${slow.r.toFixed(1)} → ${fast.r.toFixed(1)}m`);
  // 멈춘 채로도 발로 끌며 방향을 바꿀 수 있음
  const z = new Vehicle(0, 0, 0, B);
  for (let i = 0; i < 60; i++) z.step(1 / 60, 0, 1);
  assert.ok(Math.abs(z.heading) > 1 && Math.abs(z.speed) < 0.01);
});

test('배치: 밭 칸 위에는 가로등·나무·세워 둔 탈것·주민이 없음 (겹쳐 보이지 않게)', async () => {
  const { LAYOUT: L } = await import('../src/game/world.js');
  const F = L.farm, hx = F.cols * F.tile / 2, hz = F.rows * F.tile / 2;
  const inFarm = (x, z, r) => Math.abs(x - F.origin.x) < hx + r && Math.abs(z - F.origin.z) < hz + r;
  for (const [n, x, z] of L.props) assert.ok(!inFarm(x, z, 0.3), `${n} (${x}, ${z})`);
  for (const [k, list] of Object.entries(L.rides)) for (const p of list) assert.ok(!inFarm(p.x, p.z, k === 'bike' ? 0.8 : 1.2), `${k} (${p.x}, ${p.z})`);
  for (const t of L.orchard) assert.ok(!inFarm(t.x, t.z, 1), `나무 (${t.x}, ${t.z})`);
  for (const [k, n] of Object.entries(L.npcs)) assert.ok(!inFarm(n.x, n.z, 0.5), k);
});

test('배치: 흙길 판정과 새 마을 부지 예약 (나무·바위·덤불이 길과 건설 부지를 막지 않게)', async () => {
  const { LAYOUT: L, pathNear } = await import('../src/game/world.js');
  assert.ok(pathNear(0, 0), '중앙 길 위');
  assert.ok(!pathNear(-6, -1.5), '밭 안쪽 (길에서 먼 곳)');
  assert.ok(pathNear(-22.8, 9.4, 1.4), '새 마을 가는 길 옆 (예전 나무 자리)');
  const inRes = (x, z) => L.reserved.some(([x0, z0, x1, z1]) => x > x0 && x < x1 && z > z0 && z < z1);
  for (const s of L.town.sites) assert.ok(inRes(s.x, s.z), `부지 (${s.x}, ${s.z}) 예약`);
});

test('다시 열리는 작물: 처음은 yield 개, 다시 열린 수확은 regrowYield 개 (토마토·딸기가 다른 작물을 압도하지 않게)', async () => {
  const { CROPS, harvestYield, totalYield } = await import('../src/game/sim/crops.js');
  const { FarmSim } = await import('../src/game/sim/farm.js');
  assert.equal(harvestYield(CROPS.tomato, true), 3);
  assert.equal(harvestYield(CROPS.tomato, false), 2);
  assert.equal(harvestYield(CROPS.carrot, false), CROPS.carrot.yield, 'regrowYield 없으면 yield');
  assert.equal(totalYield(CROPS.tomato), 3 + 2 * 2);
  const f = new FarmSim(1);
  const p = f.plots[0];
  Object.assign(p, { state: 'ready', crop: 'tomato', progress: 1, water: 1, regrowLeft: 2, giant: false, careT: 1, careOk: 0.6 });
  const a = f.harvest(0, 2);
  Object.assign(p, { state: 'ready', progress: 1, giant: false, careT: 1, careOk: 0.6 });
  const b = f.harvest(0, 2);
  assert.equal(b.amount - a.amount, harvestYield(CROPS.tomato, false) - harvestYield(CROPS.tomato, true), `첫 ${a.amount}개, 다시 열린 것 ${b.amount}개`);
});
