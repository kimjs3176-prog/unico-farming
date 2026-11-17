import * as THREE from 'three';
import { seasonOf, growthMult, priceMult } from '../sim/season.js';
import { SURF } from '../surface.js';

/**
 * 계절 화면 (규칙은 sim/season.js)
 *  - 계절이 바뀌면: 풀 색(인스턴스 색)·들꽃 양·나무 잎 색(셰이더 유니폼: 단풍·봄 꽃송이·겨울 서리)·땅 색·눈 덮임
 *  - 봄엔 꽃잎, 가을엔 낙엽이 카메라 앞쪽에 흩날림 (비·눈 올 때·집 안에서는 쉼)
 *    카메라 바로 앞과 카메라→주인공 사이에서는 작아져 사라짐 (얼굴을 가리지 않게)
 *  - 밭 성장·판매가에 제철 배율 연결, 상단 HUD 계절 칩, 바뀔 때 알림
 */
const FALL_N = 70;
const PETAL_COLS = [0xf7a1c4, 0xffb3cf, 0xf48fb1, 0xffc9dc];
const LEAF_COLS = [0xe0802c, 0xd4372c, 0xe8b23a, 0xa8642a];

/** 꽃잎: 끝이 살짝 파인 물방울 모양, 가장자리를 들어 오목하게 (텍스처·알파 없이 모양을 지오메트리로) */
export function petalGeometry() {
  const ring = [[0, -0.045], [0.021, -0.031], [0.0325, -0.006], [0.028, 0.02], [0.013, 0.043], [0, 0.034], [-0.013, 0.043], [-0.028, 0.02], [-0.0325, -0.006], [-0.021, -0.031]];
  return fanGeometry(ring, (x, y) => 0.008 * Math.min(1, Math.hypot(x, y) / 0.03), new THREE.Color(0xffc2d4), new THREE.Color(0xffffff), -0.045, 0.045);
}

/** 낙엽: 다섯 갈래 단풍잎, 가운데 잎맥을 따라 V 자로 접힘 */
export function leafGeometry() {
  const ring = [];
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2 - Math.PI / 2;
    const r = 0.05 * (0.55 + 0.45 * Math.pow(Math.abs(Math.cos(a * 2.5 + Math.PI / 4)), 1.6));
    ring.push([Math.cos(a) * r, -Math.sin(a) * r]);
  }
  return fanGeometry(ring, (x) => Math.abs(x) * 0.25, new THREE.Color(0xc9a27a), new THREE.Color(0xffffff), -0.05, 0.05);
}

/** 가운데 점 + 둘레 점 부채꼴 메시 (z 들어올림, 아래→위 정점 색) */
function fanGeometry(ring, lift, c0, c1, y0, y1) {
  const n = ring.length, pos = [0, 0, 0], col = [], idx = [];
  const tmp = new THREE.Color();
  const put = (y) => { tmp.copy(c0).lerp(c1, (y - y0) / (y1 - y0)); col.push(tmp.r, tmp.g, tmp.b); };
  put(0);
  for (const [x, y] of ring) { pos.push(x, y, lift(x, y)); put(y); }
  for (let i = 0; i < n; i++) idx.push(0, 1 + i, 1 + ((i + 1) % n));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** 점 p 에서 선분 a-b 까지 거리 */
function segDist(p, a, b) {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
  const l2 = abx * abx + aby * aby + abz * abz;
  const t = l2 > 1e-9 ? Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby + (p.z - a.z) * abz) / l2)) : 0;
  return Math.hypot(p.x - a.x - abx * t, p.y - a.y - aby * t, p.z - a.z - abz * t);
}
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** 카메라 가까이·카메라→주인공 머리 사이면 0 쪽으로 (투명 없이 크기로 사라짐) */
export function fallScale(p, cam, head) {
  if (!cam) return 1;
  const dc = Math.hypot(p.x - cam.x, p.y - cam.y, p.z - cam.z);
  return smooth(1.5, 2.5, dc) * (head ? smooth(0.5, 1.1, segDist(p, cam, head)) : 1);
}

export class SeasonView {
  constructor(game) {
    this.game = game;
    this.cur = null;
    // 꽃잎·낙엽 (작은 모양 하나를 여러 개 그림: 그리기 1번)
    this.petalGeo = petalGeometry();
    this.leafGeo = leafGeometry();
    // 흰 재질 × 분홍 정점 색 + 아주 약한 스스로 빛: 안개·그늘에서도 잿빛이 아니라 분홍으로
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x221018, vertexColors: true, side: THREE.DoubleSide });
    this.fall = new THREE.InstancedMesh(this.petalGeo, mat, FALL_N);
    this.fall.frustumCulled = false;
    this.fall.castShadow = false;
    this.fall.visible = false;
    this.fallP = Array.from({ length: FALL_N }, () => {
      const ax = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5);
      if (ax.lengthSq() < 1e-4) ax.set(1, 0, 0);
      return { x: 0, y: 0, z: 0, vy: 0, ph: Math.random() * 6.28, spin: 1.2 + Math.random() * 2.2, s: 0.7 + Math.random() * 0.4, ax: ax.normalize() };
    });
    this.fallSeeded = false;
    game.world.scene.add(this.fall);
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._q2 = new THREE.Quaternion(); this._s = new THREE.Vector3(1, 1, 1); this._p = new THREE.Vector3();
    this._f = new THREE.Vector3(); this._z = new THREE.Vector3(0, 0, 1);
  }

  get season() { return this.cur; }

  update(dt) {
    const g = this.game, s = seasonOf(g.world.day);
    if (!this.cur || s.id !== this.cur.id) this.apply(s, !!this.cur);
    if (this.cur.dayIn !== s.dayIn) { this.cur = s; this.hud(); }
    this.updateFall(dt);
  }

  /** HUD 달력의 계절 줄 ('🌸 봄 1일') */
  hud() {
    this.game.ui.setSeason?.(this.cur.icon, this.cur.name, this.cur.dayIn);
  }

  apply(s, announce) {
    const g = this.game, w = g.world, sc = w.scenery, L = s.look;
    this.cur = s;
    // 규칙 연결: 제철 작물 성장·판매가
    g.farm.sim.growthMult = (crop) => growthMult(s, crop);
    g.economy.seasonMult = (item) => priceMult(s, item);
    // 풀 색: 인스턴스마다 정해진 난수로 (계절이 바뀌어도 같은 풀은 같은 결)
    if (sc?.grass?.instanceColor) {
      sc.grass.material.color.setHex(0xffffff); // 재질의 초록을 빼고 계절 색을 그대로 (가을 풀이 연두로 보이지 않게)
      const col = new THREE.Color(), n = sc.grassTotal || sc.grass.count;
      for (let i = 0; i < n; i++) {
        const r1 = hash(i * 3.1), r2 = hash(i * 7.7), r3 = hash(i * 1.3);
        let [h, sa, l] = L.grass;
        if (s.id === 'autumn' && r3 < 0.3) { h = 0.2; sa = 0.5; l = 0.34; } // 가을에도 군데군데 초록
        if (s.id === 'winter' && r3 < 0.25) { h = 0.26; sa = 0.22; l = 0.36; }
        col.setHSL(h + (r1 - 0.5) * 2 * L.grassJitter, sa + (r2 - 0.5) * 0.15, l + (r3 - 0.5) * 0.1);
        sc.grass.setColorAt(i, col);
      }
      sc.grass.instanceColor.needsUpdate = true;
    }
    // 들꽃 양
    if (sc) { sc.seasonFlowers = L.flowers; sc.setDensity(sc.density ?? 1); }
    // 나무 잎: 모든 잎 셰이더가 함께 쓰는 유니폼만 바꿈 (재질 색을 건드리지 않아 언제 놓은 나무든 같은 계절 색)
    const lv = L.leaves;
    SURF.leafA.value.setHex(lv.a); SURF.leafB.value.setHex(lv.b); SURF.leafR.value.setHex(lv.red); SURF.leafR2.value.setHex(lv.red2 ?? lv.red);
    SURF.leafAmt.value.set(...lv.amt);
    SURF.blossom.value = lv.blossom;
    // 땅 색·눈 덮임
    const gm = w.groundMat;
    if (gm) { gm.userData.baseColor ||= gm.color.clone(); gm.color.copy(gm.userData.baseColor).multiply(new THREE.Color(...L.ground)); }
    // 잔디 둑·테두리 (userData.seasonLawn 표시한 재질): 풀처럼 계절 색으로, 겨울엔 눈 색 쪽으로
    this.tintLawns(L);
    w.seasonSnow = L.snow;
    if (!announce) { w.snowCover = Math.max(w.snowCover || 0, L.snow); SURF.snow.value = Math.max(SURF.snow.value, L.snow * 0.85); } // 겨울에 접속하면 처음부터 눈이 쌓인 채로
    // 꽃잎·낙엽: 모양과 색
    if (L.fall) {
      this.fall.geometry = L.fall === 'petal' ? this.petalGeo : this.leafGeo;
      const cols = L.fall === 'petal' ? PETAL_COLS : LEAF_COLS;
      const col = new THREE.Color();
      for (let i = 0; i < FALL_N; i++) this.fall.setColorAt(i, col.setHex(cols[i % cols.length]));
      this.fall.instanceColor.needsUpdate = true;
    }
    this.fallKind = L.fall;
    this.hud();
    if (announce) {
      g.ui.toast(`${s.icon} ${s.name}이 왔어요! ${s.desc}`);
      g.audio.play('levelup', 0.6);
      g.onEvent('season', s.index);
    }
  }

  /** 계절 잔디색: 원래 색 × 땅 배율을 풀 색(HSL) 쪽으로, 눈이 쌓이면 눈 색으로 */
  tintLawns(L) {
    const tmp = new THREE.Color(), snow = new THREE.Color(0.86, 0.9, 0.95);
    this.game.world.scene.traverse((o) => {
      if (!o.isMesh) return;
      for (const m of [].concat(o.material)) {
        if (!m?.userData?.seasonLawn || !m.color) continue;
        m.userData.baseColor ||= m.color.clone();
        const [h, sa, l] = L.grass;
        m.color.copy(m.userData.baseColor).lerp(tmp.setHSL(h, sa * 0.9, Math.min(0.55, l + 0.08)), 0.5);
        if (L.snow > 0) m.color.lerp(snow, Math.min(1, L.snow));
      }
    });
  }

  updateFall(dt) {
    const g = this.game, w = g.world;
    const on = !!this.fallKind && !g.home?.inside && (w.weatherCur?.precip || 0) < 0.25 && (w.daylight ?? 1) > 0.15;
    this.fall.visible = on;
    if (!on) { this.fallSeeded = false; return; }
    const head = g.followCam.target, cam = g.camera?.position;
    // 흩날리는 상자: 카메라가 보는 쪽으로 4m 밀어 둠 (화면 밖·카메라 뒤에 쓰지 않게)
    const f = this._f.set(0, 0, -1);
    if (g.camera?.getWorldDirection) { g.camera.getWorldDirection(f); f.y = 0; if (f.lengthSq() < 1e-6) f.set(0, 0, -1); f.normalize(); }
    const cx = head.x + f.x * 4, cz = head.z + f.z * 4, base = head.y - 1.1, RX = 8, RZ = 7;
    const wind = w.weatherCur?.wind ?? 0.15, petal = this.fallKind === 'petal';
    for (let i = 0; i < FALL_N; i++) {
      const p = this.fallP[i];
      if (!this.fallSeeded || p.y < base - 0.2 || Math.abs(p.x - cx) > RX || Math.abs(p.z - cz) > RZ) {
        p.x = cx + (Math.random() - 0.5) * 2 * RX; p.z = cz + (Math.random() - 0.5) * 2 * RZ;
        p.y = base + (this.fallSeeded ? 5 + Math.random() * 2 : 0.5 + Math.random() * 6.5);
        p.vy = (petal ? 0.45 : 0.75) * (0.7 + Math.random() * 0.6);
      }
      p.ph += dt * p.spin;
      p.y -= p.vy * (0.8 + 0.3 * Math.abs(Math.cos(p.ph))) * dt; // 뒤집힐 때마다 살짝 멈칫 (팔랑팔랑)
      p.x += (Math.sin(p.ph) * 0.6 + wind * 1.6) * dt;
      p.z += Math.cos(p.ph * 0.7) * 0.35 * dt;
      // 한 축으로 굴러 떨어지며 좌우로 흔들림
      this._q.setFromAxisAngle(p.ax, p.ph);
      this._q2.setFromAxisAngle(this._z, Math.sin(p.ph * 0.8) * 0.5);
      this._q.multiply(this._q2);
      this._p.set(p.x, p.y, p.z);
      const k = p.s * fallScale(this._p, cam, head);
      this._s.set(k, k, k);
      this._m.compose(this._p, this._q, this._s);
      this.fall.setMatrixAt(i, this._m);
    }
    this.fallSeeded = true;
    this.fall.instanceMatrix.needsUpdate = true;
  }
}

function hash(x) { const s = Math.sin(x * 12.9898) * 43758.5453; return s - Math.floor(s); }
