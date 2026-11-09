// 따라가기 카메라
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

// 브라우저 없이: 세로 터치 폰처럼 보이게 하는 최소 흉내 (각 시험 파일은 따로 실행됨)
const el = () => ({ className: '', innerHTML: '', style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {} }, remove() {}, append() {}, querySelector: () => null, querySelectorAll: () => [] });
globalThis.document ??= { createElement: el, getElementById: el };
globalThis.requestAnimationFrame ??= (f) => f();
globalThis.window ??= { addEventListener() {}, innerWidth: 390 };
globalThis.screen ??= { width: 390, height: 844 };
globalThis.matchMedia = (q) => ({ matches: /coarse|max-width: 600px/.test(q) });

const { FollowCamera } = await import('../src/game/camera.js');

test('따라가기 카메라: 바라보는 높이 보정', () => {
  const c = new FollowCamera(new THREE.PerspectiveCamera());
  c.update(0.016, null, new THREE.Vector3(0, 0, 0));
  assert.ok(Math.abs(c.smooth.y - 1.1) < 1e-9);
  c.lookOffsetY = -1.25; c.first = true;
  c.update(0.016, null, new THREE.Vector3(0, 0, 0));
  assert.ok(Math.abs(c.smooth.y + 0.15) < 1e-9);
});
