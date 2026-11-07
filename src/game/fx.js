import * as THREE from 'three';
import { heightAt } from './terrain.js';
import { makeLabel } from './label.js';
import { SURF } from './surface.js';

/** 이보다 먼(카메라 기준, m) 작은 배경 효과(별 6개 이하: 익은 밭·굴뚝·공사장 먼지, 걸음 먼지)는 만들지 않음 — 화면에 2~3픽셀이라 안 보임 */
const FAR = 40;
/** 다 쓴 입자를 종류별로 이만큼까지 모아 두었다가 다시 씀 (재질·메시를 매번 새로 만들지 않게) */
const KEEP = 96;

/** 간단 이펙트: 떠오르는 이모지, 물방울 */
export class FX {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    // 입자는 이 묶음 안에서 보이기만 껐다 켬 (장면에 넣고 빼기를 반복하지 않음)
    this.group = new THREE.Group();
    this.group.name = 'fx';
    scene.add(this.group);
    this.pool = { star: [], dust: [], drop: [] };
    this.dropGeo = new THREE.SphereGeometry(0.06, 6, 5);
    this.dropMat = new THREE.MeshBasicMaterial({ color: 0x6fc3e8, transparent: true, opacity: 0.9 });
  }

  /** 카메라에서 먼 곳인가 (카메라 위치는 매 프레임 SURF.seeCam 에 들어옴) */
  _far(x, y, z) {
    const c = SURF.seeCam.value, dx = c.x - x, dy = c.y - y, dz = c.z - z;
    return dx * dx + dy * dy + dz * dz > FAR * FAR;
  }

  /** 풀에서 꺼내거나 새로 만들기 */
  _take(kind, make) {
    const m = this.pool[kind].pop() || make();
    if (m.parent !== this.group) this.group.add(m);
    m.visible = true;
    return m;
  }

  /** 별 반짝임 터지기 (가산 혼합) */
  burst(x, y, z, color = 0xffd75a, n = 12) {
    if (n <= 6 && this._far(x, y, z)) return; // 순간이동·집 넓히기처럼 큰 효과는 카메라가 아직 멀어도 그대로
    if (!this.starGeo) this.starGeo = new THREE.OctahedronGeometry(0.06, 0);
    const make = () => {
      const s = new THREE.Mesh(this.starGeo, new THREE.MeshBasicMaterial({ transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false }));
      s.userData.v = new THREE.Vector3();
      return s;
    };
    for (let i = 0; i < n; i++) {
      const m = this._take('star', make);
      m.material.color.set(color);
      m.material.opacity = 1;
      m.scale.setScalar(1);
      m.rotation.set(0, 0, 0);
      m.position.set(x, y, z);
      const a = (i / n) * Math.PI * 2, sp = 1.2 + Math.random() * 1.4;
      m.userData.v.set(Math.cos(a) * sp, 1.6 + Math.random() * 1.8, Math.sin(a) * sp);
      this.items.push({ obj: m, life: 0.7 + Math.random() * 0.3, vy: 0, star: true, kind: 'star' });
    }
  }

  pop(x, z, text) {
    this.burst(x, 1.0, z);
    this.onPop?.(text, new THREE.Vector3(x, 1.2, z));
    const s = makeLabel(text, { bg: 'rgba(0,0,0,0)', size: 56, scale: 0.012 });
    s.position.set(x, 1.2, z);
    this.scene.add(s);
    this.items.push({ obj: s, life: 1.2, vy: 1.6, dispose: s.userData.dispose });
  }

  sprinkle(x, z) {
    const make = () => new THREE.Mesh(this.dropGeo, this.dropMat);
    for (let i = 0; i < 14; i++) {
      const m = this._take('drop', make);
      m.position.set(x + (Math.random() - 0.5) * 1.6, 1.4 + Math.random() * 0.5, z + (Math.random() - 0.5) * 1.6);
      this.items.push({ obj: m, life: 0.6 + Math.random() * 0.4, vy: -2 - Math.random() * 2, kind: 'drop' });
    }
  }

  /** 발밑 흙먼지 (걷기 착지마다) */
  dust(x, z) {
    if (!this.dustGeo) {
      this.dustGeo = new THREE.SphereGeometry(0.09, 6, 4);
      this.dustMat = new THREE.MeshBasicMaterial({ color: 0xe9dcc0, transparent: true, opacity: 0.7, depthWrite: false });
    }
    const y = heightAt(x, z) + 0.08;
    if (this._far(x, y, z)) return;
    const make = () => new THREE.Mesh(this.dustGeo, this.dustMat.clone()); // 알마다 따로 옅어지므로 재질은 하나씩 (다시 씀)
    for (let i = 0; i < 3; i++) {
      const m = this._take('dust', make);
      m.material.opacity = 0.7;
      m.scale.setScalar(1);
      m.position.set(x + (Math.random() - 0.5) * 0.5, y, z + (Math.random() - 0.5) * 0.5);
      this.items.push({ obj: m, life: 0.45, vy: 0.5, grow: 2.2, fade: true, kind: 'dust' });
    }
  }

  /** 수명이 끝난 효과: 입자는 풀로 돌려놓고, 글자는 해제 */
  _free(it) {
    const o = it.obj;
    if (!it.kind) { this.scene.remove(o); it.dispose?.(); return; }
    const pool = this.pool[it.kind];
    if (pool.length < KEEP) { o.visible = false; pool.push(o); return; }
    this.group.remove(o);
    if (it.kind !== 'drop') o.material.dispose(); // 물방울 재질은 함께 쓰는 것
  }

  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.life -= dt;
      it.obj.position.y += it.vy * dt;
      if (it.star) {
        const v = it.obj.userData.v;
        v.y -= 6 * dt;
        it.obj.position.addScaledVector(v, dt);
        it.obj.rotation.x += dt * 8; it.obj.rotation.y += dt * 6;
        it.obj.material.opacity = Math.min(1, it.life * 2);
        it.obj.scale.setScalar(0.6 + it.life);
      }
      if (it.grow) it.obj.scale.multiplyScalar(1 + it.grow * dt);
      if (it.fade) it.obj.material.opacity = Math.max(0, it.life * 1.5);
      if (it.obj.material && 'opacity' in it.obj.material && it.dispose) it.obj.material.opacity = Math.min(1, it.life);
      if (it.life <= 0 || it.obj.position.y < 0) { this._free(it); this.items.splice(i, 1); }
    }
  }
}
