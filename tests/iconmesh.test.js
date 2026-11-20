// 아이템 아이콘 메시(src/game/iconmesh/) · 물고기 생김새(fishmesh.js LOOK) 검사
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ITEMS } from '../src/game/sim/items.js';
import { makeFish, showLength, FISH_LOOK } from '../src/game/fishmesh.js';
import { iconCats, iconBuilder } from '../src/game/iconmesh/index.js';

/** 정점이 모두 유한하고 크기가 적당한지 (월드 좌표) */
function checkMesh(obj, label) {
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3(), v = new THREE.Vector3();
  let meshes = 0;
  obj.traverse((o) => {
    if (!o.isMesh) return;
    meshes++;
    const p = o.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      assert.ok(Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z), `${label}: NaN 정점`);
      box.expandByPoint(v.applyMatrix4(o.matrixWorld));
    }
    const c = o.geometry.attributes.color;
    if (c) for (let i = 0; i < c.array.length; i++) assert.ok(Number.isFinite(c.array[i]), `${label}: NaN 색`);
  });
  assert.ok(meshes > 0, `${label}: 메시 없음`);
  const s = box.getSize(new THREE.Vector3());
  assert.ok(Math.max(s.x, s.y, s.z) > 0.05 && Math.max(s.x, s.y, s.z) < 4, `${label}: 크기 이상 ${s.toArray().map((x) => x.toFixed(2))}`);
}

test('물고기 LOOK 이 28종 모두를 덮음 (붕어로 대체되는 종 없음)', () => {
  const fish = Object.keys(ITEMS).filter((k) => ITEMS[k].cat === 'fish');
  assert.equal(fish.length, 28);
  for (const k of fish) assert.ok(FISH_LOOK[k], `${k} 생김새 없음`);
});

test('makeFish: 모든 종이 꼬리(흔들 부분)·정리 함수를 가지고 크기는 len 을 따름', () => {
  for (const id of Object.keys(FISH_LOOK)) {
    const f = makeFish(id, showLength(id, 30));
    assert.ok(f.userData.tail?.isObject3D, `${id}: tail 없음`);
    assert.equal(typeof f.userData.dispose, 'function');
    checkMesh(f, id);
    f.userData.dispose();
  }
  // 예전 호출(모르는 id)도 그대로 붕어 모양
  const x = makeFish('fish_unknown', 0.4);
  assert.ok(x.userData.tail);
});

test('makeFish: 같은 종을 여러 번 만들어도 지오메트리는 공유 (낚을 때마다 새로 만들지 않음)', () => {
  const geos = (f) => { const s = new Set(); f.traverse((o) => o.isMesh && s.add(o.geometry)); return s; };
  for (const id of ['fish_sturgeon', 'fish_crayfish', 'fish_catfish']) {
    const a = geos(makeFish(id, 0.5)), b = geos(makeFish(id, 0.5));
    for (const g of b) assert.ok(a.has(g), `${id}: 지오메트리가 매번 새로 생김`);
  }
});

test('아이콘 메시: 굽는 분류의 모든 아이템이 크기 있고 NaN 없는 메시 (코스튬·꾸미기는 브라우저 전용이라 제외)', async () => {
  const cats = iconCats();
  for (const cat of ['fish', 'bug', 'fruit', 'goods', 'ranch', 'treasure', 'rice', 'seed', 'crop', 'product', 'feed']) {
    assert.ok(cats[cat]?.length, `${cat} 분류 비어 있음`);
    for (const k of cats[cat]) {
      const obj = await iconBuilder(k, cat)();
      assert.ok(obj, `${cat}/${k}: 만드는 함수 없음`);
      checkMesh(obj, `${cat}/${k}`);
    }
  }
});

test('아이콘 열쇠: ITEMS 전부 + 작물·생산물·사료·코스튬·꾸미기, 서로 겹치지 않음', () => {
  const cats = iconCats();
  const all = Object.values(cats).flat();
  assert.equal(new Set(all).size, all.length);
  for (const k of Object.keys(ITEMS)) assert.ok(all.includes(k), k);
  assert.ok(cats.costume.every((k) => k.startsWith('costume:')));
  assert.ok(cats.decor.every((k) => k.startsWith('decor:')));
});

const FISH_DRAW_MAX = 8; // 낚은 물고기 들어 보이기: 예전(6~8번)보다 그리기 횟수가 늘지 않게
test(`makeFish: 지느러미·눈·다리를 재질별로 합쳐 한 마리 그리기 ${FISH_DRAW_MAX}번 이하 (휴대폰 낮음 포함)`, () => {
  for (const lvl of ['high', 'low']) {
    globalThis.game = { quality: { level: lvl } };
    try {
      for (const id of Object.keys(FISH_LOOK)) {
        let n = 0;
        makeFish(id, 0.4).traverse((o) => { if (o.isMesh) n++; });
        assert.ok(n <= FISH_DRAW_MAX, `${lvl}/${id}: ${n}번`);
      }
    } finally { delete globalThis.game; }
  }
});
