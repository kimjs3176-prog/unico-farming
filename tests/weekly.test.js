// 이번 계절 도전: 기간마다 같은 3개, 해금된 것만, 누적 이벤트 없음, 기간이 바뀌면 새로 + 안 받은 보상 자동, 한 번만 받기
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SeasonChallenges, pickChallenges, periodKey, daysLeft, TEMPLATES, COUNTED, CATS, STAMP_EVERY } from '../src/game/sim/weekly.js';
import { QUESTS } from '../src/game/sim/quests.js';

const none = { level: 1, has: () => false };
const all = { level: 5, has: () => true };

test('같은 기간이면 누구나 같은 3개, 분류마다 하나씩, 모두 다름', () => {
  const a = pickChallenges('1-0', all, { crops: ['strawberry'] });
  const b = pickChallenges('1-0', all, { crops: ['strawberry'] });
  assert.deepEqual(a, b);
  assert.equal(a.length, 3);
  assert.equal(new Set(a.map((c) => c.tid)).size, 3);
  const cats = a.map((c) => TEMPLATES.find((t) => t.id === c.tid).cat);
  assert.deepEqual(cats, CATS);
  // 기간이 다르면 (대개) 다른 묶음
  const keys = ['1-0', '1-1', '1-2', '1-3', '2-0'].map((k) => pickChallenges(k, all, { crops: [] }).map((c) => c.tid).join());
  assert.ok(new Set(keys).size >= 3, keys.join(' | '));
});

test('해금 안 된 시스템은 뽑지 않음 (처음 농부는 기본 도전만)', () => {
  for (const k of ['1-0', '1-1', '1-2', '1-3', '2-0', '2-1', '3-2']) {
    for (const c of pickChallenges(k, none, { crops: [] })) {
      const t = TEMPLATES.find((x) => x.id === c.tid);
      assert.equal(t.gate(none), true, `${k} ${c.tid}`);
    }
  }
});

test('누적·최댓값 이벤트는 쓰지 않음 (퀘스트의 absolute 이벤트 없음)', () => {
  const absolute = new Set(QUESTS.filter((q) => q.absolute).map((q) => q.event));
  for (const t of TEMPLATES) {
    assert.ok(COUNTED.includes(t.event), t.id);
    assert.ok(!absolute.has(t.event), `${t.id}: ${t.event}`);
  }
  const W = new SeasonChallenges();
  W.sync(1, all);
  assert.deepEqual(W.report('money', 5000), []);
  assert.deepEqual(W.report('book', 30), []);
});

test('목표는 레벨에 따라 커짐, 진행은 목표에서 멈춤, 밤·작물 조건', () => {
  const lo = pickChallenges('1-0', { ...all, level: 1 }, { crops: [] }), hi = pickChallenges('1-0', { ...all, level: 9 }, { crops: [] });
  lo.forEach((c, i) => assert.ok(hi[i].goal >= c.goal, c.tid));
  const W = new SeasonChallenges();
  W.list = [{ tid: 'fish_night', key: null, goal: 2, n: 0, claimed: false }, { tid: 'harvest_key', key: 'corn', goal: 3, n: 0, claimed: false }, { tid: 'feed', key: null, goal: 2, n: 0, claimed: false }];
  W.key = periodKey(1);
  assert.deepEqual(W.report('fish', 1, { night: false }), []);
  assert.deepEqual(W.report('fish', 5, { night: true }), [0]);
  assert.equal(W.list[0].n, 2);
  W.report('harvest', 5, { key: 'carrot' });
  assert.equal(W.list[1].n, 0, '다른 작물');
  W.report('harvest', 2, { key: 'corn' });
  assert.equal(W.list[1].n, 2);
});

test('기간: 계절(7일)마다, D-n 은 축제 날(7일째)에 0', () => {
  assert.equal(periodKey(1), periodKey(7));
  assert.notEqual(periodKey(7), periodKey(8));
  assert.equal(daysLeft(1), 6);
  assert.equal(daysLeft(7), 0);
});

test('기간이 바뀌면 새 도전 + 다 하고 안 받은 보상은 자동으로', () => {
  const W = new SeasonChallenges();
  assert.equal(W.sync(1, none), null, '처음');
  const key = W.key;
  const c0 = W.list[0];
  const ev = TEMPLATES.find((t) => t.id === c0.tid);
  W.report(ev.event, c0.goal, { key: c0.key, night: true });
  assert.equal(W.claimable, 1);
  assert.equal(W.sync(3, none), null, '같은 기간은 그대로');
  const left = W.sync(8, none);
  assert.notEqual(W.key, key);
  assert.equal(left.rewards.length, 1);
  assert.ok(left.rewards[0].money > 0 && left.rewards[0].xp > 0 && left.rewards[0].item);
  assert.ok(W.list.every((c) => c.n === 0 && !c.claimed), '새 기간은 처음부터');
});

test('보상은 한 번만, 세 개 모두 받으면 꾸미기 + 도전 도장 (4개마다 귀한 선물)', () => {
  const W = new SeasonChallenges();
  for (let k = 0; k < STAMP_EVERY; k++) {
    W.sync(1 + k * 7, all);
    for (const c of W.list) c.n = c.goal;
    const r0 = W.claim(0);
    assert.ok(r0);
    assert.equal(W.claim(0), null, '두 번 받지 않음');
    W.claim(1);
    const r2 = W.claim(2);
    assert.ok(r2.bonus?.decor, '세 개 모두: 꾸미기');
    assert.equal(r2.bonus.stamp, k + 1);
    if (k + 1 === STAMP_EVERY) assert.ok(r2.bonus.rare, '도장 4개');
    else assert.equal(r2.bonus.rare, undefined);
  }
  assert.equal(W.stamps, STAMP_EVERY);
});

test('저장·불러오기 왕복, 깨진 기록은 새로', () => {
  const W = new SeasonChallenges();
  W.sync(1, all);
  W.list[1].n = 2;
  const W2 = new SeasonChallenges();
  W2.load(JSON.parse(JSON.stringify(W.toJSON())));
  assert.deepEqual(W2.toJSON(), W.toJSON());
  const W3 = new SeasonChallenges();
  W3.load({ key: '1-0', list: [{ tid: 'nope' }] });
  assert.equal(W3.key, null);
  assert.deepEqual(W3.list, []);
});

test('도전 목록 보기에는 받을 보상이 미리 들어 있고, 받으면 같은 보상', () => {
  // 준비
  const W = new SeasonChallenges();
  W.sync(1, all);
  // 실행
  const v = W.view();
  // 확인
  for (const c of v) assert.ok(c.reward && c.reward.money > 0 && c.reward.xp > 0, `${c.id} 보상 ${JSON.stringify(c.reward)}`);
  W.list[0].n = W.list[0].goal;
  assert.equal(W.claimable, 1);
  const r = W.claim(0);
  assert.equal(r.money, v[0].reward.money);
  assert.equal(r.xp, v[0].reward.xp);
  assert.equal(W.claimable, 0);
});

test('퀘스트 창: 모든 장을 마친 이야기 탭은 위 마을 줄을 숨겨 마을 할 일 목록이 한 번만', async () => {
  const { townStrip, townHtml, rewardChip } = await import('../src/ui/panels/quests.js');
  // 모든 장을 마침: 이야기 탭('town' 으로 열어도) → 줄 없음, 카드만
  assert.deepEqual(townStrip('story', false, true), { strip: false, open: false });
  // 계절 도전 탭·아직 장이 남은 이야기 탭 → 줄 보임
  assert.deepEqual(townStrip('season', false, false), { strip: true, open: false });
  assert.deepEqual(townStrip('story', true, true), { strip: true, open: true });
  const R = { stars: 1, frac: 0.2, next: [{ icon: '🪑', label: '꾸미기 소품 12개 더 놓기', short: '꾸미기', have: 0, need: 12 }] };
  const m = townStrip('story', false, true);
  const html = (m.strip ? townHtml(R, { full: m.open }) : '') + townHtml(R, { full: true });
  assert.equal(html.split('tw-list').length - 1, 1, 'tw-list 하나');
  assert.equal(rewardChip({ money: 120, xp: 48, item: { icon: '🥕' } }), '🪙120 · ✨48 XP · 🥕');
  assert.equal(rewardChip({ money: 120, xp: 48 }), '🪙120 · ✨48 XP');
});

test('목표 칩 제목: 앞 별 이모지는 (★n) 으로, 끝 하기는 빼고', async () => {
  const { chipTitle } = await import('../src/ui/objective.js');
  assert.equal(chipTitle('★★★ 특상품 5번 수확하기'), '특상품(★3) 5번 수확');
  assert.equal(chipTitle('⭐ 다음 별: 꾸미기'), '다음 별: 꾸미기');
  assert.equal(chipTitle('물고기 3마리 낚기'), '물고기 3마리 낚기');
  assert.equal(chipTitle('⭐⭐⭐ 특상품 5번 수확하기'), '특상품(★3) 5번 수확');
  assert.equal(chipTitle(TEMPLATES.find((t) => t.id === 'star3').text(5)), '특상품(★3) 5번 수확', '도전 글 자체도 별 이모지 줄 없이');
});

test('안 읽은 편지 수: 목록과 같은 수 (HUD 는 배열 없이 셈)', async () => {
  const { unreadCount, unreadLetters } = await import('../src/ui/letters.js');
  const flags = { letters: { got: ['star1', 'star2', 'harvest1', 'nope'], read: ['star1'] } };
  assert.equal(unreadCount(flags), unreadLetters(flags).length);
  assert.ok(unreadCount(flags) >= 1);
  assert.equal(unreadCount({}), 0);
});
