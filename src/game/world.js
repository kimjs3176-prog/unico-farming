import * as THREE from 'three';
import { Scenery } from './scenery.js';

/** 월드 레이아웃 상수 (m). +X 동쪽, +Z 남쪽, 스폰 (0,0,9) */
export const LAYOUT = {
  bounds: 40,
  farm: { cols: 6, rows: 3, tile: 2.4, origin: { x: 0, z: 0 } },
  market: { x: 0, z: -10 },
  well: { x: -9, z: 1 },
  ranch: { x0: 12, z0: -6, x1: 32, z1: 10, gate: { x: 12, z: 3 } },
  barn: { x: 19, z: -13 },
  silo: { x: 26, z: -13 },
  coop: { x: 28, z: 7 },
  trough: { x: 16, z: 7 },
  smartfarm: { x: -22, z: -8 },
  sensor: { x: -17, z: -12.5 },
  field: { x0: 6, z0: 14, cols: 10, rows: 6, cell: 2 },
  tractorHome: { x: 4, z: 13, heading: Math.PI / 2 },
  windmill: { x: -27, z: 15 },
  pond: { x: -12, z: 18, r: 4.5 },
  npcs: {
    merchant: { x: 3.2, z: -8.4, pose: 'present', name: '장터 유니코' },
    researcher: { x: -14.5, z: -3.5, pose: 'lab', name: '연구원 유니코' },
    guide: { x: 4.5, z: 6.5, pose: 'megaphone', name: '안내 유니코' },
  },
};

const DAY_LENGTH = 360; // 실제 초 = 게임 하루

export class World {
  constructor(assets, renderer, quality = { grass: 9000, shadowMap: 3072 }) {
    this.assets = assets;
    this.quality = quality;
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xbfe4ff);
    this.scene.fog = new THREE.Fog(0xbfe4ff, 45, 110);
    this.obstacles = []; // {x,z,r} 원형 충돌체
    this.boxes = []; // {x0,z0,x1,z1}
    this.animated = []; // update(dt) 를 갖는 객체
    this.time = 0.33; // 하루 중 비율 (0=자정, 0.5=정오)
    this.daylight = 1;
    this.day = 1;
    this.lampMaterials = [];
    this._lights();
    this._ground();
    this._decorate();
    this.scenery = new Scenery(this);
  }

  // ------------------------------------------------------------ 조명 / 하늘
  _lights() {
    this.hemi = new THREE.HemisphereLight(0xd8eeff, 0x6f9a4a, 0.9);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff3dd, 2.4);
    this.sun.castShadow = true;
    const s = 34; // 플레이어 주변만 고해상도 그림자 (update 에서 추적)
    Object.assign(this.sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far: 200 });
    this.sun.shadow.mapSize.set(this.quality.shadowMap, this.quality.shadowMap);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    this.sun.shadow.radius = 3;
    this.scene.add(this.sun, this.sun.target);
    this.ambient = new THREE.AmbientLight(0xffffff, 0.15);
    this.scene.add(this.ambient);
  }

  _ground() {
    const B = LAYOUT.bounds + 30;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(B * 2, B * 2), new THREE.MeshStandardMaterial({ map: grassTexture(), roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
    // 흙길
    const pathMat = new THREE.MeshStandardMaterial({ map: dirtTexture(), roughness: 1 });
    const addPath = (x, z, w, h, rot = 0) => {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), pathMat);
      p.rotation.x = -Math.PI / 2;
      p.rotation.z = rot;
      p.position.set(x, 0.01, z);
      p.receiveShadow = true;
      this.scene.add(p);
    };
    addPath(0, 1, 3, 20); // 스폰 -> 장터
    addPath(8, 5, 18, 3); // 농장 -> 목장
    addPath(-10, 2, 16, 3); // 농장 -> 스마트팜
    addPath(0, 9, 24, 3); // 동서
    addPath(6, 11, 3, 7); // 트랙터 밭
    // 연못
    const pondBed = new THREE.Mesh(new THREE.CircleGeometry(LAYOUT.pond.r, 48), new THREE.MeshStandardMaterial({ color: 0x3f7fa8, roughness: 0.9 }));
    pondBed.rotation.x = -Math.PI / 2;
    pondBed.position.set(LAYOUT.pond.x, -0.05, LAYOUT.pond.z);
    this.scene.add(pondBed);
    this.obstacles.push({ x: LAYOUT.pond.x, z: LAYOUT.pond.z, r: LAYOUT.pond.r - 0.3 });
    const rim = new THREE.Mesh(new THREE.RingGeometry(LAYOUT.pond.r, LAYOUT.pond.r + 0.6, 28), new THREE.MeshStandardMaterial({ color: 0xd9c08a, roughness: 1 }));
    rim.rotation.x = -Math.PI / 2;
    rim.position.set(LAYOUT.pond.x, 0.015, LAYOUT.pond.z);
    this.scene.add(rim);
    // 트랙터 밭 바탕 (밭 셀은 tractor view 가 그림)
    const f = LAYOUT.field;
    const fieldBase = new THREE.Mesh(new THREE.PlaneGeometry(f.cols * f.cell + 2, f.rows * f.cell + 2), new THREE.MeshStandardMaterial({ color: 0x9c7a4a, roughness: 1 }));
    fieldBase.rotation.x = -Math.PI / 2;
    fieldBase.position.set(f.x0 + (f.cols * f.cell) / 2, 0.012, f.z0 + (f.rows * f.cell) / 2);
    fieldBase.receiveShadow = true;
    this.scene.add(fieldBase);
  }

  // ------------------------------------------------------------ 배치
  place(name, x, z, rotY = 0, scale = 1, { collide = true, r = null } = {}) {
    const m = this.assets.clone(name);
    m.position.set(x, 0, z);
    m.rotation.y = rotY;
    m.scale.setScalar(scale);
    this.scene.add(m);
    if (collide) {
      const box = new THREE.Box3().setFromObject(m);
      const size = box.getSize(new THREE.Vector3());
      const c = box.getCenter(new THREE.Vector3());
      if (r !== null) this.obstacles.push({ x: c.x, z: c.z, r });
      else if (Math.max(size.x, size.z) > 3.5) this.boxes.push({ x0: box.min.x + 0.2, z0: box.min.z + 0.2, x1: box.max.x - 0.2, z1: box.max.z - 0.2 });
      else this.obstacles.push({ x: c.x, z: c.z, r: Math.max(size.x, size.z) * 0.38 });
    }
    return m;
  }

  _decorate() {
    const L = LAYOUT;
    const rnd = mulberry32(42);
    // 장터 / 우물 / 표지판
    this.place('market', L.market.x, L.market.z, 0);
    this.place('well', L.well.x, L.well.z, 0.4);
    this.place('sign', 0, 5.8, 0.2, 1, { collide: false });
    this.place('sign', 11, 11, -0.6, 1, { collide: false });
    this.place('wheelbarrow', -4, 5.5, 1.2, 1, { collide: false });
    // 목장
    this.place('barn', L.barn.x, L.barn.z, 0);
    this.place('silo', L.silo.x, L.silo.z, 0, 1, { r: 1.2 });
    this.place('coop', L.coop.x, L.coop.z, Math.PI);
    this.place('trough', L.trough.x, L.trough.z, 0);
    for (let i = 0; i < 4; i++) this.place('hay_bale', 23 + (i % 2) * 1.1, -9 + Math.floor(i / 2) * 1.1, i * 0.3, 1, { collide: i < 2 });
    this._fenceRect(L.ranch.x0, L.ranch.z0, L.ranch.x1, L.ranch.z1, { gapX: null, gapZ: L.ranch.gate.z });
    // 스마트팜
    const sf = this.place('smartfarm', L.smartfarm.x, L.smartfarm.z, 0, 1, { collide: false });
    this.boxes.push({ x0: L.smartfarm.x - 4.2, z0: L.smartfarm.z - 4.6, x1: L.smartfarm.x + 4.2, z1: L.smartfarm.z + 4.6 });
    this.obstacles.push({ x: L.smartfarm.x + 5.5, z: L.smartfarm.z - 1, r: 1.2 }, { x: L.smartfarm.x + 5.5, z: L.smartfarm.z - 4, r: 0.9 });
    this.smartfarmModel = sf;
    sf.traverse((o) => { if (o.isMesh && o.material.emissiveIntensity > 0) this.lampMaterials.push(o.material); });
    // 풍차
    const wm = this.place('windmill', L.windmill.x, L.windmill.z, 0.5, 1, { r: 0.8 });
    const blades = wm.getObjectByName('Blades');
    if (blades) this.animated.push({ update: (dt) => (blades.rotation.z += dt * 0.8) });
    // 드론: 스마트팜 위를 선회
    const drone = this.place('drone', L.smartfarm.x, L.smartfarm.z, 0, 1, { collide: false });
    const rotors = [1, 2, 3, 4].map((i) => drone.getObjectByName(`Rotor${i}`)).filter(Boolean);
    let dt0 = 0;
    this.animated.push({ update: (dt) => {
      dt0 += dt;
      drone.position.set(L.smartfarm.x + Math.cos(dt0 * 0.4) * 6, 3.2 + Math.sin(dt0 * 1.3) * 0.3, L.smartfarm.z + Math.sin(dt0 * 0.4) * 5);
      drone.rotation.y = -dt0 * 0.4;
      drone.rotation.z = 0.15;
      for (const r of rotors) r.rotation.y += dt * 40;
    } });
    this.drone = drone;
    // 나무 / 수풀 / 꽃 / 바위 (경계 링 + 군데군데)
    for (let i = 0; i < 44; i++) {
      const a = (i / 44) * Math.PI * 2 + rnd() * 0.1;
      const r = L.bounds - 2 + rnd() * 6;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      this.place(rnd() > 0.35 ? 'tree' : 'pine', x, z, rnd() * 6.28, 0.9 + rnd() * 0.5, { r: 0.6 });
    }
    const spots = [[-8, -6], [-5, -9], [8, -8], [10, -4], [-6, 12], [2, 17], [-20, 4], [-28, -2], [30, 14], [20, 22], [-30, 22], [34, -4], [-18, 24]];
    for (const [x, z] of spots) this.place(rnd() > 0.3 ? 'tree' : 'pine', x, z, rnd() * 6.28, 0.9 + rnd() * 0.4, { r: 0.6 });
    for (let i = 0; i < 18; i++) {
      const x = (rnd() - 0.5) * 70, z = (rnd() - 0.5) * 70;
      if (this.isBlocked(x, z, 2.5) || Math.hypot(x, z) < 12) continue;
      this.place(rnd() > 0.5 ? 'bush' : 'flowers', x, z, rnd() * 6.28, 1, { collide: false });
    }
    for (let i = 0; i < 6; i++) {
      const x = (rnd() - 0.5) * 60, z = (rnd() - 0.5) * 60;
      if (this.isBlocked(x, z, 2.5) || Math.hypot(x, z) < 14) continue;
      this.place('rock', x, z, rnd() * 6.28, 0.8 + rnd() * 0.6);
    }
    this.sun.position.set(30, 50, 20);
  }

  _fenceRect(x0, z0, x1, z1, { gapZ = null } = {}) {
    const seg = 2;
    for (let x = x0 + 1; x < x1; x += seg) {
      this.place('fence', x, z0, 0, 1, { collide: false });
      this.place('fence', x, z1, 0, 1, { collide: false });
    }
    for (let z = z0 + 1; z < z1; z += seg) {
      this.place('fence', x1, z, Math.PI / 2, 1, { collide: false });
      if (gapZ !== null && Math.abs(z - gapZ) < 1.5) continue; // 출입구
      this.place('fence', x0, z, Math.PI / 2, 1, { collide: false });
    }
    // 울타리 충돌: 얇은 박스 4 개 (출입구 제외)
    const t = 0.25;
    this.boxes.push({ x0: x0 - t, z0: z0 - t, x1: x1 + t, z1: z0 + t });
    this.boxes.push({ x0: x0 - t, z0: z1 - t, x1: x1 + t, z1: z1 + t });
    this.boxes.push({ x0: x1 - t, z0: z0, x1: x1 + t, z1: z1 });
    if (gapZ === null) this.boxes.push({ x0: x0 - t, z0: z0, x1: x0 + t, z1: z1 });
    else {
      this.boxes.push({ x0: x0 - t, z0: z0, x1: x0 + t, z1: gapZ - 1.5 });
      this.boxes.push({ x0: x0 - t, z0: gapZ + 1.5, x1: x0 + t, z1: z1 });
    }
  }

  // ------------------------------------------------------------ 충돌
  isBlocked(x, z, r) {
    for (const o of this.obstacles) if (Math.hypot(o.x - x, o.z - z) < o.r + r) return true;
    for (const b of this.boxes) if (x > b.x0 - r && x < b.x1 + r && z > b.z0 - r && z < b.z1 + r) return true;
    return false;
  }

  /** next 위치를 장애물 밖으로 밀어냄 (원형 캐릭터) */
  resolveCollision(next, r) {
    const B = LAYOUT.bounds - 1;
    next.x = THREE.MathUtils.clamp(next.x, -B, B);
    next.z = THREE.MathUtils.clamp(next.z, -B, B);
    for (const o of this.obstacles) {
      const dx = next.x - o.x, dz = next.z - o.z;
      const d = Math.hypot(dx, dz), min = o.r + r;
      if (d < min && d > 1e-4) { next.x = o.x + (dx / d) * min; next.z = o.z + (dz / d) * min; }
    }
    for (const b of this.boxes) {
      if (next.x > b.x0 - r && next.x < b.x1 + r && next.z > b.z0 - r && next.z < b.z1 + r) {
        const push = [
          { d: next.x - (b.x0 - r), ax: 'x', v: b.x0 - r },
          { d: (b.x1 + r) - next.x, ax: 'x', v: b.x1 + r },
          { d: next.z - (b.z0 - r), ax: 'z', v: b.z0 - r },
          { d: (b.z1 + r) - next.z, ax: 'z', v: b.z1 + r },
        ].sort((a, c) => a.d - c.d)[0];
        next[push.ax] = push.v;
      }
    }
  }

  // ------------------------------------------------------------ 시간
  update(dt, focus = null) {
    for (const a of this.animated) a.update(dt);
    if (focus) {
      // 그림자 카메라를 플레이어 주변으로 이동
      this.sun.target.position.set(focus.x, 0, focus.z);
      this.cameraPos = focus;
    }
    this.time += dt / DAY_LENGTH;
    if (this.time >= 1) { this.time -= 1; this.day++; this.onNewDay?.(this.day); }
    const t = this.time;
    const sunA = (t - 0.25) * Math.PI * 2; // 06:00 일출, 18:00 일몰
    const elev = Math.sin(sunA);
    const fx = focus?.x || 0, fz = focus?.z || 0;
    this.sun.position.set(fx + Math.cos(sunA) * 60, Math.max(elev, -0.2) * 80 + 12, fz + 35);
    const daylight = THREE.MathUtils.clamp(elev * 2.2 + 0.25, 0, 1);
    this.daylight = daylight;
    this.sun.intensity = 0.15 + daylight * 2.2;
    this.hemi.intensity = 0.25 + daylight * 0.9;
    const dayCol = new THREE.Color(0xbfe4ff), duskCol = new THREE.Color(0xf4b183), nightCol = new THREE.Color(0x1d2a4a);
    const sky = new THREE.Color();
    if (elev > 0.25) sky.copy(dayCol);
    else if (elev > -0.1) sky.copy(duskCol).lerp(dayCol, (elev + 0.1) / 0.35);
    else sky.copy(nightCol).lerp(duskCol, Math.max(0, (elev + 0.35) / 0.25));
    this.scene.background.copy(sky);
    this.scene.fog.color.copy(sky);
    this.sun.color.setHex(elev < 0.15 ? 0xffb080 : 0xfff3dd);
    const night = daylight < 0.4 ? 1 : 0;
    for (const m of this.lampMaterials) m.emissiveIntensity = 1 + night * 3;
    this.ambient.intensity = 0.08 + daylight * 0.1;
    this.scenery?.update(dt, daylight, this.sun.position.clone().sub(new THREE.Vector3(fx, 0, fz)));
  }

  clockText() {
    const h = Math.floor(this.time * 24), m = Math.floor((this.time * 24 - h) * 60);
    return `${this.day}일차 ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
}

/** 프로시저럴 잔디 텍스처 (두 톤 얼룩 + 미세 점) */
function grassTexture() {
  const S = 512, c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#86cc55';
  ctx.fillRect(0, 0, S, S);
  const rnd = mulberry32(5);
  for (let i = 0; i < 900; i++) {
    const r = 6 + rnd() * 26;
    ctx.fillStyle = `hsla(${96 + rnd() * 14}, ${50 + rnd() * 20}%, ${48 + rnd() * 14}%, 0.35)`;
    ctx.beginPath(); ctx.ellipse(rnd() * S, rnd() * S, r, r * (0.5 + rnd() * 0.6), rnd() * 3, 0, 7); ctx.fill();
  }
  for (let i = 0; i < 4000; i++) {
    ctx.fillStyle = rnd() > 0.5 ? 'rgba(60,120,40,0.35)' : 'rgba(190,240,150,0.3)';
    ctx.fillRect(rnd() * S, rnd() * S, 2, 2 + rnd() * 3);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(26, 26);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function dirtTexture() {
  const S = 256, c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#d7bb84';
  ctx.fillRect(0, 0, S, S);
  const rnd = mulberry32(8);
  for (let i = 0; i < 500; i++) {
    ctx.fillStyle = `hsla(${34 + rnd() * 10}, ${35 + rnd() * 20}%, ${55 + rnd() * 20}%, 0.5)`;
    ctx.beginPath(); ctx.arc(rnd() * S, rnd() * S, 1 + rnd() * 5, 0, 7); ctx.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(2, 2);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
