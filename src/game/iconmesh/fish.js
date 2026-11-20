import * as THREE from 'three';
import { makeFish, FISH_LOOK } from '../fishmesh.js';

/**
 * 물고기 아이콘용 메시: 게임에서 쓰는 makeFish 그대로 (생김새는 fishmesh.js LOOK)
 *  - 아이콘 카메라(앞·조금 위)에서 옆모습이 보이게 머리를 오른쪽 앞으로 살짝 돌림
 */
export const FISH_ICON_KEYS = Object.keys(FISH_LOOK);

export function fishIcon(id) {
  if (!FISH_LOOK[id]) return null;
  const L = FISH_LOOK[id];
  const f = makeFish(id, 1);
  if (L.shape === 'snail' || L.shape === 'turtle') { f.rotation.y = 0.55; return f; } // 기는 것: 비스듬히 위에서
  // 헤엄치는 것·새우·가재: 옆모습 3/4, 칸을 넓게 쓰게 머리를 오른쪽 위로 비스듬히 (긴 몸일수록 더)
  f.rotation.set(0, L.shape ? 0.45 : 0.32, 0);
  const tilt = new THREE.Group();
  tilt.rotation.z = L.shape === 'crayfish' ? 0.35 : L.shape === 'shrimp' ? 0.15 : (L.long || 1) > 1.4 ? 0.62 : 0.38;
  tilt.add(f);
  tilt.userData.dispose = f.userData.dispose;
  return tilt;
}
