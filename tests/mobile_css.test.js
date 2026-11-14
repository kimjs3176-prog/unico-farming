// 모바일 화면 CSS 점검: 여러 조각에 걸친 겹침 순서·상태 (style.css → theme.css 순서로 읽었을 때 화면 크기별로 실제로 이기는 값)
// (브라우저 없이 같은 선택자끼리만 단순 계산 — 규칙 목록·화면 크기는 tests/lib/css_env.js)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES, value, PHONE, LAND, DESK, DESK2, WIDE } from './lib/css_env.js';

test('데스크톱 값은 그대로 (모바일 규칙이 새지 않음)', () => {
  assert.equal(value(WIDE, '.chat', 'bottom'), '12px'); // 넓은 창은 채팅이 바닥 그대로 (좁은 창은 아래 시험)
  for (const env of [DESK, DESK2]) {
    assert.equal(value(env, '.touch-btn', 'display'), 'none');
    assert.equal(value(env, '.bar-toggle', 'display'), 'none');
    assert.equal(value(env, '.dlg', 'bottom'), '96px');
    assert.equal(value(env, '.prompt', 'white-space'), 'nowrap');
    assert.equal(value(env, '.prompt', 'bottom'), '120px');
    assert.equal(value(env, '.actionbar button', 'font-size'), '11px');
    assert.equal(value(env, '.chip .xpbar', 'width'), '76px');
    assert.equal(value(env, '.decor-bar', 'bottom'), '174px');
    assert.equal(value(env, '.soc-reqs', 'bottom'), '178px');
    assert.equal(value(env, '.map-panel', 'display'), undefined);
  }
});

test('가로 폰: 대화창은 바닥으로, 꾸미기 막대·요청 카드는 화면 가운데를 비움', () => {
  assert.match(value(LAND, '.dlg', 'bottom'), /^calc\(6px/);
  assert.equal(value(LAND, '.dlg-choices', 'display'), 'grid');
  assert.equal(value(LAND, '.decor-bar', 'flex-direction'), 'column');
  assert.equal(value(LAND, '.decor-bar', 'left'), 'auto');
  assert.equal(value(LAND, '.soc-reqs', 'bottom'), 'auto');
  assert.equal(value(LAND, '.map-panel', 'display'), 'grid');
  assert.equal(value(LAND, '.panel.market', 'max-height'), 'none');
  // 세로 폰은 가로 폰 전용 규칙을 받지 않음
  assert.equal(value(PHONE, '.dlg-choices', 'display'), 'flex');
  assert.equal(value(PHONE, '.decor-bar', 'flex-direction'), undefined);
});

test('꾸미기 막대가 떠 있으면 자동 진행 칩을 숨김', () => {
  assert.equal(value(WIDE, '#ui:has(> .decor-bar) > .auto-chip', 'display'), 'none');
});

test('누르는 메뉴가 안내 말풍선·자동 칩보다 위 (탭이 말풍선으로 새지 않음)', () => {
  for (const env of [PHONE, LAND]) {
    const p = Number(value(env, '.prompt', 'z-index'));
    assert.ok(p >= 1);
    assert.equal(Number(value(env, '.auto-chip', 'z-index')), p);
    for (const sel of ['#ui.bar-open > .actionbar', '.emote-menu', '.chat:focus-within', '.drive-pad']) {
      assert.ok(Number(value(env, sel, 'z-index')) > p, `${sel} 가 .prompt 보다 위여야 함`);
      assert.ok(Number(value(env, sel, 'z-index')) < 5, `${sel} 는 꾸미기 막대(5)·창(10)보다 아래`);
    }
  }
  // 채팅 기록은 터치를 받음 (밀어서 지난 대화 보기) — 말풍선은 z-index 로 위에
  for (const env of [PHONE, LAND]) assert.equal(value(env, '.chat:not(:focus-within)', 'pointer-events'), undefined);
  for (const env of [DESK, DESK2]) {
    assert.equal(value(env, '.prompt', 'z-index'), undefined);
    assert.equal(value(env, '.emote-menu', 'z-index'), undefined);
  }
});

test('가로 폰: 대화창 폭은 확대 단위로 ☰·E 자리(150px)를 뺌', () => {
  assert.match(value(LAND, '.dlg', 'width'), /^min\(calc\(100vw \/ var\(--ui-zoom, 1\) - 150px/);
});

test('가로 폰: 스마트팜·논 패널이 떠도 알림·배너가 가려지지 않음', () => {
  assert.equal(value(LAND, '.toasts', 'z-index'), '7');
  assert.equal(value(LAND, '.event-banner', 'z-index'), '7');
  assert.equal(value(LAND, '#ui:has(> .smart-panel) > .toasts', 'transform'), 'none');
  assert.equal(value(LAND, '#ui:has(> .smart-panel) > .event-banner', 'transform'), 'none');
  assert.match(value(LAND, '#ui:has(> .smart-panel) .toast', 'max-width'), /452px/);
  // 패널 왼쪽 끝(오른쪽 88px + 폭 340px)보다 알림 오른쪽 끝이 왼쪽에: 8 + (W - 452) <= W - 428
  assert.match(value(LAND, '.smart-panel', 'right'), /^calc\(88px/);
  assert.match(value(LAND, '.smart-panel', 'width'), /^min\(340px/);
  // 세로 폰·데스크톱은 그대로
  for (const env of [PHONE, DESK]) {
    assert.equal(value(env, '.toasts', 'z-index'), undefined);
    assert.equal(value(env, '#ui:has(> .smart-panel) > .toasts', 'left'), undefined);
  }
});

test('dvh·svh 를 쓰는 곳에는 바로 앞에 vh 대체값이 있음', () => {
  for (const r of RULES) {
    r.decls.forEach(([p, v], i) => {
      if (!/\d(dvh|svh)\b/.test(v)) return;
      const prev = r.decls.slice(0, i).find(([q, w]) => q === p && /\dvh\b/.test(w) && !/\d(dvh|svh)\b/.test(w));
      assert.ok(prev, `${r.sel} { ${p}: ${v} } 앞에 vh 대체 선언이 없음`);
    });
  }
});

test('게임 UI 길게 누르기 방지, 입력칸은 그대로 글자 입력', () => {
  const ui = RULES.filter((r) => r.sel === '#ui' && r.media.length === 0).flatMap((r) => r.decls);
  const has = (p, v) => ui.some(([q, w]) => q === p && w === v);
  assert.ok(has('-webkit-user-select', 'none') && has('user-select', 'none') && has('-webkit-touch-callout', 'none'));
  const inp = RULES.find((r) => r.media.length === 0 && r.sel.split(',').map((s) => s.trim()).includes('#ui input'));
  assert.ok(inp && inp.decls.some(([p, v]) => p === '-webkit-user-select' && v === 'text'));
});
