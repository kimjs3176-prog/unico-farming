// 행동 막대·☰ 버튼 CSS
// (브라우저 없이 같은 선택자끼리만 단순 계산 — 규칙 목록·화면 크기는 tests/lib/css_env.js)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES } from './lib/css_env.js';

test('트랙터 운전 중(#ui.driving)에는 E·☰ 숨김 (미디어쿼리 밖)', () => {
  const r = RULES.find((x) => x.media.length === 0 && x.sel.includes('#ui.driving .touch-btn') && x.sel.includes('#ui.driving .bar-toggle'));
  assert.ok(r);
  assert.deepEqual(r.decls, [['display', 'none']]);
});
