import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// 나중 받기 (loadDeferred): 동물 모델 완료(deferredDone)는 캐릭터 원본 몸을 기다리지 않음, 원본 몸은 가까운 주민부터
const asked = [];
globalThis.fetch = async (url) => {
  const f = String(url).replace(/^.*\/models\//, '');
  asked.push(f);
  await new Promise((r) => setTimeout(r, 30)); // 느린 망
  const b = readFileSync(new URL(`../public/models/${f}`, import.meta.url));
  return { ok: true, arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) };
};
// 캔버스 2D 흉내: 쓰는 메서드가 늘어도(이름표 다시 그리기의 clearRect 등) 깨지지 않게 모르는 메서드는 빈 함수
const ctx2d = new Proxy({ createRadialGradient: () => ({ addColorStop() {} }), measureText: () => ({ width: 60 }) }, { get: (t, k) => (k in t ? t[k] : () => {}) });
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ctx2d }) };

const { Assets, DEFERRED_MODELS } = await import('../src/game/assets.js');
const { Unico, loadUnicoMesh } = await import('../src/game/unico.js');
const { SPECIES_IDS } = await import('../src/game/species.js');

test('나중 받기: 동물 모델은 묶음 순서대로 끝나면 deferredDone, 원본 몸은 따로 나란히 (가까운 주민부터), 여러 번 불러도 한 번', async () => {
  for (const sp of SPECIES_IDS) await loadUnicoMesh(`villager_${sp}_lod.bin`, `v_${sp}_lod`);
  await loadUnicoMesh('unico_body_lod.bin', 'quad_lod');
  asked.length = 0;
  const a = new Assets(), order = [];
  a._loadAnimated = async (n) => { order.push(n); };
  const p1 = a.loadDeferred({ x: -14, z: -3 }), p2 = a.loadDeferred();
  assert.equal(p1, p2, '한 번만');
  await p1;
  assert.equal(a.deferredDone, true);
  assert.deepEqual(order, DEFERRED_MODELS.flat(), '동물 모델 전부, 순서대로');
  assert.ok(!a.skinsDone, '원본 몸(느린 망)을 기다리지 않고 끝남');
  // 연구원 너구리 근처에서 시작 → 너구리 원본부터
  const raccoon = new Unico(null, { species: 'raccoon' });
  assert.ok(raccoon._wantFull, '원본 전에는 저해상도');
  await a._deferredSkins;
  assert.equal(a.skinsDone, true);
  const bins = asked.filter((f) => /^(villager_|unico_body)/.test(f));
  assert.equal(bins[0], 'villager_raccoon.bin', `처음 받은 원본: ${bins.join(', ')}`);
  for (const f of ['villager_fox.bin', 'villager_cat.bin', 'villager_bear.bin', 'unico_body.bin']) assert.ok(bins.includes(f), f);
  // 종 몸 색은 받을 때 미리 만들어 둠 → 교체 프레임에는 만들 것 없음, 슬롯 가중치는 버림
  const u = new Unico(null, { species: 'raccoon' });
  assert.ok(!u._wantFull);
  assert.ok(u.skin.geometry.attributes.color.array instanceof Uint16Array);
  const cam = new (await import('three')).PerspectiveCamera();
  cam.position.set(0, 1.4, 30); // 멀어서 저해상도로 보이는 동안 교체
  raccoon.update(1 / 60, cam);
  assert.equal(raccoon.skin.geometry, u.skin.geometry, '늦게 온 원본으로 바꿀 때 미리 만든 지오메트리를 그대로');
});

test('품질 낮음(휴대폰): 꼬마 토끼 원본은 첫 화면에서 빼고 나중 받기 맨 앞에, 받기는 한꺼번에 시작', async () => {
  asked.length = 0;
  const a = new Assets();
  a._lateRabbit = true;
  await a._loadDeferredSkins({ x: 25, z: -24 }); // KOAT 근처에서 시작해도 토끼가 먼저
  const bins = asked.filter((f) => /^(villager_|unico_body)/.test(f));
  assert.equal(bins[0], 'villager_rabbit.bin', bins.join(', '));
  assert.equal(bins[1], 'unico_body.bin', '그다음은 가까운 순');
  assert.equal(bins.length, 6, '원본 6개를 한 번씩');
  assert.equal(a.skinsDone, true);
});
