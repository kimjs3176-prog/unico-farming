// 안내 말풍선·E 버튼·조이스틱 CSS (+ 말풍선이 흐려지며 나타나고 사라지는 setPrompt)
// (브라우저 없이 같은 선택자끼리만 단순 계산 — 규칙 목록·화면 크기는 tests/lib/css_env.js)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES, mediaMatches, value, PHONE, LAND, DESK } from './lib/css_env.js';
import { PromptUI, promptKey } from '../src/ui/prompt.js';

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

// ---- 안내 말풍선이 뚝 나타나고 사라지지 않게: 흐려지며 살짝 움직임 (display:none 대신)
const REDUCED = { ...DESK, reducedMotion: true };
const sels = (sel) => RULES.filter((r) => r.sel.split(',').map((s) => s.trim()).includes(sel));

test('숨김은 display:none 이 아니라 흐려짐: 글은 남기고, 누를 수 없고, 가운데 맞춤 transform 은 그대로', () => {
  for (const env of [DESK, PHONE, LAND]) {
    for (const sel of ['.prompt.hidden', '.prompt.clickable.hidden']) {
      assert.equal(value(env, sel, 'display'), undefined, `${sel} 는 자리를 지킴`);
      assert.equal(value(env, sel, 'opacity'), '0');
      assert.equal(value(env, sel, 'visibility'), 'hidden');
      assert.equal(value(env, sel, 'pointer-events'), 'none');
      assert.equal(value(env, sel, 'translate'), '0 8px');
      assert.equal(value(env, sel, 'transform'), undefined, 'translateX(-50%) 를 덮지 않음 (translate 속성만)');
      // 사라질 때 0.08초, 다 흐려진 뒤에 visibility
      assert.match(value(env, sel, 'transition'), /opacity 0\.08s.*visibility 0s linear 0\.08s/);
    }
    assert.equal(value(env, '.prompt', 'transform'), 'translateX(-50%)');
  }
  // 나타날 때 0.12~0.14초, 누를 수 있는 안내도 같은 전환 (+ 마우스 올림 확대)
  assert.match(value(DESK, '.prompt', 'transition'), /opacity 0\.12s.*translate 0\.14s/);
  assert.match(value(DESK, '.prompt.clickable', 'transition'), /transform 0\.1s.*opacity 0\.12s.*translate 0\.14s/);
  assert.equal(value(DESK, '.prompt.clickable:hover', 'transform'), 'translateX(-50%) scale(1.04)');
  // 예전 display:none 규칙이 남아 있지 않음
  assert.ok(!sels('.prompt.hidden').some((r) => r.decls.some(([p, v]) => p === 'display' && v === 'none')));
  // 컷신 중에는 여전히 숨김
  assert.equal(value(DESK, 'body.cine .prompt', 'opacity'), '0');
});

test('숨은 안내의 손가락 까딱임은 멈춤 (보일 때만 돎)', () => {
  for (const env of [DESK, PHONE]) assert.equal(value(env, '.prompt.hidden .tapme', 'animation'), 'none');
  assert.match(value(DESK, '.prompt .tapme', 'animation'), /^tap /);
});

test('움직임 줄이기: 안내 말풍선은 흐려지기만 (움직이지 않음)', () => {
  for (const sel of ['.prompt.hidden', '.prompt.clickable.hidden']) {
    assert.equal(value(REDUCED, sel, 'translate'), 'none');
    assert.doesNotMatch(value(REDUCED, sel, 'transition'), /translate/);
  }
  assert.doesNotMatch(value(REDUCED, '.prompt.clickable', 'transition'), /translate|transform/);
});

test('setPrompt: 숨길 때 글을 지우지 않고, 대상 종류(key)가 바뀔 때만 톡 (글만 바뀌면 그대로)', () => {
  const cls = new Set(['prompt', 'hidden']);
  const anims = [];
  const el = {
    innerHTML: '',
    classList: { add: (c) => cls.add(c), remove: (c) => cls.delete(c), toggle: (c, on) => (on ? cls.add(c) : cls.delete(c)) },
    animate: (k, o) => anims.push(o.duration),
  };
  const ui = { ...PromptUI, prompt: el };
  ui.setPrompt({ label: '🥕 당근 심기', key: 'plant', onInteract() {} });
  assert.ok(!cls.has('hidden'));
  assert.equal(anims.length, 0, '처음 나타날 때는 CSS 전환만');
  ui.setPrompt(null);
  assert.ok(cls.has('hidden'));
  assert.match(el.innerHTML, /당근 심기/, '흐려지는 동안 글이 남음');
  ui.setPrompt({ label: '🥕 당근 심기', key: 'plant', onInteract() {} });
  ui.setPrompt({ label: '🐔 꼬꼬 쓰다듬기', key: 'pet', onInteract() {} });
  assert.deepEqual(anims, [150], '다른 대상 → 150ms 톡');
  for (let i = 0; i < 5; i++) ui.setPrompt({ label: `🍯 벌통 꿀 ${i * 10}%`, key: 'pet' });
  assert.deepEqual(anims, [150], '진행률처럼 글만 바뀌면 톡 없음');
  assert.ok(!cls.has('clickable'));
  // 열쇠가 없는 안내: 글에서 숫자·% 를 뺀 것으로 대상을 가림
  ui.setPrompt({ label: '🌱 자라는 중 10%' });
  anims.length = 0;
  ui.setPrompt({ label: '🌱 자라는 중 35%' });
  assert.deepEqual(anims, [], '열쇠 없이 진행률만 바뀌면 톡 없음');
  ui.setPrompt({ label: '🐶 콩이 쓰다듬기', onInteract() {} });
  assert.deepEqual(anims, [150], '열쇠 없이 다른 대상으로 바뀌면 톡');
  assert.equal(promptKey({ label: '꿀 12.5%' }), promptKey({ label: '꿀 80%' }));
});
