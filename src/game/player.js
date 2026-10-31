import * as THREE from 'three';
import { Unico } from './unico.js';

const SPEED = 5.2;

/** 로컬 플레이어 컨트롤러 */
export class Player {
  constructor(assets, world, name) {
    this.unico = new Unico(assets, { name, extraPoses: ['water', 'cheer', 'safety', 'tablet', 'heart', 'think'], labelColor: '#fff' });
    this.world = world;
    this.group = this.unico.group;
    this.group.position.set(0, 0, 9);
    this.velocity = new THREE.Vector3();
    this.frozen = false; // 미니게임/UI 중 이동 금지
    this.hidden = false;
    world.scene.add(this.group);
  }

  get position() { return this.group.position; }

  update(dt, input, followCam) {
    const ax = this.frozen ? { x: 0, y: 0 } : input.axis();
    const { fwd, right } = followCam.basis();
    const dir = new THREE.Vector3().addScaledVector(fwd, -ax.y).addScaledVector(right, ax.x);
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
  }
}
