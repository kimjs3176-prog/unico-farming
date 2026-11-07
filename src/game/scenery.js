import * as THREE from 'three';
import { LAYOUT, cellKey } from './world.js';
import { heightAt } from './terrain.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { mergeGeometries as mergeGeo } from 'three/addons/utils/BufferGeometryUtils.js';

const RIPPLES = 16; // 동시에 퍼지는 파문 수
const GRASS_CELL = 20; // 잔디 칸 크기(m): 칸마다 InstancedMesh 하나 → 화면 밖 칸은 그리지 않음 (맵 80m → 4×4)
const GRASS_FADE = 8; // 풀 거리 제한(저사양)의 사라지는 폭(m)
// 하늘·빛 먼지 색 (매 프레임 새로 만들지 않게)
const DAY_TOP = new THREE.Color(0x4f9ff0), DAY_HZ = new THREE.Color(0xd6eeff);
const DUSK_TOP = new THREE.Color(0x4a3f8a), DUSK_HZ = new THREE.Color(0xf7b27a);
const NIGHT_TOP = new THREE.Color(0x0a1230), NIGHT_HZ = new THREE.Color(0x1f2c52);
const MOTE_DUSK = new THREE.Color(0xffb35a);

/** 하늘 돔(그라데이션), 구름, 지평선 언덕, 잔디 인스턴싱, 연못 물결 — 분위기 레이어 */
export class Scenery {
  constructor(world) {
    this.world = world;
    const scene = world.scene;
    this.t = 0;
    // ---- 하늘 돔 ----
    this.skyUniforms = {
      top: { value: new THREE.Color(0x5aaaf0) },
      horizon: { value: new THREE.Color(0xd8efff) },
      bottom: { value: new THREE.Color(0xbfe4ff) },
      sunDir: { value: new THREE.Vector3(0, 1, 0) },
      sunColor: { value: new THREE.Color(0xfff2c8) },
      glow: { value: new THREE.Color(0xff9a5a) }, // 노을 번짐 색
      dusk: { value: 0 }, night: { value: 0 }, cloudy: { value: 0 }, time: { value: 0 },
    };
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(260, 48, 24),
      new THREE.ShaderMaterial({
        uniforms: this.skyUniforms,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        // 그라데이션 + 해 원반·번짐 + 해 쪽 지평선 노을 띠 + 밤에는 별·달
        fragmentShader: `uniform vec3 top, horizon, bottom, sunDir, sunColor, glow; uniform float dusk, night, cloudy, time; varying vec3 vDir;
          float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
          void main(){
            vec3 d = normalize(vDir); float h = d.y;
            vec3 c = h > 0.0 ? mix(horizon, top, pow(h, 0.5)) : mix(horizon, bottom, pow(-h, 0.6));
            vec3 sd = normalize(sunDir);
            float s = max(dot(d, sd), 0.0);
            // 해 쪽 방위만 지평선이 노을빛으로 (반대쪽은 푸르스름)
            vec2 a = normalize(d.xz + 1e-4), b = normalize(sd.xz + 1e-4);
            float az = dot(a, b) * 0.5 + 0.5;
            float band = exp(-abs(h) * 7.0) * (0.35 + 0.65 * pow(az, 2.0));
            c = mix(c, glow, band * dusk * (1.0 - cloudy * 0.7));
            c += glow * pow(s, 6.0) * 0.35 * dusk * (1.0 - cloudy);
            c += sunColor * (smoothstep(0.9993, 0.9997, s) * 2.2 + pow(s, 160.0) * 0.9 + pow(s, 14.0) * 0.12) * (1.0 - night);
            // 별: 하늘 위쪽에 반짝 (구름 끼면 안 보임)
            if (night > 0.01 && h > 0.0) {
              vec2 g = vec2(atan(d.z, d.x) * 120.0, h * 160.0);
              vec2 cell = floor(g); vec2 f = fract(g) - 0.5;
              float r = h21(cell);
              float star = step(0.985, r) * smoothstep(0.32, 0.0, length(f)) * (0.6 + 0.4 * sin(time * (2.0 + r * 5.0) + r * 40.0));
              c += vec3(0.9, 0.95, 1.0) * star * night * smoothstep(0.0, 0.25, h) * (1.0 - cloudy);
              // 달 (해 반대쪽)
              float m = max(dot(d, normalize(-sd + vec3(0.0, 0.35, 0.0))), 0.0);
              c += vec3(0.95, 0.93, 0.85) * (smoothstep(0.9990, 0.9994, m) * 1.3 + pow(m, 60.0) * 0.18) * night * (1.0 - cloudy * 0.8);
            }
            gl_FragColor = vec4(c, 1.0);
          }`,
      }),
    );
    sky.renderOrder = -10;
    scene.add(sky);
    this.sky = sky;
    // ---- 지평선 언덕 ----
    const hillMat = new THREE.MeshStandardMaterial({ color: 0x6fb84a, roughness: 1 });
    const rnd = mulberry32(9);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + rnd() * 0.3;
      const r = 78 + rnd() * 20;
      const hill = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), hillMat);
      hill.position.set(Math.cos(a) * r, -4, Math.sin(a) * r);
      hill.scale.set(28 + rnd() * 22, 9 + rnd() * 8, 24 + rnd() * 16);
      scene.add(hill);
    }
    // ---- 구름 ----
    this.clouds = [];
    this.cloudMats = new Set(); // 구름은 재질을 공유 → 색은 재질마다 한 번만 바꿈
    const cloudSrc = world.assets.scenes.get('cloud');
    for (let i = 0; i < 9; i++) {
      const c = world.assets.clone('cloud');
      c.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; this.cloudMats.add(o.material); } });
      const s = 2.5 + rnd() * 3;
      c.scale.set(s, s * 0.8, s);
      c.position.set((rnd() - 0.5) * 220, 38 + rnd() * 18, (rnd() - 0.5) * 220);
      c.userData.speed = 0.6 + rnd() * 0.8;
      scene.add(c);
      this.clouds.push(c);
    }
    void cloudSrc;
    // ---- 잔디 인스턴싱 ----
    this._grass(rnd);
    // ---- 들꽃 ----
    this._flowers(rnd);
    // ---- 연못 물결 ----
    this._water();
    this._motes();
  }

  _grass(rnd) {
    const L = LAYOUT;
    const no = [
      [L.smartfarm.x - 4.5, L.smartfarm.z - 5, L.smartfarm.x + 7, L.smartfarm.z + 5.5],
      [L.barn.x - 3, L.barn.z - 3.5, L.barn.x + 3, L.barn.z + 3.5], [L.market.x - 2, L.market.z - 1, L.market.x + 2, L.market.z + 1],
    ];
    const blade = new THREE.ConeGeometry(0.028, 0.26, 3, 1, true);
    blade.translate(0, 0.13, 0);
    const parts = [];
    for (let i = 0; i < 7; i++) {
      const g = blade.clone();
      const a = (i / 7) * Math.PI * 2;
      g.rotateX((rnd() - 0.5) * 0.7);
      g.rotateZ((rnd() - 0.5) * 0.7);
      g.translate(Math.cos(a) * 0.07, 0, Math.sin(a) * 0.07);
      parts.push(g);
    }
    const geo = mergeGeometries(parts);
    this.grassGeo = geo;
    this.grassGeoLean = mergeGeometries([0, 2, 4, 6].map((i) => parts[i])); // 저사양: 잎 4장 (정점 -43%, 같은 잎을 골라 모양은 비슷)
    const mat = new THREE.MeshStandardMaterial({ color: 0x86d156, roughness: 1, side: THREE.DoubleSide });
    this.windUniform = { value: 0 };
    this.grassFar = { value: new THREE.Vector3(0, 0, 0) }; // 저사양 풀 거리 제한 (x,z: 기준점, y: 거리, 0 = 끔)
    this.pushers = { value: [0, 1, 2, 3].map(() => new THREE.Vector3(9999, 0.01, 9999)) }; // (x, 반지름, z)
    this.windStrength = { value: 0.18 };
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.windUniform;
      sh.uniforms.uWind = this.windStrength;
      sh.uniforms.uPush = this.pushers;
      sh.uniforms.uGFar = this.grassFar;
      sh.vertexShader = 'uniform float uTime; uniform float uWind; uniform vec3 uPush[4]; uniform vec3 uGFar; varying float vGH;\n' + sh.vertexShader.replace('#include <begin_vertex>',
        `#include <begin_vertex>
         vGH = clamp(position.y / 0.26, 0.0, 1.0);
         float sway = (sin(uTime * (1.4 + uWind * 3.0) + instanceMatrix[3].x * 0.35 + instanceMatrix[3].z * 0.5) + uWind * 1.2) * (0.12 + uWind * 0.4) * position.y;
         transformed.x += sway; transformed.z += sway * 0.5;
         // 캐릭터 발밑 잔디는 바깥으로 눕힘 (x,z: 위치, w 대신 y: 반지름)
         for (int k = 0; k < 4; k++) {
           vec2 dp = instanceMatrix[3].xz - uPush[k].xz; float dd = length(dp);
           float bend = (1.0 - smoothstep(0.0, uPush[k].y, dd)) * position.y * 0.9;
           transformed.xz += normalize(dp + 1e-4) * bend; transformed.y -= bend * 0.35;
         }
         // 거리 제한(저사양): 끝 ${GRASS_FADE}m 동안 포기가 밑동 쪽으로 줄어들며 사라짐 (칸이 툭 끊기지 않게)
         if (uGFar.y > 0.0) transformed *= 1.0 - smoothstep(uGFar.y - ${GRASS_FADE.toFixed(1)}, uGFar.y, distance(instanceMatrix[3].xz, uGFar.xz));`);
      sh.fragmentShader = 'varying float vGH;\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
         diffuseColor.rgb *= mix(0.42, 1.18, vGH);
         diffuseColor.rgb += vec3(0.06, 0.07, 0.0) * smoothstep(0.7, 1.0, vGH);`);
    };
    const COUNT = 9000; // 최대치로 위치를 뽑고 품질 설정에 따라 앞쪽 일부만 그림 (setDensity)
    const mats = [], cols = [];
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const col = new THREE.Color(), up = new THREE.Vector3(0, 1, 0);
    let n = 0, tries = 0;
    const B = LAYOUT.bounds;
    while (n < COUNT && tries < COUNT * 6) {
      tries++;
      const x = (rnd() - 0.5) * 2 * B, z = (rnd() - 0.5) * 2 * B;
      if (Math.hypot(x - LAYOUT.pond.x, z - LAYOUT.pond.z) < LAYOUT.pond.r + 1.5) continue;
      if (Math.hypot(x - LAYOUT.lake.x, z - LAYOUT.lake.z) < LAYOUT.lake.r + 1.6) continue;
      if (no.some(([x0, z0, x1, z1]) => x > x0 && x < x1 && z > z0 && z < z1)) continue;
      if (this.world.isBare(x, z) || this.world.isReserved(x, z, -0.5, true)) continue;
      if (this.world.isBlocked(x, z, 0.3)) continue;
      p.set(x, heightAt(x, z), z);
      q.setFromAxisAngle(up, rnd() * Math.PI * 2);
      const sc = 0.6 + rnd() * 0.6;
      s.set(sc, sc * (0.8 + rnd() * 0.6), sc);
      mats.push(m.compose(p, q, s).clone());
      col.setHSL(0.26 + rnd() * 0.04, 0.5 + rnd() * 0.15, 0.38 + rnd() * 0.1);
      cols.push(col.clone());
      n++;
    }
    this.grassTotal = n;
    // 칸별로 나눠 담음: 칸 안 순서도 전역 순서 그대로 → 밀도를 줄여도 예전과 똑같은 풀이 남음
    const cells = groupByCell(n, (i) => mats[i].elements[12], (i) => mats[i].elements[14], GRASS_CELL);
    const chunks = [];
    for (const gids of cells.values()) {
      const mesh = new THREE.InstancedMesh(geo, mat, gids.length);
      mesh.receiveShadow = true;
      const box = new THREE.Box2();
      gids.forEach((g, k) => { mesh.setMatrixAt(k, mats[g]); mesh.setColorAt(k, cols[g]); box.expandByPoint(_v2.set(mats[g].elements[12], mats[g].elements[14])); });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere(); // 전부 그릴 때 기준으로 미리 (밀도를 바꿔도 컬링 구가 작아지지 않게)
      mesh.boundingSphere.radius += 0.6; // 바람·발밑 눕힘 여유
      mesh.userData.gids = gids;
      mesh.userData.box = box;
      chunks.push(mesh);
    }
    this.grass = new GrassField(chunks, n, mat);
    this.world.scene.add(this.grass);
  }

  /** 들꽃: 꽃잎 5장 + 줄기, 색은 인스턴스별 (알록달록한 들판) */
  _flowers(rnd) {
    const parts = [];
    const stem = new THREE.CylinderGeometry(0.012, 0.012, 0.22, 3, 1, true);
    stem.translate(0, 0.11, 0);
    parts.push(stem);
    const petals = new THREE.CircleGeometry(0.085, 5);
    petals.rotateX(-Math.PI / 2);
    petals.translate(0, 0.23, 0);
    parts.push(petals);
    const center = new THREE.OctahedronGeometry(0.03, 0);
    center.translate(0, 0.245, 0);
    parts.push(center.index ? center : center);
    const geo = mergeGeometries(parts.map((g) => (g.index ? g : withIndex(g))));
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.8, side: THREE.DoubleSide });
    const COUNT = 1400;
    const mesh = new THREE.InstancedMesh(geo, mat, COUNT);
    const palette = [0xffffff, 0xffe066, 0xf3b7cf, 0xe35d5d, 0xb39ddb, 0x8ecae6];
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3(), col = new THREE.Color();
    let n = 0, tries = 0;
    const B = LAYOUT.bounds - 2;
    // 군락: 무작위 중심 주변에 모여 핌
    const clusters = Array.from({ length: 40 }, () => [(rnd() - 0.5) * 2 * B, (rnd() - 0.5) * 2 * B, palette[Math.floor(rnd() * palette.length)]]);
    while (n < COUNT && tries < COUNT * 8) {
      tries++;
      const [cx, cz, pc] = clusters[Math.floor(rnd() * clusters.length)];
      const x = cx + (rnd() - 0.5) * 6, z = cz + (rnd() - 0.5) * 6;
      if (Math.abs(x) > B || Math.abs(z) > B) continue;
      if (this.world.isBare(x, z) || this.world.isBlocked(x, z, 0.4) || this.world.isReserved(x, z, 0, true)) continue;
      if (Math.hypot(x - LAYOUT.pond.x, z - LAYOUT.pond.z) < LAYOUT.pond.r + 1) continue;
      if (Math.hypot(x - LAYOUT.lake.x, z - LAYOUT.lake.z) < LAYOUT.lake.r + 1.2) continue;
      p.set(x, heightAt(x, z), z);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * 6.28);
      const s = 0.8 + rnd() * 0.6;
      sc.set(s, s, s);
      m.compose(p, q, sc);
      mesh.setMatrixAt(n, m);
      mesh.setColorAt(n, col.setHex(rnd() < 0.8 ? pc : palette[Math.floor(rnd() * palette.length)]));
      n++;
    }
    mesh.count = n;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    this.world.scene.add(mesh);
    this.flowers = mesh;
    this.flowerTotal = n;
  }

  /** 풀·들꽃 밀도 (0~1). 인스턴스는 무작위 순서라 앞쪽 일부만 그려도 고르게 줄어듦 */
  setDensity(d) {
    this.density = d;
    if (this.grass) {
      this.grass.setVisibleCount(Math.round(this.grassTotal * d));
      this.grass.setGeometry(this.world.quality?.grassLean ? this.grassGeoLean : this.grassGeo); // 품질 바뀔 때 (main.applyQuality → setDensity)
    }
    if (this.flowers) this.flowers.count = Math.round(this.flowerTotal * Math.min(1, 0.25 + d * 0.75) * (this.seasonFlowers ?? 1)); // 계절: 겨울엔 들꽃 없음
  }

  /** 수면에 파문 (amp 0.2 잔잔 ~ 1.5 크게 첨벙) */
  addRipple(x, z, amp = 1) {
    if (!this.ripples) return;
    const r = this.ripples[this._ri = ((this._ri || 0) + 1) % RIPPLES];
    r.set(x, z, this.clock.value, amp);
  }

  _water() {
    if (this.water) { // 품질이 바뀌어 다시 만들 때: 반사 수면은 dispose 가 재질·렌더 타깃까지, 저사양 수면은 재질을 따로 해제
      this.world.scene.remove(this.water);
      if (this.water.isReflector) this.water.dispose(); else this.water.material.dispose();
      this.water.geometry.dispose();
    }
    const L = LAYOUT.pond;
    this.waterUniform = { value: 0 };
    // 연못 + 낚시터 호수를 한 메시로: 같은 수면 높이라 반사(거울 카메라) 렌더 1번으로 둘 다 비춤.
    // 물가 거품·깊이색에 쓰는 중심·반지름은 정점 속성으로
    const waters = [LAYOUT.pond, LAYOUT.lake];
    const q = this.world.quality || {};
    // 물결 고리 (헤엄·찌·물고기·잠수가 만든 파문): x, z, 시작 시각, 세기. 링 버퍼
    this.ripples ||= Array.from({ length: RIPPLES }, () => new THREE.Vector4(0, 0, -99, 0));
    this.clock ||= { value: 0 };
    const shared = {
      uTime: this.waterUniform, uClock: this.clock, uRip: { value: this.ripples },
      uRain: (this.rainU ||= { value: 0 }), uDay: (this.dayU ||= { value: 1 }), sunDir: (this.sunU ||= { value: new THREE.Vector3(0.4, 0.8, 0.3) }),
      deep: { value: new THREE.Color(0x1f6f9e) }, shallow: { value: new THREE.Color(0x7fd3e8) },
      skyCol: { value: new THREE.Color(0xd6eeff) },
    };
    this.waterShared = shared;
    // 수면: 바람 방향 물결 5겹(해석적 기울기) + 잔물결 노이즈 + 파문·빗방울 고리 → 법선,
    // 깊이색·물속 산란·물가 거품(얼룩진 띠)·햇빛 반짝임 (반사 있는 고사양/보통, 없는 저사양 공통)
    const COMMON = /* glsl */`
      uniform float uTime, uClock, uRain, uDay; uniform vec3 deep, shallow, skyCol, sunDir;
      uniform vec4 uRip[${RIPPLES}];
      varying vec3 vW; varying vec3 vPool; // xy: 중심(x,z), z: 반지름
      float hsh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hsh(i), hsh(i + vec2(1, 0)), u.x), mix(hsh(i + vec2(0, 1)), hsh(i + vec2(1, 1)), u.x), u.y); }
      // 방향 물결 하나: xy = 기울기, z = 높이
      vec3 wv(vec2 p, vec2 d, float k, float sp, float a){ float ph = dot(d, p) * k + uTime * sp; return vec3(d * (a * k * cos(ph)), a * sin(ph)); }
      // 파문 세기(거품용)를 함께 돌려줌
      vec3 surface(vec2 p, out float rfoam){
        vec3 s = wv(p, vec2(0.80, 0.60), 1.9, 1.6, 0.030) + wv(p, vec2(-0.45, 0.89), 2.7, 1.9, 0.020)
               + wv(p, vec2(0.97, -0.24), 4.3, 2.6, 0.011) + wv(p, vec2(-0.70, -0.71), 6.1, 3.1, 0.007)
               + wv(p, vec2(0.30, 0.95), 9.7, 4.2, 0.004);
        // 잔물결: 흘러가는 노이즈의 기울기 (유한 차분)
        vec2 q = p * 3.2 + vec2(uTime * 0.35, uTime * 0.22); float e = 0.12;
        float n0 = vnoise(q), nx = vnoise(q + vec2(e, 0.0)), nz = vnoise(q + vec2(0.0, e));
        s.xy += vec2(nx - n0, nz - n0) / e * 0.012;
        rfoam = 0.0;
        // 파문: 퍼져 나가는 고리 2~3겹, 시간이 지날수록 약해짐
        for (int i = 0; i < ${RIPPLES}; i++) {
          vec4 r = uRip[i]; float age = uClock - r.z;
          if (age < 0.0 || age > 3.2 || r.w <= 0.0) continue;
          vec2 dv = p - r.xy; float d = length(dv) + 1e-4;
          float front = 0.12 + age * 1.15, x = d - front;
          float env = exp(-x * x * 7.0) * step(x, 0.35) * exp(-age * 1.15) * r.w;
          s.xy += dv / d * (cos(x * 15.0) * 15.0 * 0.018 * env);
          rfoam += exp(-x * x * 40.0) * exp(-age * 3.0) * r.w;
        }
        // 빗방울: 0.8m 칸마다 무작위 시각에 작은 고리
        if (uRain > 0.01) {
          vec2 c = floor(p / 0.8), lp = fract(p / 0.8) - 0.5 - (vec2(hsh(c), hsh(c + 7.3)) - 0.5) * 0.6;
          float on = step(hsh(c + 3.1), uRain);
          float age = fract(uClock * 0.9 + hsh(c + 1.7)) / 0.9;
          float d = length(lp) * 0.8, x = d - age * 0.35;
          float env = exp(-x * x * 700.0) * exp(-age * 3.0) * on;
          s.xy += (lp / (length(lp) + 1e-4)) * cos(x * 50.0) * 0.6 * env;
          rfoam += env * 0.45; // 빗방울 고리가 하얗게 반짝
        }
        return s;
      }
      vec3 waterBase(out float fres, out float foam, out vec2 slope){
        vec2 center = vPool.xy; float radius = vPool.z;
        float d = distance(vW.xz, center), edgeD = radius - d;
        float rfoam; vec3 s = surface(vW.xz, rfoam);
        slope = s.xy;
        vec3 V = normalize(cameraPosition - vW);
        vec3 N = normalize(vec3(-s.x * 1.4, 1.0, -s.y * 1.4));
        fres = 0.06 + 0.94 * pow(1.0 - max(dot(V, N), 0.0), 5.0);
        // 깊이: 물가는 얕고 밝은 청록, 가운데는 깊은 파랑 (반경이 큰 호수가 더 깊게)
        float depth = smoothstep(0.0, radius * 0.75, edgeD);
        vec3 base = mix(shallow, deep * (radius > 5.0 ? 0.85 : 1.0), depth);
        // 물결 마루에 햇빛이 비쳐 살짝 밝아지는 산란
        base += vec3(0.05, 0.16, 0.14) * clamp(s.z * 14.0 + 0.3, 0.0, 1.0) * uDay * (1.0 - depth * 0.4);
        // 물가 거품: 노이즈로 얼룩진 띠가 밀려왔다 빠짐
        float surge = 0.5 + 0.5 * sin(uTime * 1.3 - d * 2.0);
        float band = smoothstep(0.75 + surge * 0.25, 0.05, edgeD + (vnoise(vW.xz * 2.6 + uTime * 0.25) - 0.5) * 0.45);
        float breakup = smoothstep(0.35, 0.75, vnoise(vW.xz * 7.0 - uTime * 0.4));
        foam = clamp(band * (0.35 + 0.65 * breakup) + rfoam * (0.5 + 0.5 * breakup), 0.0, 1.0);
        // 햇빛 반짝임 (넓은 하이라이트 + 잘게 부서지는 반짝이)
        vec3 L = normalize(sunDir);
        float sd = max(dot(reflect(-V, N), L), 0.0);
        float glit = pow(sd, 220.0) * smoothstep(0.74, 0.86, vnoise(vW.xz * 18.0 + uTime * 1.7)) * 3.2;
        return base + (pow(sd, 48.0) * 0.45 + glit) * uDay * vec3(1.0, 0.96, 0.85);
      }`;
    const geo = mergeGeo(waters.map((W) => {
      const c = new THREE.CircleGeometry(W.r, W.r > 5 ? 80 : 64).translate(W.x, -W.z, 0); // 수면은 x 축으로 -90° 눕힘 → 로컬 y = -월드 z
      const n = c.attributes.position.count;
      c.setAttribute('pool', new THREE.BufferAttribute(new Float32Array(n * 3).map((_, i) => [W.x, W.z, W.r][i % 3]), 3));
      return c;
    }));
    let water;
    if (q.post !== false && q.level !== 'low') {
      // 실제 반사: 거울 카메라로 연못 위 장면을 렌더 (연못이 화면에 있을 때만 그려짐)
      const res = q.ao ? 512 : 320;
      water = new Reflector(geo, {
        textureWidth: res, textureHeight: res, clipBias: 0.003,
        shader: {
          name: 'PondReflector',
          uniforms: { color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null }, ...shared },
          vertexShader: `uniform mat4 textureMatrix; attribute vec3 pool; varying vec4 vUv; varying vec3 vW; varying vec3 vPool;
            void main(){ vPool = pool; vUv = textureMatrix * vec4(position, 1.0); vW = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
          fragmentShader: `uniform vec3 color; uniform sampler2D tDiffuse; varying vec4 vUv; ${COMMON}
            void main(){
              float fres, foam; vec2 slope; vec3 base = waterBase(fres, foam, slope);
              vec4 uv = vUv; uv.xy += slope * 0.35 * uv.w; // 물결만큼 반사가 일렁임
              vec3 refl = texture2DProj(tDiffuse, uv).rgb;
              vec3 c = mix(base, refl * 0.95, clamp(fres * 0.9 + 0.12, 0.0, 0.9));
              c = mix(c, vec3(0.97, 0.99, 1.0), foam * 0.7);
              gl_FragColor = vec4(c, 1.0);
              #include <tonemapping_fragment>
              #include <colorspace_fragment>
            }`,
        },
      });
    } else {
      // 저사양: 반사 대신 하늘색을 프레넬로 섞음
      water = new THREE.Mesh(geo, new THREE.ShaderMaterial({
        uniforms: shared, fog: false,
        vertexShader: `attribute vec3 pool; varying vec3 vW; varying vec3 vPool; void main(){ vPool = pool; vW = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: `${COMMON}
          void main(){ float fres, foam; vec2 slope; vec3 base = waterBase(fres, foam, slope);
            vec3 c = mix(base, skyCol, clamp(fres * 0.8, 0.0, 0.85)); c = mix(c, vec3(0.97, 0.99, 1.0), foam * 0.7); gl_FragColor = vec4(c, 1.0);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }`,
      }));
    }
    water.rotation.x = -Math.PI / 2;
    water.position.set(0, 0.03, 0);
    this.world.scene.add(water);
    this.water = water;
    if (water.isReflector) {
      // 반사 최적화: ① 한 프레임에 한 번만(주변광 차폐 패스가 수면을 다시 그릴 때 또 렌더하지 않게)
      // ② 두 프레임에 한 번 갱신 ③ 반사에 거의 안 보이는 잔디·들꽃·빛 먼지는 빼고 그림
      const reflect = water.onBeforeRender.bind(water);
      let last = -1;
      water.onBeforeRender = (r, sc, cam, ...rest) => {
        const f = this.world.frameNo || 0;
        if (f === last || (f - last < 2 && last >= 0)) return;
        last = f;
        const skip = [this.grass, this.flowers, this.motes].filter(Boolean);
        skip.forEach((o) => (o.userData._rv = o.visible, o.visible = false));
        reflect(r, sc, cam, ...rest);
        skip.forEach((o) => (o.visible = o.userData._rv));
      };
    }
    // 연잎: 수면 품질과 상관없으니 처음 한 번만 (품질을 바꿀 때마다 늘어나지 않게), 6장을 한 메시로 합쳐 한 번에 그림
    if (!this.pads) {
      const padMat = new THREE.MeshStandardMaterial({ color: 0x4e9a3f, roughness: 0.9, side: THREE.DoubleSide });
      const geos = [];
      for (let i = 0; i < 6; i++) {
        const g = new THREE.CircleGeometry(0.35 + Math.random() * 0.25, 14, 0.3, 5.6).rotateX(-Math.PI / 2);
        const a = Math.random() * 6.28, r = Math.random() * (L.r - 1);
        geos.push(g.translate(L.x + Math.cos(a) * r, 0.06, L.z + Math.sin(a) * r));
      }
      this.pads = new THREE.Mesh(mergeGeo(geos), padMat);
      this.world.scene.add(this.pads);
    }
  }

  /** 공중에 떠다니는 빛 먼지 (낮: 은은한 꽃가루, 해 질 녘: 금빛) — 플레이어 주변만 */
  _motes() {
    const q = this.world.quality || {};
    if (q.level === 'low') return;
    const N = 220, pos = new Float32Array(N * 3), seed = new Float32Array(N);
    for (let i = 0; i < N; i++) { pos[i * 3] = (Math.random() - 0.5) * 30; pos[i * 3 + 1] = 0.4 + Math.random() * 4.5; pos[i * 3 + 2] = (Math.random() - 0.5) * 30; seed[i] = Math.random() * 100; }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
    this.moteU = { uTime: { value: 0 }, uCenter: { value: new THREE.Vector3() }, uColor: { value: new THREE.Color(0xfff2c0) }, uAlpha: { value: 0.5 }, uMap: { value: null } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.moteU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      vertexShader: `uniform float uTime; uniform vec3 uCenter; attribute float seed; varying float vA;
        void main(){ vec3 p = position;
          p.x += sin(uTime * 0.3 + seed) * 1.2; p.y += sin(uTime * 0.5 + seed * 1.7) * 0.5; p.z += cos(uTime * 0.25 + seed * 0.7) * 1.2;
          p.xz = uCenter.xz + mod(p.xz - uCenter.xz + 15.0, 30.0) - 15.0; // 플레이어 주변 30m 안에서 감김
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          vA = (0.5 + 0.5 * sin(uTime * 1.3 + seed * 3.0)) * smoothstep(40.0, 8.0, -mv.z);
          gl_PointSize = (2.0 + mod(seed, 3.0)) * 60.0 / -mv.z;
          gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform vec3 uColor; uniform float uAlpha; varying float vA;
        void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d); gl_FragColor = vec4(uColor * a, a * vA * uAlpha); }`,
    });
    this.motes = new THREE.Points(geo, mat);
    this.motes.frustumCulled = false;
    this.world.scene.add(this.motes);
  }

  /** @param daylight 0..1, @param sunPos THREE.Vector3 */
  update(dt, daylight, sunPos, weather = { cloud: 0.15, wind: 0.15, precip: 0 }) {
    this.t += dt;
    this.windUniform.value = this.t;
    this.windStrength.value = weather.wind;
    this.waterUniform.value = this.t * (1 + weather.wind * 2 + weather.precip * 2);
    if (this.clock) {
      this.clock.value += dt;
      this.rainU.value = Math.min(1, (weather.precip || 0) * 1.2);
      this.dayU.value = Math.max(0.08, daylight);
      this.sunU.value.copy(sunPos).normalize();
      if (this.sunU.value.y < 0.05) this.sunU.value.set(-0.3, 0.6, 0.5); // 밤: 달빛 방향 (약하게)
    }
    const visible = Math.round(3 + weather.cloud * (this.clouds.length - 3));
    for (let i = 0; i < this.clouds.length; i++) {
      const c = this.clouds[i];
      c.visible = i < visible;
      c.position.x += c.userData.speed * (1 + weather.wind * 6) * dt;
      if (c.position.x > 130) c.position.x = -130;
    }
    // 풀 거리 제한 (저사양): 기준점은 캐릭터, 먼 칸은 아예 끄고 경계는 셰이더에서 부드럽게
    const far = this.world.quality?.grassFar || 0, fp = this.world.focusPos;
    if (this.grass) {
      if (far > 0 && fp) this.grassFar.value.set(fp.x, far, fp.z); else this.grassFar.value.y = 0;
      this.grass.cull(far > 0 && fp ? fp : null, far);
    }
    const u = this.skyUniforms;
    const dayTop = DAY_TOP, dayHz = DAY_HZ, duskTop = DUSK_TOP, duskHz = DUSK_HZ, nightTop = NIGHT_TOP, nightHz = NIGHT_HZ;
    if (daylight > 0.6) { const k = (daylight - 0.6) / 0.4; u.top.value.copy(duskTop).lerp(dayTop, k); u.horizon.value.copy(duskHz).lerp(dayHz, k); }
    else { const k = daylight / 0.6; u.top.value.copy(nightTop).lerp(duskTop, k); u.horizon.value.copy(nightHz).lerp(duskHz, k); }
    const grey = (this._grey ||= new THREE.Color()).setHex(0x8d98a3).multiplyScalar(0.4 + daylight * 0.6);
    u.top.value.lerp(grey, weather.cloud * 0.75);
    u.horizon.value.lerp(grey, weather.cloud * 0.6);
    u.bottom.value.copy(u.horizon.value).multiplyScalar(0.9);
    u.sunDir.value.copy(sunPos).normalize();
    u.sunColor.value.setHex(daylight > 0.6 ? 0xfff2c8 : 0xffb070).multiplyScalar(Math.max(0.15, daylight) * (1 - weather.cloud * 0.85));
    const elev = u.sunDir.value.y;
    u.dusk.value = THREE.MathUtils.clamp(1 - Math.abs(elev - 0.02) / 0.32, 0, 1); // 해가 지평선 근처일 때
    u.night.value = THREE.MathUtils.clamp((-elev - 0.04) / 0.18, 0, 1);
    u.cloudy.value = weather.cloud;
    u.time.value = this.t;
    u.glow.value.setHex(elev > 0 ? 0xff9a55 : 0xd9607a); // 해 질 녘 주황 → 땅거미 분홍
    this.horizonColor = u.horizon.value;
    if (this.moteU) {
      this.moteU.uTime.value = this.t;
      const f = this.world.focusPos; if (f) this.moteU.uCenter.value.set(f.x, 0, f.z);
      this.moteU.uColor.value.setHex(0xfff2c0).lerp(MOTE_DUSK, u.dusk.value);
      this.moteU.uAlpha.value = (0.28 + u.dusk.value * 0.5) * (1 - u.night.value) * (1 - weather.precip) * (1 - weather.cloud * 0.6);
    }
    if (this.waterShared) this.waterShared.skyCol.value.copy(u.horizon.value).lerp(u.top.value, 0.4);
    for (const m of this.ridges || []) m.uniforms.horizon.value.copy(u.horizon.value).lerp(u.glow.value, u.dusk.value * 0.25);
    // 구름: 노을이면 아랫면이 물듦
    const tint = (this._tint ||= new THREE.Color()).setHex(0xffffff).lerp(u.glow.value, u.dusk.value * 0.55);
    this.sky.position.copy(this.world.cameraPos || this.sky.position);
    const cloudShade = (0.5 + 0.5 * daylight) * (1 - weather.precip * 0.4);
    const cc = (this._cloudCol ||= new THREE.Color()).copy(tint).multiplyScalar(cloudShade);
    for (const m of this.cloudMats) m.color?.copy(cc);
  }
}

/**
 * 잔디 칸 묶음: 칸 InstancedMesh 들을 담은 그룹이지만, 예전 한 덩어리 잔디처럼 전역 번호로 다룰 수 있음
 * (season_view 의 setColorAt(i)·instanceColor.needsUpdate·material, 반사 패스의 visible 토글 그대로)
 */
class GrassField extends THREE.Group {
  constructor(chunks, total, material) {
    super();
    this.chunks = chunks;
    this.total = total;
    this.material = material;
    this.chunkOf = new Uint16Array(total);
    this.localOf = new Uint32Array(total);
    chunks.forEach((c, ci) => c.userData.gids.forEach((g, k) => { this.chunkOf[g] = ci; this.localOf[g] = k; }));
    for (const c of chunks) this.add(c);
    const self = this;
    this._colorFlag = { set needsUpdate(v) { for (const c of self.chunks) if (c.instanceColor) c.instanceColor.needsUpdate = v; } };
    this.shown = total;
  }

  get instanceColor() { return this._colorFlag; }
  get count() { return this.shown; }
  setColorAt(i, color) { this.chunks[this.chunkOf[i]].setColorAt(this.localOf[i], color); }

  /** 전역 앞쪽 n 포기만: 칸마다 전역 번호가 n 보다 작은 것까지 (칸 안은 오름차순) */
  setVisibleCount(n) {
    this.shown = n;
    for (const c of this.chunks) { c.count = countBelow(c.userData.gids, n); c.visible = c.count > 0 && c.userData.near !== false; }
  }

  setGeometry(geo) { for (const c of this.chunks) c.geometry = geo; }

  /** 거리 제한: center 에서 칸 상자까지 가장 가까운 거리가 far 보다 먼 칸은 끔 (center 없으면 모두 켬) */
  cull(center, far) {
    for (const c of this.chunks) {
      const near = !center || c.userData.box.distanceToPoint(_v2.set(center.x, center.z)) < far;
      c.userData.near = near;
      c.visible = near && c.count > 0;
    }
  }
}
const _v2 = new THREE.Vector2();

/** 0..n-1 번호를 (x,z) 칸으로 나눔 → Map(칸 → 오름차순 번호 배열) (순수 계산 → tests/world_batch.test.js) */
export function groupByCell(n, getX, getZ, size) {
  const cells = new Map();
  for (let i = 0; i < n; i++) {
    const k = cellKey(getX(i), getZ(i), size);
    let a = cells.get(k);
    if (!a) cells.set(k, (a = []));
    a.push(i);
  }
  return cells;
}

/** 오름차순 배열에서 n 보다 작은 값의 개수 (이분 탐색) */
export function countBelow(sorted, n) {
  let lo = 0, hi = sorted.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (sorted[mid] < n) lo = mid + 1; else hi = mid; }
  return lo;
}

function withIndex(g) {
  const n = g.attributes.position.count;
  g.setIndex(Array.from({ length: n }, (_, i) => i));
  return g;
}

function mergeGeometries(geos) {
  const pos = [], nor = [], uv = [], idx = [];
  let off = 0;
  for (const g of geos) {
    const p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv;
    for (let i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); nor.push(n.getX(i), n.getY(i), n.getZ(i)); uv.push(u.getX(i), u.getY(i)); }
    const ix = g.index;
    for (let i = 0; i < ix.count; i++) idx.push(ix.getX(i) + off);
    off += p.count;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  return geo;
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
