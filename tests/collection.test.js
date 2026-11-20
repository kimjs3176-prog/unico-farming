// 도감: 출하 탭 · 이정표 선물 · 완성 보상 · 칭호 · 모습 문자열의 칭호 칸
import test from 'node:test';
import assert from 'node:assert/strict';
import { Collection, SHIP_IDS, BOOK_CATS, BOOK_CATS_3D, COMPLETE_REWARD, MILESTONE_EVERY, milestoneReward, listOf } from '../src/game/sim/collection.js';
import { CATEGORY_NAMES, ITEMS } from '../src/game/sim/items.js';
import { CROPS } from '../src/game/sim/crops.js';
import { DECOR_BY_ID } from '../src/game/sim/decor.js';
import { TITLES, checkTitles, titleIdOf, titleById } from '../src/game/sim/titles.js';
import { LEVEL_GIFTS } from '../src/game/sim/unlocks.js';
import { encodeLook, decodeLook } from '../src/game/sim/costume.js';
import { sanitizeLook } from '../server/rooms.js';

test('출하 목록은 작물 5 · 쌀 ★1~★5 · 가공품 · 황금 생산물 3 = 25종이고 도트 판 탭은 세 칸 그대로', () => {
  assert.equal(SHIP_IDS.length, 25);
  for (const k of Object.keys(CROPS)) assert.ok(SHIP_IDS.includes(k), k);
  for (const k of ['rice_1', 'rice_5', 'goods_kimchi', 'egg_gold', 'wool_gold']) assert.ok(SHIP_IDS.includes(k), k);
  assert.ok(!SHIP_IDS.some((k) => k.startsWith('fest_')), '축제 음식은 출하 도감 밖');
  assert.deepEqual(BOOK_CATS, ['fish', 'bug', 'fruit']);
  assert.deepEqual(BOOK_CATS_3D, ['fish', 'bug', 'fruit', 'ship']);
  assert.equal(CATEGORY_NAMES.ship, '출하');
  assert.ok(COMPLETE_REWARD.ship > 0);
});

test('ship(id, n) 은 출하 열쇠만 받고 개수를 쌓으며, 처음일 때만 isNew', () => {
  const c = new Collection();
  assert.deepEqual(c.ship('carrot', 3, { day: 2 }), { isNew: true });
  assert.deepEqual(c.ship('carrot', 2), { isNew: false });
  assert.equal(c.entries.carrot.count, 5);
  assert.equal(c.entries.carrot.day, 2);
  assert.equal(c.ship('fish_carp', 1).isNew, false, '물고기는 출하 도감이 아님');
  assert.equal(c.ship('nope', 1).isNew, false);
  assert.equal(c.ship('corn', 0).isNew, false, '0개는 기록 안 함');
  assert.deepEqual(c.progress('ship'), { got: 1, total: 25 });
  assert.equal(c.add('tomato').isNew, true, 'add 도 출하 열쇠를 받음');
});

test('도트 판 기본 claimCompletions 는 세 탭만 보고, 빈 탭(전체 0)은 완성으로 치지 않음', () => {
  const c = new Collection();
  for (const k of SHIP_IDS) c.ship(k, 1);
  assert.deepEqual(c.claimCompletions(), [], '도트 판: 출하를 다 채워도 새 보상 없음');
  assert.deepEqual(c.claimCompletions(BOOK_CATS_3D), [{ cat: 'ship', money: COMPLETE_REWARD.ship }]);
  assert.deepEqual(c.claimCompletions(BOOK_CATS_3D), [], '한 번만');
  assert.deepEqual(c.completed(), ['ship']);
});

test('이정표: 5종마다 한 번씩만, 홀수 번째는 소모품 · 짝수 번째는 있는 꾸미기 소품', () => {
  // 준비
  const c = new Collection();
  const fish = listOf('fish');
  for (const k of fish.slice(0, 11)) c.add(k);
  // 실행
  const first = c.claimMilestones();
  const again = c.claimMilestones();
  // 확인
  assert.deepEqual(first.map((m) => `${m.cat}@${m.at}`), ['fish@5', 'fish@10']);
  assert.deepEqual(first[0].item, { bait: 5 });
  assert.ok(DECOR_BY_ID[first[1].decor], `소품 ${first[1].decor}`);
  assert.deepEqual(again, []);
  assert.equal(c.rewarded['fish@10'], true);
  assert.deepEqual(c.nextMilestone('fish'), { at: 15, left: 4 });
  // 모든 탭의 모든 이정표 소품이 실제로 있음
  for (const cat of BOOK_CATS_3D) for (let at = MILESTONE_EVERY; at < listOf(cat).length; at += MILESTONE_EVERY) {
    const r = milestoneReward(cat, at);
    if (r.decor) assert.ok(DECOR_BY_ID[r.decor], `${cat}@${at} 소품 ${r.decor}`);
    else for (const id of Object.keys(r.item)) assert.ok(ITEMS[id], `${cat}@${at} 아이템 ${id}`);
  }
});

test('저장 왕복: 출하 기록과 받은 이정표가 그대로', () => {
  const c = new Collection();
  for (const k of SHIP_IDS.slice(0, 6)) c.ship(k, 2);
  c.claimMilestones();
  const d = new Collection();
  d.load(JSON.parse(JSON.stringify(c.toJSON())));
  assert.deepEqual(d.progress('ship'), { got: 6, total: 25 });
  assert.deepEqual(d.claimMilestones(), [], '다시 불러와도 또 주지 않음');
  assert.equal(d.natureCount(), 0, '출하는 자연 도감 수에 안 들어감');
});

test('칭호: 기록으로 열리고 이미 가진 것은 빼며, id 는 서버가 지우지 않는 글자만', () => {
  const got = checkTitles({ nature: 10, shipped: 1, done: ['fish'] }, ['꼬마 박물학자']);
  assert.deepEqual(got, ['새내기 농부', '물고기 박사']);
  assert.deepEqual(checkTitles({}), []);
  for (const t of TITLES) assert.match(t.id, /^[a-z0-9-]+$/, t.id);
  assert.equal(new Set(TITLES.map((t) => t.id)).size, TITLES.length, 'id 겹침 없음');
  assert.equal(titleIdOf('유니코 으뜸 농부'), 'top-farmer');
  assert.equal(titleById('top-farmer').name, LEVEL_GIFTS[10].title, '레벨 10 선물 칭호와 이름이 같음');
  assert.equal(titleIdOf('아무 글'), null);
});

test('모습 문자열 6번째 칸 칭호: 서버 정리를 거쳐도 그대로, 모르는 칭호는 버림', () => {
  const look = encodeLook({ costume: 'hanbok', hat: 'straw', title: 'fish-doctor' });
  assert.equal(look, 'hanbok.straw.-.0.1.fish-doctor');
  assert.equal(sanitizeLook(look), look);
  assert.ok(look.length <= 48);
  assert.equal(decodeLook(sanitizeLook(look)).title, 'fish-doctor');
  assert.equal(decodeLook('hanbok.-.-.0.1.<b>hi').title, undefined, '정해진 id 가 아니면 칭호 없음');
  assert.equal(encodeLook({ costume: 'hanbok', title: 'nope' }), 'hanbok.-.-.0.1', '모르는 칭호는 칸을 만들지 않음');
  // 가장 긴 칭호 id 를 붙여도 48자 안
  const longest = TITLES.reduce((a, t) => (t.id.length > a.length ? t.id : a), '');
  assert.ok(encodeLook({ costume: 'overalls', hat: 'helmet', scarf: 'green', goggles: true, title: longest }).length <= 48);
});

test('집 트로피 선반: 빈 받침도, 넷을 다 채워도 방 메시(그리기 호출) 수가 그대로', async () => {
  const THREE = await import('three');
  const { buildRoom, TROPHY_CATS } = await import('../src/game/view/home_interior.js');
  const mats = { glass: new THREE.MeshStandardMaterial(), lampMat: new THREE.MeshStandardMaterial() };
  const meshes = (lv, trophies) => { let n = 0; buildRoom(lv, mats, { trophies }).group.traverse((o) => { if (o.isMesh) n++; }); return n; };
  assert.deepEqual(TROPHY_CATS, BOOK_CATS_3D);
  for (const lv of [0, 1, 2]) for (const tr of [['fruit'], TROPHY_CATS]) assert.equal(meshes(lv, tr), meshes(lv, []), `집 ${lv}단계 트로피 ${tr.join(',')}`);
  const label = buildRoom(1, mats, { trophies: ['fish'] }).spots.find((s) => s.key === 'books').label;
  assert.match(label, /트로피 1\/4/);
});

/** 트로피 넷을 다 채워도 늘어나는 삼각형 (폰 낮은 화질에서도 방 하나에 붙는 몫) */
const TROPHY_TRI_BUDGET = 1000;
test(`트로피 넷을 다 채워도 방 삼각형은 ${TROPHY_TRI_BUDGET}개 넘게 늘지 않고, 선반은 책상 위 벽(달력과 옷장 사이)`, async () => {
  const THREE = await import('three');
  const { buildRoom, TROPHY_CATS } = await import('../src/game/view/home_interior.js');
  const mats = { glass: new THREE.MeshStandardMaterial(), lampMat: new THREE.MeshStandardMaterial() };
  const tris = (lv, trophies) => { let n = 0; buildRoom(lv, mats, { trophies }).group.traverse((o) => { if (o.isMesh) { const g = o.geometry; n += (g.index ? g.index.count : g.attributes.position.count) / 3; } }); return n; };
  for (const lv of [0, 1, 2]) {
    const d = tris(lv, TROPHY_CATS) - tris(lv, []);
    assert.ok(d <= TROPHY_TRI_BUDGET, `집 ${lv}단계: 트로피 넷 +${d}개`);
  }
  // 선반은 책상 위 벽: 달력과 옷장 사이 (모든 집 단계), PC 화면 위 끝(약 2.35m) 아래
  for (const lv of [0, 1, 2]) {
    const room = buildRoom(lv, mats, { trophies: [] });
    const at = room.furnAt.trophies, cal = room.spots.find((s) => s.key === 'calendar');
    assert.ok(at.z < -room.D / 2 + 0.3 && at.y > 1.2 && at.y < 2.3, `집 ${lv}단계 ${JSON.stringify(at)}`);
    assert.ok(at.x - 0.53 > cal.x + 0.3 && at.x + 0.53 < room.W / 2 - 1.4, `집 ${lv}단계: 달력·옷장과 겹치지 않음 x=${at.x}`);
  }
});

test('칭호 id 검사는 물려받은 이름(constructor·toString)을 칭호로 치지 않음', () => {
  for (const k of ['constructor', 'toString', 'hasOwnProperty', '__proto__']) {
    assert.equal(titleById(k), null, k);
    assert.equal(decodeLook(`-.-.-.0.1.${k}`).title, undefined, k);
    assert.equal(encodeLook({ title: k }), '-.-.-.0.1', k);
  }
});

test('과일 탭(4종)은 이정표 선물 없이 완성 보상만', () => {
  const c = new Collection();
  for (const k of listOf('fruit')) c.add(k);
  assert.deepEqual(c.claimMilestones(['fruit']), []);
  assert.equal(c.nextMilestone('fruit'), null);
});

// 도감 보상 흐름 (afterCollect): 가짜 게임에 GameProgress 를 붙여 봄
async function fakeGame({ panel = null, decor = true } = {}) {
  const { GameProgress } = await import('../src/game/game_progress.js');
  const log = { toasts: [], cards: [], items: {}, money: 0, refresh: 0 };
  const g = Object.assign(Object.create(GameProgress), {
    collection: new Collection(), flags: {},
    economy: { addItem: (id, n) => { log.items[id] = (log.items[id] || 0) + n; }, earn: (n) => { log.money += n; } },
    decor: decor ? { sim: { stored: {}, give(id, n) { this.stored[id] = (this.stored[id] || 0) + n; return true; } } } : {},
    ui: { panel, toast: (t) => log.toasts.push(t), bookRewardCard: (c) => log.cards.push(c), result: () => assert.fail('result 창은 쓰지 않음'), refreshBook: () => { log.refresh++; } },
    onEvent() {},
  });
  return { g, log };
}

test('도감 이정표·칭호를 한 번에 받으면 알림 여러 개가 아니라 보상 카드 하나', async () => {
  // 준비: 물고기 10종 → 이정표 5·10 + 칭호 '꼬마 박물학자'
  const { g, log } = await fakeGame();
  for (const k of listOf('fish').slice(0, 10)) g.collection.add(k);
  // 실행
  g.afterCollect();
  // 확인
  assert.equal(log.cards.length, 1);
  assert.equal(log.toasts.length, 0, log.toasts.join(' / '));
  const card = log.cards[0];
  assert.equal(card.rows.length, 2, '떡밥 + 꾸미기 소품');
  assert.deepEqual(card.titles.map((t) => t.name), ['꼬마 박물학자']);
  assert.equal(log.items.bait, milestoneReward('fish', 5).item.bait);
  assert.equal(g.decor.sim.stored[milestoneReward('fish', 10).decor], 1);
  assert.equal(log.refresh, 1, '열린 도감 창은 받은 뒤 다시 그림');
});

test('다른 창이 열려 있으면 알림 하나만 내고 카드는 창을 닫은 뒤로 미룸', async () => {
  const { g, log } = await fakeGame({ panel: {} });
  for (const k of listOf('fish').slice(0, 5)) g.collection.add(k);
  g.afterCollect();
  assert.equal(log.cards.length, 0);
  assert.equal(log.toasts.length, 1);
  assert.match(log.toasts[0], /창을 닫으면/);
  assert.equal(g._bookCard.rows.length, 1);
  clearInterval(g._bookCardT);
});

test('꾸미기 보관함이 없을 때 소품 이정표는 쓰지 않고 다음에 다시 받음', async () => {
  // 준비: 보관함 없는 게임에서 물고기 10종 (10종 선물은 소품)
  const { g, log } = await fakeGame({ decor: false });
  for (const k of listOf('fish').slice(0, 10)) g.collection.add(k);
  g.afterCollect();
  assert.equal(g.collection.rewarded['fish@10'], undefined, '소품 이정표는 남겨 둠');
  assert.equal(g.collection.rewarded['fish@5'], true);
  // 실행: 보관함이 생긴 뒤 다시
  g.decor = { sim: { stored: {}, give(id, n) { this.stored[id] = n; return true; } } };
  g.afterCollect();
  // 확인
  assert.equal(g.collection.rewarded['fish@10'], true);
  assert.equal(g.decor.sim.stored[milestoneReward('fish', 10).decor], 1);
  assert.equal(log.cards.length, 2);
});
