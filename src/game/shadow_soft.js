// 그림자 경계 부드럽게 (계단 현상 줄이기)
//  three r182 의 PCF 그림자는 하드웨어 비교 샘플을 5번(노이즈로 돌린 원판) 읽음 → 모바일에는 무거움.
//  그래서 shadow.radius 가 1 이하면 '하드웨어 비교 1번'만 읽게 바꿈: 비용은 예전 Basic(1번 읽기)과 같고,
//  GPU 가 이웃 4칸을 섞어 주어(2×2 선형 비교) 칸 경계가 계단 대신 부드러운 비탈이 됨.
//  radius 가 1 보다 크면(보통·높음) 원래 5번 읽기 그대로 → 더 부드러운 반그림자. radius 는 uniform 이라 바꿔도 셰이더를 다시 만들지 않음
import * as THREE from 'three';

const NEEDLE = 'float phi = interleavedGradientNoise( gl_FragCoord.xy ) * 6.28318530718;'; // 배포용 three 는 주석이 빠져 있어 주석 없는 부분만 찾음
const ONE_TAP = 'if ( shadowRadius <= 1.0 ) return mix( 1.0, texture( shadowMap, shadowCoord.xyz ), shadowIntensity );\n\t\t\t\t';

/** ShaderChunk 문자열에 1탭 갈래를 끼움 (재질을 처음 컴파일하기 전에 한 번). 바꿨으면 true */
export function patchShadowChunk(chunks = THREE.ShaderChunk) {
  const src = chunks.shadowmap_pars_fragment;
  if (src.includes(ONE_TAP)) return true;
  if (!src.includes(NEEDLE)) return false; // three 버전이 바뀌어 모양이 다르면 그대로 둠 (5탭 PCF 로 그려짐)
  chunks.shadowmap_pars_fragment = src.replace(NEEDLE, ONE_TAP + NEEDLE);
  return true;
}

/** 품질 단계별 그림자 반지름: 낮음 = 1탭(1), 보통·높음 = 5탭 반그림자 */
export const shadowRadiusFor = (level) => (level === 'high' ? 2 : 1); // 5번 샘플 반그림자는 높음만 (보통·낮음은 하드웨어 비교 1번, 경계는 이미 부드러움)
