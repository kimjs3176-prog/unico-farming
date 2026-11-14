// 위쪽 HUD CSS: 칩·막대 크기가 화면 크기별로 맞게 (테마가 모바일 압축 값을 다시 덮지 않음)
// (브라우저 없이 같은 선택자끼리만 단순 계산 — 규칙 목록·화면 크기는 tests/lib/css_env.js)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { value, PHONE, LAND } from './lib/css_env.js';

test('테마(theme.css)가 모바일 압축 값을 다시 덮지 않음', () => {
  for (const env of [PHONE, LAND]) {
    assert.equal(value(env, '.chip .xpbar', 'width'), '28px');
    assert.equal(value(env, '.actionbar', 'padding'), '3px');
    assert.equal(value(env, '.minimap', 'border-width'), '2px');
  }
  // 꾸미기 막대: 세로 폰은 이름 한 줄 + 단추 한 줄, 가로 폰은 세로 막대 (단추가 줄바꿈되지 않음)
  assert.equal(value(PHONE, '.decor-bar', 'flex-wrap'), 'wrap');
  assert.equal(value(PHONE, '.decor-what', 'flex'), '1 0 100%');
  assert.equal(value(LAND, '.decor-bar', 'flex-wrap'), 'nowrap');
  assert.equal(value(LAND, '.decor-what', 'flex'), '0 0 auto');
});
