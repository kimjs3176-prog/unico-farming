import * as THREE from 'three';
import { LAYOUT } from './world.js';

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
    };
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(260, 32, 16),
      new THREE.ShaderMaterial({
        uniforms: this.skyUniforms,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `uniform vec3 top, horizon, bottom, sunDir, sunColor; varying vec3 vDir;
          void main(){ float h = vDir.y; vec3 c = h > 0.0 ? mix(horizon, top, pow(h, 0.55)) : mix(horizon, bottom, pow(-h, 0.6));
          float s = max(dot(normalize(vDir), normalize(sunDir)), 0.0); c += sunColor * (pow(s, 180.0) * 1.4 + pow(s, 12.0) * 0.12);
          gl_FragColor = vec4(c, 1.0); }`,
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
    this.windStrength = { value: 0.18 };
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.windUniform;
      sh.uniforms.uWind = this.windStrength;
      sh.vertexShader = 'uniform float uTime; uniform float uWind; varying float vGH;\n' + sh.vertexShader.replace('#include <begin_vertex>',
        `#include <begin_vertex>
         vGH = clamp(position.y / 0.26, 0.0, 1.0);
         float sway = (sin(uTime * (1.4 + uWind * 3.0) + instanceMatrix[3].x * 0.35 + instanceMatrix[3].z * 0.5) + uWind * 1.2) * (0.12 + uWind * 0.4) * position.y;
         transformed.x += sway; transformed.z += sway * 0.5;`);
      sh.fragmentShader = 'varying float vGH;\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
         diffuseColor.rgb *= mix(0.42, 1.18, vGH);
         diffuseColor.rgb += vec3(0.06, 0.07, 0.0) * smoothstep(0.7, 1.0, vGH);`);
    };
    const COUNT = this.world.quality?.grass ?? 9000;
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
      p.set(x, 0, z);
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
    const COUNT = this.world.quality?.level === 'low' ? 500 : 1400;
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
      p.set(x, 0, z);
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
  }

  _water() {
    const L = LAYOUT.pond;
    const geo = new THREE.CircleGeometry(L.r, 48);
    const mat = new THREE.MeshStandardMaterial({ color: 0x5bb9e6, roughness: 0.12, metalness: 0.05, transparent: true, opacity: 0.9 });
    this.waterUniform = { value: 0 };
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.waterUniform;
      sh.vertexShader = 'uniform float uTime; varying vec2 vRip;\n' + sh.vertexShader.replace('#include <begin_vertex>',
        `#include <begin_vertex>
         vRip = position.xy;
         transformed.z += sin(position.x * 2.2 + uTime * 1.8) * 0.025 + cos(position.y * 2.7 - uTime * 1.3) * 0.025;`);
      sh.fragmentShader = 'uniform float uTime; varying vec2 vRip;\n' + sh.fragmentShader.replace('#include <color_fragment>',
        `#include <color_fragment>
         float ripple = sin(vRip.x * 6.0 + uTime * 2.0) * sin(vRip.y * 5.0 - uTime * 1.5);
         diffuseColor.rgb += ripple * 0.035;`);
    };
    const water = new THREE.Mesh(geo, mat);
    water.rotation.x = -Math.PI / 2;
    water.position.set(L.x, 0.03, L.z);
    this.world.scene.add(water);
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
    this.sky.position.copy(this.world.cameraPos || this.sky.position);
    const cloudShade = (0.5 + 0.5 * daylight) * (1 - weather.precip * 0.4);
    for (const c of this.clouds) c.traverse((o) => { if (o.isMesh) o.material.color?.setScalar(cloudShade); });
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
