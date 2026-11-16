import * as THREE from 'three';
import { Unico } from './unico.js';
import { DEADZONE, RUN_ON, runBand } from './input.js';

// 걷기·달리기 속도(m/s, 속도 배율 전). 짧은 다리라 걷기는 종종걸음, 달리기는 발이 공중에 뜨는 뜀박질 (unico.js bipedGait)
export const WALK_SPEED = 1.9, RUN_SPEED = 4.6, SWIM_SPEED = 2.4;
/** 점프: 처음 속도(m/s)·중력(m/s²) → 높이 약 0.9m, 공중 약 0.6초 */
export const JUMP_V = 6.0, GRAVITY = 20;

/** 점프 한 걸음 (순수 함수): { y, v } 를 dt 만큼 진행. 땅(0)에 닿으면 landed.
 *  등가속도 공식(y += v·dt − ½g·dt²) 그대로 → 프레임이 끊기는 폰에서도 높이·공중 시간이 같음 */
export function jumpStep(y, v, dt) {
  y += v * dt - 0.5 * GRAVITY * dt * dt;
  v -= GRAVITY * dt;
  if (y <= 0) return { y: 0, v: 0, landed: true };
  return { y, v, landed: false };
}
/** 탭·클릭 이동: 남은 거리가 이만큼 안이면 걷기 속도까지 줄이며 다가감 (가까운 곳은 걸어서) */
export const ARRIVE_WALK = 2.5;
/** 살짝 기울였을 때 가장 느린 걸음 (m/s) */
export const CREEP_SPEED = 0.9;

/**
 * 이동 막대 기울기 m(0..1) → { run, speed } (속도 배율 전)
 * 데드존 안은 0(달리기 기억도 지움), 기울인 만큼 0.9→1.9 로 천천히~걷기, 끝까지(0.6 이상) 기울이면 달리기 — 달리다가는 0.45 아래로 내려야 걷기. walkKey(Shift)면 늘 걷기
 */
export function stickSpeed(m, wasRun = false, walkKey = false) {
  if (!(m >= DEADZONE)) return { run: false, speed: 0 };
  const run = runBand(m, wasRun) && !walkKey;
  if (run) return { run, speed: RUN_SPEED };
  const k = Math.min(1, (m - DEADZONE) / (RUN_ON - DEADZONE)), e = k * k * (3 - 2 * k);
  return { run, speed: CREEP_SPEED + (WALK_SPEED - CREEP_SPEED) * e };
}

/** 탭·클릭 이동의 남은 거리 rem(m) → 목표 속도: 2.5m 밖은 달리기, 0.5m 안은 걷기, 그 사이는 서서히 */
export function arriveSpeed(rem) {
  const k = Math.min(1, Math.max(0, (rem - 0.5) / (ARRIVE_WALK - 0.5)));
  return WALK_SPEED + (RUN_SPEED - WALK_SPEED) * k;
}

/** 로컬 플레이어 컨트롤러 */
export class Player {
  constructor(assets, world, name) {
    this.name = name;
    this.unico = new Unico(assets, { name: `⭐ ${name} (나)`, labelColor: '#ffffff', labelBg: 'rgba(36,157,146,0.95)', rig: 'biped' });
    this.unico.labelAlways = true;
    this.world = world;
    this.group = this.unico.group;
    // 내 캐릭터 표시: 발밑 금색 링 + 머리 위 통통 튀는 화살표
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.78, 0.95, 40),
      new THREE.MeshBasicMaterial({ color: 0xfac03e, transparent: true, opacity: 0.85, depthWrite: false }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.035;
    this.ring.renderOrder = 4;
    this.group.add(this.ring);
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.24, 4), new THREE.MeshBasicMaterial({ color: 0xfac03e }));
    arrow.rotation.x = Math.PI;
    arrow.position.y = 3.0;
    this.arrow = arrow;
    this.group.add(arrow);
    this.markT = 0;
    this.group.position.set(0, 0, 9);
    this.velocity = new THREE.Vector3();
    this.frozen = false; // 미니게임/UI 중 이동 금지
    this.speedMult = 1; // 집에서 푹 자고 일어난 날 +15% (home_view)
    this.swimming = false;
    this.hidden = false;
    world.scene.add(this.group);
  }

  get position() { return this.group.position; }

  /** 칭호 (KOAT 스탬프 투어 완주 등) */
  setTitle(title) {
    this.title = title;
    this.unico.setName(`⭐ ${this.name} (나) · 🏅${title}`, '#ffffff', 'rgba(36,157,146,0.95)');
  }

  /**
   * 클릭/탭 이동: pos() 위치까지 걸어가 stop 거리 안에 들면 멈춤. interact 면 도착 시 상호작용
   * key: 누른 대상의 안내 종류 (문자열 또는 배열) → 도착하면 arrivedKey 로 알려 그 대상만 실행 (옆 안내가 대신 실행되지 않게)
   */
  goTo(pos, stop = 0.2, interact = false, key = null) {
    // arrive: 누른 대상·땅으로 가는 이동이면 끝에서 걷기로 (자동 진행의 중간 경유점(멈춤 거리 0.35, 상호작용 없음)은 달린 채로 이어 감)
    this.moveTarget = { pos, stop, interact, key, stuck: 0, arrive: interact || stop < 0.3 };
  }

  /** 지금 점프할 수 있나 (멈춤·헤엄·탑승·숨김 중이 아니고, 이미 공중이 아님) */
  canJump() { return !this.frozen && !this.swimming && !this.unico.riding && !this.hidden && !(this.jumpY > 0); }
  get airborne() { return this.jumpY > 0; }

  /** 점프 (Space · 화면 점프 버튼). 할 수 없으면 false */
  jump() {
    if (!this.canJump()) return false;
    this.jumpV = JUMP_V; this.jumpY = 1e-4;
    return true;
  }

  update(dt, input, followCam) {
    const ax = this.frozen ? { x: 0, y: 0 } : input.axis();
    const { fwd, right } = followCam.basis();
    // 기울기(0..1)는 방향을 맞추기 전에 따로 둠: 조이스틱을 반쯤 기울이면 걷고 끝까지 기울이면 달림 (키보드는 달리기, Shift = 걷기)
    const m = Math.min(1, Math.hypot(ax.x, ax.y));
    const st = stickSpeed(m, this.running, !!input.walkHeld?.());
    const dir = (this._dir ||= new THREE.Vector3()).set(0, 0, 0);
    // 손을 떼면(데드존 안) 달리기 기억도 지움 → 다음에 반쯤 기울이면 늘 걷기
    if (st.speed > 0) dir.addScaledVector(fwd, -ax.y).addScaledVector(right, ax.x);
    this.running = st.run;
    let speed = st.speed || RUN_SPEED;
    if (st.speed > 0 || this.frozen) this.moveTarget = null; // 키보드/조이스틱 입력이 우선
    else if (this.moveTarget) {
      const t = this.moveTarget, goal = t.pos();
      const d = (this._d ||= new THREE.Vector3()).set(goal.x - this.position.x, 0, goal.z - this.position.z);
      const dist = d.length();
      if (dist <= t.stop) {
        this.arrivedInteract = t.interact;
        this.arrivedKey = t.interact ? t.key ?? null : null;
        this.arrivedTarget = t.interact ? t : null;
        this.moveTarget = null;
        if (t.interact && dist > 0.01) this.unico.facing = Math.atan2(d.x, d.z);
      } else {
        dir.copy(d.normalize());
        // 누른 곳이 가까워지면 걷기 속도까지 줄이며 다가감
        speed = t.arrive ? arriveSpeed(dist - t.stop) : RUN_SPEED;
        // 장애물에 막혀 거의 못 움직이면 포기 (상호작용 대상 근처면 도착 처리) — 기준은 지금 목표 속도 (걸어서 다가갈 때 막힘으로 오해하지 않게)
        t.stuck = (t.lastDist !== undefined && t.lastDist - dist < speed * this.speedMult * dt * 0.25) ? t.stuck + dt : 0;
        t.lastDist = dist;
        if (t.stuck > 0.6) {
          if (t.interact && dist < t.stop + 1.5) { this.arrivedInteract = true; this.arrivedKey = t.key ?? null; this.arrivedTarget = t; }
          this.moveTarget = null; dir.set(0, 0, 0);
        }
      }
    }
    const wants = dir.lengthSq() > 0.0001;
    if (wants) {
      dir.normalize();
      this.unico.facing = Math.atan2(dir.x, dir.z);
    }
    // 가감속: 약 0.12초 만에 최고 속도, 손을 떼면 짧게 미끄러지듯 멈춤 (급출발·급정지 방지)
    const vel = (this.vel ||= new THREE.Vector3());
    // 헤엄은 걷기 기울기면 조금 느리게
    this.targetSpeed = wants ? (this.swimming ? SWIM_SPEED * (speed >= RUN_SPEED ? 1 : 0.7) : speed) * this.speedMult : 0;
    const want = dir.multiplyScalar(this.targetSpeed);
    vel.lerp(want, 1 - Math.exp(-dt * (wants ? 16 : 20)));
    if (!wants && vel.lengthSq() < 0.01) vel.set(0, 0, 0);
    if (vel.lengthSq() > 0) {
      const from = (this._from ||= new THREE.Vector3()).copy(this.group.position);
      const next = (this._next ||= new THREE.Vector3()).copy(from).addScaledVector(vel, dt);
      this.world.resolveCollision(next, 0.45, { swim: true, player: true }); // 호수는 헤엄쳐 들어감
      this.group.position.copy(next);
      // 벽에 막힌 만큼 속도도 줄여 다시 출발할 때 튀지 않게
      if (dt > 0) { const real = next.distanceTo(from) / dt, sp = vel.length(); if (real < sp) vel.multiplyScalar(Math.max(0, real / sp)); }
    }
    if (this.frozen) vel.set(0, 0, 0);
    // 점프: 공중에서도 방향키로 움직임은 그대로, 땅에 닿으면 살짝 눌렸다 펴짐
    if (this.jumpY > 0) {
      const r = jumpStep(this.jumpY, this.jumpV, dt);
      this.jumpY = r.y; this.jumpV = r.v;
      if (r.landed) { this.unico._squash = 0.1; this.unico._landed = true; this.onLand?.(); }
    }
    this.unico.jumpY = this.jumpY || 0;
    // 수영: 물가에서 조금 들어가면 헤엄 자세 (나올 때는 조금 더 얕은 곳까지 헤엄 → 경계에서 깜빡이지 않게)
    const p = this.group.position;
    const sw = this.world.inSwimWater(p.x, p.z, this.swimming ? 0.25 : 0.55);
    if (sw !== this.swimming) { this.swimming = sw; this.unico.swimming = sw; this.onSwim?.(sw); }
    this.unico.moving = wants && vel.length() > 0.4;
    this.unico.update(dt, followCam.camera, this.world.daylight);
    this.group.visible = !this.hidden;
    this.markT += dt;
    const pulse = 1 + Math.sin(this.markT * 3) * 0.06;
    this.ring.scale.set(pulse, pulse, 1);
    this.ring.visible = !this.unico.riding;
    this.arrow.position.y = (this.unico.riding ? 2.8 : 3.0) + Math.abs(Math.sin(this.markT * 3)) * 0.12;
    this.arrow.rotation.y += dt * 2;
  }
}
