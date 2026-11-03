import * as THREE from 'three';

const N = 320;    // 물방울 풀
const CROWNS = 8; // 물기둥(왕관 모양 물보라) 풀
const WATER_Y = 0.03;

/**
 * 첨벙 효과: 물방울 입자(중력·끌림, 수면에 떨어지면 작은 파문), 왕관 모양 물보라, 수면 파문(scenery.addRipple)
 *  - splash(x, z, power): 뛰어들기·잠수·물고기 착수 같은 큰 첨벙
 *  - stroke(x, z, yaw, side): 헤엄칠 때 팔로 물을 퍼 올림
 *  - kick(x, z, yaw): 발차기 물보라
 */
export class WaterFX {
  constructor(scene, scenery, quality = {}) {
    this.scene = scene;
    this.scenery = scenery;
    this.max = quality.level === 'low' ? 160 : N;
    // ---- 물방울 (Points, 둥글고 가장자리가 부드러운 하이라이트) ----
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(N * 3);
    this.life = new Float32Array(N); // 남은 비율(투명도)
    this.size = new Float32Array(N);
    this.vel = new Float32Array(N * 3);
    this.ttl = new Float32Array(N);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aLife', new THREE.BufferAttribute(this.life, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uScale: { value: 360 }, uTint: { value: new THREE.Color(0xeaf8ff) } },
      vertexShader: `attribute float aLife; attribute float aSize; varying float vL; uniform float uScale;
        void main(){ vL = aLife; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
          gl_PointSize = aLife > 0.0 ? aSize * uScale / max(0.5, -mv.z) : 0.0; }`,
      fragmentShader: `varying float vL; uniform vec3 uTint;
        void main(){ vec2 c = gl_PointCoord - 0.5; float r = length(c); if (r > 0.5) discard;
          float a = smoothstep(0.5, 0.18, r) * clamp(vL * 1.6, 0.0, 1.0);
          vec3 col = mix(uTint * 0.8, vec3(1.0), smoothstep(0.25, 0.0, length(c - vec2(-0.12, -0.12)))); // 반짝이는 점
          gl_FragColor = vec4(col, a * 0.9); }`,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 6;
    scene.add(this.points);
    this.next = 0;
    this.alive = 0;
    // ---- 왕관 물보라: 위로 갈수록 투명하고 가장자리가 물방울처럼 끊긴 원통 ----
    const cg = new THREE.CylinderGeometry(1, 0.75, 1, 28, 1, true).translate(0, 0.5, 0);
    this.crowns = Array.from({ length: CROWNS }, () => {
      const m = new THREE.Mesh(cg, new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, side: THREE.DoubleSide,
        uniforms: { uA: { value: 0 }, uSeed: { value: Math.random() * 10 } },
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: `varying vec2 vUv; uniform float uA, uSeed;
          float h(float x){ return fract(sin(x * 91.7 + uSeed) * 4375.5); }
          void main(){ float cols = 22.0; float id = floor(vUv.x * cols);
            float top = 0.45 + 0.55 * h(id);                       // 기둥마다 높이가 다른 물줄기
            float y = vUv.y / top; if (y > 1.0) discard;
            float edge = smoothstep(0.5, 0.25, abs(fract(vUv.x * cols) - 0.5)) ;
            float a = uA * (1.0 - y) * mix(0.55, 1.0, edge);
            gl_FragColor = vec4(mix(vec3(0.82, 0.93, 1.0), vec3(1.0), y), a); }`,
      }));
      m.visible = false;
      m.renderOrder = 5;
      scene.add(m);
      return { m, t: 0, dur: 0.5, r0: 0.2, r1: 0.6, h: 0.5 };
    });
    this.ci = 0;
    // ---- 물거품 원판 (첨벙 직후 수면에 남는 하얀 거품) ----
    const foamTex = (() => {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const x = c.getContext('2d');
      for (let i = 0; i < 70; i++) { const a = Math.random() * 6.28, r = Math.random() * 26; x.fillStyle = `rgba(255,255,255,${0.25 + Math.random() * 0.5})`; x.beginPath(); x.arc(32 + Math.cos(a) * r, 32 + Math.sin(a) * r, 1 + Math.random() * 3.5, 0, 7); x.fill(); }
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
    })();
    this.foams = Array.from({ length: 6 }, () => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: foamTex, transparent: true, depthWrite: false, opacity: 0 }));
      m.rotation.x = -Math.PI / 2; m.visible = false; m.renderOrder = 4;
      scene.add(m);
      return { m, t: 0, dur: 1.4, s: 1 };
    });
    this.fi = 0;
  }

  /** 물방울 n개: 중심 (x,y,z), 위로 up, 옆으로 spread, 방향 (dx,dz)·세기 push */
  spray(x, y, z, n, { up = 2.2, spread = 1.0, dx = 0, dz = 0, push = 0, size = 0.06, ttl = 1.1 } = {}) {
    for (let k = 0; k < n; k++) {
      const i = this.next; this.next = (this.next + 1) % this.max;
      const a = Math.random() * Math.PI * 2, r = Math.random() * spread;
      this.pos[i * 3] = x + Math.cos(a) * 0.08; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z + Math.sin(a) * 0.08;
      this.vel[i * 3] = Math.cos(a) * r + dx * push * (0.6 + Math.random() * 0.6);
      this.vel[i * 3 + 1] = up * (0.55 + Math.random() * 0.65);
      this.vel[i * 3 + 2] = Math.sin(a) * r + dz * push * (0.6 + Math.random() * 0.6);
      this.ttl[i] = ttl * (0.7 + Math.random() * 0.5);
      this.life[i] = 1;
      this.size[i] = size * (0.5 + Math.random());
    }
    this.alive = 1.6;
  }

  crown(x, z, { r0 = 0.18, r1 = 0.7, h = 0.55, dur = 0.55 } = {}) {
    const c = this.crowns[this.ci++ % CROWNS];
    Object.assign(c, { t: 0, dur, r0, r1, h });
    c.m.position.set(x, WATER_Y, z);
    c.m.visible = true;
  }

  foam(x, z, s = 1) {
    const f = this.foams[this.fi++ % this.foams.length];
    Object.assign(f, { t: 0, s, dur: 1.2 + s * 0.6 });
    f.m.position.set(x, WATER_Y + 0.012, z);
    f.m.rotation.z = Math.random() * 6.28;
    f.m.visible = true;
  }

  ripple(x, z, amp) { this.scenery?.addRipple(x, z, amp); }

  /** 큰 첨벙 (power 0.5 ~ 2) */
  splash(x, z, power = 1) {
    this.ripple(x, z, Math.min(1.6, 0.6 + power * 0.5));
    this.crown(x, z, { r0: 0.15 * power + 0.1, r1: 0.45 + power * 0.45, h: 0.35 + power * 0.35, dur: 0.45 + power * 0.15 });
    this.spray(x, WATER_Y + 0.05, z, Math.round(16 + power * 22), { up: 2.2 + power * 1.4, spread: 0.7 + power * 0.6, size: 0.075 + power * 0.015 });
    this.foam(x, z, 0.8 + power * 0.7);
  }

  /** 헤엄 한 번 저을 때: 바라보는 쪽 앞, 팔 쪽(side ±1)에서 물을 퍼 올려 앞·옆으로 */
  stroke(x, z, yaw, side = 1, speed = 1) {
    const fx = Math.sin(yaw), fz = Math.cos(yaw), sx = Math.cos(yaw) * side, sz = -Math.sin(yaw) * side;
    const hx = x + fx * 0.42 + sx * 0.32, hz = z + fz * 0.42 + sz * 0.32;
    this.spray(hx, WATER_Y + 0.08, hz, Math.round(8 + speed * 8), { up: 1.7 + speed * 0.9, spread: 0.45, dx: sx * 0.6 + fx * 0.4, dz: sz * 0.6 + fz * 0.4, push: 1.0, size: 0.075 });
    this.crown(hx, hz, { r0: 0.08, r1: 0.32, h: 0.22 + speed * 0.12, dur: 0.35 });
    this.ripple(hx, hz, 0.45 + speed * 0.25);
    if (speed > 0.5 && Math.random() < 0.6) this.foam(hx, hz, 0.45);
  }

  /** 발차기: 뒤쪽에 작은 물보라 */
  kick(x, z, yaw, speed = 1) {
    const bx = x - Math.sin(yaw) * 0.55, bz = z - Math.cos(yaw) * 0.55;
    this.spray(bx, WATER_Y + 0.05, bz, Math.round(4 + speed * 6), { up: 1.1 + speed * 0.6, spread: 0.5, dx: -Math.sin(yaw), dz: -Math.cos(yaw), push: 0.5, size: 0.06, ttl: 0.8 });
  }

  update(dt, camera, renderer) {
    if (camera && renderer) this.mat.uniforms.uScale.value = renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    // 물방울
    if (this.alive > 0) {
      this.alive -= dt;
      const p = this.pos, v = this.vel;
      for (let i = 0; i < this.max; i++) {
        if (this.life[i] <= 0) continue;
        v[i * 3 + 1] -= 9.8 * dt;
        const drag = Math.exp(-dt * 1.2);
        v[i * 3] *= drag; v[i * 3 + 2] *= drag;
        p[i * 3] += v[i * 3] * dt; p[i * 3 + 1] += v[i * 3 + 1] * dt; p[i * 3 + 2] += v[i * 3 + 2] * dt;
        this.life[i] -= dt / this.ttl[i];
        if (p[i * 3 + 1] < WATER_Y && v[i * 3 + 1] < 0) {
          if (this.size[i] > 0.07 && Math.random() < 0.08) this.ripple(p[i * 3], p[i * 3 + 2], 0.18); // 큰 물방울은 떨어진 자리에 작은 파문
          this.life[i] = 0;
        }
        if (this.life[i] > 0) this.alive = Math.max(this.alive, 0.1);
      }
      const at = this.points.geometry.attributes;
      at.position.needsUpdate = at.aLife.needsUpdate = at.aSize.needsUpdate = true;
    }
    for (const c of this.crowns) {
      if (!c.m.visible) continue;
      c.t += dt;
      const k = c.t / c.dur;
      if (k >= 1) { c.m.visible = false; continue; }
      const r = c.r0 + (c.r1 - c.r0) * (1 - (1 - k) ** 2);
      c.m.scale.set(r, c.h * Math.sin(Math.min(1, k * 1.25) * Math.PI) + 0.01, r);
      c.m.material.uniforms.uA.value = 0.85 * (1 - k);
    }
    for (const f of this.foams) {
      if (!f.m.visible) continue;
      f.t += dt;
      const k = f.t / f.dur;
      if (k >= 1) { f.m.visible = false; continue; }
      const s = f.s * (0.6 + k * 0.7);
      f.m.scale.set(s, s, 1);
      f.m.material.opacity = 0.75 * (1 - k) * Math.min(1, f.t * 8);
    }
  }
}
