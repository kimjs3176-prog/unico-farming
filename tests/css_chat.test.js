// 채팅 CSS: 행동 막대 위로 올리기·겹침 순서(z-index)
// (브라우저 없이 같은 선택자끼리만 단순 계산 — 규칙 목록·화면 크기는 tests/lib/css_env.js)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { read, value, PHONE, LAND, TABLET, DESK, DESK2, WIDE } from './lib/css_env.js';

test('터치 태블릿: 채팅·E 버튼이 가운데 행동 막대(약 102px) 위로, \'크게\' 설정에서도', () => {
  assert.equal(value(TABLET, '.chat', 'bottom'), '110px');
  assert.equal(value(TABLET, 'body.ui-big .chat', 'bottom'), '110px'); // max-width:1500px 의 92px 보다 뒤에서 이김
  assert.equal(value(TABLET, '.touch-btn', 'bottom'), '110px');
  assert.equal(value(LAND, '.chat', 'bottom') === '110px', false); // 가로 폰은 모바일 블록 값
  assert.equal(value(WIDE, 'body.ui-big .chat', 'bottom'), '92px'); // 넓은 데스크톱은 그대로
});

test('좁은 데스크톱 창(601~1340px): 채팅이 가운데 행동 막대 위로, 폰·넓은 창은 그대로', () => {
  for (const env of [DESK, DESK2]) {
    assert.equal(value(env, '.chat', 'bottom'), '112px');
    assert.equal(value(env, 'body.ui-big .chat', 'bottom'), '128px');
  }
  assert.equal(value(WIDE, '.chat', 'bottom'), '12px');
  for (const env of [PHONE, LAND]) assert.match(value(env, '.chat', 'bottom'), /^calc\(60px/);
  // 올린 채팅(바닥 112px)은 주민 대화창(바닥 96px) 아래에 깔리므로 대화 중에는 숨김
  for (const env of [DESK, DESK2]) assert.equal(value(env, '#ui:has(> .dlg:not(.hidden)) > .chat', 'visibility'), 'hidden');
  assert.equal(value(WIDE, '#ui:has(> .dlg:not(.hidden)) > .chat', 'visibility'), undefined, '넓은 창은 채팅이 대화창과 안 겹쳐 그대로');
});

test('좁은 데스크톱 창: 올린 채팅이 가운데 안내(E)를 덮지 않음, 입력 중에는 채팅이 위', () => {
  const NARROW = { w: 800, h: 600, coarse: false };
  for (const env of [NARROW, DESK, DESK2]) {
    // 안내는 z-index 없음(0 층) → 입력 중이 아닌 채팅(음수)이 그 아래. 안내를 올리지 않으므로 스마트팜 창·운전 버튼은 그대로 안내 위
    assert.equal(value(env, '.prompt', 'z-index'), undefined);
    assert.ok(Number(value(env, '.chat:not(:focus-within)', 'z-index')) < 0);
    assert.equal(value(env, '.chat:focus-within', 'z-index'), undefined, '입력 중이면 원래 순서');
    assert.equal(value(env, '#ui', 'isolation'), 'isolate', '음수 층이 게임 화면 아래로 가지 않게');
  }
  // 입력 중 원래 순서에서 채팅이 안내보다 위: #ui 안에서 안내 → 채팅 순서 (생성자가 안내 조각을 먼저 만들고, 조각마다 자기 요소를 붙임)
  const ui = read('src/ui/ui.js');
  assert.ok(ui.indexOf('this.buildPrompt()') > 0 && ui.indexOf('this.buildPrompt()') < ui.indexOf('this.buildChat()'));
  assert.match(read('src/ui/prompt.js'), /root\.append\(this\.prompt\)/);
  assert.match(read('src/ui/chat.js'), /root\.append\(this\.chat\)/);
  // 넓은 창·세로 폰은 그대로 (채팅이 안내와 겹치지 않음)
  for (const env of [WIDE, PHONE]) assert.equal(value(env, '.chat:not(:focus-within)', 'z-index'), undefined);
});

test('넓은 화면(마우스): 채팅은 💬 동그라미로 접힘, 입력칸은 보이지만 않게 (T 의 focus() 가 그대로), 폰·태블릿은 그대로', () => {
  for (const env of [DESK, DESK2, WIDE]) {
    assert.equal(value(env, '.chat:not(:focus-within):not(.peek) .chat-bubble', 'display'), 'grid');
    assert.equal(value(env, '.chat:not(:focus-within):not(.peek) .chat-bubble', 'width'), '40px');
    // 입력칸: display·visibility 로 숨기지 않음 (보이지만 않게: 투명·잘라 냄)
    const sel = '.chat:not(:focus-within) input';
    assert.equal(value(env, sel, 'opacity'), '0');
    assert.equal(value(env, sel, 'clip-path'), 'inset(50%)');
    assert.equal(value(env, sel, 'display'), undefined);
    assert.equal(value(env, sel, 'visibility'), undefined);
    assert.equal(value(env, '.chat:not(:focus-within):not(.peek)', 'width'), 'fit-content', '접힌 채팅은 동그라미만큼만 (빈 칸이 클릭을 막지 않음)');
  }
  for (const env of [PHONE, LAND, TABLET]) assert.equal(value(env, '.chat:not(:focus-within):not(.peek) .chat-bubble', 'display'), undefined, '터치 화면은 ☰ 의 말하기로');
  assert.equal(value(DESK, '.chat-bubble', 'display'), 'none', '펼치면 동그라미는 숨김');
  const chat = read('src/ui/chat.js');
  assert.match(chat, /this\.chatBubble\.onclick = \(\) => this\.chatInput\.focus\(\)/);
  assert.match(chat, /if \(!mine && this\.game\.net\?\.connected\)/, '접속 중일 때만 새 말에 펼침');
  assert.match(chat, /6000/);
  assert.match(read('src/main.js'), /justPressed\('KeyT'\)\) this\.ui\.chatInput\.focus\(\)/, 'T 키는 입력칸 focus');
});
