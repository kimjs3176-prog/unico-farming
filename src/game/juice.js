/**
 * 게임 필(juice) 헬퍼 — vendored skill `game-feel` 의 패턴 적용
 * - 화면 흔들림: 트라우마(쌓였다 줄어듦) → 카메라 기준 작은 회전·이동 (줌과 무관하게 같은 크기로 보임)
 * - 카메라 밀림(kick): 충격 순간 짧게 툭 밀렸다 돌아옴 (호미질·쫓기·챔질 같은 가벼운 손맛)
 * - 팝: 눌림 → 늘어남 → 출렁이며 제자리 (부피 유지), 대상마다 하나만 — 겹쳐도 원래 크기로 정확히 돌아옴
 * - 히트스톱: 내 캐릭터의 동작 시간만 잠깐 느리게 (세상은 그대로)
 * - 움직임 줄이기 설정(prefers-reduced-motion)·screenShake=false 면 흔들림·밀림·시야 펀치를 끔 (팝·히트스톱은 그대로)
 */
import * as THREE from 'three';

/** 손맛 등급: 1 가벼움(호미질·챔질·쫓기) 2 중간(큰 작물·줄 끊김·집 넓히기) 3 큼(트랙터 충돌) */
export const TIERS = {
  1: { kick: 0.06, trauma: 0, stop: 0.035, fov: 0 },
  2: { kick: 0.1, trauma: 0.3, stop: 0.06, fov: 0 },
  3: { kick: 0, trauma: 0.6, stop: 0.09, fov: -2 },
};

/** 팝 세로 배율 (u 0..1 진행, a 세기): 눌림(0~18%) → 늘어남(18~45%) → 감쇠 출렁임으로 정확히 1 */
export function popCurve(u, a) {
  if (u >= 1) return 1;
  if (u < 0.18) return 1 - 0.6 * a * Math.sin((u / 0.18) * Math.PI * 0.5);
  if (u < 0.45) { const k = (u - 0.18) / 0.27, e = k * k * (3 - 2 * k); return 1 - 0.6 * a + 1.1 * a * e; }
  const k = (u - 0.45) / 0.55;
  return 1 + 0.5 * a * Math.cos(k * Math.PI * 2.5) * (1 - k) * (1 - k);
}

/** 밀림 세기 0..1 (t 초): 약 50ms 만에 밀리고 약 160ms 동안 부드럽게 돌아옴 */
export function kickEnvelope(t) {
  if (t < 0 || t >= 0.21) return 0;
  if (t < 0.05) return Math.sin((t / 0.05) * Math.PI * 0.5);
  const k = (t - 0.05) / 0.16;
  return (1 - k) * (1 - k) * (1 + 2 * k);
}

let rmq = null;
/** 움직임 줄이기 설정 */
export function reducedMotion() {
  try { return typeof matchMedia !== 'undefined' && (rmq ||= matchMedia('(prefers-reduced-motion: reduce)')).matches; } catch { return false; }
}

// 진동(햅틱): 안드로이드 등 navigator.vibrate 가 있는 기기만 (iPhone 은 없음 → 조용히 무시)
const HAPTIC_KEY = 'unico.haptics';
/** 이 기기가 진동을 낼 수 있나 */
export function canVibrate(nav = typeof navigator !== 'undefined' ? navigator : null) {
  return !!nav && typeof nav.vibrate === 'function';
}
/** 진동 설정 (기본 켜짐, 소리 설정처럼 이 브라우저에 따로 저장 — 그래픽 설정과 섞지 않음) */
export const hapticPrefs = {
  get() { try { return globalThis.localStorage?.getItem(HAPTIC_KEY) !== '0'; } catch { return true; } },
  set(on) { try { globalThis.localStorage?.setItem(HAPTIC_KEY, on ? '1' : '0'); } catch { /* 저장 못 해도 이번 판은 그대로 */ } },
};

const _v = new THREE.Vector3(), _r = new THREE.Vector3(), _u = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler();

export class Juice {
  constructor() {
    this.trauma = 0;
    this.pops = [];
    this.t = 0;
    this.offset = new THREE.Vector3();
    this.screenShake = true; // 설정에서 끌 수 있음 (흔들림·밀림·시야 펀치)
    this._kick = null; // { dir|null, m, t }
    this._fov = null; // { d, t }
    this._applied = null; // 지난 프레임에 카메라에 더한 값 (카메라를 아무도 다시 놓지 않았으면 되돌림)
  }

  /**
   * 짧은 진동 (ms 또는 [진동, 쉼, 진동…]). 설정이 꺼졌거나 오토플레이 중이면 생략
   * 계약: 터치 버튼 상호작용 8 · 수확·낚기 15 · 입질 [10, 40, 20]
   */
  haptic(p = 8, nav = typeof navigator !== 'undefined' ? navigator : null) {
    if (!canVibrate(nav) || !hapticPrefs.get() || globalThis.game?.autoplay?.on) return false;
    try { return nav.vibrate(p) !== false; } catch { return false; }
  }

  /** 흔들림·밀림을 써도 되나 */
  get motionOk() { return this.screenShake !== false && !reducedMotion(); }

  /**
   * 화면 흔들림 (예전 호출 그대로 씀). 0.2 미만은 가벼운 손맛(카메라 밀림 + 짧은 멈칫)으로,
   * 그 이상은 트라우마로 쌓임 (여러 충격이 겹치면 누적, 최대 1).
   * 멈칫은 내 캐릭터가 한 동작(호미질·챔질·짓기)일 때만: 다른 캐릭터·주변 사건이면 opts.stop=false, opts.actor 로 멈칫할 캐릭터 지정
   */
  shake(amount, opts = {}) {
    if (!(amount > 0)) return;
    if (amount < 0.2) {
      this.kick(null, 0.04 + amount * 0.2);
      if (opts.stop !== false) this.hitStop(TIERS[1].stop, opts.actor);
      return;
    }
    if (this.motionOk) this.trauma = Math.min(1, this.trauma + amount);
  }

  /** 카메라를 dir(월드 방향, 없으면 화면 아래) 쪽으로 m 미터 툭 밀었다 되돌림. 더 센 밀림이 오면 바꿈 */
  kick(dir = null, m = 0.06) {
    if (!this.motionOk || !(m > 0)) return;
    const k = this._kick;
    if (k && k.t < 0.05 && k.m >= m) return; // 이미 더 세게 밀리는 중
    this._kick = { dir: dir ? dir.clone().normalize() : null, m, t: 0 };
  }

  /** 히트스톱: actor(없으면 내 캐릭터)의 동작 시간만 s 초 동안 느리게 */
  hitStop(s = 0.035, actor = null) {
    const u = actor ?? globalThis.game?.player?.unico;
    u?.hitStop?.(s);
  }

  /**
   * 등급별 손맛 한 번에: tier 1 가벼움 · 2 중간 · 3 큼. pos(월드, 선택)는 충격 위치 — 밀림이 그쪽으로 살짝 기움
   * opts.stop=false 면 히트스톱 없음 (천둥처럼 내 동작과 무관한 충격), opts.actor 로 멈칫할 캐릭터 지정
   */
  feedback(tier = 1, pos = null, opts = {}) {
    const T = TIERS[tier] || TIERS[1];
    if (T.kick) {
      let dir = null;
      const cam = globalThis.game?.camera;
      if (pos && cam) {
        // 화면 아래 + 충격 쪽으로 조금 (좌우)
        _r.setFromMatrixColumn(cam.matrixWorld, 0);
        const side = Math.sign(_v.copy(pos).sub(cam.position).dot(_r)) * 0.35;
        dir = _u.setFromMatrixColumn(cam.matrixWorld, 1).negate().addScaledVector(_r, side).clone();
      }
      this.kick(dir, T.kick);
    }
    if (T.trauma && this.motionOk) this.trauma = Math.min(1, this.trauma + T.trauma);
    if (T.fov && this.motionOk) this._fov = { d: T.fov, t: 0 };
    if (T.stop && opts.stop !== false) this.hitStop(T.stop, opts.actor);
  }

  /**
   * 오브젝트를 눌렀다 늘였다 원래 크기로 (부피 유지). 대상마다 하나만: 진행 중이면 처음부터 다시, 세기는 더 큰 쪽.
   * userData.popTarget 이 있으면 그것을 (캐릭터: 이름표가 붙은 group 대신 몸 root)
   */
  pop(obj, amount = 0.25, duration = 0.35) {
    if (!obj) return;
    obj = obj.userData?.popTarget || obj;
    const cur = obj.userData.pop;
    if (cur) { cur.t = 0; cur.amount = Math.max(cur.amount, amount); cur.duration = Math.max(cur.duration, duration); return; }
    const p = { obj, amount, duration, t: 0, base: obj.scale.clone(), last: null };
    obj.userData.pop = p;
    this.pops.push(p);
  }

  update(dt, camera) {
    this.t += dt;
    if (camera) this._camera(dt, camera);
    for (let i = this.pops.length - 1; i >= 0; i--) {
      const p = this.pops[i], s = p.obj.scale;
      // 다른 코드가 이번 프레임에 크기를 새로 정했으면(목장 새끼 성장 등) 그 값을 새 기준으로 — 오래된 크기로 되돌리지 않음
      if (p.last && !s.equals(p.last)) p.base.copy(s);
      p.t += dt;
      const u = Math.min(1, p.t / p.duration);
      if (u >= 1) {
        s.copy(p.base);
        delete p.obj.userData.pop;
        this.pops.splice(i, 1);
        continue;
      }
      const sy = popCurve(u, p.amount), sx = 1 / Math.sqrt(sy);
      s.set(p.base.x * sx, p.base.y * sy, p.base.z * sx);
      (p.last ||= new THREE.Vector3()).copy(s);
    }
  }

  /** 카메라 흔들림·밀림·시야 펀치 (따라가기·연출 카메라가 이번 프레임 자리를 정한 뒤) */
  _camera(dt, camera) {
    // 지난 프레임에 더한 것: 그 뒤 아무도 카메라를 다시 놓지 않았으면 먼저 되돌림 (쌓이지 않게)
    const A = this._applied;
    if (A) {
      if (camera.position.equals(A.pos) && camera.quaternion.equals(A.quat)) { camera.position.copy(A.pos0); camera.quaternion.copy(A.quat0); }
      if (A.fov && camera.fov === A.fovNow) { camera.fov -= A.fov; camera.updateProjectionMatrix(); }
      else if (A.fov) camera.updateProjectionMatrix();
      this._applied = null;
    }
    const ok = this.motionOk;
    if (!ok) { this.trauma = 0; this._kick = null; this._fov = null; }
    const k = this.trauma ** 1.5;
    const kick = this._kick;
    let fovD = 0;
    if (this._fov) {
      const f = this._fov;
      f.t += dt;
      const cine = globalThis.game?.cinema?.locked;
      if (f.t >= 0.15) this._fov = null;
      else if (!cine) fovD = f.d * Math.sin((f.t / 0.15) * Math.PI);
    }
    if (k <= 0 && !kick && !fovD) return;
    const pos0 = camera.position.clone(), quat0 = camera.quaternion.clone();
    const dist = globalThis.game?.followCam?.curDist ?? 9;
    camera.updateMatrixWorld();
    _r.setFromMatrixColumn(camera.matrixWorld, 0);
    _u.setFromMatrixColumn(camera.matrixWorld, 1);
    if (k > 0) {
      // 부드러운 노이즈: 회전(위아래·좌우 최대 0.6°·k) + 화면 기준 이동(거리 × 1.2%·k) + 아주 작은 기울기
      const n = (s, o) => Math.sin(this.t * 31 * s + o) * Math.cos(this.t * 17 * s + s);
      const deg = THREE.MathUtils.DEG2RAD * 0.6 * k;
      _e.set(n(1.1, 0.3) * deg, n(0.9, 1.7) * deg, n(1.3, 2.9) * deg * 0.5, 'YXZ');
      camera.quaternion.multiply(_q.setFromEuler(_e));
      const tr = dist * 0.012 * k;
      camera.position.addScaledVector(_r, n(1.3, 0) * tr).addScaledVector(_u, n(0.8, 4.1) * tr);
      this.trauma = Math.max(0, this.trauma - dt * 1.6);
    }
    if (kick) {
      kick.t += dt;
      const e = kickEnvelope(kick.t);
      if (kick.t >= 0.21) this._kick = null;
      else {
        const dir = kick.dir ?? _v.copy(_u).negate();
        camera.position.addScaledVector(dir, kick.m * e * (dist / 9));
      }
    }
    this.offset.copy(camera.position).sub(pos0);
    let fovApplied = 0;
    if (fovD) { camera.fov += fovD; fovApplied = fovD; camera.updateProjectionMatrix(); }
    camera.updateMatrixWorld();
    this._applied = { pos0, quat0, pos: camera.position.clone(), quat: camera.quaternion.clone(), fov: fovApplied, fovNow: camera.fov };
  }
}
