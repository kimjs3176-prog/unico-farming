import * as THREE from 'three';
import { Unico } from './unico.js';

const SPEED = 4.6;

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
    this.hidden = false;
    world.scene.add(this.group);
  }

  get position() { return this.group.position; }

  /** 칭호 (KOAT 스탬프 투어 완주 등) */
  setTitle(title) {
    this.title = title;
    this.unico.setName(`⭐ ${this.name} (나) · 🏅${title}`, '#ffffff', 'rgba(36,157,146,0.95)');
  }

  /** 클릭/탭 이동: pos() 위치까지 걸어가 stop 거리 안에 들면 멈춤. interact 면 도착 시 상호작용 */
  goTo(pos, stop = 0.2, interact = false) {
    this.moveTarget = { pos, stop, interact, stuck: 0 };
  }

  update(dt, input, followCam) {
    const ax = this.frozen ? { x: 0, y: 0 } : input.axis();
    const { fwd, right } = followCam.basis();
    const dir = new THREE.Vector3().addScaledVector(fwd, -ax.y).addScaledVector(right, ax.x);
    if (dir.lengthSq() > 0.0001 || this.frozen) this.moveTarget = null; // 키보드/조이스틱 입력이 우선
    else if (this.moveTarget) {
      const t = this.moveTarget, goal = t.pos();
      const d = new THREE.Vector3(goal.x - this.position.x, 0, goal.z - this.position.z);
      const dist = d.length();
      if (dist <= t.stop) {
        this.arrivedInteract = t.interact;
        this.moveTarget = null;
        if (t.interact && dist > 0.01) this.unico.facing = Math.atan2(d.x, d.z);
      } else {
        dir.copy(d.normalize());
        // 장애물에 막혀 거의 못 움직이면 포기 (상호작용 대상 근처면 도착 처리)
        t.stuck = (t.lastDist !== undefined && t.lastDist - dist < SPEED * dt * 0.25) ? t.stuck + dt : 0;
        t.lastDist = dist;
        if (t.stuck > 0.6) { if (t.interact && dist < t.stop + 1.5) this.arrivedInteract = true; this.moveTarget = null; dir.set(0, 0, 0); }
      }
    }
    const moving = dir.lengthSq() > 0.0001;
    if (moving) {
      dir.normalize();
      this.unico.facing = Math.atan2(dir.x, dir.z);
      const next = this.group.position.clone().addScaledVector(dir, SPEED * dt);
      this.world.resolveCollision(next, 0.45);
      this.group.position.copy(next);
    }
    this.unico.moving = moving;
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
