import * as THREE from 'three';
import { makeLabel } from './label.js';

const TWO_PI = Math.PI * 2;
const wrap = (a) => ((a + Math.PI) % TWO_PI + TWO_PI) % TWO_PI - Math.PI;
const NIGHT = new THREE.Color(0.6, 0.7, 1.0);

/**
 * 유니코 캐릭터 엔티티 (플레이어 / 다른 접속자 / NPC 공용)
 * - 원본 일러스트를 그대로 래스터한 스프라이트 평면을 카메라 방향으로 빌보드 (2.5D)
 *   · Y축 회전으로 카메라를 향하고, 카메라가 내려다보는 각도만큼 발을 축으로 살짝 뒤로 눕혀
 *     납작해 보이지 않게 함 (발은 항상 지면에)
 * - 이동 방향과 카메라 각도에 따라 정면/3·4측면/뒷면 그림을 전환 (측면은 좌우 반전)
 * - 방향이 바뀔 때는 종이 인형처럼 납작해졌다 뒤집히는 플립 전환
 * - 걷기: 통통 튀는 바운스, 착지 스쿼시&스트레치, 진행 방향 기울기, 발 먼지(onStep)
 * - 액션 포즈(물주기, 환호, 안전모 등)는 팝 효과와 함께 일정 시간 우선 표시
 * - 밤에는 월드 밝기에 맞춰 틴트
 */
export class Unico {
  constructor(assets, { name = '', poses = ['idle', 'front', 'side', 'back'], extraPoses = [], labelColor = '#fff' } = {}) {
    this.group = new THREE.Group();
    this.models = {};
    for (const p of [...poses, ...extraPoses]) {
      const m = assets.makeUnicoSprite(p);
      m.visible = false;
      this.group.add(m);
      this.models[p] = m;
    }
    this.tint = new THREE.Color(1, 1, 1);
    this.facing = 0; // 이동 방향(라디안, +Z 기준)
    this.moving = false;
    this.t = Math.random() * 10;
    this.action = null;
    this.actionUntil = 0;
    this.current = null;
    this.position = this.group.position;
    this.hasDirectional = 'front' in this.models && 'back' in this.models && 'side' in this.models;
    // 바닥 그림자
    const sh = new THREE.Mesh(
      new THREE.CircleGeometry(0.55, 20),
      new THREE.MeshBasicMaterial({ color: 0x231916, transparent: true, opacity: 0.22, depthWrite: false }),
    );
    sh.rotation.x = -Math.PI / 2;
    sh.position.y = 0.02;
    sh.renderOrder = 1;
    this.shadow = sh;
    this.group.add(sh);
    this.label = null;
    if (name) this.setName(name, labelColor);
    this.flip = 1;
    this.popT = 1;
    this.walkPhase = 0;
    this.walkBlend = 0;
    this.lastS = 0;
    this.shownKey = null;
    this.shownMirror = false;
    this.actionMirror = false;
    this.onStep = null; // (x, z) => void  발 먼지 등
    this.showPose('idle');
  }

  setName(name, color = '#fff') {
    if (this.label) { this.group.remove(this.label); this.label.userData.dispose(); }
    this.label = makeLabel(name, { color });
    this.label.position.y = 2.35;
    this.group.add(this.label);
  }

  say(text, seconds = 4) {
    if (this.bubble) { this.group.remove(this.bubble); this.bubble.userData.dispose(); }
    this.bubble = makeLabel(text, { color: '#231916', bg: 'rgba(255,255,255,0.92)', size: 36 });
    this.bubble.position.y = 2.8;
    this.group.add(this.bubble);
    this.bubbleUntil = this.t + seconds;
  }

  /** 액션 포즈 표시 (seconds 동안, 0 이면 해제할 때까지) */
  playAction(pose, seconds = 1.5) {
    if (!this.models[pose]) return;
    this.action = pose;
    this.actionUntil = seconds > 0 ? this.t + seconds : Infinity;
    this.popT = 0;
  }

  clearAction() { this.action = null; }

  showPose(name) {
    if (this.current !== name) {
      for (const [k, m] of Object.entries(this.models)) m.visible = k === name;
      this.current = name;
    }
  }

  /** @param camera THREE.Camera - 빌보드 기준, @param daylight 0..1 (밤 틴트) */
  update(dt, camera, daylight = 1) {
    this.t += dt;
    const p = this.group.position;
    const dx = camera.position.x - p.x, dz = camera.position.z - p.z;
    const toCam = Math.atan2(dx, dz);
    this.group.rotation.y = toCam;
    const pitch = Math.atan2(camera.position.y - (p.y + 1.0), Math.hypot(dx, dz));
    this.tint.setScalar(0.3 + 0.62 * daylight).lerp(NIGHT, (1 - daylight) * 0.35);

    if (this.action && this.t > this.actionUntil) this.action = null;
    if (this.bubble && this.t > this.bubbleUntil) { this.group.remove(this.bubble); this.bubble.userData.dispose(); this.bubble = null; }

    // ---- 목표 포즈 결정 ----
    const diff = wrap(this.facing - toCam); // 0 = 카메라를 정면으로 봄, + = 화면 오른쪽
    let pose = 'idle', mirror = false;
    if (this.action) {
      pose = this.action;
      mirror = this.actionMirror;
    } else if (this.hasDirectional) {
      const a = Math.abs(diff);
      if (!this.moving && this.models.idle) {
        pose = a < Math.PI * 0.25 ? 'front' : 'idle';
        mirror = diff > 0 && a >= Math.PI * 0.25; // idle/side 그림은 왼쪽을 봄
      } else if (a < Math.PI * 0.25) pose = 'front';
      else if (a > Math.PI * 0.75) pose = 'back';
      else { pose = 'side'; mirror = diff > 0; }
    }

    // ---- 방향 전환: 종이 인형처럼 납작해졌다가 뒤집혀 펴지는 플립 (0.16초) ----
    const key = pose + (mirror ? '-' : '+');
    if (key !== this.shownKey && this.flip >= 1) {
      // 액션 포즈 시작은 팝, 방향 전환은 플립
      if (this.action && pose === this.action && this.shownKey && !this.shownKey.startsWith(pose)) { this.showPose(pose); this.shownKey = key; this.shownMirror = mirror; this.popT = 0; }
      else { this.flip = 0; this.pendingKey = key; this.pendingPose = pose; this.pendingMirror = mirror; }
    }
    if (this.flip < 1) {
      this.flip = Math.min(1, this.flip + dt / 0.16);
      if (this.flip >= 0.5 && this.pendingKey) {
        this.showPose(this.pendingPose);
        this.shownKey = this.pendingKey; this.shownMirror = this.pendingMirror; this.pendingKey = null;
      }
    }
    if (!this.shownKey) { this.showPose(pose); this.shownKey = key; this.shownMirror = mirror; }
    const flipScale = this.flip < 1 ? Math.max(0.04, Math.abs(Math.cos(this.flip * Math.PI))) : 1;

    // ---- 걷기: 통통 튀는 바운스 + 착지 스쿼시 + 진행 방향 기울기 + 발 먼지 ----
    const target = this.moving ? 1 : 0;
    this.walkBlend += (target - this.walkBlend) * Math.min(1, dt * 10);
    if (this.moving) this.walkPhase += dt * 10.5;
    const s = Math.abs(Math.sin(this.walkPhase));
    const hop = s * 0.13 * this.walkBlend;
    const land = Math.pow(1 - s, 6) * this.walkBlend; // 착지 순간 1
    let sy = 1 + 0.05 * s * this.walkBlend - 0.08 * land;
    if (!this.moving) sy *= 1 + Math.sin(this.t * 2.2) * 0.013; // 숨쉬기
    // 액션 시작 팝 (easeOutBack 느낌)
    if (this.popT < 1) {
      this.popT = Math.min(1, this.popT + dt / 0.3);
      sy *= 1 + Math.sin(this.popT * Math.PI) * 0.14 * (1 - this.popT * 0.4);
    }
    const sx = 1 / Math.sqrt(sy);
    const lean = -Math.sin(diff) * 0.12 * this.walkBlend + Math.sin(this.walkPhase) * 0.035 * this.walkBlend;
    if (this.moving && this.lastS > 0.25 && s <= 0.25) this.onStep?.(p.x, p.z);
    this.lastS = s;

    const m = this.models[this.current];
    if (m) {
      m.rotation.set(-pitch * 0.8, 0, lean);
      m.position.y = hop;
      m.scale.set((this.shownMirror ? -1 : 1) * sx * flipScale, sy, 1);
      if (m.material?.color) m.material.color.copy(this.tint);
    }
    const shs = 1 - hop * 1.6;
    this.shadow.scale.set(shs, shs, 1);
    this.shadow.material.opacity = 0.22 * shs;
  }

  dispose() {
    this.label?.userData.dispose();
    this.bubble?.userData.dispose();
  }
}
