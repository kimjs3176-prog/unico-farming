import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SURF, easeWet, enhanceMaterial } from '../src/game/surface.js';

test('젖음: 비가 오면 약 20초에 거의 젖고, 그치면 천천히(약 80초) 마름', () => {
  assert.equal(SURF.wet.value, 0, '처음엔 마른 상태');
  let w = 0;
  for (let t = 0; t < 20; t += 0.1) w = easeWet(w, 1, 0.1);
  assert.ok(w > 0.93, `20초 뒤 ${w.toFixed(3)}`);
  let w5 = 0;
  for (let t = 0; t < 5; t += 0.1) w5 = easeWet(w5, 1, 0.1);
  assert.ok(w5 > 0.3 && w5 < 0.8, '5초 만에 다 젖지는 않음');
  let d = 1;
  for (let t = 0; t < 20; t += 0.1) d = easeWet(d, 0, 0.1);
  assert.ok(d > 0.4, `마르는 건 느림: 20초 뒤 ${d.toFixed(3)}`);
  for (let t = 20; t < 80; t += 0.1) d = easeWet(d, 0, 0.1);
  assert.ok(d < 0.1, `80초 뒤 거의 마름 ${d.toFixed(3)}`);
  assert.equal(easeWet(0.5, 0.5, 1), 0.5);
  assert.ok(easeWet(0, 1, 1000) <= 1, '큰 dt 에도 넘치지 않음');
});

/** onBeforeCompile 을 가짜 셰이더 조각으로 돌려 주입된 코드를 봄 */
function compiled(kind, opts) {
  const m = enhanceMaterial(new THREE.MeshStandardMaterial(), kind, opts);
  const sh = {
    uniforms: {},
    vertexShader: '#include <begin_vertex>\n#include <project_vertex>',
    fragmentShader: 'void main(){\n#include <color_fragment>\n#include <roughnessmap_fragment>\n#include <emissivemap_fragment>\n}',
  };
  m.onBeforeCompile(sh, null);
  return sh;
}

test('젖음 셰이더: 같은 유니폼(SURF.wet)을 쓰고, 유니폼 분기 + 땅속 실내 방은 젖지 않음', () => {
  const sh = compiled('wood');
  assert.equal(sh.uniforms.uSurfWet, SURF.wet, '모든 재질이 같은 값을 봄 → 다시 컴파일 없음');
  assert.match(sh.fragmentShader, /if \(uSurfWet > 0\.001\)/);
  assert.match(sh.fragmentShader, /step\(-50\.0, vSW\.y\)/, '실내 방(y = -200)은 제외');
  assert.match(sh.fragmentShader, /roughnessFactor \*= 1\.0 - 0\.4 \* wetW/);
  // 젖음 계산이 거칠기보다 먼저 (같은 main 안에서 wetW 를 씀)
  const fs = sh.fragmentShader;
  assert.ok(fs.indexOf('float wetW') < fs.indexOf('roughnessFactor *='));
});

test('젖음 셰이더: 털(캐릭터·동물)은 젖지 않음', () => {
  const sh = compiled('fur', { contact: false, rim: 0.2 });
  assert.doesNotMatch(sh.fragmentShader, /uSurfWet > 0\.001/);
  assert.doesNotMatch(sh.fragmentShader, /roughnessFactor \*= 1\.0 - 0\.4/);
});
