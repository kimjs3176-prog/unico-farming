import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { World } from '../src/game/world.js';
import { Vehicle } from '../src/game/sim/tractor.js';

/** 장애물 판정만 쓰는 가짜 월드 (렌더링·에셋 없이) */
const fakeWorld = (obstacles) => ({ waters: [], boxes: [], obstacles, resolveCollision: World.prototype.resolveCollision });

test('운전 중인 트랙터(반지름 0 장애물)는 자기 자신에게 튕겨 나가지 않음 — 급발진 방지', () => {
  const v = new Vehicle(28.5, 17, -Math.PI / 2);
  const self = { x: v.x, z: v.z, r: 0 };
  const w = fakeWorld([self]);
  let maxJump = 0;
  for (let i = 0; i < 120; i++) {
    const px = v.x, pz = v.z;
    v.step(1 / 60, 1, 0);
    const next = new THREE.Vector3(v.x, 0, v.z);
    w.resolveCollision(next, 1.4);
    v.x = next.x; v.z = next.z;
    self.x = v.x; self.z = v.z;
    maxJump = Math.max(maxJump, Math.hypot(v.x - px, v.z - pz));
  }
  // 한 프레임 이동은 최고 속도(5.5m/s) × 1/60 ≈ 0.09m 를 넘지 않아야 함
  assert.ok(maxJump < 0.1, `한 프레임에 ${maxJump.toFixed(2)}m 튐`);
});

test('트랙터 출발은 부드러움: 0.3초 안에 0.5m/s 미만, 2초 뒤 3m/s 이상', () => {
  const v = new Vehicle(0, 0, 0);
  for (let t = 0; t < 0.3; t += 1 / 60) v.step(1 / 60, 1, 0);
  assert.ok(v.speed < 0.5, `0.3초에 ${v.speed.toFixed(2)}`);
  for (let t = 0.3; t < 2; t += 1 / 60) v.step(1 / 60, 1, 0);
  assert.ok(v.speed > 3, `2초에 ${v.speed.toFixed(2)}`);
});

test('켜진 장애물(반지름 > 0)은 여전히 밀어냄', () => {
  const w = fakeWorld([{ x: 0, z: 0, r: 1 }]);
  const n = new THREE.Vector3(0.5, 0, 0);
  w.resolveCollision(n, 0.5);
  assert.ok(Math.hypot(n.x, n.z) >= 1.5 - 1e-6);
});
