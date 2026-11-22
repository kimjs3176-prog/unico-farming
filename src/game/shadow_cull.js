// 그림자 그리는 물체 줄이기 (사양 최적화)
// - 모든 품질: 납작한 것(높이 0.12m 미만: 밭 흙·발판·깔개)은 그림자가 안 보이므로 그리지 않음
// - 낮음: 작은 것(세상 크기 반지름 0.45m 미만: 상자 손잡이·표지판 글판·탈것 부품 등)도 그림자를 그리지 않음
//   → 저사양 그림자 패스 드로우콜이 크게 줆. 캐릭터(유니코·주민·동물)는 Unico.setQuality 가 따로 정하므로 건드리지 않음
// 이 모듈이 끈 것만 userData._culled 로 표시해 품질을 올리면 되돌림 (다른 코드가 끈 그림자는 그대로). InstancedMesh(나무·풀 묶음)는 한 번에 그려 손대지 않음
import * as THREE from 'three';

const _s = new THREE.Vector3(), _box = new THREE.Box3();
export const SMALL_R = 0.45, FLAT_H = 0.12;

/** 캐릭터(유니코 몸) 안의 메시인가 */
function inCharacter(o) {
  for (let q = o; q; q = q.parent) if (q.userData?.unico) return true;
  return false;
}

/** 이 메시가 지금 품질에서 그림자를 그려야 하는가 (원래 castShadow 가 true 인 것만 물음) */
export function keepCaster(o, low) {
  const g = o.geometry;
  if (!g) return true;
  if (!g.boundingBox) g.computeBoundingBox();
  o.getWorldScale(_s);
  _box.copy(g.boundingBox);
  const h = (_box.max.y - _box.min.y) * Math.abs(_s.y);
  if (h < FLAT_H) return false;
  if (!low) return true;
  if (!g.boundingSphere) g.computeBoundingSphere();
  const r = g.boundingSphere.radius * Math.max(Math.abs(_s.x), Math.abs(_s.y), Math.abs(_s.z));
  return r >= SMALL_R;
}

/**
 * 장면 전체에 적용. low: 낮음 품질인가. 바꾼 메시 수를 돌려줌
 * 새로 생긴 물체(꾸미기·건설)도 잡히도록 품질을 바꿀 때와 가끔(game_gfx) 다시 부름
 */
export function cullShadowCasters(root, low) {
  let changed = 0;
  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh) return;
    const culled = !!o.userData._culled;
    if (!o.castShadow && !culled) return; // 다른 코드가 끈 것은 건드리지 않음
    if (inCharacter(o)) return;
    const want = keepCaster(o, low);
    if (!want && o.castShadow) { o.castShadow = false; o.userData._culled = true; changed++; }
    else if (want && culled) { o.castShadow = true; o.userData._culled = false; changed++; } // 품질을 올리면 이 모듈이 끈 것만 되돌림
  });
  return changed;
}
