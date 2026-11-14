import { josa } from '../sim/josa.js';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LAYOUT } from '../world.js';
import { HomeSim, HOME_LEVELS, OUTFIT } from '../sim/home.js';
import { COSTUMES, COSTUME } from '../sim/costume.js';
import { buildRoom, IO } from './home_interior.js';
import { SURF, enhanceMaterial } from '../surface.js';
import { ITEMS } from '../sim/items.js';
import { saveGame } from '../save.js';

/**
 * 유니코 집 (밭 남쪽): 문 앞에서 E → 집 창
 *  - 🛏️ 잠자기: 저녁 6시~새벽 6시. 화면이 어두워졌다 밝아지며 다음 날 아침 6시 30분, 그날 하루 걷기 +15%
 *  - 🏡 집 넓히기: 오두막 → 아늑한 집(큰 창·꽃밭·우편함) → 2층 집(2층·정원 등불·굴뚝 연기)
 *  - 밤에는 창문에 불이 켜짐, 아늑한 집부터 매일 아침 우편함 선물
 *  - 🏠 실내: 문으로 들어가면 단면 인형집처럼 위·앞에서 내려다보는 방 (view/home_interior.js)
 *    침대(잠자기)·옷장(옷 갈아입기)·책장(도감)·달력(퀘스트)·책상(집 넓히기)·문(나가기)
 * 모양은 모두 코드로 만든 저폴리 (게임 팔레트)
 */
const M = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...o });
const MAT = {
  wall: M(0xfff4e2), wallB: M(0xf3e2c6), roof: M(0x2fa89c), roofD: M(0x24877e), wood: M(0xa8784a), woodD: M(0x7a5232),
  stone: M(0xcfc4b2), door: M(0xe58a3a), knob: M(0xfac03e, { metalness: 0.4, roughness: 0.4 }), white: M(0xffffff),
  leaf: M(0x6dbb4f), red: M(0xe35d5d), pink: M(0xf28bb0), yellow: M(0xfac03e), purple: M(0x9b7fd1), mail: M(0x4a90d9),
};
// 다른 건물처럼 질감 셰이더 + '시야 구멍'(카메라와 유니코 사이를 가리면 점묘로 비침) — 커진 집이 유니코를 가리지 않게
for (const [k, m] of Object.entries(MAT)) { m.name = `home_${k}`; enhanceMaterial(m); }
const box = (w, h, d, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); return o; };
const ball = (r, m, x, y, z) => { const o = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), m); o.position.set(x, y, z); return o; };
/** 빛을 받는 재질 (장면의 불빛 개수가 바뀌면 셰이더를 새로 만듦) */
const litMat = (m) => !!m && !!(m.isMeshStandardMaterial || m.isMeshLambertMaterial || m.isMeshPhongMaterial || m.isMeshToonMaterial
  || m.isShadowMaterial || (m.isShaderMaterial && m.lights));
const litMesh = (o) => (Array.isArray(o.material) ? o.material.some(litMat) : litMat(o.material));
const _sph = new THREE.Sphere();
/** 화면 밖 판정에 쓰는 경계 구(월드 좌표)의 가장 낮은 높이 */
function sphereBottom(o) {
  let s = o.boundingSphere; // 묶음(인스턴스)·스킨 메시는 자기 경계 구
  if (s === null && !o.isSkinnedMesh && o.computeBoundingSphere) { o.computeBoundingSphere(); s = o.boundingSphere; }
  if (!s) {
    const geo = o.geometry;
    if (!geo?.attributes?.position) return Infinity;
    if (!geo.boundingSphere) geo.computeBoundingSphere();
    s = geo.boundingSphere;
  }
  _sph.copy(s).applyMatrix4(o.matrixWorld);
  return _sph.center.y - _sph.radius;
}

/** 박공 지붕 (앞뒤로 기운 판 두 장 + 마룻대) */
function roof(w, d, y, rise, mat = MAT.roof) {
  const g = new THREE.Group(), half = d / 2 + 0.25, slope = Math.hypot(half, rise), ang = Math.atan2(rise, half);
  for (const s of [-1, 1]) { const p = box(w + 0.5, 0.16, slope, mat, 0, y + rise / 2, s * half / 2); p.rotation.x = s * ang; g.add(p); }
  g.add(box(w + 0.6, 0.18, 0.22, MAT.roofD, 0, y + rise + 0.02, 0));
  // 박공벽 (앞뒤 세모)
  const tri = new THREE.Shape(); tri.moveTo(-w / 2, 0); tri.lineTo(w / 2, 0); tri.lineTo(0, rise); tri.closePath();
  const geo = new THREE.ShapeGeometry(tri);
  for (const s of [-1, 1]) { const t = new THREE.Mesh(geo, MAT.wallB); t.position.set(0, y, s * (d / 2 + 0.005)); if (s < 0) t.rotation.y = Math.PI; g.add(t); }
  return g;
}

/** 창문: 틀 + 유리(밤에 불빛) */
function windowAt(x, y, z, w, h, glass) {
  const g = new THREE.Group();
  g.add(box(w + 0.14, h + 0.14, 0.06, MAT.white, x, y, z));
  g.add(box(w, h, 0.07, glass, x, y, z + 0.01));
  g.add(box(0.05, h, 0.08, MAT.white, x, y, z + 0.02), box(w, 0.05, 0.08, MAT.white, x, y, z + 0.02));
  return g;
}

/**
 * 묶음 안의 메시를 재질별로 하나씩 합침 (집 약 30개 → 12개 안팎, 그림자 그리기도 같이 줆)
 * 하위 묶음(지붕·창문)의 위치·회전까지 펴서 합치고, 묶음의 userData(굴뚝·지붕 높이)는 그대로
 */
export function mergeByMaterial(g) {
  g.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(g.matrixWorld).invert(), rel = new THREE.Matrix4();
  const sets = new Map();
  g.traverse((o) => {
    if (!o.isMesh || Array.isArray(o.material)) return;
    if (!sets.has(o.material)) sets.set(o.material, []);
    sets.get(o.material).push(o);
  });
  const out = [];
  for (const [mat, list] of sets) {
    const geos = list.map((o) => o.geometry.clone().applyMatrix4(rel.multiplyMatrices(inv, o.matrixWorld)));
    const geo = mergeGeometries(geos, false);
    for (const x of geos) x.dispose();
    if (!geo) return g; // 속성이 달라 못 합치면 그대로 둠
    out.push(new THREE.Mesh(geo, mat));
  }
  const old = new Set();
  g.traverse((o) => { if (o.isMesh) old.add(o.geometry); });
  for (const x of old) x.dispose();
  g.clear();
  for (const m of out) g.add(m);
  return g;
}

/** 집 전체 크기 배율: 벽 높이 1.9m × 1.5 ≈ 2.9m (키 1.8m 유니코보다 넉넉히 크게, 문 높이 약 2m) */
const HOUSE_SCALE = 1.5;
const HOUSE_BACK = 0.55; // 커진 만큼 뒤로 물려 앞문 위치는 그대로

/** 단계별 집 모양 (앞 = +z, 문은 앞 가운데) */
function buildHouse(level, glass) {
  const g = new THREE.Group();
  const W = [3.0, 3.8, 4.2][level], D = [2.6, 3.0, 3.2][level], H = 1.9;
  g.add(box(W + 0.3, 0.22, D + 0.3, MAT.stone, 0, 0.11, 0));          // 기단
  g.add(box(W, H, D, MAT.wall, 0, 0.22 + H / 2, 0));                 // 벽
  g.add(box(W + 0.02, 0.18, D + 0.02, MAT.wallB, 0, 0.3, 0));        // 아랫단 띠
  // 문 + 차양 + 계단
  g.add(box(0.8, 1.35, 0.08, MAT.door, 0, 0.22 + 0.68, D / 2 + 0.02));
  g.add(ball(0.05, MAT.knob, 0.25, 0.9, D / 2 + 0.08));
  const aw = box(1.3, 0.08, 0.6, MAT.roofD, 0, 1.78, D / 2 + 0.28); aw.rotation.x = 0.25; g.add(aw);
  g.add(box(1.1, 0.12, 0.45, MAT.stone, 0, 0.06, D / 2 + 0.35));
  // 창문 (단계가 오를수록 큼)
  const ww = [0.55, 0.75, 0.8][level];
  for (const s of [-1, 1]) g.add(windowAt(s * (W / 2 - 0.62), 1.25, D / 2 + 0.01, ww, ww * 0.85, glass));
  for (const s of [-1, 1]) { const w = windowAt(0, 1.25, 0, ww, ww * 0.85, glass); w.rotation.y = s * Math.PI / 2; w.position.set(s * (W / 2 + 0.01), 0, 0); g.add(w); }
  let top = 0.22 + H;
  if (level >= 2) { // 2층
    const W2 = W - 1.0, D2 = D - 0.4, H2 = 1.3;
    g.add(box(W2, H2, D2, MAT.wall, 0, top + H2 / 2, -0.1));
    g.add(box(W + 0.3, 0.14, D + 0.3, MAT.wallB, 0, top + 0.07, 0));
    g.add(windowAt(0, top + 0.7, D2 / 2 - 0.09, 0.7, 0.55, glass));
    top += H2;
    g.add(roof(W2, D2, top, 1.0));
    g.userData.roofTop = top + 1.0;
  } else {
    g.add(roof(W, D, top, [1.1, 1.3][level]));
    g.userData.roofTop = top + [1.1, 1.3][level];
  }
  // 굴뚝
  const cx = W / 2 - 0.7, cz = -D / 4;
  g.add(box(0.45, 1.3, 0.45, MAT.stone, cx, top + 0.55, cz), box(0.55, 0.12, 0.55, MAT.woodD, cx, top + 1.22, cz));
  g.userData.chimney = new THREE.Vector3(cx, top + 1.35, cz);
  // 꽃 상자 (아늑한 집부터)
  if (level >= 1) {
    for (const s of [-1, 1]) {
      const x = s * (W / 2 - 0.62);
      g.add(box(ww + 0.25, 0.18, 0.25, MAT.wood, x, 0.85, D / 2 + 0.14));
      [MAT.red, MAT.pink, MAT.yellow].forEach((m, k) => g.add(ball(0.09, m, x + (k - 1) * 0.22, 1.0, D / 2 + 0.16)));
    }
  }
  return mergeByMaterial(g);
}

/** 마당: 꽃밭·우편함(1단계부터), 정원 등불(2단계) */
function buildYard(level, lampMat) {
  const g = new THREE.Group();
  if (level >= 1) {
    for (let k = 0; k < 7; k++) { const a = k / 7; g.add(ball(0.11, [MAT.red, MAT.pink, MAT.yellow, MAT.purple][k % 4], -3.0 + a * 1.1, 0.18, 2.35 + (k % 2) * 0.25)); g.add(box(0.03, 0.18, 0.03, MAT.leaf, -3.0 + a * 1.1, 0.09, 2.35 + (k % 2) * 0.25)); } // 커진 집 앞 마당으로
    g.add(box(0.08, 1.0, 0.08, MAT.woodD, 1.9, 0.5, 3.0));                  // 우편함 기둥
    g.add(box(0.36, 0.3, 0.5, MAT.mail, 1.9, 1.1, 3.0));
    g.add(box(0.04, 0.22, 0.12, MAT.red, 2.1, 1.25, 3.1));                    // 깃발
  }
  if (level >= 2) for (const x of [-1.1, 1.1]) { g.add(box(0.08, 0.9, 0.08, MAT.woodD, x, 0.45, 3.4)); g.add(box(0.22, 0.22, 0.22, lampMat, x, 1.0, 3.4)); }
  return mergeByMaterial(g);
}

export class HomeView {
  constructor(game) {
    this.game = game;
    this.sim = new HomeSim();
    const H = LAYOUT.home;
    this.root = new THREE.Group();
    this.root.position.set(H.x, 0, H.z);
    this.root.rotation.y = Math.PI; // 앞(+z)이 북쪽(-z)을 보게 → 길·처음 위치 쪽
    game.world.scene.add(this.root);
    this.glass = new THREE.MeshStandardMaterial({ color: 0x9fd3ea, roughness: 0.2, emissive: 0xffc46b, emissiveIntensity: 0 });
    this.lamp = new THREE.MeshStandardMaterial({ color: 0xfff1c4, emissive: 0xffc46b, emissiveIntensity: 0 });
    this.obstacle = { x: H.x, z: H.z + HOUSE_BACK, r: 2.8 };
    game.world.obstacles.push(this.obstacle);
    this.smokeT = 0;
    // 실내 (맵 밖 IO 에 지어 둠). 불빛은 후처리를 안 쓰는 품질(낮음)에서는 밖에서 장면 계산에서 빼 둠 (바깥 조각마다 빛 계산 하나 덜 함)
    // 그때 실내용 셰이더는 처음 들어갈 때 페이드 동안 한 번 준비 (_warmRoom), 그 뒤로는 드나들어도 다시 만들지 않음
    // 후처리를 쓰는 품질은 예전처럼 꺼진 채(세기 0)로 늘 장면에 둠 → 들어갈 때 셰이더를 새로 만들 일이 없음
    this.inside = false;
    this.outPos = { x: LAYOUT.home.door.x, z: LAYOUT.home.door.z - 0.8 };
    this.outVec = new THREE.Vector3(this.outPos.x, 0, this.outPos.z);
    this.roomGlass = new THREE.MeshStandardMaterial({ color: 0x9fd3ea, roughness: 0.2, emissive: 0x9fd3ea, emissiveIntensity: 0.3 });
    this.roomLampMat = new THREE.MeshStandardMaterial({ color: 0xfff1c4, emissive: 0xffc46b, emissiveIntensity: 0.2 });
    this.roomLight = new THREE.PointLight(0xffd6a0, 0, 16, 1.4);
    this.roomLight.position.set(IO.x, IO.y + 2.7, IO.z);
    this.roomLight.visible = this._lightOutside();
    game.world.scene.add(this.roomLight);
    this.build();
  }

  /** 실내 방 다시 짓기 (집 단계가 바뀌면) */
  buildRoom() {
    if (this.room) { this.game.world.scene.remove(this.room.group); this.room.group.traverse((o) => o.geometry?.dispose()); }
    this.room = buildRoom(this.sim.level, { glass: this.roomGlass, lampMat: this.roomLampMat });
    this.room.group.position.set(IO.x, IO.y, IO.z);
    this.game.world.scene.add(this.room.group);
    this.room.group.visible = this.inside;
  }

  build() {
    if (this.house) { this.root.remove(this.house, this.yard); for (const o of [this.house, this.yard]) o.traverse((m) => m.geometry?.dispose()); }
    this.house = buildHouse(this.sim.level, this.glass);
    this.house.scale.setScalar(HOUSE_SCALE);
    this.house.position.z = -HOUSE_BACK;
    this.yard = buildYard(this.sim.level, this.lamp);
    for (const o of [this.house, this.yard]) { o.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } }); this.root.add(o); }
    this.obstacle.r = [2.8, 3.2, 3.5][this.sim.level];
    this.buildRoom();
  }

  /** 밖에서도 방 불빛(세기 0)을 장면에 둘지: 후처리를 쓸 때만. 품질이 바뀌어 후처리가 켜지고 꺼질 때는
   *  어차피 모든 셰이더가 다시 만들어지므로 그때 함께 바꿈 (update 가 매 프레임 맞춤) */
  _lightOutside() { return !!this.game.postfx?.enabled; }

  update(dt, pp) {
    const g = this.game, w = g.world;
    if (this.inside) return this._updateInside(dt, pp);
    const keep = this._lightOutside();
    if (this.roomLight.visible !== keep) { this.roomLight.visible = keep; this.roomLight.intensity = 0; }
    // 밤엔 창문·등불에 불, 굴뚝 연기 (저녁·아침과 2층 집은 늘)
    const night = 1 - THREE.MathUtils.clamp(w.daylight * 2.2, 0, 1);
    this.glass.emissiveIntensity = night * 1.1;
    this.lamp.emissiveIntensity = night * 1.6;
    this.smokeT -= dt;
    if (this.smokeT <= 0 && (night > 0.2 || this.sim.level >= 2) && Math.hypot(pp.x - this.root.position.x, pp.z - this.root.position.z) < 30) {
      this.smokeT = 0.7;
      this.root.updateMatrixWorld(true);
      const c = this.house.localToWorld(this.house.userData.chimney.clone());
      g.fx.burst(c.x, c.y, c.z, 0xdedede, 3);
    }
    g.player.speedMult = this.sim.speedMult(w.day) * this._wetMult();
    const D = LAYOUT.home.door, d = Math.hypot(D.x - pp.x, D.z - pp.z);
    if (d > 2.0) return null;
    const can = this.sim.canSleep(w.time);
    return { d, label: `🏠 ${this.sim.info.name} 들어가기${can ? ' · 🛏️ 잘 시간' : ''}`, key: 'home', onInteract: () => this.enter() };
  }

  /** 비·눈 오는 날 코스튬 혜택 (노란 비옷: 걷기 +10%) */
  _wetMult() { return ['rain', 'storm', 'snow'].includes(this.game.world.weatherKind) ? (this.game.costume?.mult('speed_wet') ?? 1) : 1; }

  /** 화면을 잠깐 어둡게 했다가 fn 실행 후 밝게. 이미 페이드 중이면 무시 (false) */
  _fade(text, fn, ms = 450) {
    if (this._fadeT) return false;
    const fade = document.createElement('div');
    fade.className = 'sleep-fade quick';
    fade.innerHTML = `<span>${text}</span>`;
    document.getElementById('ui').append(fade);
    requestAnimationFrame(() => fade.classList.add('on'));
    this._fadeEl = fade;
    this._fadeT = setTimeout(() => {
      this._fadeT = null; this._fadeEl = null;
      try { fn(); } finally { fade.classList.remove('on'); setTimeout(() => fade.remove(), 700); }
    }, ms);
    return true;
  }

  /** 남은 페이드 취소 (지도 이동처럼 바로 처리해야 할 때) */
  _cancelFade() {
    if (!this._fadeT) return;
    clearTimeout(this._fadeT);
    this._fadeT = null;
    const el = this._fadeEl;
    this._fadeEl = null;
    if (el) { el.classList.remove('on'); setTimeout(() => el.remove(), 700); }
  }

  /** 처음 들어갈 때 한 번 (밖에서 방 불빛을 빼 둔 경우만): 불빛을 켠 상태의 셰이더를 페이드 동안 미리 준비 (가능하면 병렬)
   *  대상: 방·내 캐릭터 + 방 카메라에 잡힐 수 있는 빛 받는 메시
   *   - 컬링을 끈 메시 (목장 동물·콩이 등 — 어디서나 그려짐)
   *   - 경계 구가 방 높이까지 내려오는 큰 메시 (맵 전체를 묶은 지형·물·나무 묶음 등)
   *     방 카메라는 IO.y+20 아래에서 내려다보고, 옷장 미리보기도 IO.y+6 아래에서 위로 7° 안이라 600m 안에서 IO.y+80 위는 화면에 없음
   *  그리는 대상(화면)에 따라 톤매핑·색 공간이 달라 셰이더가 다르므로, 실제로 그릴 대상을 묶어 두고 준비 */
  _warmRoom() {
    const g = this.game, r = g.renderer;
    if (this._warmed || !r?.compileAsync || this.roomLight.visible) return;
    this._warmed = true;
    const list = [this.room.group, g.player.unico.group], reach = IO.y + 80;
    g.world.scene.traverseVisible((o) => {
      if (o.isMesh && litMesh(o) && (o.frustumCulled === false || sphereBottom(o) < reach)) list.push(o);
    });
    // 부모를 바꾸지 않고 한 번에 준비 (자식 목록만 빌린 빈 묶음 → 장면 불빛 모으기도 한 번만)
    const batch = new THREE.Object3D();
    batch.children = list;
    const prevRT = r.getRenderTarget?.() ?? null;
    this.roomLight.visible = true;
    try {
      r.setRenderTarget?.(g.postfx?.enabled ? g.postfx.composer.readBuffer : null);
      r.compileAsync(batch, g.camera, g.world.scene).catch(() => {}); // compile 자체는 바로 끝남 → 아래에서 되돌려도 됨
    } catch { /* 첫 프레임에 준비 */ } finally {
      r.setRenderTarget?.(prevRT);
      this.roomLight.visible = this.inside || this._lightOutside();
    }
  }

  /** 들어가기: 방으로 옮기고, 카메라를 위·앞에서 내려다보게, 바깥(하늘·비·안개)은 가림 */
  enter() {
    const g = this.game, cam = g.followCam;
    if (this.inside || this._fadeT || this._sleeping || g.ride.driving) return; // 페이드 중 E 를 또 눌러도 한 번만
    g.ui.closePanel();
    g.audio.play('click');
    this._warmRoom();
    this._fade('🏠', () => {
      if (this.inside) return;
      this.inside = true;
      this.room.group.visible = true;
      this.roomLight.visible = true;
      this._cam = { yaw: cam.yaw, pitch: cam.pitch, distance: cam.distance };
      const e = this.room.entry;
      g.player.position.set(IO.x + e.x, IO.y, IO.z + e.z);
      g.player.unico.floorY = IO.y; // 바닥 높이는 방바닥 (지형 높이 대신)
      SURF.floor.value = IO.y;
      g.player.moveTarget = null; g.player.vel?.set(0, 0, 0);
      g.player.unico.facing = -Math.PI / 2;
      cam.yaw = 0; cam.pitch = 0.92; cam.distance = [9.5, 10.5, 12][this.sim.level]; cam.first = true;
      g.world.playerCollision = (next, r) => this._collide(next, r);
      g.ui.toast(`🏠 ${this.sim.info.name}에 들어왔어요 · 가구 앞에서 E`);
    });
  }

  /** 나가기: 문 앞으로, 카메라·바깥 원래대로. quick: 지도 이동 (남은 들어가기·나가기 페이드는 취소하고 바로) */
  leave(quick = false) {
    const g = this.game, cam = g.followCam;
    if (quick) this._cancelFade();
    if (!this.inside) return;
    if (!quick && (this._fadeT || this._sleeping)) return;
    const go = () => {
      if (!this.inside) return;
      this.inside = false;
      this.room.group.visible = false;
      g.world.playerCollision = null;
      this.roomLight.intensity = 0;
      this.roomLight.visible = this._lightOutside();
      g.player.unico.floorY = null;
      SURF.floor.value = 0;
      g.player.position.set(this.outPos.x, 0, this.outPos.z);
      g.player.moveTarget = null; g.player.vel?.set(0, 0, 0);
      g.player.unico.facing = Math.PI; // 북쪽(길)을 보고 나옴
      if (this._cam) Object.assign(cam, this._cam);
      cam.lookOffsetY = 0; // 옷장 미리보기 중에 지도로 나가도 시점이 낮은 채 남지 않게
      this._wdCam = null; this._wdPanel = null;
      cam.first = true;
      if (g.world.scenery?.sky) g.world.scenery.sky.visible = true;
    };
    if (quick) go(); else { g.audio.play('click'); this._fade('🚪', go); }
  }

  /** 실내 충돌: 방 안쪽 + 가구 상자 */
  _collide(next, r) {
    const { W, D, solids } = this.room;
    const lx = next.x - IO.x, lz = next.z - IO.z;
    let x = THREE.MathUtils.clamp(lx, -W / 2 + r, W / 2 - r), z = THREE.MathUtils.clamp(lz, -D / 2 + r, D / 2 - 0.25);
    for (const b of solids) {
      if (x > b.x0 - r && x < b.x1 + r && z > b.z0 - r && z < b.z1 + r) {
        const push = [[x - (b.x0 - r), 'x', b.x0 - r], [(b.x1 + r) - x, 'x', b.x1 + r], [z - (b.z0 - r), 'z', b.z0 - r], [(b.z1 + r) - z, 'z', b.z1 + r]].sort((a, c) => a[0] - c[0])[0];
        if (push[1] === 'x') x = push[2]; else z = push[2];
      }
    }
    next.x = IO.x + x; next.z = IO.z + z;
    return next;
  }

  _updateInside(dt, pp) {
    const g = this.game, w = g.world, cam = g.followCam;
    // 바깥 가리기: 하늘·비·눈 끄고 배경·안개를 어둡게 (매 프레임 world.update 가 되돌리므로 그 뒤에 덮어씀)
    if (w.scenery?.sky) w.scenery.sky.visible = false;
    if (w.precip) { w.precip.rain.visible = false; w.precip.snow.visible = false; }
    w.scene.background?.setHex(0x1c1720);
    if (w.scene.fog) { w.scene.fog.color.setHex(0x1c1720); w.scene.fog.near = 18; w.scene.fog.far = 34; }
    // 실내 불빛: 밤일수록 따뜻하게, 창밖은 낮엔 하늘빛·밤엔 짙은 남색
    const night = 1 - THREE.MathUtils.clamp(w.daylight * 2.2, 0, 1);
    this.roomLight.intensity = 0.9 + night * 2.4;
    this.roomLampMat.emissiveIntensity = 0.3 + night * 1.8;
    this.roomGlass.emissive.setHex(night > 0.5 ? 0x1b2a55 : 0x9fd3ea);
    this.roomGlass.emissiveIntensity = night > 0.5 ? 0.6 : 0.5;
    if (this.room.fire) { const f = this.room.fire; f.scale.y = 1 + Math.sin(performance.now() / 90) * 0.12; f.material.emissiveIntensity = 1.4 + Math.sin(performance.now() / 70) * 0.3; }
    // 옷장 미리보기: 창이 닫히면 카메라를 원래대로
    if (this._wdCam && g.ui.panel !== this._wdPanel) { Object.assign(cam, this._wdCam); this._wdCam = null; this._wdPanel = null; }
    if (this._wdCam) { cam.yaw = THREE.MathUtils.clamp(cam.yaw, -0.9, 0.9); return { d: 99, label: '👗 옷장', key: 'inside' }; }
    // 카메라는 앞쪽에서만 (옆으로 너무 돌리면 벽 뒤가 보임)
    cam.yaw = THREE.MathUtils.clamp(((cam.yaw + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI, -0.55, 0.55);
    cam.pitch = THREE.MathUtils.clamp(cam.pitch, 0.62, 1.2);
    cam.distance = THREE.MathUtils.clamp(cam.distance, 6, 15);
    g.player.speedMult = this.sim.speedMult(w.day) * this._wetMult();
    // 잠드는 중(화면이 어두운 동안)에는 가구를 쓰지 않음 (상호작용 없는 안내로 다른 안내도 막음)
    if (this._sleeping) return { d: 99, label: '💤 쿨쿨…', key: 'inside' };
    // 가장 가까운 가구
    let best = null, bd = 1.35;
    for (const sp of this.room.spots) { const d = Math.hypot(IO.x + sp.x - pp.x, IO.z + sp.z - pp.z); if (d < bd) { bd = d; best = sp; } }
    if (!best) return { d: 99, label: `🏠 ${this.sim.info.name} · 가구 앞에서 E`, key: 'inside' };
    return { d: bd, label: best.key === 'bed' && !this.sim.canSleep(w.time) ? '🛏️ 침대 · 저녁 6시부터 잘 수 있어요' : best.label, key: 'home_' + best.key, onInteract: () => this._use(best.key) };
  }

  _use(key) {
    const g = this.game, ui = g.ui;
    if (this._fadeT || this._sleeping) return;
    if (key === 'door') return this.leave();
    if (key === 'bed') { if (this.sim.canSleep(g.world.time)) return this.sleep(); return ui.toast(`🛏️ 아직 일러요 · 저녁 6시부터 잘 수 있어요 (지금 ${g.world.clockText().split(' ')[1]})`); }
    if (key === 'books') return ui.openBook();
    if (key === 'calendar') return ui.openQuests();
    if (key === 'desk') return this.open();
    if (key === 'wardrobe') return this.openWardrobe();
  }

  /** 옷장: 🧥 코스튬 · 🎩 소품 · 💾 세트. 창은 옆에 붙고 카메라가 유니코 앞으로 다가가 입은 모습을 보여 줌 */
  openWardrobe(tab = this._wdTab || 'cos') {
    const g = this.game, ui = g.ui, cs = g.costume, cam = g.followCam;
    const el = (tag, cls, html = '') => { const e = document.createElement(tag); if (cls) e.className = cls; e.innerHTML = html; return e; };
    const p = ui.openPanel('👗 옷장');
    p.classList.add('wardrobe');
    // 미리보기 카메라 (창을 닫으면 _updateInside 가 되돌림)
    if (!this._wdCam) this._wdCam = { yaw: cam.yaw, pitch: cam.pitch, distance: cam.distance, lookOffsetY: cam.lookOffsetY || 0 };
    this._wdPanel = p;
    cam.yaw = -0.35; cam.pitch = 0.28; cam.distance = 4.6;
    // 세로 폰: 창이 화면 아래 절반을 덮으므로 조금 물러나 바라보는 점을 낮춤 → 유니코가 창 위쪽에 보임
    if (typeof matchMedia !== 'undefined' && matchMedia('(max-width: 600px)').matches) { cam.distance = 6.5; cam.lookOffsetY = -1.25; }
    g.player.unico.facing = cam.yaw + 0.35;
    const body = el('div', 'wd');
    p.append(body);
    const render = () => {
      this._wdTab = tab;
      body.innerHTML = '';
      const tabs = el('div', 'mk-tabs wd-tabs');
      for (const [id, label] of [['cos', '🧥 코스튬'], ['acc', '🎩 소품'], ['set', '💾 세트']]) {
        const t = el('button', tab === id ? 'on' : '', label);
        t.onclick = () => { tab = id; g.audio.play('click', 0.5); render(); };
        tabs.append(t);
      }
      body.append(tabs);
      const o = g.outfitNow();
      if (tab === 'cos') {
        const grid = el('div', 'cos-grid');
        const slot = (id, icon, name, sub, state, onclick) => {
          const b = el('button', `cos-slot ${state}`, `<span class="ic">${icon}</span><b>${name}</b><small>${sub}</small>${state === 'on' ? '<i>입는 중</i>' : ''}`);
          b.disabled = state === 'locked';
          b.onclick = onclick;
          grid.append(b);
        };
        slot(null, '🦄', '기본 유니코', '아무것도 입지 않은 모습', cs.wearing ? 'own' : 'on', () => { cs.wear(null); this._applyCos(); render(); });
        for (const c of COSTUMES) {
          const owned = cs.has(c.id);
          const how = c.unlock === 'stamps' ? '🏢 체험관 스탬프 6개' : c.festival ? `🎉 축제 날 장터 ${c.price}🪙` : `🛒 장터 ${c.price}🪙 · Lv.${c.lv}`;
          slot(c.id, c.icon, c.name, owned ? `✨ ${c.perkText}` : `🔒 ${how}`, !owned ? 'locked' : cs.wearing === c.id ? 'on' : 'own', () => { cs.wear(c.id); this._applyCos(c); render(); });
        }
        body.append(grid);
        body.append(el('p', 'mk-note', '코스튬은 장터의 👗 의상 탭에서 사요. 입고 있는 옷의 혜택만 적용돼요'));
      } else if (tab === 'acc') {
        const cover = cs.wearing ? COSTUME[cs.wearing] : null;
        const group = (title, opts, keyName) => {
          body.append(el('h3', '', title));
          const row = el('div', 'wd-row');
          for (const [val, label] of opts) {
            const b = el('button', o[keyName] === val ? 'gold' : 'ghost', label);
            b.onclick = () => { this.wear({ [keyName]: val }); g.audio.play('pop', 0.6); render(); };
            row.append(b);
          }
          body.append(row);
        };
        group('🎩 모자', [[null, '없음'], ['straw', '👒 밀짚모자'], ['helmet', '⛑️ 안전모']], 'hat');
        group('🧣 스카프', [[null, '없음'], ['red', '🔴 빨강'], ['green', '🟢 초록'], ['blue', '🔵 파랑']], 'scarf');
        group('🥽 고글', [[false, '안 씀'], [true, '씀']], 'goggles');
        group('🌱 머리 새싹 (모자를 쓰면 가려져요)', [[true, '있음'], [false, '없음']], 'sprout');
        if (cover) body.append(el('p', 'mk-note', `${cover.icon} ${cover.name}${josa(cover.name, '을/를')} 입는 동안에는 옷에 따라 모자·스카프가 가려질 수 있어요`));
      } else {
        const rows = el('div', 'rows');
        const desc = (st) => st ? [st.costume ? `${COSTUME[st.costume].icon} ${COSTUME[st.costume].name}` : '🦄 기본', st.hat ? { straw: '👒', helmet: '⛑️' }[st.hat] : '', st.scarf ? { red: '🔴', green: '🟢', blue: '🔵' }[st.scarf] : '', st.goggles ? '🥽' : ''].filter(Boolean).join(' ') : '비어 있음';
        cs.sets.forEach((st, i) => {
          const r = el('div', 'row', `<span class="ic">${i + 1}</span><span class="nm">세트 ${i + 1}<br><small>${desc(st)}</small></span>`);
          const save = el('button', 'ghost', '💾 지금 옷 저장');
          save.onclick = () => { cs.saveSet(i, o); g.audio.play('pop', 0.6); ui.toast(`💾 세트 ${i + 1}에 저장했어요`); render(); };
          const load = el('button', '', '입기');
          load.disabled = !st;
          load.onclick = () => { const v = cs.loadSet(i); if (!v) return ui.toast('🔒 그 옷을 아직 가지고 있지 않아요'); this.wear({ hat: v.hat, scarf: v.scarf, goggles: v.goggles, sprout: v.sprout }); this._applyCos(v.costume && COSTUME[v.costume]); render(); };
          r.append(save, load);
          rows.append(r);
        });
        body.append(rows);
        body.append(el('p', 'mk-note', '자주 입는 옷차림을 저장해 두고 한 번에 갈아입어요'));
      }
    };
    render();
  }

  /** 코스튬을 바꾼 뒤: 입히기·접속자 알림·저장, 반짝 효과 */
  _applyCos(c) {
    const g = this.game;
    g.applyLook();
    g.audio.play(c ? 'levelup' : 'pop', c ? 0.5 : 0.6);
    g.player.unico.playAction('cheer', 0.9);
    if (c) g.ui.toast(`${c.icon} ${c.name} · ${c.perkText}`);
    g.onEvent('outfit');
    saveGame(g);
  }

  /** 옷 입기 (저장도) */
  wear(o) {
    const clean = {};
    if ('hat' in o) clean.hat = OUTFIT.hat.includes(o.hat) ? o.hat : null;
    if ('scarf' in o) clean.scarf = OUTFIT.scarf.includes(o.scarf) ? o.scarf : null;
    if ('goggles' in o) clean.goggles = !!o.goggles;
    if ('sprout' in o) clean.sprout = !!o.sprout;
    this.sim.outfit = { ...this.sim.outfit, ...clean, set: true };
    this.game.applyLook();
    this.game.onEvent('outfit');
  }

  /** 집 창 */
  open() {
    const g = this.game, ui = g.ui, w = g.world, S = this.sim, eco = g.economy;
    const p = ui.openPanel(`🏠 ${S.info.name}`);
    const add = (cls, html) => { const e = document.createElement('div'); e.className = cls; e.innerHTML = html; p.append(e); return e; };
    add('mk-note', `${S.info.desc}${S.rested(w.day) ? '<br>😊 오늘은 푹 자서 개운해요 (걷는 속도 +15%)' : ''}`);
    const rows = document.createElement('div'); rows.className = 'rows'; p.append(rows);
    // 잠자기
    const can = S.canSleep(w.time);
    const sr = document.createElement('div'); sr.className = 'row mk-row';
    sr.innerHTML = `<span class="ic">🛏️</span><span class="nm">잠자기<br><small>${can ? '자고 나면 아침 6시 30분 · 하루 동안 걷는 속도 +15%' : `저녁 6시부터 잘 수 있어요 (지금 ${w.clockText ? w.clockText().split(' ')[1] : ''})`}</small></span>`;
    const sb = document.createElement('button'); sb.className = can ? 'gold' : ''; sb.textContent = can ? '잠자기 💤' : '아직 일러요'; sb.disabled = !can;
    sb.onclick = () => this.sleep();
    sr.append(sb); rows.append(sr);
    // 집 넓히기
    const n = S.next;
    const ur = document.createElement('div'); ur.className = 'row mk-row';
    if (n) {
      const why = S.whyNotUpgrade(eco.money, g.quests.level);
      ur.innerHTML = `<span class="ic">🏡</span><span class="nm">${n.name}으로 넓히기<br><small>${n.desc}</small></span><span class="pr">${n.price.toLocaleString()}🪙</span>`;
      const ub = document.createElement('button'); ub.className = why ? '' : 'gold'; ub.disabled = !!why; ub.textContent = why && /Lv/.test(why) ? `🔒 ${why.split('부터')[0]}` : '넓히기'; if (why) ub.title = why;
      ub.onclick = () => this.upgrade();
      ur.append(ub);
    } else ur.innerHTML = '<span class="ic">🏡</span><span class="nm">가장 큰 집이에요<br><small>매일 아침 우편함에 선물이 와요</small></span>';
    rows.append(ur);
    if (S.mail()) add('mk-note', `📬 우편함: 매일 아침 ${S.mail().coins}🪙${S.mail().items.length ? ` + ${S.mail().items.map(([id, k]) => `${ITEMS[id]?.emoji || ''}${ITEMS[id]?.name || id} ${k}개`).join(', ')}` : ''}`);
  }

  upgrade() {
    const g = this.game, eco = g.economy;
    const cost = this.sim.upgrade(eco.money, g.quests.level);
    if (!cost) return;
    eco.spend(cost);
    g.ui.closePanel();
    this.build();
    if (this.inside) { const e = this.room.entry; g.player.position.set(IO.x + e.x, IO.y, IO.z + e.z); this.room.group.visible = true; g.followCam.distance = [9.5, 10.5, 12][this.sim.level]; }
    g.audio.play('levelup');
    g.juice.pop(this.root, 0.25);
    g.fx.burst(this.root.position.x, 2.5, this.root.position.z, 0xfff3a0, 34);
    g.ui.toast(`🏡 집을 '${this.sim.info.name}'으로 넓혔어요! ${this.sim.info.desc}`);
    g.onEvent('homeup');
    saveGame(g);
  }

  /** 잠자기: 화면이 어두워졌다가 아침으로. 잠드는 1.3초 동안 다시 불러도 한 번만 (하루가 두 번 넘어가지 않게) */
  sleep() {
    const g = this.game, w = g.world;
    if (this._sleeping || this._fadeT) return;
    const r = this.sim.sleep(w.time, w.day);
    if (!r) return;
    this._sleeping = true;
    g.ui.closePanel();
    g.player.frozen = true;
    const fade = document.createElement('div');
    fade.className = 'sleep-fade';
    fade.innerHTML = '<span>💤 쿨쿨…</span>';
    document.getElementById('ui').append(fade);
    g.audio.play('pop', 0.4);
    requestAnimationFrame(() => fade.classList.add('on'));
    setTimeout(() => {
      this._sleeping = false;
      try {
        w.time = r.time;
        // 어두운 사이 자정이 지나 world 가 이미 날을 넘겼으면 다시 넘기지 않음 (우편함·임대 수입·시세가 두 번 처리되지 않게)
        if (r.newDay && w.day < r.day) { w.day = r.day; w.onNewDay?.(r.day); }
        if (this.inside) { const b = this.room.spots.find((x) => x.key === 'bed'); if (b) g.player.position.set(IO.x + b.x, IO.y, IO.z + b.z); }
        g.player.unico.playAction('cheer', 1.2);
        g.ui.toast(`☀️ ${w.day}일차 아침! 푹 자서 개운해요 · 오늘 하루 걷는 속도 +15%`);
        g.onEvent('sleep');
        saveGame(g);
      } finally {
        fade.classList.remove('on');
        setTimeout(() => fade.remove(), 900);
        g.player.frozen = false;
      }
    }, 1300);
  }

  /** 새 날 아침 우편함 */
  newDay() {
    const g = this.game, m = this.sim.mail();
    if (!m) return;
    g.economy.earn(m.coins);
    for (const [id, n] of m.items) g.economy.addItem(id, n);
    g.ui.toast(`📬 우편함 선물: ${m.coins}🪙${m.items.length ? ` + ${m.items.map(([id, n]) => `${ITEMS[id]?.name || id} ${n}개`).join(', ')}` : ''}`);
  }

  toJSON() { return this.sim.toJSON(); }
  load(d) {
    this.sim.load(d);
    this.build();
  }
}

export { HOME_LEVELS };
