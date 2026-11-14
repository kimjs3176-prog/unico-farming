import * as THREE from 'three';

/** 카메라 기본 세로 시야각 (가로 화면·데스크톱) */
export const BASE_FOV = 45;

/** 세로 화면: 가로 시야가 너무 좁아지지 않게 세로 시야각을 넓힘 (가로·세로의 중간으로 타협, 가장자리 왜곡 막으려 상한 64°) */
export function fovFor(aspect) {
  if (!(aspect < 1)) return BASE_FOV;
  const t = Math.tan(THREE.MathUtils.degToRad(BASE_FOV / 2)) / Math.sqrt(aspect);
  return THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(2 * Math.atan(t)), BASE_FOV, 64);
}

/**
 * 앱 전환 등으로 손 뗀 이벤트를 놓쳤을 때 눌린 채 남은 입력 정리
 * (조이스틱이 계속 걷게 하거나, 남은 시점 터치가 카메라·트랙터 시점 복귀를 막지 않게)
 */
export function releaseInput(I) {
  if (!I) return;
  if (typeof I.reset === 'function') return I.reset();
  I.keys?.clear(); I.pressed?.clear();
  if (I.clicks) I.clicks.length = 0;
  if (I.drag) { I.drag.active = false; I.drag.dx = I.drag.dy = 0; }
  I.down = null; I.wheel = 0; I.interactTap = false;
  I.touches?.clear(); I.tapStart?.clear(); I.pinch = null;
  if (I.virtual) I.virtual.x = I.virtual.y = 0;
  if (I.joy?.active || I.joy?.id != null) {
    if (typeof I._joyOff === 'function') I._joyOff();
    else { I.joy.active = false; I.joy.id = null; I.joy.x = I.joy.y = 0; I.onJoystick?.(false); }
  }
}

/** 줌 한 단계 배율 (＋/－ 버튼) */
export const ZOOM_STEP = 1.25;

/**
 * 기기별 카메라 기본값과 한계. 터치(폰·태블릿)는 화면이 작아 주변이 잘 안 보이므로 멀리·높이서 잡음
 *  - PC: 거리 9, 높이각 0.45 (예전 그대로), 줌 4~18
 *  - 터치 세로: 거리 15, 높이각 0.62 · 터치 가로: 거리 13, 높이각 0.55, 줌 5~24, 거의 내려다보는 각도(1.35)까지
 */
export function camDefaults({ touch = false, aspect = 1.6 } = {}) {
  if (!touch) return { distance: 9, pitch: 0.45, min: 4, max: 18, pitchMax: 1.2 };
  return aspect < 1 ? { distance: 15, pitch: 0.62, min: 5, max: 24, pitchMax: 1.35 } : { distance: 13, pitch: 0.55, min: 5, max: 24, pitchMax: 1.35 };
}

/** 줌 한 단계: dir > 0 이면 멀리, < 0 이면 가까이 (배율로 → 가까울수록 조금씩, 멀수록 크게), 한계 안으로 */
export function zoomStep(distance, dir, { min = 4, max = 18 } = {}) {
  const d = dir > 0 ? distance * ZOOM_STEP : distance / ZOOM_STEP;
  return THREE.MathUtils.clamp(+d.toFixed(2), min, max);
}

/** 저장해 둔 카메라 값(거리·높이각)을 한계 안으로. 잘못된 값이면 null */
export function savedCam(v, lim) {
  if (!v || !Number.isFinite(+v.distance) || !Number.isFinite(+v.pitch)) return null;
  return { distance: THREE.MathUtils.clamp(+v.distance, lim.min, lim.max), pitch: THREE.MathUtils.clamp(+v.pitch, 0.15, lim.pitchMax) };
}

/** 3인칭 추적 카메라 (드래그 회전 / 휠·두 손가락 줌 / 화면 버튼) */
export class FollowCamera {
  /** @param opts { touch, aspect, saved: { distance, pitch } } — 터치 기기는 멀리서 시작, 저장한 값이 있으면 그 값 */
  constructor(camera, opts = {}) {
    this.camera = camera;
    this.yaw = 0; // 카메라가 플레이어 남쪽(+Z)에서 북쪽(밭·장터 쪽)을 바라봄
    this.defaults = camDefaults(opts);
    const sv = savedCam(opts.saved, this.defaults);
    this.pitch = sv?.pitch ?? this.defaults.pitch;
    this.distance = sv?.distance ?? this.defaults.distance;
    this.target = new THREE.Vector3();
    this.smooth = new THREE.Vector3();
    this.first = true;
    this.lockTarget = null;
    this.lookOffsetY = 0; // 바라보는 높이 보정 (세로 폰 옷장: 유니코가 아래 창 위로 보이게 낮춤)
  }

  update(dt, input, targetPos) {
    if (input) {
      const L = this.defaults;
      if (input.drag.dx || input.drag.dy || input.wheel) {
        this.yaw -= input.drag.dx * 0.005;
        this.pitch = THREE.MathUtils.clamp(this.pitch + input.drag.dy * 0.004, 0.15, L.pitchMax);
        this.distance = THREE.MathUtils.clamp(this.distance + input.wheel * 0.01, L.min, L.max);
        this._changed();
      }
    }
    this.target.copy(targetPos);
    this.target.y += 1.1 + (this.lookOffsetY || 0);
    if (this.first) { this.smooth.copy(this.target); this.first = false; }
    this.smooth.lerp(this.target, 1 - Math.pow(0.001, dt));
    const off = (this._off ||= new THREE.Vector3()).set(
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

  /** ＋/－ 버튼: dir > 0 멀리, < 0 가까이 */
  zoom(dir) {
    this.distance = zoomStep(this.distance, dir, this.defaults);
    this._changed();
  }

  /** 🎥 버튼: 기본 거리·높이각으로, 캐릭터 뒤에서 (facing = 캐릭터가 보는 방향) */
  resetView(facing) {
    this.distance = this.defaults.distance;
    this.pitch = this.defaults.pitch;
    if (Number.isFinite(facing)) this.yaw = facing + Math.PI;
    this._changed();
  }

  /** 사람이 바꾼 거리·높이각을 저장하도록 알림 (onChange 는 main 이 연결, 1초에 한 번만) */
  _changed() {
    if (!this.onChange) return;
    clearTimeout(this._saveT);
    this._saveT = setTimeout(() => this.onChange({ distance: +this.distance.toFixed(2), pitch: +this.pitch.toFixed(3) }), 1000);
  }

  /** 카메라 기준 앞 방향(XZ) 과 오른쪽 */
  basis() {
    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    return { fwd, right };
  }
}
