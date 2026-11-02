import * as THREE from 'three';
import { LAYOUT } from './world.js';
import { heightAt } from './terrain.js';
import { Reflector } from 'three/addons/objects/Reflector.js';

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
    const cloudSrc = world.assets.scenes.get('cloud');
    for (let i = 0; i < 9; i++) {
      const c = world.assets.clone('cloud');
      c.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
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
    const mat = new THREE.MeshStandardMaterial({ color: 0x86d156, roughness: 1, side: THREE.DoubleSide });
    this.windUniform = { value: 0 };
    this.pushers = { value: [0, 1, 2, 3].map(() => new THREE.Vector3(9999, 0.01, 9999)) }; // (x, 반지름, z)
    this.windStrength = { value: 0.18 };
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.windUniform;
      sh.uniforms.uWind = this.windStrength;
      sh.uniforms.uPush = this.pushers;
      sh.vertexShader = 'uniform float uTime; uniform float uWind; uniform vec3 uPush[4]; varying float vGH;\n' + sh.vertexShader.replace('#include <begin_vertex>',
        `#include <begin_vertex>
         vGH = clamp(position.y / 0.26, 0.0, 1.0);
         float sway = (sin(uTime * (1.4 + uWind * 3.0) + instanceMatrix[3].x * 0.35 + instanceMatrix[3].z * 0.5) + uWind * 1.2) * (0.12 + uWind * 0.4) * position.y;
         transformed.x += sway; transformed.z += sway * 0.5;
         // 캐릭터 발밑 잔디는 바깥으로 눕힘 (x,z: 위치, w 대신 y: 반지름)
         for (int k = 0; k < 4; k++) {
           vec2 dp = instanceMatrix[3].xz - uPush[k].xz; float dd = length(dp);
           float bend = (1.0 - smoothstep(0.0, uPush[k].y, dd)) * position.y * 0.9;
           transformed.xz += normalize(dp + 1e-4) * bend; transformed.y -= bend * 0.35;
         }`);
      sh.fragmentShader = 'varying float vGH;\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
         diffuseColor.rgb *= mix(0.42, 1.18, vGH);
         diffuseColor.rgb += vec3(0.06, 0.07, 0.0) * smoothstep(0.7, 1.0, vGH);`);
    };
    const COUNT = 9000; // 최대치로 만들고 품질 설정에 따라 앞쪽 일부만 그림 (setDensity)
    const mesh = new THREE.InstancedMesh(geo, mat, COUNT);
    mesh.receiveShadow = true;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const col = new THREE.Color();
    let n = 0, tries = 0;
    const B = LAYOUT.bounds;
    while (n < COUNT && tries < COUNT * 6) {
      tries++;
      const x = (rnd() - 0.5) * 2 * B, z = (rnd() - 0.5) * 2 * B;
      if (Math.hypot(x - LAYOUT.pond.x, z - LAYOUT.pond.z) < LAYOUT.pond.r + 1.5) continue;
      if (no.some(([x0, z0, x1, z1]) => x > x0 && x < x1 && z > z0 && z < z1)) continue;
      if (this.world.isBare(x, z) || this.world.isReserved(x, z, -0.5)) continue;
      if (this.world.isBlocked(x, z, 0.3)) continue;
      p.set(x, heightAt(x, z), z);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * Math.PI * 2);
      const sc = 0.6 + rnd() * 0.6;
      s.set(sc, sc * (0.8 + rnd() * 0.6), sc);
      m.compose(p, q, s);
      mesh.setMatrixAt(n, m);
      col.setHSL(0.26 + rnd() * 0.04, 0.5 + rnd() * 0.15, 0.38 + rnd() * 0.1);
      mesh.setColorAt(n, col);
      n++;
    }
    mesh.count = n;
    this.grassTotal = n;
    mesh.instanceMatrix.needsUpdate = true;
    this.world.scene.add(mesh);
    this.grass = mesh;
  }

  /** 들꽃: 꽃잎 5장 + 줄기, 색은 인스턴스별 (동물의 숲 들판 느낌) */
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
      if (this.world.isBare(x, z) || this.world.isBlocked(x, z, 0.4) || this.world.isReserved(x, z, 0)) continue;
      if (Math.hypot(x - LAYOUT.pond.x, z - LAYOUT.pond.z) < LAYOUT.pond.r + 1) continue;
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
    if (this.grass) this.grass.count = Math.round(this.grassTotal * d);
    if (this.flowers) this.flowers.count = Math.round(this.flowerTotal * Math.min(1, 0.25 + d * 0.75));
  }

  _water() {
    if (this.water) { this.world.scene.remove(this.water); this.water.dispose?.(); this.water.geometry.dispose(); }
    const L = LAYOUT.pond;
    this.waterUniform = { value: 0 };
    const q = this.world.quality || {};
    const shared = {
      uTime: this.waterUniform, deep: { value: new THREE.Color(0x2f86b8) }, shallow: { value: new THREE.Color(0x7fd3e8) },
      center: { value: new THREE.Vector2(L.x, L.z) }, radius: { value: L.r }, skyCol: { value: new THREE.Color(0xd6eeff) },
    };
    this.waterShared = shared;
    // 잔물결 법선·프레넬·물가 거품·깊이색 (반사 있는 고사양/보통, 없는 저사양 공통 부분)
    const COMMON = /* glsl */`
      uniform float uTime; uniform vec3 deep, shallow, skyCol; uniform vec2 center; uniform float radius;
      varying vec3 vW;
      vec2 ripple(vec2 p){ return vec2(sin(p.x*3.1+uTime*1.7)+sin(p.y*2.3-uTime*1.3)+sin((p.x+p.y)*5.3+uTime*2.4)*0.5,
                                       cos(p.y*3.7+uTime*1.5)+sin(p.x*1.9+uTime*1.1)+cos((p.x-p.y)*4.7-uTime*2.1)*0.5); }
      vec3 waterBase(out float fres, out float foam){
        float d = distance(vW.xz, center), edge = smoothstep(radius * 0.25, radius, d);
        vec3 V = normalize(cameraPosition - vW);
        vec2 rp = ripple(vW.xz);
        vec3 N = normalize(vec3(rp.x * 0.06, 1.0, rp.y * 0.06));
        fres = 0.12 + 0.88 * pow(1.0 - max(dot(V, N), 0.0), 4.0);
        float wave = 0.5 + 0.5 * sin(d * 18.0 - uTime * 2.2);
        foam = smoothstep(radius - 0.55, radius - 0.08, d) * (0.45 + 0.55 * wave);
        vec3 base = mix(deep, shallow, edge * 0.85);
        float spec = pow(max(dot(reflect(-V, N), normalize(vec3(0.4, 0.8, 0.3))), 0.0), 60.0);
        return base + spec * 0.35;
      }`;
    const geo = new THREE.CircleGeometry(L.r, 64);
    let water;
    if (q.post !== false && q.level !== 'low') {
      // 실제 반사: 거울 카메라로 연못 위 장면을 렌더 (연못이 화면에 있을 때만 그려짐)
      const res = q.ao ? 512 : 320;
      water = new Reflector(geo, {
        textureWidth: res, textureHeight: res, clipBias: 0.003,
        shader: {
          name: 'PondReflector',
          uniforms: { color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null }, ...shared },
          vertexShader: `uniform mat4 textureMatrix; varying vec4 vUv; varying vec3 vW;
            void main(){ vUv = textureMatrix * vec4(position, 1.0); vW = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
          fragmentShader: `uniform vec3 color; uniform sampler2D tDiffuse; varying vec4 vUv; ${COMMON}
            void main(){
              float fres, foam; vec3 base = waterBase(fres, foam);
              vec2 rp = ripple(vW.xz) * 0.012;
              vec4 uv = vUv; uv.xy += rp * uv.w;
              vec3 refl = texture2DProj(tDiffuse, uv).rgb;
              vec3 c = mix(base, refl * 0.92, clamp(fres * 0.85 + 0.15, 0.0, 0.92));
              c = mix(c, vec3(1.0), foam * 0.55);
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
        vertexShader: `varying vec3 vW; void main(){ vW = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: `${COMMON}
          void main(){ float fres, foam; vec3 base = waterBase(fres, foam);
            vec3 c = mix(base, skyCol, fres * 0.7); c = mix(c, vec3(1.0), foam * 0.55); gl_FragColor = vec4(c, 1.0);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }`,
      }));
    }
    water.rotation.x = -Math.PI / 2;
    water.position.set(L.x, 0.03, L.z);
    this.world.scene.add(water);
    this.water = water;
    // 연잎
    const padMat = new THREE.MeshStandardMaterial({ color: 0x4e9a3f, roughness: 0.9, side: THREE.DoubleSide });
    for (let i = 0; i < 6; i++) {
      const pad = new THREE.Mesh(new THREE.CircleGeometry(0.35 + Math.random() * 0.25, 14, 0.3, 5.6), padMat);
      pad.rotation.x = -Math.PI / 2;
      const a = Math.random() * 6.28, r = Math.random() * (L.r - 1);
      pad.position.set(L.x + Math.cos(a) * r, 0.06, L.z + Math.sin(a) * r);
      this.world.scene.add(pad);
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
    const visible = Math.round(3 + weather.cloud * (this.clouds.length - 3));
    this.clouds.forEach((c, i) => {
      c.visible = i < visible;
      c.position.x += c.userData.speed * (1 + weather.wind * 6) * dt;
      if (c.position.x > 130) c.position.x = -130;
    });
    const u = this.skyUniforms;
    const dayTop = new THREE.Color(0x4f9ff0), dayHz = new THREE.Color(0xd6eeff);
    const duskTop = new THREE.Color(0x4a3f8a), duskHz = new THREE.Color(0xf7b27a);
    const nightTop = new THREE.Color(0x0a1230), nightHz = new THREE.Color(0x1f2c52);
    if (daylight > 0.6) { const k = (daylight - 0.6) / 0.4; u.top.value.copy(duskTop).lerp(dayTop, k); u.horizon.value.copy(duskHz).lerp(dayHz, k); }
    else { const k = daylight / 0.6; u.top.value.copy(nightTop).lerp(duskTop, k); u.horizon.value.copy(nightHz).lerp(duskHz, k); }
    const grey = new THREE.Color(0x8d98a3).multiplyScalar(0.4 + daylight * 0.6);
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
      this.moteU.uColor.value.setHex(0xfff2c0).lerp(new THREE.Color(0xffb35a), u.dusk.value);
      this.moteU.uAlpha.value = (0.28 + u.dusk.value * 0.5) * (1 - u.night.value) * (1 - weather.precip) * (1 - weather.cloud * 0.6);
    }
    if (this.waterShared) this.waterShared.skyCol.value.copy(u.horizon.value).lerp(u.top.value, 0.4);
    for (const m of this.ridges || []) m.uniforms.horizon.value.copy(u.horizon.value).lerp(u.glow.value, u.dusk.value * 0.25);
    // 구름: 노을이면 아랫면이 물듦
    const tint = (this._tint ||= new THREE.Color()).setHex(0xffffff).lerp(u.glow.value, u.dusk.value * 0.55);
    this.sky.position.copy(this.world.cameraPos || this.sky.position);
    const cloudShade = (0.5 + 0.5 * daylight) * (1 - weather.precip * 0.4);
    for (const c of this.clouds) c.traverse((o) => { if (o.isMesh) o.material.color?.copy(tint).multiplyScalar(cloudShade); });
  }
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
