// 구글 글꼴 CSS 비차단 붙이기(public/font-css.js)와 캔버스 글자 다시 그리기(label.js whenFontReady)
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { whenFontReady } from '../src/game/label.js';

const SRC = readFileSync(new URL('../public/font-css.js', import.meta.url), 'utf8');

/** font-css.js 를 가짜 문서에서 돌림. link: #gf-css 흉내, entries: 받기 기록 수 */
function runFontCss({ sheet = null, entries = 0 } = {}) {
  const ev = {}, timers = [];
  const link = { href: 'https://fonts.example/css', media: 'print', sheet, addEventListener: (t, f) => { ev[t] = f; } };
  const win = {
    document: { getElementById: () => link, documentElement: { classList: { add() {} } }, fonts: null },
    performance: { getEntriesByName: () => new Array(entries) },
    setTimeout: (f, ms) => { timers.push({ f, ms }); return timers.length; }, clearTimeout() {},
    Promise,
  };
  win.window = win;
  vm.runInNewContext(SRC, win);
  return { win, link, ev, timers };
}

const settled = async (p) => { let done = false; p.then(() => { done = true; }); await new Promise((r) => setImmediate(r)); return done; };

test('글꼴 CSS 가 스크립트보다 먼저 실패했으면(받기 기록은 있고 sheet 없음) 기다림이 바로 풀림', async () => {
  const { win, link } = runFontCss({ entries: 1 });
  assert.equal(await settled(win.__gfReady), true);
  assert.equal(win.__gfDone, true);
  assert.equal(link.media, 'print', '실패한 CSS 는 켜지 않음');
});

test('글꼴 CSS 가 아직 오는 중이면 load 에서 켜고 풀림, 끝내 안 오면 10초 뒤 풀림', async () => {
  const a = runFontCss();
  assert.equal(await settled(a.win.__gfReady), false);
  a.ev.load();
  assert.equal(await settled(a.win.__gfReady), true);
  assert.equal(a.link.media, 'all');
  const b = runFontCss();
  const t = b.timers.find((x) => x.ms === 10000);
  assert.ok(t, '안전 시간');
  t.f();
  assert.equal(await settled(b.win.__gfReady), true);
});

test('글꼴 CSS 가 붙기 전에 그린 캔버스 글자는 붙은 뒤 다시 그림 (등록 전 check 는 늘 "있음")', async () => {
  // 준비: 글꼴이 등록 전이라 check 가 true 로 답하는 상태
  const keep = { document: globalThis.document, window: globalThis.window };
  let open;
  globalThis.document = { fonts: { check: () => true, load: () => Promise.resolve() } };
  globalThis.window = { __gfReady: new Promise((r) => { open = r; }), __gfDone: false };
  try {
    let n = 0;
    // 실행
    assert.equal(whenFontReady('40px Jua', '유니코', () => n++), true, '다시 그리기 예약');
    assert.equal(n, 0);
    globalThis.window.__gfDone = true; open();
    await new Promise((r) => setImmediate(r));
    // 확인
    assert.equal(n, 1);
    assert.equal(whenFontReady('40px Jua', '유니코', () => n++), false, 'CSS 가 붙은 뒤에는 check 를 믿음');
  } finally {
    globalThis.document = keep.document; globalThis.window = keep.window;
  }
});
