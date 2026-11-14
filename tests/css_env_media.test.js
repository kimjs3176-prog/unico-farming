// CSS 시험 도우미(tests/lib/css_env.js)의 미디어 조건 계산 — 뒤 조각이 새 조건을 써도 시험이 터지지 않고 브라우저처럼 계산되는지
import test from 'node:test';
import assert from 'node:assert/strict';
import { mediaMatches as mq, PHONE, LAND, TABLET, DESK } from './lib/css_env.js';

test('지금 쓰는 조건: 너비·높이·비율·포인터·호버', () => {
  const q = '@media (max-width: 600px), (max-height: 500px) and (pointer: coarse)';
  assert.equal(mq(q, PHONE), true);
  assert.equal(mq(q, LAND), true);
  assert.equal(mq(q, TABLET), false);
  assert.equal(mq(q, DESK), false);
  assert.equal(mq('@media (max-height: 500px) and (min-aspect-ratio: 4/3)', LAND), true);
  assert.equal(mq('@media (max-height: 500px) and (min-aspect-ratio: 4/3)', { w: 600, h: 450, coarse: true }), true); // 딱 4:3
  assert.equal(mq('@media (hover: none)', PHONE), true);
  assert.equal(mq('@media (hover: none)', DESK), false);
  assert.equal(mq('@media (prefers-reduced-motion: reduce)', DESK), false);
});

test('방향·any-·색 모드·표시 방식·해상도', () => {
  assert.equal(mq('@media (orientation: landscape)', LAND), true);
  assert.equal(mq('@media (orientation: landscape)', PHONE), false);
  assert.equal(mq('@media (orientation: portrait)', { w: 500, h: 500 }), true); // 정사각형은 세로
  assert.equal(mq('@media (any-pointer: coarse)', PHONE), true);
  assert.equal(mq('@media (any-hover: hover)', DESK), true);
  assert.equal(mq('@media (prefers-reduced-motion: no-preference)', DESK), true);
  assert.equal(mq('@media (prefers-reduced-motion: reduce)', { ...DESK, reducedMotion: true }), true);
  assert.equal(mq('@media (prefers-color-scheme: dark)', DESK), false);
  assert.equal(mq('@media (prefers-color-scheme: light)', DESK), true);
  assert.equal(mq('@media (display-mode: standalone)', PHONE), false);
  assert.equal(mq('@media (display-mode: standalone)', { ...PHONE, displayMode: 'standalone' }), true);
  assert.equal(mq('@media (min-resolution: 2dppx)', DESK), false);
  assert.equal(mq('@media (min-resolution: 2dppx)', { ...PHONE, dpr: 3 }), true);
  assert.equal(mq('@media (-webkit-min-device-pixel-ratio: 2)', { ...PHONE, dpr: 2 }), true);
  assert.equal(mq('@media (min-resolution: 192dpi)', { ...PHONE, dpr: 2 }), true);
});

test('범위 문법·값 없는 조건·매체 종류·not', () => {
  assert.equal(mq('@media (width <= 600px)', PHONE), true);
  assert.equal(mq('@media (width <= 600px)', DESK), false);
  assert.equal(mq('@media (601px <= width <= 1340px)', DESK), true);
  assert.equal(mq('@media (601px <= width <= 1340px)', PHONE), false);
  assert.equal(mq('@media (600px >= width)', PHONE), true);
  assert.equal(mq('@media (hover)', DESK), true);
  assert.equal(mq('@media (hover)', PHONE), false);
  assert.equal(mq('@media print', DESK), false);
  assert.equal(mq('@media screen and (max-width: 600px)', PHONE), true);
  assert.equal(mq('@media only screen and (max-width: 600px)', DESK), false);
  assert.equal(mq('@media not print', DESK), true);
  assert.equal(mq('@media not all and (pointer: coarse)', DESK), true);
  assert.equal(mq('@media (max-width:600px) or (orientation: landscape)', LAND), true);
  assert.equal(mq('@media  (max-width:\n 600px)', PHONE), true); // 줄바꿈·띄어쓰기
});

test('모르는 조건은 던지지 않고 거짓 (브라우저처럼), @media 아닌 at-rule', () => {
  assert.doesNotThrow(() => mq('@media (scripting: enabled)', DESK));
  assert.equal(mq('@media (scripting: enabled)', DESK), false);
  assert.equal(mq('@media (max-foo: 3)', DESK), false);
  assert.equal(mq('@media (scripting: enabled), (max-width: 600px)', PHONE), true); // 쉼표는 하나만 맞아도
  assert.equal(mq('@keyframes pop', DESK), false);
  assert.equal(mq('@container (min-width: 300px)', DESK), false);
  assert.equal(mq('@supports (backdrop-filter: blur(4px))', DESK), true);
  assert.equal(mq('@supports not (backdrop-filter: blur(4px))', DESK), false);
});
