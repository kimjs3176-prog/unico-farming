import * as THREE from 'three';
import { makeLabel } from './label.js';

const TWO_PI = Math.PI * 2;
const wrap = (a) => ((a + Math.PI) % TWO_PI + TWO_PI) % TWO_PI - Math.PI;

/**
 * 유니코 캐릭터 엔티티 (플레이어 / 다른 접속자 / NPC 공용)
 * - 원본 벡터를 입체화한 릴리프 모델을 카메라 방향으로 빌보드
 * - 이동 방향과 카메라 각도에 따라 정면/측면/뒷면 모델을 전환 (측면은 좌우 반전)
 * - 액션 포즈(물주기, 환호, 안전모 등) 는 일정 시간 우선 표시
 */
export class Unico {
  constructor(assets, { name = '', poses = ['idle', 'front', 'side', 'back'], extraPoses = [], labelColor = '#fff' } = {}) {
    this.group = new THREE.Group();
    this.models = {};
    for (const p of [...poses, ...extraPoses]) {
      const m = assets.clone(`unico_${p}`);
      m.visible = false;
      this.group.add(m);
      this.models[p] = m;
    }
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
  }

  clearAction() { this.action = null; }

  showPose(name, mirror = false) {
    if (this.current !== name) {
      for (const [k, m] of Object.entries(this.models)) m.visible = k === name;
      this.current = name;
    }
    const m = this.models[name];
    if (m) m.scale.x = mirror ? -1 : 1;
  }

  /** @param camera THREE.Camera - 빌보드 기준 */
  update(dt, camera) {
    this.t += dt;
    const p = this.group.position;
    const toCam = Math.atan2(camera.position.x - p.x, camera.position.z - p.z);
    this.group.rotation.y = toCam;

    if (this.action && this.t > this.actionUntil) this.action = null;
    if (this.bubble && this.t > this.bubbleUntil) { this.group.remove(this.bubble); this.bubble.userData.dispose(); this.bubble = null; }

    // 포즈 결정
    let pose = 'idle', mirror = false;
    if (this.action) {
      pose = this.action;
    } else if (this.hasDirectional) {
      const diff = wrap(this.facing - toCam); // 0 = 카메라를 정면으로 봄
      const a = Math.abs(diff);
      if (!this.moving && this.models.idle) {
        pose = a < Math.PI * 0.25 ? 'front' : 'idle';
        mirror = diff > 0 && a >= Math.PI * 0.25; // idle 은 왼쪽을 보는 그림
      } else if (a < Math.PI * 0.25) pose = 'front';
      else if (a > Math.PI * 0.75) pose = 'back';
      else { pose = 'side'; mirror = diff > 0; }
    }
    this.showPose(pose, mirror);

    // 걷기 바운스 / 숨쉬기
    const m = this.models[pose];
    if (m) {
      if (this.moving) {
        m.position.y = Math.abs(Math.sin(this.t * 11)) * 0.09;
        m.rotation.z = Math.sin(this.t * 11) * 0.05;
        m.scale.y = 1;
      } else {
        m.position.y = 0;
        m.rotation.z = 0;
        m.scale.y = 1 + Math.sin(this.t * 2.2) * 0.012;
      }
    }
  }

  dispose() {
    this.label?.userData.dispose();
    this.bubble?.userData.dispose();
  }
}
