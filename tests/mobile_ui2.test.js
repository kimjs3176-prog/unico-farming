// 휴대폰 UI: 전체 화면 켜고 끄기·전체 화면 단추, 선물 되돌리기
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// 브라우저 없이: 세로 터치 폰처럼 보이게 하는 최소 흉내 (각 시험 파일은 따로 실행됨)
const el = () => ({ className: '', innerHTML: '', style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {} }, remove() {}, append() {}, querySelector: () => null, querySelectorAll: () => [] });
globalThis.document ??= { createElement: el, getElementById: el };
globalThis.requestAnimationFrame ??= (f) => f();
globalThis.window ??= { addEventListener() {}, innerWidth: 390 };
globalThis.screen ??= { width: 390, height: 844 };
globalThis.matchMedia = (q) => ({ matches: /coarse|max-width: 600px/.test(q) });

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root));

const { canFullscreen, toggleFullscreen } = await import('../src/ui/ui.js');
const { SocialSim } = await import('../src/game/sim/social.js');

// ---------------------------------------------------------------- 전체 화면·아이콘·서버
test('전체 화면: 휴대폰 + API 있을 때만, 누르면 켜고 다시 누르면 끔', () => {
  assert.equal(canFullscreen({ fullscreenEnabled: false }), false, 'iPhone 사파리 (API 없음)');
  assert.equal(canFullscreen({ fullscreenEnabled: true }), true);
  const calls = [];
  const doc = {
    fullscreenElement: null,
    documentElement: { requestFullscreen: (o) => { calls.push(['req', o]); return Promise.reject(new Error('거부')); } },
    exitFullscreen: () => { calls.push(['exit']); return Promise.resolve(); },
  };
  toggleFullscreen(doc);
  assert.deepEqual(calls[0], ['req', { navigationUI: 'hide' }]);
  doc.fullscreenElement = {};
  toggleFullscreen(doc);
  assert.deepEqual(calls[1], ['exit']);
  // 오래된 webkit 접두사만 있는 브라우저
  const wk = { documentElement: { webkitRequestFullscreen: () => calls.push(['wk']) } };
  toggleFullscreen(wk);
  assert.deepEqual(calls[2], ['wk']);
});

test('전체 화면 단추: 켜져도 오토플레이의 켜짐 표시(on: 강조·통통 튀기)를 쓰지 않음', () => {
  const src = read('src/ui/actionbar.js').toString();
  const a = src.indexOf('this.fsBtn = mk('), b = src.indexOf('root.append(this.bar)', a);
  assert.ok(a > 0 && b > a, '전체 화면 단추 코드를 찾음');
  const blk = src.slice(a, b);
  assert.doesNotMatch(blk, /classList\.(toggle|add)\(\s*'on'/);
  assert.match(blk, /창 모드/, '켜지면 이름만 바뀜');
});

test('선물 되돌리기: 오늘 횟수·누적 기록이 0 아래로 내려가지 않음', () => {
  const s = new SocialSim();
  s.noteGift();
  s.undoGift(); s.undoGift();
  assert.equal(s.gifts, 0);
  assert.equal(s.stats.giftsSent, 0);
});
