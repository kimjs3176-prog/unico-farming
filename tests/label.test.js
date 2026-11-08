import test from 'node:test';
import assert from 'node:assert/strict';
import { makeLabel, whenFontReady } from '../src/game/label.js';

// 가짜 캔버스: 글꼴을 받기 전에는 글자 폭이 좁고(대체 글꼴), 받은 뒤에는 넓어짐
function fakeDom({ loaded = false, check = true } = {}) {
  const state = { loaded, fills: 0, loads: 0 };
  const ctx = {
    font: '', fillStyle: '', textBaseline: '', textAlign: '',
    measureText: (t) => ({ width: t.length * (state.loaded ? 30 : 20) }),
    clearRect() {}, beginPath() {}, moveTo() {}, arcTo() {}, closePath() {}, fill() {},
    fillText() { state.fills++; },
  };
  let resolve;
  const fonts = check ? {
    check: () => state.loaded,
    load: () => { state.loads++; return new Promise((r) => { resolve = () => { state.loaded = true; r([]); }; }); },
  } : undefined;
  globalThis.document = { createElement: () => ({ width: 300, height: 150, getContext: () => ctx }), fonts };
  return { state, finishLoad: async () => { resolve?.(); await new Promise((r) => setTimeout(r, 0)); } };
}

test('이름표: 한글 글꼴 조각이 늦게 오면 받은 뒤 크기를 다시 재고 다시 그림 (옛 텍스처는 해제)', async () => {
  const { state, finishLoad } = fakeDom();
  const s = makeLabel('새 친구 닉네임');
  const tex = s.material.map, w0 = tex.image.width, sx0 = s.scale.x, v0 = tex.version;
  let disposed = 0;
  tex.addEventListener('dispose', () => disposed++);
  assert.equal(state.loads, 1, '아직 없는 조각을 요청');
  await finishLoad();
  assert.ok(tex.image.width > w0, '넓어진 글자 폭에 맞춰 캔버스를 키움');
  assert.ok(s.scale.x > sx0, '스프라이트 크기도 맞춤');
  assert.equal(disposed, 1, '크기가 바뀌면 GPU 텍스처를 새로 잡음');
  assert.ok(tex.version > v0, '다시 올리기');
  assert.equal(state.fills, 2);
  delete globalThis.document;
});

test('이름표: 이미 받은 글꼴·확인할 수 없는 환경은 그대로, 치운 이름표는 다시 그리지 않음', async () => {
  let d = fakeDom({ loaded: true });
  makeLabel('유니코');
  assert.equal(d.state.loads, 0);
  d = fakeDom({ check: false });
  assert.equal(whenFontReady('40px Jua', '가', () => {}), false);
  makeLabel('유니코');
  d = fakeDom();
  const s = makeLabel('늦게 오는 글자');
  s.userData.dispose();
  await d.finishLoad();
  assert.equal(d.state.fills, 1, '해제한 뒤에는 그리지 않음');
  delete globalThis.document;
});
