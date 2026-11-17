// 행동 막대·☰ 버튼 CSS
// (브라우저 없이 같은 선택자끼리만 단순 계산 — 규칙 목록·화면 크기는 tests/lib/css_env.js)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES, value, PHONE, LAND, DESK } from './lib/css_env.js';

test('트랙터 운전 중(#ui.driving)에는 E·☰ 숨김 (미디어쿼리 밖)', () => {
  const r = RULES.find((x) => x.media.length === 0 && x.sel.includes('#ui.driving .touch-btn') && x.sel.includes('#ui.driving .bar-toggle'));
  assert.ok(r);
  assert.deepEqual(r.decls, [['display', 'none']]);
});

test('단계적 공개: [hidden] 버튼은 어느 화면에서나 숨김, ☰ 전용(설정·도움말)은 휴대폰에서만', () => {
  for (const env of [DESK, PHONE, LAND]) assert.equal(value(env, '.actionbar button[hidden]', 'display'), 'none');
  assert.equal(value(DESK, '.actionbar button.mob-only', 'display'), 'none');
  for (const env of [PHONE, LAND]) assert.equal(value(env, '.actionbar button.mob-only', 'display'), 'flex');
  // [hidden] 이 휴대폰의 .mob-only·버튼 display 보다 세게 (선택자 세기: 클래스 1 + 속성 1 + 태그 1)
  const hid = RULES.find((r) => r.sel === '.actionbar button[hidden]');
  assert.ok(hid && hid.media.length === 0);
});

test('오프라인이면 채팅 숨김, ☰ 빨간 점, 세로 폰 ☰ 칸 수는 --ab-cols', () => {
  assert.equal(value(DESK, '#ui.net-off > .chat', 'display'), 'none');
  assert.equal(value(PHONE, '.bar-toggle.dot::after', 'border-radius'), '50%');
  assert.match(value(PHONE, '#ui.bar-open .actionbar', 'grid-template-columns'), /var\(--ab-cols, 5\)/);
  assert.equal(value(LAND, '#ui.bar-open .actionbar', 'grid-template-columns'), undefined, '가로 폰은 한 줄 그대로');
  assert.equal(value({ ...PHONE, reducedMotion: true }, '.actionbar button.bounce span', 'animation'), undefined);
});
