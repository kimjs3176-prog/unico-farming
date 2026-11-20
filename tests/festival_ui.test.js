// 축제 화면 조각: 미니게임 결과 카드 ✕ 닫기, 도감 못 만난 칸 힌트
import test from 'node:test';
import assert from 'node:assert/strict';

/** 아주 작은 가짜 DOM: 같은 선택자는 같은 요소 */
class El {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase(); this.children = []; this.cache = {}; this.className = ''; this.innerHTML = ''; this.textContent = ''; this.isConnected = false;
    const set = new Set(); this.classList = { add: (c) => set.add(c), remove: (c) => set.delete(c), contains: (c) => set.has(c) }; this.style = { setProperty() {} };
  }
  querySelector(s) { return (this.cache[s] ||= new El()); }
  querySelectorAll() { return []; }
  append(...cs) { this.children.push(...cs); }
  setAttribute() {}
}
globalThis.document ??= { createElement: (t) => new El(t), body: new El('body'), getElementById: () => new El() };
globalThis.requestAnimationFrame ??= () => 0;

const { mgResult } = await import('../src/ui/minigame_frame.js');
const { bookHint } = await import('../src/ui/panels/bag.js');
const { ITEMS } = await import('../src/game/sim/items.js');

test('결과 카드: ✕ 로 닫아도 onClose 가 한 번 불리고, 다시 눌러도 또 불리지 않음 (축제 창이 다시 열림)', () => {
  // 준비: 창을 하나만 여는 가짜 ui
  let closed = 0, open = 0;
  const panel = new El();
  const ui = { openPanel: () => { open++; return panel; }, closePanel: () => { open = 0; } };
  const g = { ui, audio: { play() {} }, onEvent() {} };
  // 실행
  mgResult(g, { id: 'fest_t', icon: '🎪', title: '시험', score: 3, unit: '점', th: [15, 30, 45], prevBest: 99, onClose: () => closed++ });
  const x = panel.querySelector('h2 .close');
  x.onclick(); x.onclick();
  panel.onDismiss?.();
  // 확인
  assert.equal(closed, 1);
  assert.equal(open, 0, '창은 닫힘');
});

test('도감 힌트: 못 만난 칸에 계절·때·곳을 알려 줌 (예: 여름 밤 연못)', () => {
  assert.equal(bookHint(ITEMS.fish_softshell), '여름 밤 연못');
  assert.equal(bookHint(ITEMS.bug_cricket), '가을 밤 풀숲');
  assert.equal(bookHint(ITEMS.fish_smelt), '겨울 추운 날 낚시터 호수');
  assert.equal(bookHint(ITEMS.fruit_persimmon), '가을·겨울 과수원');
});
