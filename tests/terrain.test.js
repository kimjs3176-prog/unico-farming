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

test('물가 굴곡: ±15% 안, 부두 뿌리는 뭍·데크 끝은 물 위, 낚시 데크는 물가에', async () => {
  const { shoreR, shoreDist, shorePolygon } = await import('../src/game/terrain.js');
  const K = LAYOUT.lake, P = LAYOUT.pond;
  for (const W of [K, P]) {
    let lo = 9, hi = 0;
    for (let i = 0; i < 720; i++) { const r = shoreR(W, (i / 720) * Math.PI * 2) / W.r; lo = Math.min(lo, r); hi = Math.max(hi, r); }
    assert.ok(lo >= 0.85 && hi <= 1.15, `${W.id} ${lo.toFixed(3)}~${hi.toFixed(3)}`);
    assert.ok(hi - lo > 0.15, `${W.id} 굴곡이 너무 작음`);
    assert.equal(shorePolygon(W, 32).length, 32);
  }
  assert.ok(shoreDist(K, -12.5, 23.4) < 0, '부두 뿌리는 뭍');
  for (const b of K.pier) assert.ok(shoreDist(K, (b.x0 + b.x1) / 2, b.z1) > 0.5, '부두 끝은 물 위');
  assert.ok(shoreDist(K, (K.pier[1].x0 + K.pier[1].x1) / 2, (K.pier[1].z0 + K.pier[1].z1) / 2) > 0.5);
  assert.ok(Math.abs(shoreDist(P, LAYOUT.dock.x, LAYOUT.dock.z)) < 0.3, '낚시 데크는 연못 물가에');
  assert.ok(shoreDist(K, K.entry.x, K.entry.z) < -0.8, '호수 입구는 뭍');
  // 호수로 가는 길(부두 뿌리 전까지)·연못 옆 길은 물에 닿지 않음
  const path = LAYOUT.paths.find((p) => p.pts.at(-1)[0] === -12.5);
  for (const [x, z] of path.pts.slice(0, -1)) assert.ok(shoreDist(K, x, z) < -1.1 && shoreDist(P, x, z) < -1.1, `길 (${x},${z})`);
  // 물가 벤치·가로등·낚시꾼 자리·버드나무는 뭍
  for (const [x, z] of [[-17.6, 27.2], [-17.4, 34.6], [-10.4, 23.4], [-6.9, 25.6], [LAYOUT.npcs.fisher.x, LAYOUT.npcs.fisher.z]]) assert.ok(shoreDist(K, x, z) < 0, `호수가 (${x},${z})`);
  for (const [x, z] of [[-17.6, 15.5], [-16.5, 21.8]]) assert.ok(shoreDist(P, x, z) < -0.6, `연못가 (${x},${z})`);
});

test('물가 모래 폭: 어디서나 0.8m 이상, 호수 부두 옆(서남쪽 -1.15rad)은 넓은 모래 물굽이', async () => {
  const { sandWidth } = await import('../src/game/terrain.js');
  const pond = { id: 'pond', r: 4.5 }, lake = { id: 'lake', r: 6 };
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    assert.ok(sandWidth(pond, a) >= 0.8 && sandWidth(pond, a) <= 1.3, `연못 ${a.toFixed(2)}`);
  }
  assert.ok(sandWidth(lake, -1.15) > sandWidth(pond, -1.15) + 1.2, `물굽이 ${sandWidth(lake, -1.15)}`);
});
