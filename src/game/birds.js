import * as THREE from 'three';

/**
 * 하늘을 가로지르는 새 떼 (낮에만, 저사양에서는 끔)
 *  - 3~6마리가 V자로 날아 지나감 (40~90초마다 한 무리), 날갯짓 + 가끔 활공
 *  - 새 한 마리 = 몸통 + 날개 2장 (삼각형), 모두 같은 지오메트리를 공유해 가벼움
 */
const BODY = (() => { const g = new THREE.ConeGeometry(0.09, 0.42, 5); g.rotateX(Math.PI / 2); return g; })();
const WING = (() => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.12, 0.62, 0, -0.04, 0, 0, -0.12], 3));
  g.computeVertexNormals();
  return g;
})();
const MAT = new THREE.MeshStandardMaterial({ color: 0x3a3f4a, roughness: 0.9, side: THREE.DoubleSide });

export class Birds {
  constructor(scene, { enabled = true } = {}) {
    this.scene = scene;
    this.enabled = enabled;
    this.flocks = [];
    this.wait = 6 + Math.random() * 12;
  }

  spawn(focus) {
    const n = 3 + Math.floor(Math.random() * 4);
    const a = Math.random() * Math.PI * 2, dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const side = new THREE.Vector3(-dir.z, 0, dir.x);
    const start = new THREE.Vector3(focus.x, 0, focus.z).addScaledVector(dir, -70).addScaledVector(side, (Math.random() - 0.5) * 30);
    start.y = 13 + Math.random() * 7;
    const group = new THREE.Group();
    const birds = [];
    for (let i = 0; i < n; i++) {
      const b = new THREE.Group();
      const body = new THREE.Mesh(BODY, MAT);
      const wl = new THREE.Mesh(WING, MAT), wr = new THREE.Mesh(WING, MAT);
      wr.scale.x = -1;
      b.add(body, wl, wr);
      const row = Math.ceil(i / 2), s = i % 2 ? 1 : -1;
      b.position.set(i ? s * row * 0.9 : 0, (Math.random() - 0.5) * 0.4, i ? -row * 0.9 : 0); // V자 대형
      b.userData = { wl, wr, ph: Math.random() * 6.28, rate: 7 + Math.random() * 3 };
      group.add(b);
      birds.push(b);
    }
    group.position.copy(start);
    group.lookAt(start.clone().add(dir));
    group.scale.setScalar(1.2 + Math.random() * 0.4);
    this.scene.add(group);
    this.flocks.push({ group, birds, vel: dir.multiplyScalar(6.5 + Math.random() * 2), t: 0, glide: 0 });
  }

  update(dt, focus, daylight = 1) {
    if (this.enabled && focus && daylight > 0.45) {
      this.wait -= dt;
      if (this.wait <= 0 && this.flocks.length < 2) { this.spawn(focus); this.wait = 40 + Math.random() * 50; }
    }
    for (let k = this.flocks.length - 1; k >= 0; k--) {
      const f = this.flocks[k];
      f.t += dt;
      f.group.position.addScaledVector(f.vel, dt);
      f.group.position.y += Math.sin(f.t * 0.7) * 0.25 * dt;
      // 날갯짓 몇 초 → 잠깐 활공 (날개를 편 채로)
      f.glide = (f.t % 6) > 4.2 ? Math.min(1, f.glide + dt * 3) : Math.max(0, f.glide - dt * 3);
      for (const b of f.birds) {
        const u = b.userData;
        u.ph += dt * u.rate;
        const flap = Math.sin(u.ph) * 0.75 * (1 - f.glide) + 0.12;
        u.wl.rotation.z = flap; u.wr.rotation.z = -flap;
      }
      if (f.t > 22) { this.scene.remove(f.group); this.flocks.splice(k, 1); }
    }
  }
}
