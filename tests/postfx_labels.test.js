// 후처리 위 이름표: 효과 패스 동안 숨기고, 다 그린 화면 위에 빈 장면으로 덧그림 (가짜 렌더러·컴포저)
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

const ctx = new Proxy({ measureText: (t) => ({ width: t.length * 24 }) }, { get: (t, k) => (k in t ? t[k] : () => {}) });
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };
globalThis.innerWidth ??= 1200; globalThis.innerHeight ??= 800;
const { PostFX, tiltFocus, TILT_R } = await import('../src/game/postfx.js');
const { makeLabel, setHeroLabel } = await import('../src/game/label.js');

function rig(post = true) {
  const log = [];
  const renderer = {
    autoClear: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 0.95, target: 'composer-rt',
    getPixelRatio: () => 1, getSize: (v) => v.set(1200, 800),
    getRenderTarget() { return this.target; }, setRenderTarget(t) { this.target = t; log.push(['target', t]); },
    render(scene, camera) { log.push(['render', scene, { autoClear: this.autoClear, target: this.target, kids: [...scene.children], mask: camera.layers.mask }]); },
  };
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x88ccff);
  const camera = new THREE.PerspectiveCamera(45, 1.5, 0.1, 100);
  camera.position.set(0, 2, 8); camera.lookAt(0, 2, 0);
  const fx = new PostFX(renderer, scene, camera, { post, bloom: false, smaa: false, env: false });
  return { fx, renderer, scene, camera, log };
}

test('후처리 켬: 효과 패스 동안 이름표를 숨기고, 끝난 뒤 배경 없는 장면으로 화면에 덧그림 (지우지 않음)', () => {
  const { fx, renderer, scene, log } = rig(true);
  const npc = new THREE.Group(); scene.add(npc);
  const tag = makeLabel('🛒 장터 여우'); tag.position.y = 2.2; npc.add(tag);
  let seen = null;
  fx.composer = { render: () => { seen = tag.visible; log.push(['composer']); } };
  fx.render();
  assert.equal(seen, false, '주변광 차폐·반사·미니어처 흐림이 이름표를 못 봄');
  assert.equal(tag.visible, true, '끝나면 되돌림');
  assert.equal(tag.parent, npc, '부모는 그대로');
  const i = log.findIndex((e) => e[0] === 'composer'), j = log.findIndex((e) => e[0] === 'render');
  assert.ok(i >= 0 && j > i, '컴포저 다음에 덧그림');
  const [, L, st] = log[j];
  assert.notEqual(L, scene, '월드 장면이 아닌 빈 장면');
  assert.equal(L.background, null);
  assert.equal(L.fog, null);
  assert.equal(L.matrixWorldAutoUpdate, false, '월드 행렬을 다시 계산하지 않음');
  assert.deepEqual(st.kids, [tag]);
  assert.equal(st.autoClear, false, '효과 입힌 화면을 지우지 않음');
  assert.equal(st.target, null, '화면에 바로');
  assert.equal(renderer.autoClear, true, 'autoClear 되돌림');
  assert.equal(L.children.length, 0, '빌린 자식 반납');
  assert.equal(renderer.target, 'composer-rt', '그리기 대상 되돌림');
  tag.userData.dispose();
});

test('후처리 켬: 컴포저가 오류를 내도 이름표 보이기·불투명도는 되돌림, 숨은 부모 밑 이름표는 그리지 않음', () => {
  const { fx, scene, camera, log } = rig(true);
  const a = new THREE.Group(), b = new THREE.Group(); scene.add(a, b); b.visible = false;
  const t1 = makeLabel('⭐ 졸린 우유 (나)'), t2 = makeLabel('🐕 콩이'), t3 = makeLabel('숨은 주민');
  a.add(t1); a.add(t2); b.add(t3);
  t1.position.y = 2.3; t2.position.set(0.2, 2.25, 0.3);
  scene.updateMatrixWorld(true); camera.updateMatrixWorld();
  t2.userData.fadeMul = 0.5; t2.userData.faded = true;
  fx.composer = { render: () => { throw new Error('gpu'); } };
  assert.throws(() => fx.render(), /gpu/);
  for (const t of [t1, t2]) assert.equal(t.visible, true);
  assert.equal(t2.material.opacity, 1, '흐림 배율은 그릴 때만 곱함');
  fx.composer = { render() {} };
  log.length = 0;
  fx.render();
  const kids = log.find((e) => e[0] === 'render')[2].kids;
  assert.ok(kids.includes(t1) && kids.includes(t2));
  assert.ok(!kids.includes(t3), '숨은 부모 밑');
  for (const t of [t1, t2, t3]) t.userData.dispose();
});

test('겹친 반려견 이름표는 그리는 동안만 흐리게 (내 이름표가 먼저 자리)', () => {
  const { fx, scene, camera } = rig(true);
  const me = new THREE.Group(), dog = new THREE.Group(); scene.add(me, dog);
  const hero = makeLabel('⭐ 상냥한 무지개 (나)'), pet = makeLabel('🐕 콩이');
  me.add(hero); dog.add(pet); hero.position.y = 2.3; pet.position.set(0.3, 2.2, 0.4);
  scene.updateMatrixWorld(true); camera.updateMatrixWorld();
  setHeroLabel(hero);
  let during = null;
  fx.composer = { render() {} };
  const r0 = fx.renderer.render.bind(fx.renderer);
  fx.renderer.render = (s, c) => { if (s !== scene) during = pet.material.opacity; r0(s, c); };
  for (let i = 0; i < 12; i++) { fx._t = performance.now() - 16; fx.render(); }
  assert.ok(during < 0.4, `그릴 때 ${during}`);
  assert.equal(pet.material.opacity, 1, '끝나면 원래 값 (unico.js·npcs.js 가 매 프레임 쓰는 값)');
  setHeroLabel(null);
  hero.userData.dispose(); pet.userData.dispose();
});

test('후처리 끔(저사양): 한 번에 그림 (이름표 포함), 덧그리기 없음', () => {
  const { fx, scene, log } = rig(false);
  const tag = makeLabel('📣 안내 강아지'); scene.add(tag);
  fx.composer = { render: () => assert.fail('컴포저를 쓰지 않음') };
  fx.render();
  const renders = log.filter((e) => e[0] === 'render');
  assert.equal(renders.length, 1);
  assert.equal(renders[0][1], scene);
  assert.ok(renders[0][2].kids.includes(tag) && tag.visible);
  tag.userData.dispose();
});

test('미니어처 흐림 초점: 렌즈를 올린 대화 구도에서는 얼굴 높이로 따라 올라감', () => {
  const cam = new THREE.PerspectiveCamera(45, 1.6, 0.1, 100);
  assert.equal(tiltFocus(cam), TILT_R);
  cam.setViewOffset(1.6, 1, 0, 0.3, 1.6, 1);
  assert.ok(Math.abs(tiltFocus(cam) - (TILT_R + 0.3)) < 1e-9);
  cam.clearViewOffset();
  assert.equal(tiltFocus(cam), TILT_R);
});
