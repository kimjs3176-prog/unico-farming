import test from 'node:test';
import assert from 'node:assert/strict';
import { DecorSim, DECOR, DECOR_ALL, DECOR_BY_ID, DECOR_MAX, DECOR_CATS, DECOR_PREMIUM, DECOR_LIMITED, registerDecor, outsideZones, snapAhead } from '../src/game/sim/decor.js';

test('꾸미기: 사서 놓기 · 레벨·코인 조건 · 치우면 보관함 → 다시 놓을 때 무료', () => {
  const d = new DecorSim();
  assert.match(d.whyNot('bench', { money: 10 }), /모자라요/);
  assert.match(d.whyNot('well', { money: 9999, level: 1 }), /Lv\.4/);
  assert.equal(d.place('bench', 1.234, 2, 1, { money: 9999 }), DECOR_BY_ID.bench.price);
  assert.deepEqual(d.placed[0], { id: 'bench', x: 1.23, z: 2, rot: 1 });
  const p = d.pickUp(0);
  assert.equal(p.id, 'bench'); assert.equal(d.count, 0); assert.equal(d.storedOf('bench'), 1);
  assert.equal(d.whyNot('bench', { money: 0, level: 1 }), null, '보관함 것은 돈·레벨 상관없이');
  assert.equal(d.place('bench', 3, 3, 9, { money: 0 }), 0);
  assert.equal(d.placed[0].rot, 1, '돌리기는 8단계(45도)로');
  assert.equal(d.storedOf('bench'), 0);
});

test('꾸미기: 옮기기는 무료, 가장 가까운 소품 찾기, 개수 한도', () => {
  const d = new DecorSim();
  d.place('lamp', 0, 0, 0, { money: 9999 }); d.place('crate', 5, 5, 0, { money: 9999 });
  assert.equal(d.nearest(4.5, 5.2), 1);
  assert.equal(d.nearest(20, 20), -1);
  const spent = d.spent;
  assert.ok(d.move(0, 2, 2, 3));
  assert.equal(d.spent, spent);
  assert.deepEqual(d.placed.find((p) => p.id === 'lamp'), { id: 'lamp', x: 2, z: 2, rot: 3 });
  for (let i = d.count; i < DECOR_MAX; i++) d.place('stump', i, 0, 0, { money: 99999 });
  assert.match(d.whyNot('stump', { money: 99999 }), /까지/);
  assert.equal(d.place('stump', 0, 0, 0, { money: 99999 }), -1);
});

test('꾸미기: 불러오기 검사 (없는 소품·이상한 좌표·너무 많음 거름)', () => {
  const d = new DecorSim();
  d.load({ placed: [{ id: 'bench', x: 1, z: 2, rot: 2 }, { id: 'rocket', x: 0, z: 0 }, { id: 'lamp', x: 'NaN', z: 1 }, { id: 'lamp', x: 1e9, z: 0 }], stored: { bench: 2, ufo: 5, lamp: -3 } });
  assert.deepEqual(d.placed, [{ id: 'bench', x: 1, z: 2, rot: 2 }]);
  assert.deepEqual(d.stored, { bench: 2 });
  const many = { placed: Array.from({ length: 200 }, (_, i) => ({ id: 'stump', x: i % 50, z: 0 })) };
  d.load(many);
  assert.equal(d.count, DECOR_MAX);
});

test('꾸미기: 보호 구역·앞쪽 자리 계산, 카탈로그는 모두 모델 이름이 있음', () => {
  const zones = [[0, 0, 10, 10], { x: 20, z: 0, r: 2 }];
  assert.equal(outsideZones(5, 5, 0.5, zones), false);
  assert.equal(outsideZones(10.3, 5, 0.5, zones), false, '반지름만큼 여유');
  assert.equal(outsideZones(11, 5, 0.5, zones), true);
  assert.equal(outsideZones(21, 0, 0.3, zones), false);
  assert.deepEqual(snapAhead(0, 0, 0, 2.2), { x: 0, z: 2 });
  assert.deepEqual(snapAhead(1, 1, Math.PI / 2, 2.2), { x: 3, z: 1 });
  for (const it of DECOR) assert.ok(it.model && it.price > 0 && it.icon, it.id);
  assert.equal(new Set(DECOR.map((x) => x.id)).size, DECOR.length);
});

test('특별 소품: Lv5~8 · 800~5,000코인 10개 이상, 색 바꾼 소품은 tint 를 가짐', () => {
  assert.ok(DECOR_PREMIUM.length >= 10 && DECOR_PREMIUM.length <= 15, String(DECOR_PREMIUM.length));
  for (const d of DECOR_PREMIUM) {
    assert.ok(d.lv >= 5 && d.lv <= 8, `${d.id} Lv.${d.lv}`);
    assert.ok(d.price >= 800 && d.price <= 5000, `${d.id} ${d.price}`);
    assert.equal(DECOR_BY_ID[d.id], d);
  }
  assert.ok(DECOR_PREMIUM.some((d) => d.tint) && DECOR_LIMITED.every((d) => d.tint && d.limited));
  assert.equal(DECOR.length, 20, '기본 목록(레벨 해금 카드가 읽음)은 그대로');
  assert.equal(new Set(DECOR_ALL.map((x) => x.id)).size, DECOR_ALL.length);
  assert.equal(DECOR_MAX, 60);
});

test('한정 소품: 진열대에서 사면 보관함으로, 놓을 때 무료 · 직접 놓아 사기는 안 됨', () => {
  const d = new DecorSim();
  const id = DECOR_LIMITED[0].id, price = DECOR_LIMITED[0].price;
  assert.match(d.whyNot(id, { money: 99999 }), /오늘의 특별 상품/);
  assert.equal(d.buyToStore(id, { money: price - 1 }), 0);
  assert.equal(d.buyToStore(id, { money: price }), price);
  assert.equal(d.storedOf(id), 1);
  assert.equal(d.spent, price);
  assert.equal(d.place(id, 2, 2, 0, { money: 0, level: 1 }), 0);
  assert.equal(d.storedOf(id), 0);
});

test('색 바꾼 소품을 놓고 저장했다가 불러와도 그대로 남음', () => {
  const d = new DecorSim();
  d.place('goldlamp', 1, 1, 2, { money: 99999, level: 8 });
  d.buyToStore('bench_pink', { money: 99999 });
  const back = new DecorSim();
  back.load(JSON.parse(JSON.stringify(d.toJSON())));
  assert.deepEqual(back.placed, [{ id: 'goldlamp', x: 1, z: 1, rot: 2 }]);
  assert.equal(back.storedOf('bench_pink'), 1);
});

test('registerDecor: 새 소품을 목록·찾기표에 더하고, 잘못된 id·겹치는 id 는 거절', () => {
  const def = registerDecor({ id: 'test_lantern', name: '시험 등불', icon: '🏮', price: 300, lv: 2, model: 'lamp', cat: 'festival_t', catLabel: '🎉 축제' });
  assert.ok(def);
  assert.equal(DECOR_BY_ID.test_lantern, def);
  assert.ok(DECOR_ALL.includes(def) && DECOR.includes(def));
  assert.equal(registerDecor({ id: 'test_lantern', name: 'x', model: 'lamp' }), null, '겹치는 id');
  assert.equal(registerDecor({ id: 'Bad Id!', name: 'x', model: 'lamp' }), null);
  assert.equal(registerDecor({ id: 'no_model', name: 'x' }), null);
  // 등록한 소품은 놓고 불러오기까지 됨
  const d = new DecorSim();
  d.place('test_lantern', 0, 0, 0, { money: 999, level: 5 });
  const back = new DecorSim(); back.load(d.toJSON());
  assert.equal(back.placed[0].id, 'test_lantern');
  // 되돌림 (다른 시험에 새지 않게)
  for (const list of [DECOR, DECOR_ALL]) list.splice(list.indexOf(def), 1);
  delete DECOR_BY_ID.test_lantern;
  DECOR_CATS.splice(DECOR_CATS.findIndex(([c]) => c === 'festival_t'), 1);
});
