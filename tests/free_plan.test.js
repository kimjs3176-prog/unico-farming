import test from 'node:test';
import assert from 'node:assert/strict';
import { assertFreeSubscriptions, verifyFreePlan } from '../scripts/verify-free-plan.mjs';

test('배포 보호: 활성 유료·알 수 없는 구독·체험은 거부, 빈 목록·확인된 무료만 허용', () => {
  assert.doesNotThrow(() => assertFreeSubscriptions([]));
  assert.doesNotThrow(() => assertFreeSubscriptions([{ state: 'Provisioned', price: 0, rate_plan: { id: 'workers_free' } }]));
  for (const row of [
    { state: 'Paid', price: 5, rate_plan: { id: 'workers_paid' } },
    { state: 'Trial', price: 0 }, { state: 'Provisioned', price: 0, rate_plan: { id: 'workers_paid' } }, {},
  ]) assert.throws(() => assertFreeSubscriptions([row]));
});

test('배포 보호: 권한 없음·통신 실패·불완전한 응답이면 배포 허용 안 함', async () => {
  const env = { CLOUDFLARE_ACCOUNT_ID: 'a'.repeat(32), CLOUDFLARE_API_TOKEN: 'test' };
  await assert.rejects(verifyFreePlan({}, () => {}));
  await assert.rejects(verifyFreePlan(env, async () => new Response('', { status: 403 })));
  await assert.rejects(verifyFreePlan(env, async () => { throw new Error('offline'); }));
  await assert.rejects(verifyFreePlan(env, async () => Response.json({ success: true, result: [] })));
  let calls = 0;
  await verifyFreePlan(env, async () => { calls++; return Response.json({ success: true, result: [], result_info: { count: 0, total_count: 0 } }); });
  assert.equal(calls, 1);
});
