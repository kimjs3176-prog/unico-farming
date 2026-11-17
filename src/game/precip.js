import * as THREE from 'three';
import { skipOverride } from './fx.js';

// 빗줄기 (GPU): 사각형 한 장을 빗방울 수만큼 인스턴스로 그림. 위치·낙하는 정점 셰이더가 시간으로 계산 → 매 프레임 JS 계산·버퍼 업로드 없음
const RAIN_VS = /* glsl */`
  attribute vec4 aSeed; // x, z: 상자 안 자리, y: 높이 위상, w: 속도·길이 난수
  uniform float uTime, uFall, uSlant, uLen, uWidth, uPxMin, uPxMax, uViewH;
  uniform vec3 uCenter, uBox;
  varying float vAlong; varying float vSide; varying float vA;
  void main(){
    float h = uBox.y;
    float y = mod(aSeed.y * h - uTime * uFall * (0.8 + aSeed.w * 0.05), h);
    // 월드에 고정된 기둥: 상자가 따라 움직여도 빗방울이 미끄러지지 않게 상자 안으로 감음
    vec2 lo = uCenter.xz - uBox.xz * 0.5;
    vec2 col = aSeed.xz * uBox.xz;
    vec2 xz = lo + mod(col - lo, uBox.xz);
    vec3 head = vec3(xz.x + uSlant * y / uFall, uCenter.y + y, xz.y);
    vec3 axis = normalize(vec3(uSlant, uFall, 0.0)); // 떨어지는 방향의 반대 (꼬리 쪽)
    vec3 tail = head + axis * uLen * (0.75 + aSeed.w * 0.04);
    vec4 hv = viewMatrix * vec4(head, 1.0), tv = viewMatrix * vec4(tail, 1.0);
    vAlong = position.y;
    vSide = position.x;
    vec4 P = mix(hv, tv, position.y);
    float dz = max(-P.z, 0.05);
    vec3 dir = normalize(tv.xyz - hv.xyz + 1e-5);
    vec3 side = normalize(cross(dir, P.xyz) + vec3(1e-5, 0.0, 0.0));
    // 화면 폭(픽셀) 제한: 너무 가늘면 넓히고 그만큼 흐리게 (멀리서 깜빡이지 않게), 저사양은 최대 폭도 제한
    float pxPerM = projectionMatrix[1][1] * uViewH * 0.5 / dz;
    float px = uWidth * pxPerM;
    float pw = clamp(px, uPxMin, uPxMax);
    vA = min(1.0, px / uPxMin) * smoothstep(1.2, 3.5, dz) * (1.0 - smoothstep(26.0, 40.0, dz));
    P.xyz += side * position.x * 0.5 * pw / pxPerM;
    gl_Position = projectionMatrix * P;
  }`;
const RAIN_FS = /* glsl */`
  uniform vec3 uColor; uniform float uAlpha;
  varying float vAlong; varying float vSide; varying float vA;
  void main(){
    // 머리(아래)가 진하고 꼬리로 갈수록 흐림, 옆 가장자리는 부드럽게
    float a = smoothstep(0.0, 0.12, vAlong) * pow(1.0 - vAlong, 0.8) * (1.0 - vSide * vSide * 0.5);
    gl_FragColor = vec4(uColor, a * vA * uAlpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

// 땅 튀김 (보통·고사양): 바닥에 퍼지는 작은 고리
const SPLASH_N = 64, SPLASH_LIFE = 0.36;
const SPLASH_VS = /* glsl */`
  attribute vec4 aSpl; // x, y, z, 시작 시각
  uniform float uTime; varying vec2 vUv; varying float vAge;
  void main(){
    vAge = (uTime - aSpl.w) / ${SPLASH_LIFE.toFixed(2)};
    float sz = 0.7 + 0.6 * fract(aSpl.w * 7.31); // 고리마다 크기 조금씩 다르게
    float r = (0.06 + 0.22 * sqrt(clamp(vAge, 0.0, 1.0))) * sz; // 빨리 퍼지다 느려짐 (반지름 약 0.2~0.35m)
    vUv = position.xz;
    vec3 p = aSpl.xyz + vec3(position.x * r, 0.03, position.z * r);
    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  }`;
const SPLASH_FS = /* glsl */`
  uniform vec3 uColor; uniform float uAlpha; varying vec2 vUv; varying float vAge;
  void main(){
    float d = length(vUv);
    float ring = smoothstep(0.68, 0.86, d) * (1.0 - smoothstep(0.88, 1.0, d));
    float a = ring * (1.0 - vAge) * (1.0 - vAge) * step(0.0, vAge) * step(vAge, 0.999);
    if (a < 0.01) discard;
    gl_FragColor = vec4(uColor, a * uAlpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

/** 비/눈 파티클 (카메라 주변 상자 안에서 순환) + 번개 섬광 */
export class Precipitation {
  constructor(scene) {
    this.scene = scene;
    const N = 2200;
    this.N = N;
    this.box = { w: 46, h: 22, d: 46 }; // 눈 상자 (플레이어 둘레)
    this.rainBox = { w: 30, h: 18, d: 30 }; // 비 상자 (카메라와 플레이어 사이: 화면 안에 더 많이)
    this.seeds = new Float32Array(N * 4); // x, y, z, phase
    for (let i = 0; i < N; i++) {
      this.seeds[i * 4] = Math.random();
      this.seeds[i * 4 + 1] = Math.random();
      this.seeds[i * 4 + 2] = Math.random();
      this.seeds[i * 4 + 3] = Math.random() * 6.28;
    }
    // 비: 사각형 한 장(4정점) × 인스턴스, 난수는 처음 한 번만 올림
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, 0, 1, 0, 0, -1, 1, 0, 1, 1, 0], 3));
    geo.setIndex([0, 1, 2, 2, 1, 3]);
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(this.seeds, 4));
    geo.instanceCount = 0;
    this.rainGeo = geo;
    this.rainU = {
      uTime: { value: 0 }, uFall: { value: 24 }, uSlant: { value: 0 }, uLen: { value: 1.05 }, uWidth: { value: 0.022 },
      uPxMin: { value: 1.4 }, uPxMax: { value: 1e3 }, uViewH: { value: 800 },
      uCenter: { value: new THREE.Vector3() }, uBox: { value: new THREE.Vector3(this.rainBox.w, this.rainBox.h, this.rainBox.d) },
      uColor: { value: new THREE.Color(0xa7c3db) }, uAlpha: { value: 0.45 },
    };
    // 앞뒤 모두 그림: 화면을 향해 세운 사각형이라 감김 방향이 카메라 쪽에 따라 뒤집힘
    this.rain = new THREE.Mesh(geo, new THREE.ShaderMaterial({ uniforms: this.rainU, vertexShader: RAIN_VS, fragmentShader: RAIN_FS, transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide }));
    this.rain.frustumCulled = false;
    this.rain.renderOrder = 2;
    // 처음엔 보이게 둠 (그릴 개수 0 → 그리지 않음): 로딩 때 셰이더를 미리 컴파일, update 가 매 프레임 정함
    this.rain.visible = true;
    // 실제 화면 높이(장치 픽셀)·픽셀 비율로 폭 제한 (저사양 폰은 약 1.35배로 그림)
    this.rain.onBeforeRender = (r, scene) => {
      // AO 법선·깊이 패스(덮어쓰기 재질)에서는 그리지 않음: 원점에 사각형 겹침이 생김
      if (scene?.overrideMaterial) { this.rain.matrixWorld.makeScale(0, 0, 0); return; }
      r.getDrawingBufferSize(_buf);
      const pr = r.getPixelRatio();
      this.rainU.uViewH.value = _buf.y;
      const lim = rainPxLimits(pr, this.thin);
      this.rainU.uPxMin.value = lim.min;
      this.rainU.uPxMax.value = lim.max;
    };
    // 눈: 둥근 점 (그릴 개수 0 으로 보이게 두어 로딩 때 컴파일)
    const spos = new Float32Array(N * 3);
    this.snowGeo = new THREE.BufferGeometry();
    this.snowGeo.setAttribute('position', new THREE.BufferAttribute(spos, 3));
    this.snowGeo.setDrawRange(0, 0);
    this.snowMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.16, transparent: true, alphaTest: 0.1, depthWrite: false, map: typeof document !== 'undefined' ? dotTexture() : null });
    this.snow = new THREE.Points(this.snowGeo, this.snowMat);
    this.snow.frustumCulled = false;
    this.snow.visible = true;
    scene.add(this.rain, this.snow);
    this._makeSplash();
    this.kind = 'clear';
    this.intensity = 0;
    this.wind = 0;
    this.t = 0;
    this.flash = 0;
    this.nextThunder = 5;
    this.density = 1; // 품질·실내에 따른 입자 비율 (world.update 가 매 프레임 정함, 0 이면 계산·업로드도 안 함)
    this.thin = false; // 저사양: 빗줄기 수 3/4, 화면 폭 2px 이하
    this.light = 1; // 밤·흐림에 빗줄기 밝기 (world.update)
    this.splash = false; // 땅 튀김 (보통·고사양만, world.update)
    this.ground = null; // (x, z) → 튀김 높이, 놓을 수 없으면 null (world 가 넣음)
    this.view = null; // 카메라 위치 (비 상자 중심을 카메라 쪽으로)
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
    const rainN = rainCount(this.N, this.intensity, this.density, this.thin);
    const isRain = (this.kind === 'rain' || this.kind === 'storm') && rainN > 0;
    const isSnow = this.kind === 'snow' && active > 0;
    this.rain.visible = isRain;
    this.snow.visible = isSnow;
    // 비: 그릴 개수와 유니폼만 바꿈 (위치는 셰이더)
    this.rainGeo.instanceCount = isRain ? rainN : 0;
    if (isRain) {
      const U = this.rainU, v = this.view;
      U.uTime.value = this.t;
      U.uSlant.value = this.wind * 6;
      // 상자 중심: 플레이어와 카메라 사이 (카메라 정보가 없으면 플레이어)
      U.uCenter.value.set(v ? (center.x + v.x) / 2 : center.x, 0, v ? (center.z + v.z) / 2 : center.z);
      U.uColor.value.setHex(0xa7c3db).multiplyScalar(this.light);
      U.uAlpha.value = (this.kind === 'storm' ? 0.7 : 0.6) * (this.thin ? 1.4 : 1); // 저사양: 가는 줄이라 조금 진하게
      const B = this.thin ? RAIN_BOX_LOW : this.rainBox; // 저사양: 상자를 줄여 같은 수로 화면에 촘촘히
      U.uBox.value.set(B.w, B.h, B.d);
    }
    this._splashes(isRain && this.splash, center);
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

  /** 땅 튀김 메시 (처음부터 만들어 로딩 때 컴파일, 개수 0 이면 그리지 않음) */
  _makeSplash() {
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, -1, 1, 0, -1, -1, 0, 1, 1, 0, 1], 3));
    geo.setIndex([0, 2, 1, 1, 2, 3]);
    this.splArr = new Float32Array(SPLASH_N * 4).fill(-99);
    this.splAttr = new THREE.InstancedBufferAttribute(this.splArr, 4);
    this.splAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aSpl', this.splAttr);
    geo.instanceCount = 0;
    this.splGeo = geo;
    this.splU = { uTime: { value: 0 }, uColor: { value: new THREE.Color(0xe4eef8) }, uAlpha: { value: 0.4 } }; // 은은하게 (하얀 표시처럼 뜨지 않게)
    this.spl = new THREE.Mesh(geo, new THREE.ShaderMaterial({ uniforms: this.splU, vertexShader: SPLASH_VS, fragmentShader: SPLASH_FS, transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide }));
    this.spl.frustumCulled = false;
    this.spl.renderOrder = 1;
    this.spl.onBeforeRender = skipOverride; // AO 패스에서는 그리지 않음
    this.scene.add(this.spl);
  }

  /** 땅 튀김: 수명이 끝난 것만 CPU 에서 새 자리로 (프레임당 몇 개), 물·건물·장애물 위는 건너뜀 */
  _splashes(on, center) {
    this.spl.visible = on;
    this.splGeo.instanceCount = on ? SPLASH_N : 0;
    if (!on) return;
    const U = this.splU, a = this.splArr, t = this.t;
    U.uTime.value = t;
    U.uColor.value.setHex(0xe4eef8).multiplyScalar(this.light);
    let dirty = false;
    const n = Math.max(1, Math.round(SPLASH_N * Math.min(1, this.intensity * 1.3)));
    for (let i = 0; i < n; i++) {
      if (t - a[i * 4 + 3] < SPLASH_LIFE) continue;
      // 플레이어 둘레 10m (카메라 쪽으로 조금 치우침: 보는 곳에 촘촘히)
      const v = this.view;
      const cx = v ? center.x + (v.x - center.x) * 0.3 : center.x, cz = v ? center.z + (v.z - center.z) * 0.3 : center.z;
      const r = Math.sqrt(Math.random()) * 10, ang = Math.random() * Math.PI * 2;
      const x = cx + Math.cos(ang) * r, z = cz + Math.sin(ang) * r;
      const y = this.ground ? this.ground(x, z) : 0;
      a[i * 4 + 3] = t + Math.random() * 0.25; // 시작을 흩어 한꺼번에 터지지 않게
      if (y === null || y === undefined) { a[i * 4 + 1] = -99; dirty = true; continue; }
      a[i * 4] = x; a[i * 4 + 1] = y; a[i * 4 + 2] = z;
      dirty = true;
    }
    for (let i = n; i < SPLASH_N; i++) if (a[i * 4 + 1] !== -99) { a[i * 4 + 1] = -99; dirty = true; }
    if (dirty) this.splAttr.needsUpdate = true;
  }
}

const _buf = new THREE.Vector2();
/** 저사양 비 상자: 카메라 앞을 더 촘촘히 (같은 그리기 1번) */
export const RAIN_BOX_LOW = { w: 22, h: 14, d: 22 };

/** 빗줄기 수: 저사양(thin)은 품질 비율 0.4 의 9/8 (약 0.45) — 폭 2px 이하라 폰에서도 비가 읽히게 */
export function rainCount(N, intensity, density = 1, thin = false) {
  return activeCount(N, intensity, density * (thin ? 1.125 : 1));
}

/** 빗줄기 화면 폭 한계(장치 픽셀): 최소 1.4 CSS px (실제 픽셀 비율 반영), 저사양은 최대 2px */
export function rainPxLimits(pr = 1, thin = false) {
  const max = thin ? 2 : 1e3;
  return { min: Math.min(max, 1.4 * Math.max(1, pr || 1)), max };
}

/** 살아 있는 입자 수: 최대 N × 세기(0~1) × 품질 비율 (순수 계산 → tests/world_batch.test.js) */
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
