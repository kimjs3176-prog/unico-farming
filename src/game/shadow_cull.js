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

/** 이 메시가 지금 품질에서 그림자를 그려야 하는가 (원래 castShadow 가 true 인 것만 물음)
 *  크기는 세상 좌표 상자로 잼 (회전 포함: 눕혀 만든 뒤 세운 판자·바퀴도 제 높이로) */
export function keepCaster(o, low) {
  const g = o.geometry;
  if (!g) return true;
  if (!g.boundingBox) g.computeBoundingBox();
  _box.copy(g.boundingBox).applyMatrix4(o.matrixWorld);
  const h = _box.max.y - _box.min.y;
  if (h < FLAT_H) return false;
  if (!low) return true;
  _box.getSize(_s);
  return Math.max(_s.x, _s.y, _s.z) / 2 >= SMALL_R;
}

/** 회전·크기 표시 (위치 빼고): 공사 중 자라는 건물·튀어나오는 소품처럼 모양이 바뀌면 달라짐 → 다시 판단 */
function shapeSig(o) {
  const e = o.matrixWorld.elements;
  return Math.round((e[0] * 1 + e[1] * 3 + e[2] * 5 + e[4] * 7 + e[5] * 11 + e[6] * 13 + e[8] * 17 + e[9] * 19 + e[10] * 23) * 1000);
}

/**
 * 장면 전체에 적용. low: 낮음 품질인가. 바꾼 메시 수를 돌려줌
 * 새로 생긴 물체(꾸미기·건설)도 잡히도록 품질을 바꿀 때와 가끔(game_gfx) 다시 부름
 */
export function cullShadowCasters(root, low) {
  let changed = 0;
  root.updateMatrixWorld?.(); // 세상 좌표로 재므로 행렬을 맞춰 둠
  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh) return;
    const culled = !!o.userData._culled;
    if (!o.castShadow && !culled) return; // 다른 코드가 끈 것은 건드리지 않음
    const ud = o.userData, sig = shapeSig(o);
    if (ud._csFor === low && ud._csSig === sig) return; // 이 품질·이 모양으로 이미 판단함 (8초마다 다시 돌 때 새것·모양이 바뀐 것만 계산)
    ud._csFor = low; ud._csSig = sig;
    if (inCharacter(o)) return;
    const want = keepCaster(o, low);
    if (!want && o.castShadow) { o.castShadow = false; o.userData._culled = true; changed++; }
    else if (want && culled) { o.castShadow = true; o.userData._culled = false; changed++; } // 품질을 올리면 이 모듈이 끈 것만 되돌림
  });
  return changed;
}
