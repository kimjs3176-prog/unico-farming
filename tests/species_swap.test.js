import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';

// 원본 몸이 늦게 왔을 때 바꾸기는 한 프레임에 하나만 (KOAT 담당 7명이 같은 프레임에 색을 만들면 휴대폰에서 끊김)
globalThis.fetch = async (url) => {
  const b = readFileSync(new URL(`../public/models/${String(url).replace(/^.*\/models\//, '')}`, import.meta.url));
  return { ok: true, arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) };
};
// 캔버스 2D 흉내: 쓰는 메서드가 늘어도(이름표 다시 그리기의 clearRect 등) 깨지지 않게 모르는 메서드는 빈 함수
const ctx2d = new Proxy({ createRadialGradient: () => ({ addColorStop() {} }), measureText: () => ({ width: 60 }) }, { get: (t, k) => (k in t ? t[k] : () => {}) });
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ctx2d }) };
const { Unico, loadUnicoMesh, PALETTES } = await import('../src/game/unico.js');

test('원본 몸 바꾸기: 한 프레임에 하나만, 다음 프레임에 나머지 (KOAT 팔레트 색은 받을 때 미리)', async () => {
  await loadUnicoMesh('unico_body_lod.bin', 'quad_lod');
  await loadUnicoMesh('unico_biped_lod.bin', 'biped_lod');
  PALETTES.koat_test = { body: 0xffffff, snout: 0xf7e1ec, mane: 0x4a90d9, maneD: 0x3b73ad, hoof: 0x376ca3 };
  const us = [new Unico(null, { palette: 'koat_test' }), new Unico(null, { palette: 'koat_desk' }), new Unico(null, { palette: 'merchant' })];
  for (const u of us) assert.ok(u._wantFull, '원본 전에는 저해상도');
  const me = new Unico(null, { rig: 'biped' });
  me.labelAlways = true; // 매 프레임 번호를 올리는 내 캐릭터
  const cam = new THREE.PerspectiveCamera(); cam.position.set(0, 1.4, 30); // 멀어서 저해상도로 보이는 중 → 바꿀 수 있음
  me.update(1 / 60, cam);
  let yields = 0;
  await loadUnicoMesh('unico_body.bin', 'quad', { yieldTo: async () => { yields++; } });
  assert.ok(yields >= 2, `KOAT 팔레트 색을 한가할 때 하나씩 (${yields})`);
  for (let f = 1; f <= 3; f++) {
    for (const u of us) u.update(1 / 60, cam);
    assert.equal(us.filter((u) => !u._wantFull).length, f, `${f}번째 프레임까지 ${f}명`);
    me.update(1 / 60, cam); // 다음 프레임
  }
  delete PALETTES.koat_test;
});
