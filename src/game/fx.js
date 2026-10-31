import * as THREE from 'three';
import { makeLabel } from './label.js';

/** 간단 이펙트: 떠오르는 이모지, 물방울 */
export class FX {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    this.dropGeo = new THREE.SphereGeometry(0.06, 6, 5);
    this.dropMat = new THREE.MeshBasicMaterial({ color: 0x6fc3e8, transparent: true, opacity: 0.9 });
  }

  pop(x, z, text) {
    const s = makeLabel(text, { bg: 'rgba(0,0,0,0)', size: 56, scale: 0.012 });
    s.position.set(x, 1.2, z);
    this.scene.add(s);
    this.items.push({ obj: s, life: 1.2, vy: 1.6, dispose: s.userData.dispose });
  }

  sprinkle(x, z) {
    for (let i = 0; i < 14; i++) {
      const m = new THREE.Mesh(this.dropGeo, this.dropMat);
      m.position.set(x + (Math.random() - 0.5) * 1.6, 1.4 + Math.random() * 0.5, z + (Math.random() - 0.5) * 1.6);
      this.scene.add(m);
      this.items.push({ obj: m, life: 0.6 + Math.random() * 0.4, vy: -2 - Math.random() * 2 });
    }
  }

  /** 발밑 흙먼지 (걷기 착지마다) */
  dust(x, z) {
    if (!this.dustGeo) {
      this.dustGeo = new THREE.SphereGeometry(0.09, 6, 4);
      this.dustMat = new THREE.MeshBasicMaterial({ color: 0xe9dcc0, transparent: true, opacity: 0.7, depthWrite: false });
    }
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(this.dustGeo, this.dustMat.clone());
      m.position.set(x + (Math.random() - 0.5) * 0.5, 0.08, z + (Math.random() - 0.5) * 0.5);
      this.scene.add(m);
      this.items.push({ obj: m, life: 0.45, vy: 0.5, grow: 2.2, fade: true });
    }
  }

  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.life -= dt;
      it.obj.position.y += it.vy * dt;
      if (it.grow) it.obj.scale.multiplyScalar(1 + it.grow * dt);
      if (it.fade) it.obj.material.opacity = Math.max(0, it.life * 1.5);
      if (it.obj.material && 'opacity' in it.obj.material && it.dispose) it.obj.material.opacity = Math.min(1, it.life);
      if (it.life <= 0 || it.obj.position.y < 0) { this.scene.remove(it.obj); it.dispose?.(); if (it.fade) it.obj.material.dispose(); this.items.splice(i, 1); }
    }
  }
}
