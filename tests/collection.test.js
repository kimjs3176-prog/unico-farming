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

test('집 트로피 선반: 빈 받침은 그리기 호출을 늘리지 않고, 넷을 다 채워도 넓힌 집에선 많아야 하나', async () => {
  const THREE = await import('three');
  const { buildRoom, TROPHY_CATS } = await import('../src/game/view/home_interior.js');
  const mats = { glass: new THREE.MeshStandardMaterial(), lampMat: new THREE.MeshStandardMaterial() };
  const meshes = (lv, trophies) => { let n = 0; buildRoom(lv, mats, { trophies }).group.traverse((o) => { if (o.isMesh) n++; }); return n; };
  assert.deepEqual(TROPHY_CATS, BOOK_CATS_3D);
  for (const lv of [1, 2]) assert.ok(meshes(lv, TROPHY_CATS) - meshes(lv, []) <= 1, `집 ${lv}단계: ${meshes(lv, [])} → ${meshes(lv, TROPHY_CATS)}`);
  const label = buildRoom(1, mats, { trophies: ['fish'] }).spots.find((s) => s.key === 'books').label;
  assert.match(label, /트로피 1\/4/);
});
