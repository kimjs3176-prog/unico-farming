// 메서드 나중에 받기(lazy.js): 받기 실패만 onFail, 받은 메서드 안의 오류는 그대로 올려 보냄
import test from 'node:test';
import assert from 'node:assert/strict';
import { lazyMethods } from '../src/game/lazy.js';

test('나중에 받은 메서드 안의 오류는 받기 실패 안내로 바뀌지 않고 그대로 올라감', async () => {
  // 준비
  class V {}
  const fails = [];
  lazyMethods(V.prototype, async () => ({ open() { throw new Error('창 코드 버그'); } }), ['open'], (e) => fails.push(e));
  // 실행·확인
  await assert.rejects(() => new V().open(), /창 코드 버그/);
  assert.equal(fails.length, 0, '받기 실패 안내는 부르지 않음');
});

test('받기가 실패하면 onFail 을 부르고, 다음 부름에서 다시 받음', async () => {
  class V {}
  let tries = 0;
  const fails = [];
  lazyMethods(V.prototype, async () => { if (++tries === 1) throw new Error('오프라인'); return { open() { return 'ok'; } }; }, ['open'], (e) => fails.push(e.message));
  assert.equal(await new V().open(), undefined);
  assert.deepEqual(fails, ['오프라인']);
  assert.equal(await new V().open(), 'ok', '두 번째는 다시 받아 열림');
});
