// 이름 카드 (대화창 안, 브라우저 입력 창 대신): 다듬기 · [좋아!]/[✏️ 바꾸기] · 한글 조합 중 Enter · 건너뛰기/오토플레이는 지금 이름
import test from 'node:test';
import assert from 'node:assert/strict';

/** 아주 작은 가짜 DOM (이름 카드가 쓰는 만큼) */
class El {
  constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.parent = null; this.attrs = {}; this.listeners = {}; this.textContent = ''; this.innerHTML = ''; this.value = ''; this.focused = false; }
  append(...cs) { for (const c of cs) { c.parent = this; this.children.push(c); } }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this); this.parent = null; }
  replaceWith(n) { const p = this.parent, i = p.children.indexOf(this); p.children[i] = n; n.parent = p; this.parent = null; }
  setAttribute(k, v) { this.attrs[k] = v; }
  addEventListener(k, f) { (this.listeners[k] ||= []).push(f); }
  focus() { this.focused = true; } blur() { this.focused = false; } select() {}
  find(pred) { for (const c of this.children) { if (pred(c)) return c; const r = c.find(pred); if (r) return r; } return null; }
  key(e) { for (const f of this.listeners.keydown || []) f({ preventDefault() {}, stopPropagation() {}, ...e }); }
}
globalThis.document = { createElement: (t) => new El(t), body: { classList: { add() {}, remove() {} } } };
globalThis.window ??= { addEventListener() {} };

const { Dialogue, sanitizeName, NAME_AUTO_S } = await import('../src/ui/dialogue.js');

test('이름 다듬기: 공백·제어 문자 빼고 6글자까지 (이모지는 한 글자), 비면 예전 이름', () => {
  assert.equal(sanitizeName('  보리  ', '콩이'), '보리');
  assert.equal(sanitizeName('콩\u0007이​', '콩이'), '콩이');
  assert.equal(sanitizeName('가나다라마바사아', '콩이'), '가나다라마바');
  assert.equal(sanitizeName('🐶🐶🐶🐶🐶🐶🐶', '콩이'), '🐶🐶🐶🐶🐶🐶');
  assert.equal(sanitizeName('a\n\tb', 'x'), 'a b');
  assert.equal(sanitizeName('    ', '콩이'), '콩이');
  assert.equal(sanitizeName(null, '콩이'), '콩이');
  assert.equal(sanitizeName('‮뒤집기', '콩이'), '뒤집기');
  assert.equal(sanitizeName('짧은 이름 ', '콩이', 3), '짧은');
});

function card() {
  const box = new El('div');
  const d = Object.assign(Object.create(Dialogue.prototype), { game: { audio: { play() {} } }, $: () => box, active: true });
  let got;
  const done = new Promise((r) => { d._showName({ value: '콩이', max: 6 }, (v) => { got = v; r(v); }); });
  const btn = (re) => box.find((c) => c.tagName === 'BUTTON' && re.test(c.innerHTML));
  return { d, box, done, btn, got: () => got };
}

test('이름 카드: [좋아!] 는 지금 이름, 글 상자는 [바꾸기] 를 눌러야 열림 (폰 자판이 처음부터 올라오지 않게)', async () => {
  const c = card();
  assert.equal(c.box.find((x) => x.tagName === 'INPUT'), null, '처음엔 글 상자 없음');
  assert.ok(c.d.choosing);
  c.btn(/좋아/).onclick({ stopPropagation() {} });
  assert.equal(await c.done, '콩이');
  assert.equal(c.d.choosing, false);
  assert.equal(c.d._naming, null);
});

test('이름 카드: 바꾸기 → 글 상자(6글자, 포커스), 한글 조합 중 Enter 는 무시, 조합이 끝난 Enter 로 확정', async () => {
  const c = card();
  c.btn(/바꾸기/).onclick({ stopPropagation() {} });
  const inp = c.box.find((x) => x.tagName === 'INPUT');
  assert.ok(inp && inp.focused);
  assert.equal(inp.maxLength, 6);
  assert.equal(inp.value, '콩이');
  assert.ok(c.d._naming.editing);
  inp.value = '  보리차 ';
  inp.key({ key: 'Enter', isComposing: true });
  assert.equal(c.got(), undefined, '조합 중');
  inp.key({ key: 'Enter', isComposing: false });
  assert.equal(await c.done, '보리차');
});

test('이름 카드: Esc 는 지금 이름, 빈 이름은 지금 이름', async () => {
  const c = card();
  c.btn(/바꾸기/).onclick({ stopPropagation() {} });
  c.box.find((x) => x.tagName === 'INPUT').key({ key: 'Escape' });
  assert.equal(await c.done, '콩이');
  const c2 = card();
  c2.btn(/바꾸기/).onclick({ stopPropagation() {} });
  const inp = c2.box.find((x) => x.tagName === 'INPUT');
  inp.value = '   ';
  c2.btn(/이 이름으로/).onclick({ stopPropagation() {} });
  assert.equal(await c2.done, '콩이');
});

test('이름 카드: 건너뛰기(skipAll)·오토플레이(4초)는 지금 이름, 고치는 중이면 오토플레이가 기다림', async () => {
  const c = card();
  c.d.skipAll();
  assert.equal(await c.done, '콩이');
  const a = card();
  a.d._autoAt = performance.now() - (NAME_AUTO_S + 0.5) * 1000;
  assert.equal(a.d.autoStep(), true);
  assert.equal(await a.done, '콩이');
  const e = card();
  e.btn(/바꾸기/).onclick({ stopPropagation() {} });
  e.d._autoAt = performance.now() - 10000;
  e.d.autoStep();
  assert.equal(e.got(), undefined, '고치는 중');
});
