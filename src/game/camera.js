import * as THREE from 'three';

/** 3인칭 추적 카메라 (드래그 회전 / 휠 줌) */
export class FollowCamera {
  constructor(camera) {
    this.camera = camera;
    this.yaw = 0; // 카메라가 플레이어 남쪽(+Z)에서 북쪽(밭·장터 쪽)을 바라봄
    this.pitch = 0.45;
    this.distance = 9;
    this.target = new THREE.Vector3();
    this.smooth = new THREE.Vector3();
    this.first = true;
    this.lockTarget = null;
  }

  update(dt, input, targetPos) {
    if (input) {
      this.yaw -= input.drag.dx * 0.005;
      this.pitch = THREE.MathUtils.clamp(this.pitch + input.drag.dy * 0.004, 0.15, 1.2);
      this.distance = THREE.MathUtils.clamp(this.distance + input.wheel * 0.01, 4, 18);
    }
    this.target.copy(targetPos).add(new THREE.Vector3(0, 1.1, 0));
    if (this.first) { this.smooth.copy(this.target); this.first = false; }
    this.smooth.lerp(this.target, 1 - Math.pow(0.001, dt));
    const off = new THREE.Vector3(
      Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      Math.cos(this.yaw) * Math.cos(this.pitch),
    ).multiplyScalar(this.distance);
    // 가리는 물체가 있어도 카메라를 당기지 않음 → 물체 쪽에서 시야 구멍(surface.js)으로 비춰 보임.
    // 휠 줌만 부드럽게 따라감
    const want = this.distance;
    this.curDist = this.curDist === undefined ? want : this.curDist + (want - this.curDist) * Math.min(1, dt * 8);
    off.setLength(this.curDist);
    this.camera.position.copy(this.smooth).add(off);
    this.camera.lookAt(this.smooth);
  }

  /** 카메라 기준 앞 방향(XZ) 과 오른쪽 */
  basis() {
    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    return { fwd, right };
  }
}
