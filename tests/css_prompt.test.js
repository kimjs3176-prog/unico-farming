// 안내 말풍선·E 버튼·조이스틱 CSS
// (브라우저 없이 같은 선택자끼리만 단순 계산 — 규칙 목록·화면 크기는 tests/lib/css_env.js)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES, mediaMatches, value, PHONE, LAND } from './lib/css_env.js';

test('세로 폰: ☰ 를 펼치면 안내 말풍선·자동 칩이 두 줄 막대 위로, 올라간 E 버튼을 비킴', () => {
  assert.match(value(PHONE, '#ui.bar-open > .prompt', 'bottom'), /^calc\(124px/);
  assert.match(value(PHONE, '#ui.bar-open > .auto-chip', 'bottom'), /^calc\(180px/);
  assert.match(value(PHONE, '#ui.bar-open .touch-btn', 'bottom'), /^calc\(116px/);
  for (const sel of ['#ui.bar-open > .prompt', '#ui.bar-open > .auto-chip']) assert.match(value(PHONE, sel, 'max-width'), /- 152px\)$/);
  // 가로 폰은 막대가 한 줄이라 그대로
  assert.equal(value(LAND, '#ui.bar-open > .prompt', 'bottom'), undefined);
  // 트랙터 운전 중 안내는 운전 버튼 위 (막대 펼침 규칙보다 뒤에서 이김)
  const order = RULES.filter((r) => r.media.some((m) => mediaMatches(m, PHONE)) && /#ui\.(bar-open|driving) > \.prompt/.test(r.sel)).map((r) => r.sel);
  assert.deepEqual(order, ['#ui.bar-open > .prompt', '#ui.driving > .prompt']);
});

test('조이스틱은 글자·버튼 크기 확대(zoom)에서 빠짐 (JS 가 손가락 화면 좌표로 놓음)', () => {
  const z = RULES.find((r) => r.media.length === 0 && r.decls.some(([p, v]) => p === 'zoom' && v.includes('--ui-zoom')));
  assert.ok(z, 'zoom 규칙이 있어야 함');
  assert.match(z.sel, /:not\([^)]*\.joystick[^)]*\)/);
  assert.match(z.sel, /:not\([^)]*\.fly[^)]*\)/);
});
