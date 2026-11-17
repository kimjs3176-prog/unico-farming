// 퀘스트 장 구성·따라갈 퀘스트 고르기 (src/game/sim/chapters.js)
import test from 'node:test';
import assert from 'node:assert/strict';
import { QUESTS, Quests } from '../src/game/sim/quests.js';
import { CHAPTERS, QMETA, pickTracked, currentChapter, coreIds, chapterProgress } from '../src/game/sim/chapters.js';

const BY = Object.fromEntries(QUESTS.map((q) => [q.id, q]));
/** 퀘스트를 다 하고 받기 */
const finish = (q, id) => { q.progress[id] = BY[id].goal; assert.ok(q.claim(id), id); };

test('모든 퀘스트가 장 하나에만 들어 있고, QMETA 와 QUESTS 가 같은 목록', () => {
  const ids = QUESTS.map((q) => q.id);
  assert.equal(new Set(ids).size, ids.length, 'id 중복 없음');
  for (const id of ids) assert.ok(QMETA[id], `${id} 가 QMETA 에`);
  assert.deepEqual(Object.keys(QMETA).sort(), [...ids].sort());
  const seen = CHAPTERS.flatMap((c) => c.ids);
  assert.equal(new Set(seen).size, seen.length, '두 장에 들어간 퀘스트 없음');
  assert.deepEqual([...seen].sort(), [...ids].sort());
  for (const c of CHAPTERS) for (const id of c.ids) assert.equal(QMETA[id].ch, c.n);
  assert.deepEqual(CHAPTERS[0].ids, ['till1', 'plant3', 'water3', 'harvest5', 'sell3']);
  assert.equal(QMETA.koat1.ch, 2);
  assert.equal(QMETA.ride5.ch, QMETA.tractor1.ch, '드라이브는 트랙터 옆');
  for (const id of ['friend2', 'book10', 'fest1', 'build5', 'rich', 'plow30', 'egg30']) assert.ok(QMETA[id].wait, id);
  for (const id of ['greet1', 'five3', 'friend1']) assert.ok(QMETA[id].peers, id);
  for (const c of CHAPTERS) assert.ok(coreIds(c).length > 0 && c.reward.money > 0, `${c.n}장`);
});

test('새 저장은 첫 밭 갈기부터, 1장을 끝내면 바로 KOAT 체험관', () => {
  const q = new Quests();
  assert.equal(pickTracked(q).id, 'till1');
  assert.equal(currentChapter(q).n, 1);
  let claims = 0;
  for (const id of CHAPTERS[0].ids) { assert.equal(pickTracked(q).id, id, '1장은 순서대로'); finish(q, id); }
  // 1장을 받은 뒤 2번 안에 koat1
  let x = pickTracked(q);
  while (x.id !== 'koat1' && claims < 2) { finish(q, x.id); claims++; x = pickTracked(q); }
  assert.equal(x.id, 'koat1');
  assert.equal(currentChapter(q).n, 2);
  assert.deepEqual(chapterProgress(q, CHAPTERS[0]), { done: 5, total: 5 });
});

test('기다리기 퀘스트·친구 없는 친구 퀘스트는 고르지 않음, 친구가 있으면 끝에 친구 퀘스트', () => {
  const q = new Quests();
  const picked = [];
  for (let k = 0; k < 200; k++) {
    const x = pickTracked(q, { peersOnline: false });
    if (!x) break;
    picked.push(x.id);
    finish(q, x.id);
  }
  for (const id of picked) { assert.ok(!QMETA[id].wait, `${id} 는 기다리기`); assert.ok(!QMETA[id].peers, `${id} 는 친구`); }
  assert.equal(currentChapter(q), null, '모든 장 끝');
  assert.equal(pickTracked(q, { peersOnline: false }), null);
  assert.ok(QMETA[pickTracked(q, { peersOnline: true }).id].peers);
  // 장 순서대로 지나감
  const chs = picked.map((id) => QMETA[id].ch);
  assert.deepEqual(chs, [...chs].sort((a, b) => a - b));
});

test('다 했는데 안 받은 퀘스트(🎁)가 먼저, 고정(📌)은 그보다 먼저', () => {
  const q = new Quests();
  q.progress.fish1 = 1; // 3장 퀘스트를 미리 함
  assert.equal(pickTracked(q).id, 'fish1');
  assert.equal(pickTracked(q, { pinned: 'koat6' }).id, 'koat6');
  q.claim('fish1');
  assert.equal(pickTracked(q).id, 'till1');
  // 받은 퀘스트를 고정해 둔 것은 무시
  q.progress.koat6 = 6; q.claim('koat6');
  assert.equal(pickTracked(q, { pinned: 'koat6' }).id, 'till1');
  assert.equal(pickTracked(q, { pinned: 'nope' }).id, 'till1');
});

test('예전 저장(받은 것이 많음): 지금 장과 따라갈 퀘스트가 올바름, sell3 은 이미 판 만큼 채움', () => {
  const q = new Quests();
  // 1장의 sell3 이 없던 시절: 나머지는 거의 다 받음, petfeed3 만 남음
  const claimed = {}, progress = { sell10: 12 };
  for (const x of QUESTS) if (!['sell3', 'petfeed3', 'cos4', 'five3'].includes(x.id)) { claimed[x.id] = true; progress[x.id] = x.goal; }
  q.load({ claimed, progress, xp: 3000 });
  assert.equal(q.progress.sell3, 3, '이미 3개 넘게 판 저장');
  assert.equal(pickTracked(q).id, 'sell3', '🎁 먼저');
  q.claim('sell3');
  assert.equal(currentChapter(q).n, 2);
  assert.equal(pickTracked(q).id, 'petfeed3');
  q.progress.petfeed3 = 3; q.claim('petfeed3');
  assert.equal(currentChapter(q), null);
  assert.equal(pickTracked(q), null, 'cos4 는 기다리기, five3 는 친구 없음');
  // 처음 저장(load 없이 빈 값)도 괜찮음
  const fresh = new Quests(); fresh.load({});
  assert.equal(fresh.progress.sell3, undefined);
  assert.equal(pickTracked(fresh).id, 'till1');
});
