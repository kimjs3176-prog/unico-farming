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

test('세로 폰: 창은 아래에 붙는 시트 (옷장 빼고), 등장·흔들림은 translate 속성이라 위치와 겹쳐도 어긋나지 않음', () => {
  const sheet = '.panel:not(.wardrobe)';
  assert.equal(value(PHONE, sheet, 'bottom'), '0');
  assert.equal(value(PHONE, sheet, 'position'), 'absolute', '체험관 결과 창(.koat-result relative)도 시트로');
  assert.equal(value(PHONE, sheet, 'top'), 'auto');
  assert.equal(value(PHONE, sheet, 'transform'), 'none');
  assert.equal(value(PHONE, sheet, 'border-radius'), '22px 22px 0 0');
  assert.match(value(PHONE, sheet, 'max-height'), /var\(--hud-b/);
  assert.match(value(PHONE, sheet, 'padding-bottom'), /var\(--sab/);
  assert.match(value(PHONE, sheet, 'animation'), /^sheetin /);
  assert.equal(value(PHONE, `${sheet} > h2::before`, 'width'), '36px');
  assert.match(value(PHONE, '.panel.shake', 'animation'), /^sheetshake /);
  // 데스크톱·가로 폰은 가운데 창 그대로
  for (const env of [DESK, LAND]) assert.equal(value(env, sheet, 'bottom'), undefined);
  const css = readCss('src/ui/style.css') + readCss('src/ui/theme.css');
  for (const name of ['sheetin', 'sheetshake', 'panelout']) {
    const kf = css.match(new RegExp(`@keyframes ${name} \\{([^}]*\\{[^}]*\\})*[^}]*\\}`))?.[0] || '';
    assert.ok(kf, name);
    assert.ok(!/transform/.test(kf), `${name} 는 transform 대신 translate/scale 속성: ${kf}`);
  }
});

test('창 닫힘: 0.14초 흐려짐, 누름 막음, 움직임 줄이기에서는 투명도만', () => {
  assert.match(value(DESK, '#ui > .panel.closing', 'animation'), /^panelout 0\.14s/);
  assert.equal(value(DESK, '#ui > .panel.closing', 'pointer-events'), 'none');
  assert.equal(value(DESK, '#ui > .scrim.closing', 'pointer-events'), 'none');
  assert.equal(value({ ...DESK, reducedMotion: true }, '#ui > .panel.closing', 'animation-name'), 'fadeout');
  assert.equal(value(DESK, '#ui > .panel.closing', 'animation-name'), undefined);
});

test('장터 줄은 목록 폭에 맞춤: 좁으면 두 줄 격자, 설명 마디는 줄바꿈 없음, 옛 55% 규칙 없음', () => {
  assert.equal(value(DESK, '.mk-body', 'container-type'), 'inline-size');
  assert.match(value(DESK, '.mk-body .mk-row', 'grid-template-areas'), /"ic nm pr btns" "ic meta pr btns"/);
  assert.equal(value(DESK, '.mk-row .meta > span.nw', 'white-space'), 'nowrap');
  const css = readCss('src/ui/style.css');
  const narrow = css.match(/@container \(max-width: 460px\) \{([\s\S]*?)\n\}/)?.[1] || '';
  assert.match(narrow, /grid-template-areas: "ic nm pr" "ic meta btns"/);
  assert.match(narrow, /button\.locked \{ min-width: auto/);
  assert.match(narrow, /\.lk-x \{ display: none/);
  for (const env of [PHONE, DESK]) assert.equal(value(env, '.mk-row .nm', 'min-width'), undefined);
});

test('PC: 배경막은 조금 더 진하고, 창은 아래 행동 막대 위에서 끝남 · 바꿔 연 창은 등장 애니메이션 없음', () => {
  assert.equal(value(DESK, '.scrim', 'background'), 'rgba(32, 22, 14, 0.45)');
  assert.equal(value(PHONE, '.scrim', 'background'), 'rgba(32, 22, 14, 0.38)');
  assert.match(value(DESK, '.panel:not(.wardrobe)', 'max-height'), /100dvh \/ var\(--ui-zoom, 1\) - 220px/);
  assert.match(value(PHONE, '.panel:not(.wardrobe)', 'max-height'), /var\(--hud-b/, '폰 시트 높이는 그대로');
  assert.equal(value(LAND, '.panel:not(.wardrobe)', 'max-height'), undefined, '가로 폰은 PC 높이 제한을 받지 않음');
  assert.equal(value(DESK, '.panel.instant:not(.shake)', 'animation'), 'none');
});
