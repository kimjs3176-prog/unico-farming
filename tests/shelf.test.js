import test from 'node:test';
import assert from 'node:assert/strict';
import { todaySpecial, dayRng, SHELF_DECOR, SHELF_COSTUME } from '../src/game/sim/shelf.js';
import { DECOR_BY_ID } from '../src/game/sim/decor.js';
import { COSTUME } from '../src/game/sim/costume.js';

test('오늘의 특별 상품: 같은 날은 늘 같은 진열, 한정 소품 2개 + 색 바꾼 옷 1벌', () => {
  // 실행
  const a = todaySpecial(7), b = todaySpecial(7);
  // 확인
  assert.deepEqual(a, b);
  assert.equal(a.filter((x) => x.kind === 'decor').length, SHELF_DECOR);
  assert.equal(a.filter((x) => x.kind === 'costume').length, SHELF_COSTUME);
  for (const x of a) {
    if (x.kind === 'decor') assert.equal(DECOR_BY_ID[x.id]?.limited, true, x.id);
    else assert.equal(COSTUME[x.id]?.variant, true, x.id);
    assert.ok(x.price > 0, x.id);
  }
  assert.equal(new Set(a.map((x) => x.id)).size, a.length, '같은 물건이 두 번 나오지 않음');
});

test('오늘의 특별 상품: 날이 바뀌면 진열이 바뀜 (열흘 중 여러 가지가 나옴)', () => {
  const seen = new Set();
  for (let d = 1; d <= 10; d++) for (const x of todaySpecial(d)) seen.add(x.id);
  assert.ok(seen.size >= 6, `열흘 동안 나온 물건 ${seen.size}가지`);
  assert.notDeepEqual(todaySpecial(1), todaySpecial(2));
});

test('날짜 난수는 0 이상 1 미만이고 같은 날이면 같은 수열', () => {
  const r1 = dayRng(3), r2 = dayRng(3);
  for (let i = 0; i < 50; i++) { const v = r1(); assert.equal(v, r2()); assert.ok(v >= 0 && v < 1, String(v)); }
});
