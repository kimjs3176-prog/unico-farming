// 그림자 그리는 물체 줄이기: 납작한 것은 늘, 낮음은 작은 것도. 캐릭터·다른 코드가 끈 것은 건드리지 않음
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { cullShadowCasters } from '../src/game/shadow_cull.js';

const mesh = (w, h, d) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial()); m.castShadow = true; return m; };

test('그림자 줄이기: 납작한 것은 늘 끔, 낮음은 작은 것도 끄고, 품질을 올리면 되돌림', () => {
  const scene = new THREE.Scene();
  const flat = mesh(2, 0.05, 2), small = mesh(0.3, 0.3, 0.3), big = mesh(2, 2, 2), off = mesh(0.3, 0.3, 0.3);
  off.castShadow = false; // 다른 코드가 일부러 끈 것
  const ch = new THREE.Group(); ch.userData.unico = true; const part = mesh(0.2, 0.2, 0.2); ch.add(part);
  scene.add(flat, small, big, off, ch);
  scene.updateMatrixWorld(true);
  cullShadowCasters(scene, false);
  assert.deepEqual([flat.castShadow, small.castShadow, big.castShadow], [false, true, true], '보통·높음: 납작한 것만');
  cullShadowCasters(scene, true);
  assert.deepEqual([flat.castShadow, small.castShadow, big.castShadow], [false, false, true], '낮음: 작은 것도');
  assert.equal(part.castShadow, true, '캐릭터 부품은 그대로');
  cullShadowCasters(scene, false);
  assert.equal(small.castShadow, true, '품질을 올리면 되돌림');
  assert.equal(off.castShadow, false, '다른 코드가 끈 것은 켜지 않음');
});

test('크기는 세상 크기(배율 포함)로 봄', () => {
  const scene = new THREE.Scene(), g = new THREE.Group(), m = mesh(0.3, 0.3, 0.3);
  g.scale.setScalar(4); g.add(m); scene.add(g); scene.updateMatrixWorld(true);
  cullShadowCasters(scene, true);
  assert.equal(m.castShadow, true, '4배로 키운 작은 상자는 큰 물체');
});

test('눕혀 만든 판자를 세우면 제 높이로 봄 (회전 포함)', () => {
  const scene = new THREE.Scene(), board = mesh(1.5, 0.04, 1.2);
  board.rotation.x = Math.PI / 2; // 세움 → 세상 높이 1.2m
  scene.add(board); scene.updateMatrixWorld(true);
  cullShadowCasters(scene, false);
  assert.equal(board.castShadow, true, '세운 판자는 그림자를 그림');
});

test('공사 중 납작하게 시작한 건물도 다 자라면 그림자가 돌아옴', () => {
  const scene = new THREE.Scene(), wall = mesh(2, 1.2, 0.3);
  wall.scale.y = 0.08; // 공사 시작 (높이 0.096m)
  scene.add(wall); scene.updateMatrixWorld(true);
  cullShadowCasters(scene, false);
  assert.equal(wall.castShadow, false, '공사 초반은 납작함');
  wall.scale.y = 1; scene.updateMatrixWorld(true); // 완공
  cullShadowCasters(scene, false);
  assert.equal(wall.castShadow, true, '모양이 바뀌면 다시 판단');
});
