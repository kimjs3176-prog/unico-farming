// 터치 E 버튼: 무엇을 할지(모드·아이콘·동사) + 진동 설정
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { touchAction, touchSig, firstEmoji, touchLabel, verbInLabel, ACTION } from '../src/ui/touch_action.js';
import { Juice, canVibrate, hapticPrefs } from '../src/game/juice.js';

const go = (key, label = '') => ({ key, label, onInteract: () => {} });

test('대화: 넘기는 중이면 ▶ 다음, 고르는 중이면 흐리게', () => {
  assert.deepEqual(touchAction(null, { active: true, choosing: false }), { mode: 'next', icon: '▶', verb: '다음' });
  assert.equal(touchAction(go('till'), { active: true, choosing: true }).mode, 'idle');
});

test('할 것이 없거나 기다리기만 하는 안내는 idle', () => {
  assert.equal(touchAction(null, null).mode, 'idle');
  assert.equal(touchAction({ key: 'wait', label: '당근 성장 중 40%', onInteract: () => {} }, null).mode, 'idle');
  assert.equal(touchAction({ key: 'hive', label: '🐝 꿀 모으는 중' }, null).mode, 'idle');
  assert.equal(touchAction({ key: 'hive', label: '🐝 꿀 모으는 중' }, null).icon, '🐝', '흐린 버튼에도 무엇인지 보임');
  // 호미질 중 누름은 다음 칸으로 이어지므로 흐리지 않음 (onInteract 가 없어도)
  assert.deepEqual(touchAction({ key: 'hoeing', label: '⛏️ 호미질 중…' }, null), { mode: 'go', icon: '⛏️', verb: '이어서' });
});

test('낚시: 입질이면 urgent 당기기!, 힘겨루기면 hold 꾹 누르기, 기다리는 중은 idle', () => {
  const p = go('fishing', '🎣 기다리는 중…');
  assert.deepEqual(touchAction(p, null, { bite: true }), { mode: 'urgent', icon: '❗', verb: '당기기!' });
  assert.equal(touchAction(p, null, { reel: true }).mode, 'hold');
  assert.equal(touchAction(p, null, { reel: true }).verb, '꾹 누르기');
  assert.equal(touchAction(p, null, {}).mode, 'idle');
});

test('알려진 동작은 짧은 동사, 심기·수확은 고른 씨앗·작물 아이콘', () => {
  assert.deepEqual(touchAction(go('till', '밭 갈기'), null), { mode: 'go', icon: '⛏️', verb: '갈기' });
  assert.equal(touchAction(go('water'), null).verb, '물주기');
  assert.equal(touchAction(go('plant'), null, { seedEmoji: '🥕' }).icon, '🥕');
  assert.equal(touchAction(go('harvest'), null, { cropEmoji: '🍓' }).icon, '🍓');
  assert.equal(touchAction(go('npc', '💬 여우와 대화'), null).verb, '대화');
  assert.equal(touchAction(go('ride', '🚲 자전거 타기'), null).icon, '🚲', '탈것은 안내 글의 아이콘');
  assert.equal(touchAction(go('home_bed', '🛏️ 침대'), null).verb, '잠자기');
  assert.equal(touchAction(go('home_door', '🚪 문'), null).verb, '나가기');
  for (const [k, [, verb]] of Object.entries(ACTION)) assert.ok(verb.length <= 5, `${k} 동사는 짧게: ${verb}`);
});

test('모르는 열쇠: 안내 글 첫 이모지 + 확인', () => {
  assert.deepEqual(touchAction(go('newthing', '🧁 컵케이크 굽기'), null), { mode: 'go', icon: '🧁', verb: '확인' });
  assert.equal(touchAction(go('x', '이모지 없음'), null).icon, '👆');
  assert.equal(firstEmoji('나무 흔들기 (🍎 사과)'), '🍎');
  assert.equal(firstEmoji('👨‍🌾 농부'), '👨‍🌾', '조합 이모지는 한 덩어리');
  assert.equal(firstEmoji(''), '');
});

test('같은 대상이면 글이 바뀌어도 표시가 같음 (진행률 때문에 톡 튀지 않음)', () => {
  const a = go('harvest', '당근 수확 (★)'), b = go('harvest', '당근 수확 (★★)');
  assert.equal(touchSig(touchAction(a, null), a), touchSig(touchAction(b, null), b));
  assert.notEqual(touchSig(touchAction(a, null), a), touchSig(touchAction(go('water'), null), go('water')));
});

test('진동: 기기에 있고 설정이 켜져 있을 때만, 오토플레이 중에는 생략', () => {
  const calls = [];
  const nav = { vibrate: (p) => { calls.push(p); return true; } };
  const store = new Map();
  const keepLs = globalThis.localStorage, keepGame = globalThis.game;
  globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  try {
    const j = new Juice();
    assert.equal(canVibrate({}), false, 'iPhone 사파리 (vibrate 없음)');
    assert.equal(j.haptic(8, {}), false);
    assert.equal(j.haptic(8, nav), true);
    assert.deepEqual(calls, [8]);
    hapticPrefs.set(false);
    assert.equal(hapticPrefs.get(), false);
    assert.equal(j.haptic(15, nav), false);
    hapticPrefs.set(true);
    globalThis.game = { autoplay: { on: true } };
    assert.equal(j.haptic([10, 40, 20], nav), false);
    globalThis.game = { autoplay: { on: false } };
    assert.equal(j.haptic([10, 40, 20], nav), true);
    assert.deepEqual(calls, [8, [10, 40, 20]]);
    // 진동이 오류를 내도 게임은 계속
    assert.equal(j.haptic(8, { vibrate: () => { throw new Error('x'); } }), false);
  } finally { globalThis.localStorage = keepLs; globalThis.game = keepGame; }
});

test('탈곡 중: 누를 때마다 연타 (안내에 onInteract 가 없어도 흐리지 않음)', () => {
  assert.deepEqual(touchAction({ key: 'thresh', label: '👊 더 빨리 연타!' }, null, { mash: true }), { mode: 'go', icon: '👊', verb: '연타!' });
  assert.equal(touchAction({ key: 'thresh', label: '탈곡기 (벼를 수확해 오세요)' }, null, {}).mode, 'idle');
});

test('터치 말풍선 글: 키보드 안내를 빼고, 동사가 이미 있으면 알약을 또 붙이지 않음', () => {
  assert.equal(touchLabel('지금 당기기! (E / 탭)'), '지금 당기기!');
  assert.equal(touchLabel('❗ 지금 당기기! (E / 탭)'), '❗ 지금 당기기!');
  assert.equal(touchLabel('빈 밭에서 E 를 눌러 갈기'), '빈 밭에서 눌러 갈기');
  assert.equal(touchLabel('🐄 소 (E)'), '🐄 소');
  assert.equal(touchLabel('KOAT 체험관'), 'KOAT 체험관', '영문 낱말은 그대로');
  assert.equal(verbInLabel('갈기', '밭 갈기'), true);
  assert.equal(verbInLabel('당기기!', '❗ 지금 당기기!'), true);
  assert.equal(verbInLabel('대화', '🦊 여우'), false);
  assert.equal(verbInLabel('', '아무 글'), false);
});

test('첫 이모지: 같은 글은 기억해 두고 같은 답 (매 프레임 다시 쪼개지 않음)', () => {
  for (let i = 0; i < 200; i++) assert.equal(firstEmoji(`🐝 꿀 ${i % 70}%`), '🐝');
  assert.equal(firstEmoji('🐝 꿀 5%'), '🐝');
  assert.equal(firstEmoji('글만'), '');
});
