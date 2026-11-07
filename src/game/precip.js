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
    this.density = 1; // 품질·실내에 따른 입자 비율 (world.update 가 매 프레임 정함, 0 이면 계산·업로드도 안 함)
  }

  set(kind, intensity, wind) {
    this.kind = kind;
    this.intensity = intensity;
    this.wind = wind;
  }

  update(dt, center) {
    this.t += dt;
    const { w, h, d } = this.box;
    const active = activeCount(this.N, this.intensity, this.density);
    const isRain = (this.kind === 'rain' || this.kind === 'storm') && active > 0;
    const isSnow = this.kind === 'snow' && active > 0;
    this.rain.visible = isRain;
    this.snow.visible = isSnow;
    // 살아 있는 입자만 계산하고, 그만큼만 그리고 올림 (나머지는 그리기 범위 밖)
    if (isRain) {
      const pos = this.rainGeo.attributes.position.array;
      const fall = 24, slant = this.wind * 6, sd = this.seeds;
      for (let i = 0; i < active; i++) {
        const o = i * 6;
        let y = (sd[i * 4 + 1] * h - this.t * fall * (0.8 + sd[i * 4 + 3] * 0.05)) % h;
        if (y < 0) y += h;
        const x = center.x + (sd[i * 4] - 0.5) * w + (slant * y) / fall;
        const z = center.z + (sd[i * 4 + 2] - 0.5) * d;
        pos[o] = x; pos[o + 1] = y; pos[o + 2] = z;
        pos[o + 3] = x - slant * 0.04; pos[o + 4] = y + 0.9; pos[o + 5] = z;
      }
      this.rainGeo.setDrawRange(0, active * 2);
      uploadRange(this.rainGeo.attributes.position, active * 6);
    }
    if (isSnow) {
      const pos = this.snowGeo.attributes.position.array, sd = this.seeds;
      for (let i = 0; i < active; i++) {
        const o = i * 3;
        let y = (sd[i * 4 + 1] * h - this.t * 1.6) % h;
        if (y < 0) y += h;
        pos[o] = center.x + (sd[i * 4] - 0.5) * w + Math.sin(this.t * 0.8 + sd[i * 4 + 3]) * 0.6 + this.wind * y * 0.2;
        pos[o + 1] = y;
        pos[o + 2] = center.z + (sd[i * 4 + 2] - 0.5) * d + Math.cos(this.t * 0.6 + sd[i * 4 + 3]) * 0.6;
      }
      this.snowGeo.setDrawRange(0, active);
      uploadRange(this.snowGeo.attributes.position, active * 3);
    }
    // 번개
    this.flash = Math.max(0, this.flash - dt * 4);
    if (this.kind === 'storm') {
      this.nextThunder -= dt;
      if (this.nextThunder <= 0) { this.flash = 1; this.nextThunder = 6 + Math.random() * 10; this.onThunder?.(); }
    }
  }
}

/** 살아 있는 입자 수: 최대 N × 세기(0~1) × 품질 비율 (순수 계산 → tests/precip.test.js) */
export function activeCount(N, intensity, density = 1) {
  if (!(intensity > 0) || !(density > 0)) return 0;
  return Math.min(N, Math.floor(N * Math.min(1, intensity) * Math.min(1, density)));
}

/** 앞쪽 count 개 값만 GPU 로 올림 (count 0 이면 올리지 않음: 길이 0 범위는 버퍼 전체 업로드가 되므로) */
function uploadRange(attr, count) {
  if (count <= 0) return;
  attr.clearUpdateRanges();
  attr.addUpdateRange(0, count);
  attr.needsUpdate = true;
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
