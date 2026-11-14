// 창(패널) CSS: 낮은 창의 장터·큰 지도, 미니게임 창 등장
// (브라우저 없이 같은 선택자끼리만 단순 계산 — 규칙 목록·화면 크기는 tests/lib/css_env.js)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readCss, value, PHONE, LAND, TABLET, DESK, DESK2, WIDE, SHORT } from './lib/css_env.js';

test('낮은 창(가로 폰·낮은 데스크톱 창): 장터 압축, 큰 지도는 옆으로 나란히', () => {
  for (const env of [LAND, SHORT]) {
    assert.equal(value(env, '.panel.market', 'max-height'), 'none');
    assert.equal(value(env, '.mk-body', 'min-height'), '64px');
    assert.equal(value(env, '.mk-top', 'flex-flow'), 'row wrap');
    assert.equal(value(env, '.panel.market h2', 'font-size'), '19px');
    assert.equal(value(env, '.map-panel', 'display'), 'grid');
  }
  // 높은 창은 그대로, 목록 최소 높이는 보이는 높이에 맞춰 줄어듦
  for (const env of [DESK, WIDE, PHONE]) {
    assert.equal(value(env, '.panel.market', 'max-height'), undefined);
    assert.equal(value(env, '.map-panel', 'display'), undefined);
    assert.equal(value(env, '.mk-body', 'min-height'), 'min(120px, 16dvh)');
  }
  // 큰 지도: 창 높이에 맞춘 상한 (넓고 높은 창에서는 100% 그대로)
  assert.match(value(WIDE, '.bigmap', 'width'), /^min\(100%, max\(200px, calc\(86dvh/);
  for (const env of [DESK, DESK2, WIDE, TABLET]) assert.match(value(env, '.bigmap', 'width'), /- 260px\)\)\)$/);
  // 세로 폰: 두 줄 제목·네 줄 장소 버튼만큼 더 뺌 (390x664 에서 지도 약 241px, 스크롤 없음)
  assert.match(value(PHONE, '.bigmap', 'width'), /^min\(100%, max\(200px, calc\(86dvh \/ var\(--ui-zoom, 1\) - 330px\)\)\)$/);
});

test('미니게임 창은 투명도만 나타남 (화면 전체가 미끄러지면 바구니 끌기가 어긋남)', () => {
  const anim = value(WIDE, '.mg-wrap', 'animation');
  assert.ok(anim && !anim.includes('panelin'), anim);
  const name = anim.split(' ')[0];
  const css = readCss('src/ui/style.css'); // @import 조각까지 풀어서
  const kf = css.match(new RegExp(`@keyframes ${name} \\{([^}]*\\{[^}]*\\})*[^}]*\\}`))?.[0] || '';
  assert.ok(kf, `@keyframes ${name}`);
  assert.ok(!/transform/.test(kf), kf);
});
