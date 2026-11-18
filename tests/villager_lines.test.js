import test from 'node:test';
import assert from 'node:assert/strict';
import { LINES, REACT, WAKE, pickLine, lineFits, condCount, remember } from '../src/game/sim/villager_lines.js';
import { VILLAGERS, HEART_REWARDS, VILLAGER_HEART_REWARDS, heartReward, Villagers } from '../src/game/sim/villagers.js';
import { QUESTS } from '../src/game/sim/quests.js';

const IDS = Object.keys(VILLAGERS);
const seeded = (s) => () => ((s = (s * 16807) % 2147483647) / 2147483647);
const base = { season: 'spring', weather: null, night: false, hearts: 0, festival: false, done: {}, species: true };

test('대사: 주민마다 12~16줄, 계절 4개·비 오는 날 줄이 모두 있음', () => {
  for (const id of IDS) {
    const L = LINES[id];
    assert.ok(L.length >= 12 && L.length <= 16, `${id} ${L.length}줄`);
    for (const season of ['spring', 'summer', 'autumn', 'winter']) {
      assert.ok(L.some((l) => l.season === season), `${id} ${season}`);
      // 그 계절에 실제로 고를 수 있음 (조건 우선이면 계절 줄이 나옴)
      const ln = pickLine(id, { ...base, season }, [], seeded(3), { prefer: true });
      assert.ok(ln && lineFits(ln, { ...base, season }));
    }
    assert.ok(L.some((l) => l.weather === 'rain'), `${id} 비`);
    assert.ok(L.some((l) => l.night), `${id} 밤`);
    assert.ok(WAKE[id] && REACT[id]?.liked && REACT[id]?.neutral && REACT[id]?.heartUp && REACT[id]?.thanks, `${id} 반응`);
    for (const l of L) if (l.after) assert.ok(QUESTS.some((q) => q.id === l.after), `${id} 없는 퀘스트 ${l.after}`);
  }
});

test('대사 고르기: 최근 4줄은 되풀이하지 않음, 조건이 맞지 않는 줄·동물 줄(유니콘 대체)은 안 나옴', () => {
  const rng = seeded(11);
  for (const id of IDS) {
    const recent = [];
    for (let i = 0; i < 40; i++) {
      const ln = pickLine(id, base, recent, rng);
      assert.ok(ln, `${id} 고를 줄`);
      assert.ok(!recent.includes(ln.t), `${id} 되풀이: ${ln.t}`);
      remember(recent, ln.t);
      assert.ok(recent.length <= 4);
    }
    for (let i = 0; i < 60; i++) {
      const ln = pickLine(id, { ...base, species: false }, [], rng);
      assert.ok(!ln.species, `${id} 동물 줄이 유니콘에게: ${ln.t}`);
      assert.ok(!ln.night && !ln.weather && !ln.festival && !ln.after && !(ln.minHearts > 0) && (!ln.season || ln.season === 'spring'));
    }
  }
});

test('대사 고르기: 비·밤·하트·축제·퀘스트 조건, 조건이 많을수록 자주, 다 쓰면 null', () => {
  const rng = seeded(5);
  const ctx = { ...base, weather: 'rain', night: true, hearts: 5, festival: true, done: { harvest5: true } };
  let rain = 0;
  for (let i = 0; i < 400; i++) if (pickLine('guide', ctx, [], rng).weather === 'rain') rain++;
  const fits = LINES.guide.filter((l) => lineFits(l, ctx));
  const share = 3 / fits.reduce((n, l) => n + 1 + 2 * condCount(l), 0);
  assert.ok(Math.abs(rain / 400 - share) < 0.06, `비 줄 비율 ${rain / 400} ≈ ${share.toFixed(2)}`);
  assert.ok(fits.some((l) => l.after === 'harvest5') && fits.some((l) => l.minHearts === 4));
  assert.ok(!LINES.guide.filter((l) => lineFits(l, base)).some((l) => l.after || l.minHearts), '조건이 없으면 안 나옴');
  // 한 대화에서 다 쓰면 null (같은 말 되풀이 대신 '오늘은 할 얘기 다 했어')
  const said = [];
  for (;;) { const ln = pickLine('kid', base, said, rng); if (!ln) break; said.push(ln.t); assert.ok(said.length < 30); }
  assert.equal(said.length, LINES.kid.filter((l) => lineFits(l, base)).length);
});

test('말투: 주민은 플레이어에게 반말 (해요체 끝맺음 없음), 키보드 안내 (Q) 없음, 할머니는 해라체', () => {
  const all = (id) => [...LINES[id].map((l) => l.t), ...Object.values(REACT[id]), WAKE[id], ...VILLAGER_HEART_REWARDS[id].map((r) => r.text)];
  for (const id of IDS) for (const t of all(id)) {
    assert.ok(!/(요|세요|니다)[.!?~… 💕🙏🐾🎣]*$/.test(t.trim()) || /삽니다~|팔아요!/.test(t), `${id} 해요체: ${t}`);
    assert.ok(!/\([A-Z]\)/.test(t), `${id} 키 안내: ${t}`);
  }
  for (const t of all('granny')) assert.ok(/(단다|거라|니|구나|란다|지|마|게|다)[.!?~… 💕🙏]*$/.test(t.trim()), `할머니 해라체: ${t}`);
});

test('하트 보상: 주민마다 다르고, 칸마다 돈·씨앗·아이템 중 하나 (도트 판도 무언가 받음), ♥5 는 주민 칭호', () => {
  for (const id of IDS) {
    const R = VILLAGER_HEART_REWARDS[id];
    assert.equal(R.length, 5);
    R.forEach((r, i) => {
      assert.equal(r.hearts, i + 1);
      assert.ok(r.money > 0 || r.seeds || r.item, `${id} ♥${i + 1} 지급물`);
      assert.equal(heartReward(id, i + 1), r);
    });
    assert.equal(typeof R[4].title, 'string');
  }
  assert.equal(new Set(IDS.map((id) => VILLAGER_HEART_REWARDS[id][4].title)).size, IDS.length, '칭호가 모두 다름');
  assert.equal(heartReward('nobody', 2), HEART_REWARDS[1], '없으면 공통 표');
  // 하트가 오르면 그 주민의 보상이 나옴 (문턱은 그대로 20씩)
  const v = new Villagers(seeded(2));
  const r = v.addFriend('fisher', 100);
  assert.deepEqual(r.rewards.map((x) => x.hearts), [1, 2, 3, 4, 5]);
  assert.equal(r.rewards[0].item.bait, 3);
  assert.equal(r.rewards[4].title, '호수의 낚시 친구');
});
