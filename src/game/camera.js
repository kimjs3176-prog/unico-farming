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

/**
 * 앞쪽 내다보기 (걷는 방향의 땅을 더 보여 줌, 카메라 기준 m)
 *  - 카메라 쪽으로(화면 아래로) 걸을 때 가장 많이: 속도 × 0.35, 최대 1.6m
 *  - 카메라에서 멀어질 때는 조금: 속도 × 0.10, 최대 0.5m (자전거처럼 빠르면 1.2m 까지 조금 더)
 *  - 옆으로: 속도 × 0.12, ±0.6m
 *  - 커질 때 2.0/s, 줄어들 때 1.4/s 로 부드럽게
 */
export const LEAD = { toward: 0.35, towardMax: 1.6, away: 0.10, awayMax: 0.5, awayFastMax: 1.2, side: 0.12, sideMax: 0.6, grow: 2.0, shrink: 1.4 };
/** 이보다 빠른 위치 변화(m/s)는 순간이동으로 봄 (내다보기를 지움) */
const LEAD_JUMP = 25;

/** 걷는 속도 → 원하는 내다보기 (vf: 카메라에서 멀어지는 쪽 +, vr: 오른쪽 +) → [앞뒤, 옆] */
export function leadWant(vf, vr) {
  const f = vf < 0
    ? Math.max(vf * LEAD.toward, -LEAD.towardMax)
    : Math.min(vf * LEAD.away, Math.min(LEAD.awayFastMax, LEAD.awayMax + Math.max(0, vf - 5) * 0.15));
  const r = THREE.MathUtils.clamp(vr * LEAD.side, -LEAD.sideMax, LEAD.sideMax);
  return [f, r];
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
    this.smooth = new THREE.Vector3(); // 내다보기 없는 따라가기 점 (시야 구멍·그림자·컷신이 씀)
    this.lead = new THREE.Vector3();   // 걷는 방향 내다보기 (XZ)
    this.look = new THREE.Vector3();   // 실제로 바라보는 점 = smooth + lead
    this.vel = new THREE.Vector3();    // 따라가는 대상의 속도 (위치 변화로 잼)
    this._prev = new THREE.Vector3();
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
    if (this.first) { this.smooth.copy(this.target); this.lead.set(0, 0, 0); this.vel.set(0, 0, 0); this._prev.copy(targetPos); this.first = false; }
    this.smooth.lerp(this.target, 1 - Math.pow(0.001, dt));
    this._updateLead(dt, input, targetPos);
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
    this.look.copy(this.smooth).add(this.lead);
    this.camera.position.copy(this.look).add(off);
    this.camera.lookAt(this.look);
  }

  /** 내다보기: 창·컷신(input 없음)·바라보는 높이 보정 중에는 0 으로 돌아감 */
  _updateLead(dt, input, targetPos) {
    const v = this.vel;
    if (dt > 0) {
      const ix = (targetPos.x - this._prev.x) / dt, iz = (targetPos.z - this._prev.z) / dt;
      if (Math.hypot(ix, iz) > LEAD_JUMP) { v.set(0, 0, 0); this.lead.set(0, 0, 0); }
      else { const a = 1 - Math.exp(-dt * 10); v.x += (ix - v.x) * a; v.z += (iz - v.z) * a; }
    }
    this._prev.copy(targetPos);
    let wx = 0, wz = 0;
    if (input && !this.lookOffsetY) {
      const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw); // 카메라 앞(fwd) = (-sy, -cy), 오른쪽 = (cy, -sy)
      const vf = -v.x * sy - v.z * cy, vr = v.x * cy - v.z * sy;
      const [f, r] = leadWant(vf, vr);
      wx = -sy * f + cy * r; wz = -cy * f - sy * r;
    }
    const grow = wx * wx + wz * wz > this.lead.x * this.lead.x + this.lead.z * this.lead.z;
    const a = 1 - Math.exp(-dt * (grow ? LEAD.grow : LEAD.shrink));
    this.lead.x += (wx - this.lead.x) * a;
    this.lead.z += (wz - this.lead.z) * a;
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
