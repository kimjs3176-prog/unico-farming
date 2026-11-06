import test from 'node:test';
import assert from 'node:assert/strict';
import { Meter, addToLedger, limits, dayOf, nextReset, IDLE_SLEEP_MS } from '../deploy/cloudflare/budget.js';

test('무료 한도: 기본은 공식 한도의 85%, 환경변수로 줄일 수 있음', () => {
  assert.deepEqual(limits(), { requests: 85000, awakeSec: 86328 });
  assert.deepEqual(limits({ BUDGET_REQUESTS: '50', BUDGET_AWAKE_SEC: '30' }), { requests: 50, awakeSec: 30 });
});

test('계량기: 받은 메시지 20개 = 요청 1건, 조용한 간격은 10초까지만 깨어 있음', () => {
  const m = new Meter(0);
  m.tick(0, 'fetch');
  for (let i = 1; i <= 40; i++) m.tick(i * 200, 'msg'); // 8초 동안 0.2초마다
  m.tick(8000 + 60000, 'msg'); // 1분 쉬었다가 (그 사이 잠듦 → 10초만 더함)
  assert.equal(m.due(30000), false);
  assert.ok(m.due(70000));
  const r = m.take(70000);
  assert.equal(r.requests, 1 + 41 / 20);
  assert.equal(r.awakeSec, (8000 + IDLE_SLEEP_MS) / 1000);
  assert.equal(m.due(140000), false, '쓴 게 없으면 보고 안 함');
});

test('장부: 하루 합계, 넘으면 over, UTC 0시에 새로', () => {
  const lim = { requests: 100, awakeSec: 1000 };
  const t0 = Date.UTC(2026, 10, 6, 10);
  let b = addToLedger(null, { requests: 50, awakeSec: 10 }, t0, lim);
  assert.equal(b.requests, 51); assert.equal(b.over, false);
  b = addToLedger(b, { requests: 49, awakeSec: 10 }, t0 + 1000, lim);
  assert.equal(b.over, true);
  b = addToLedger(b, { requests: 1, awakeSec: 0 }, Date.UTC(2026, 10, 7, 0, 0, 1), lim);
  assert.equal(b.requests, 2); assert.equal(b.over, false);
  b = addToLedger(b, { awakeSec: 2000 }, Date.UTC(2026, 10, 7, 1), lim);
  assert.equal(b.over, true, '실행 시간도 한도');
  assert.equal(nextReset(t0), Date.UTC(2026, 10, 7));
  assert.equal(dayOf(Date.UTC(2026, 10, 7)) - dayOf(t0), 1);
});
