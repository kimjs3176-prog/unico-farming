import test from 'node:test';
import assert from 'node:assert/strict';
import { heightAt, HILLS, CHESTS, normalAt } from '../src/game/terrain.js';
import { LAYOUT } from '../src/game/world.js';

test('마을·밭·목장·체험관·연못·논은 평지', () => {
  const L = LAYOUT;
  const pts = [[0, 0], [0, 9], [L.market.x, L.market.z], [L.well.x, L.well.z], [L.pond.x, L.pond.z], [L.smartfarm.x, L.smartfarm.z],
    [L.windmill.x, L.windmill.z], [L.barn.x, L.barn.z], [L.tractorHome.x, L.tractorHome.z], [25, -29], [0, -21]];
  for (let x = L.ranch.x0; x <= L.ranch.x1; x += 2) for (let z = L.ranch.z0; z <= L.ranch.z1; z += 2) pts.push([x, z]);
  for (let x = L.field.x0; x <= L.field.x0 + L.field.cols * L.field.cell; x += 2) for (let z = L.field.z0; z <= L.field.z0 + L.field.rows * L.field.cell; z += 2) pts.push([x, z]);
  for (const [x, z] of pts) assert.equal(heightAt(x, z), 0, `(${x},${z})`);
});

test('언덕 꼭대기는 높고, 경사는 걸어 오를 만함', () => {
  for (const H of HILLS) {
    assert.ok(heightAt(H.x, H.z) > H.h * 0.95, H.id);
    let maxSlope = 0;
    for (let a = 0; a < 6.28; a += 0.5) for (let d = 0; d < H.r; d += 0.25) {
      const n = normalAt(H.x + Math.cos(a) * d, H.z + Math.sin(a) * d);
      maxSlope = Math.max(maxSlope, Math.acos(n[1]) * 180 / Math.PI);
    }
    assert.ok(maxSlope < 45, `${H.id} 최대 경사 ${maxSlope.toFixed(1)}°`);
  }
});

test('보물 상자는 맵 안(경계 39m)에', () => {
  for (const c of CHESTS) assert.ok(Math.abs(c.x) < 39 && Math.abs(c.z) < 39, c.id);
});
