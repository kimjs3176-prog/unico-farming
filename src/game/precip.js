import * as THREE from 'three';

/** 비/눈 파티클 (카메라 주변 상자 안에서 순환) + 번개 섬광 */
export class Precipitation {
  constructor(scene) {
    this.scene = scene;
    const N = 2200;
    this.N = N;
    this.box = { w: 46, h: 22, d: 46 };
    // 비: 짧은 선분
    const rpos = new Float32Array(N * 6);
    this.rainGeo = new THREE.BufferGeometry();
    this.rainGeo.setAttribute('position', new THREE.BufferAttribute(rpos, 3));
    this.rain = new THREE.LineSegments(this.rainGeo, new THREE.LineBasicMaterial({ color: 0xa7c3db, transparent: true, opacity: 0.8, depthWrite: false }));
    this.rain.frustumCulled = false;
    // 눈: 둥근 점
    const spos = new Float32Array(N * 3);
    this.snowGeo = new THREE.BufferGeometry();
    this.snowGeo.setAttribute('position', new THREE.BufferAttribute(spos, 3));
    this.snow = new THREE.Points(this.snowGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.16, map: dotTexture(), transparent: true, alphaTest: 0.1, depthWrite: false }));
    this.snow.frustumCulled = false;
    this.seeds = new Float32Array(N * 4); // x, y, z, phase
    for (let i = 0; i < N; i++) {
      this.seeds[i * 4] = Math.random();
      this.seeds[i * 4 + 1] = Math.random();
      this.seeds[i * 4 + 2] = Math.random();
      this.seeds[i * 4 + 3] = Math.random() * 6.28;
    }
    scene.add(this.rain, this.snow);
    this.kind = 'clear';
    this.intensity = 0;
    this.wind = 0;
    this.t = 0;
    this.flash = 0;
    this.nextThunder = 5;
  }

  set(kind, intensity, wind) {
    this.kind = kind;
    this.intensity = intensity;
    this.wind = wind;
  }

  update(dt, center) {
    this.t += dt;
    const { w, h, d } = this.box;
    const isRain = (this.kind === 'rain' || this.kind === 'storm') && this.intensity > 0;
    const isSnow = this.kind === 'snow' && this.intensity > 0;
    this.rain.visible = isRain;
    this.snow.visible = isSnow;
    const active = Math.floor(this.N * this.intensity);
    if (isRain) {
      const pos = this.rainGeo.attributes.position.array;
      const fall = 24, slant = this.wind * 6;
      for (let i = 0; i < this.N; i++) {
        const o = i * 6;
        if (i >= active) { pos.fill(0, o, o + 6); pos[o + 1] = pos[o + 4] = -100; continue; }
        const sd = this.seeds;
        let y = (sd[i * 4 + 1] * h - this.t * fall * (0.8 + sd[i * 4 + 3] * 0.05)) % h;
        if (y < 0) y += h;
        const x = center.x + (sd[i * 4] - 0.5) * w + (slant * y) / fall;
        const z = center.z + (sd[i * 4 + 2] - 0.5) * d;
        pos[o] = x; pos[o + 1] = y; pos[o + 2] = z;
        pos[o + 3] = x - slant * 0.04; pos[o + 4] = y + 0.9; pos[o + 5] = z;
      }
      this.rainGeo.attributes.position.needsUpdate = true;
    }
    if (isSnow) {
      const pos = this.snowGeo.attributes.position.array;
      for (let i = 0; i < this.N; i++) {
        const o = i * 3, sd = this.seeds;
        if (i >= active) { pos[o + 1] = -100; continue; }
        let y = (sd[i * 4 + 1] * h - this.t * 1.6) % h;
        if (y < 0) y += h;
        pos[o] = center.x + (sd[i * 4] - 0.5) * w + Math.sin(this.t * 0.8 + sd[i * 4 + 3]) * 0.6 + this.wind * y * 0.2;
        pos[o + 1] = y;
        pos[o + 2] = center.z + (sd[i * 4 + 2] - 0.5) * d + Math.cos(this.t * 0.6 + sd[i * 4 + 3]) * 0.6;
      }
      this.snowGeo.attributes.position.needsUpdate = true;
    }
    // 번개
    this.flash = Math.max(0, this.flash - dt * 4);
    if (this.kind === 'storm') {
      this.nextThunder -= dt;
      if (this.nextThunder <= 0) { this.flash = 1; this.nextThunder = 6 + Math.random() * 10; this.onThunder?.(); }
    }
  }
}

function dotTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.6, 'rgba(255,255,255,0.8)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 32, 32);
  const t = new THREE.CanvasTexture(c);
  return t;
}
