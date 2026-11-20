// 수치 표 만들기(balance.mjs): 늘 같은 결과 + 출하 탭 포함 (문서와 맞는지는 tests/gen/docs_balance.check.mjs — 배포를 막지 않음)
import test from 'node:test';
import assert from 'node:assert/strict';
import { balanceMarkdown, balanceRows, dominanceByTier, docBlock } from '../scripts/balance.mjs';

test('balanceMarkdown: 두 번 불러도 같고 출하 탭이 들어 있음', () => {
  const a = balanceMarkdown(), b = balanceMarkdown();
  assert.equal(a, b);
  assert.match(a, /출하/);
  for (const k of ['crops', 'rice', 'ranch', 'book']) assert.ok(docBlock(a, k) !== null, `${k} 칸`);
});

test('다시 열리는 작물: 수확 1 + r 번, 한 주기 = 성장 × (1 + 0.5r)', () => {
  const rows = balanceRows();
  const st = rows.find((r) => r.id === 'strawberry'), carrot = rows.find((r) => r.id === 'carrot');
  assert.equal(st.cycle_s, 150 * 2.5);
  assert.equal(st.profit, 65 * 3 * 4 - 40);
  assert.equal(carrot.cycle_s, 60);
  assert.ok(rows.some((r) => r.id === 'honey' && r.feed === 0), '꿀은 사료 없음');
});

test('해금 단계별 지배 전략 검사는 단계마다 하나씩', () => {
  const d = dominanceByTier();
  assert.deepEqual(d.map((x) => x.lv), [...new Set(d.map((x) => x.lv))]);
  assert.ok(d.every((x) => x.ratio >= 1));
});
