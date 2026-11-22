import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { patchShadowChunk, shadowRadiusFor } from '../src/game/shadow_soft.js';

test('그림자 1탭 갈래: three 의 PCF 셰이더 조각에 끼워짐 (three 를 올려 모양이 바뀌면 여기서 알림)', () => {
  const chunks = { shadowmap_pars_fragment: THREE.ShaderChunk.shadowmap_pars_fragment };
  assert.equal(patchShadowChunk(chunks), true);
  const src = chunks.shadowmap_pars_fragment;
  assert.match(src, /if \( shadowRadius <= 1\.0 \) return mix\( 1\.0, texture\( shadowMap, shadowCoord\.xyz \), shadowIntensity \);/);
  // 1탭 갈래는 PCF getShadow 안, 5탭 원판보다 앞
  const pcf = src.indexOf('float getShadow( sampler2DShadow shadowMap');
  const one = src.indexOf('shadowRadius <= 1.0'), disk = src.indexOf('vogelDiskSample( 0, 5');
  assert.ok(pcf >= 0 && pcf < one && one < disk, '자리');
  assert.equal(patchShadowChunk(chunks), true, '두 번 불러도 한 번만');
  assert.equal(chunks.shadowmap_pars_fragment.split('shadowRadius <= 1.0').length, 2);
});

test('그림자 1탭 갈래: 모양이 다른 셰이더 조각은 건드리지 않음', () => {
  const chunks = { shadowmap_pars_fragment: 'void main(){}' };
  assert.equal(patchShadowChunk(chunks), false);
  assert.equal(chunks.shadowmap_pars_fragment, 'void main(){}');
});

test('그림자 반지름: 낮음 = 1탭, 보통·높음 = 5탭 반그림자', () => {
  assert.equal(shadowRadiusFor('low'), 1);
  assert.equal(shadowRadiusFor('medium'), 1, '보통도 1번 (내장 그래픽 부담)');
  assert.ok(shadowRadiusFor('high') > 1);
});
