// 모델 받기 (src/game/fetch_gz.js): 망 끊김·서버 오류·멈춤은 다시 받고, 404 는 바로 실패, 주소는 매번 같게
import test from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { fetchModel, onFetchRetry, FETCH_RETRY } from '../src/game/fetch_gz.js';

// 시험에서는 짧게 (쉬는 시간·멈춤 한도)
Object.assign(FETCH_RETRY, { waits: [5, 10], stallMs: 40, headMs: 80 });

const BYTES = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
const ok = (b = BYTES) => new Response(b);
const never = () => new Response(new ReadableStream({ pull() { return new Promise(() => {}); } })); // 머리는 왔는데 본문이 안 옴

/** fetch 를 가짜로: plan 의 차례대로 (함수면 불러서) 돌려줌. 부른 주소·옵션을 남김 */
function fake(plan) {
  const calls = [];
  globalThis.fetch = (url, opt) => {
    calls.push({ url, opt });
    const step = plan[Math.min(calls.length - 1, plan.length - 1)];
    return typeof step === 'function' ? step(url, opt) : step;
  };
  return calls;
}
const same = (buf, want = BYTES) => assert.deepEqual([...new Uint8Array(buf)], [...want]);

test('망 끊김(TypeError) 두 번 → 세 번째에 받음, 알림은 2/3·3/3, 주소는 매번 같음', async () => {
  const seen = [];
  onFetchRetry((r) => seen.push(`${r.attempt}/${r.of}`));
  const calls = fake([() => Promise.reject(new TypeError('Failed to fetch')), () => Promise.reject(new TypeError('Failed to fetch')), () => ok()]);
  same(await fetchModel('/models/tree.glb'));
  assert.equal(calls.length, 3);
  assert.deepEqual(seen, ['2/3', '3/3']);
  assert.ok(calls.every((c) => c.url === '/models/tree.glb'), '같은 주소');
  for (const c of calls) assert.deepEqual(Object.keys(c.opt || {}), ['signal'], 'mode·credentials 는 기본값 그대로 (미리 받기 재사용)');
  onFetchRetry(null);
});

test('404 는 다시 받지 않고 바로 실패 (망 오류 표시 없음)', async () => {
  let notified = 0;
  onFetchRetry(() => notified++);
  const calls = fake([() => new Response('없음', { status: 404 })]);
  await assert.rejects(fetchModel('/models/none.glb'), (e) => /404/.test(e.message) && e.code !== 'E-NET');
  assert.equal(calls.length, 1);
  assert.equal(notified, 0);
  onFetchRetry(null);
});

test('서버 오류(503) 는 다시 받음, 세 번 다 실패하면 E-NET 오류', async () => {
  let calls = fake([() => new Response('', { status: 503 }), () => ok()]);
  same(await fetchModel('/models/rock.glb'));
  assert.equal(calls.length, 2);
  calls = fake([() => Promise.reject(new TypeError('offline'))]);
  await assert.rejects(fetchModel('/models/rock.glb'), (e) => e.code === 'E-NET');
  assert.equal(calls.length, 3, '최대 3번');
});

test('본문이 멈추면(바이트가 stallMs 동안 안 옴) 끊고 다시 받음 — 전체 시간 제한은 없음', async () => {
  const why = [];
  onFetchRetry((r) => why.push(r.why));
  const calls = fake([() => never(), () => ok()]);
  same(await fetchModel('/models/bush.glb'));
  assert.equal(calls.length, 2);
  assert.match(why[0], /멈춤/);
  assert.ok(calls[0].opt.signal.aborted, '멈춘 요청은 AbortController 로 끊음');
  // 느려도 바이트가 계속 오면 끊지 않음: 30ms 마다 한 조각씩 (멈춤 한도 40ms, 전체 150ms)
  let i = 0;
  const slow = new ReadableStream({ async pull(c) { await new Promise((r) => setTimeout(r, 30)); if (i < 5) c.enqueue(BYTES.subarray(i, i + 1)); else c.close(); i++; } });
  const c2 = fake([() => new Response(slow)]);
  same(await fetchModel('/models/bush.glb'), BYTES.subarray(0, 5));
  assert.equal(c2.length, 1, '느린 것은 기다림');
  onFetchRetry(null);
});

test('응답 머리가 headMs 동안 안 오면 끊고 다시', async () => {
  const calls = fake([() => new Promise(() => {}), () => ok()]);
  same(await fetchModel('/models/sign.glb'));
  assert.equal(calls.length, 2);
});

test('.gz: 받아서 풂 · .gz 가 404 면 원본 (쉬지 않음) · 망 오류면 .gz 를 다시 (마지막에만 원본)', async () => {
  const gz = gzipSync(Buffer.from(BYTES));
  let calls = fake([() => new Response(gz)]);
  same(await fetchModel('/models/q_farm.glb', true));
  assert.deepEqual(calls.map((c) => c.url), ['/models/q_farm.glb.gz']);

  calls = fake([(u) => (u.endsWith('.gz') ? new Response('', { status: 404 }) : ok())]);
  same(await fetchModel('/models/q_farm.glb', true));
  assert.deepEqual(calls.map((c) => c.url), ['/models/q_farm.glb.gz', '/models/q_farm.glb'], '개발 서버처럼 .gz 가 없으면 원본');

  calls = fake([() => Promise.reject(new TypeError('net')), () => Promise.reject(new TypeError('net')), () => Promise.reject(new TypeError('net')), () => ok()]);
  same(await fetchModel('/models/q_farm.glb', true));
  assert.deepEqual(calls.map((c) => c.url), ['/models/q_farm.glb.gz', '/models/q_farm.glb.gz', '/models/q_farm.glb.gz', '/models/q_farm.glb'], '끊긴 망에서 두 배 큰 원본을 먼저 받지 않음');

  calls = fake([(u) => (u.endsWith('.gz') ? new Response(new Uint8Array([0x1f, 0x8b, 9, 9, 9])) : ok())]);
  same(await fetchModel('/models/q_farm.glb', true));
  assert.equal(calls.at(-1).url, '/models/q_farm.glb', '못 푸는 .gz 는 원본으로');
});
