import test from 'node:test';
import assert from 'node:assert/strict';
import { josa, withJosa } from '../src/game/sim/josa.js';

test('조사: 받침 있으면 을·이·은·과·으로, 없으면 를·가·는·와·로', () => {
  assert.equal(withJosa('사과', '을/를'), '사과를');
  assert.equal(withJosa('당근', '을/를'), '당근을');
  assert.equal(withJosa('안내 유니코', '이/가'), '안내 유니코가');
  assert.equal(withJosa('꼬마 곰', '이/가'), '꼬마 곰이');
  assert.equal(withJosa('콩이', '와/과'), '콩이와');
  assert.equal(withJosa('송아지 별', '와/과'), '송아지 별과');
  assert.equal(withJosa('목장', '은/는'), '목장은');
});

test('조사: (으)로 는 ㄹ 받침도 로', () => {
  assert.equal(withJosa('장터', '으로/로'), '장터로');
  assert.equal(withJosa('낚시터', '으로/로'), '낚시터로');
  assert.equal(withJosa('새 마을', '으로/로'), '새 마을로');
  assert.equal(withJosa('우리 집', '으로/로'), '우리 집으로');
  assert.equal(withJosa('보통', '으로/로'), '보통으로');
});

test('조사: 숫자·이모지·따옴표 뒤, 영어는 둘 다 표시', () => {
  assert.equal(josa('사과 3개', '을/를'), '를');
  assert.equal(josa('물고기 1', '을/를'), '을');
  assert.equal(josa('레벨 7', '으로/로'), '로');
  assert.equal(josa('🍎 사과 🎉', '을/를'), '를');
  assert.equal(josa("'멜빵바지'", '을/를'), '를');
  assert.equal(josa('SMART', '을/를'), '을(를)');
  assert.equal(josa('SMART', '으로/로'), '(으)로');
  assert.equal(josa('', '이/가'), '이(가)');
  assert.equal(josa('사과', '없는/조사'), '');
});
