import * as THREE from 'three';
import { seasonOf, growthMult, priceMult } from '../sim/season.js';

/**
 * 계절 화면 (규칙은 sim/season.js)
 *  - 계절이 바뀌면: 풀 색(인스턴스 색)·들꽃 양·나무 잎 색(단풍·벚꽃빛·겨울 잿빛)·땅 색·눈 덮임
 *  - 봄엔 꽃잎, 가을엔 낙엽이 플레이어 주변에 흩날림 (비·눈 올 때·집 안에서는 쉼)
 *  - 밭 성장·판매가에 제철 배율 연결, 상단 HUD 계절 칩, 바뀔 때 알림
 */
const FALL_N = 70;

export class SeasonView {
  constructor(game) {
    this.game = game;
    this.cur = null;
    this.leafMats = null;
    // 꽃잎·낙엽 (작은 판 하나를 여러 개 그림)
    const geo = new THREE.PlaneGeometry(0.14, 0.09);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, side: THREE.DoubleSide });
    this.fall = new THREE.InstancedMesh(geo, mat, FALL_N);
    this.fall.frustumCulled = false;
    this.fall.visible = false;
    this.fallP = Array.from({ length: FALL_N }, () => ({ x: 0, y: 0, z: 0, vy: 0, ph: Math.random() * 6.28, spin: 0.5 + Math.random() * 2 }));
    this.fallSeeded = false;
    game.world.scene.add(this.fall);
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler(); this._s = new THREE.Vector3(1, 1, 1); this._p = new THREE.Vector3();
  }

  get season() { return this.cur; }

  update(dt) {
    const g = this.game, s = seasonOf(g.world.day);
    if (!this.cur || s.id !== this.cur.id) this.apply(s, !!this.cur);
    if (this.cur.dayIn !== s.dayIn) { this.cur = s; this.hud(); }
    this.updateFall(dt);
  }

  hud() {
    const c = this.game.ui.seasonChip;
    if (c) c.textContent = `${this.cur.icon} ${this.cur.name} ${this.cur.dayIn}/7`;
  }

  apply(s, announce) {
    const g = this.game, w = g.world, sc = w.scenery, L = s.look;
    this.cur = s;
    // 규칙 연결: 제철 작물 성장·판매가
    g.farm.sim.growthMult = (crop) => growthMult(s, crop);
    g.economy.seasonMult = (item) => priceMult(s, item);
    // 풀 색: 인스턴스마다 정해진 난수로 (계절이 바뀌어도 같은 풀은 같은 결)
    if (sc?.grass?.instanceColor) {
      const col = new THREE.Color(), n = sc.grassTotal || sc.grass.count;
      for (let i = 0; i < n; i++) {
        const r1 = hash(i * 3.1), r2 = hash(i * 7.7), r3 = hash(i * 1.3);
        let [h, sa, l] = L.grass;
        if (s.id === 'autumn' && r3 < 0.35) { h = 0.22; sa = 0.45; l = 0.4; } // 가을에도 군데군데 초록
        if (s.id === 'winter' && r3 < 0.25) { h = 0.27; sa = 0.25; l = 0.42; }
        col.setHSL(h + (r1 - 0.5) * 2 * L.grassJitter, sa + (r2 - 0.5) * 0.15, l + (r3 - 0.5) * 0.1);
        sc.grass.setColorAt(i, col);
      }
      sc.grass.instanceColor.needsUpdate = true;
    }
    // 들꽃 양
    if (sc) { sc.seasonFlowers = L.flowers; sc.setDensity(sc.density ?? 1); }
    // 나무 잎: 잎 재질(foliage)마다 원래 색에서 계절 색으로 (두 가지 색을 번갈아 → 숲이 알록달록)
    if (!this.leafMats) {
      const set = new Set();
      w.scene.traverse((o) => { if (!o.isMesh) return; for (const m of [].concat(o.material)) if (m?.userData?.enhanced === 'foliage') set.add(m); });
      this.leafMats = [...set];
      for (const m of this.leafMats) m.userData.baseColor = m.color.clone();
    }
    this.leafMats.forEach((m, i) => {
      const [hex, amt] = (i % 2 && L.leafAlt) ? L.leafAlt : L.leaf;
      m.color.copy(m.userData.baseColor).lerp(new THREE.Color(hex), amt);
    });
    // 땅 색·눈 덮임
    const gm = w.groundMat;
    if (gm) { gm.userData.baseColor ||= gm.color.clone(); gm.color.copy(gm.userData.baseColor).multiply(new THREE.Color(...L.ground)); }
    w.seasonSnow = L.snow;
    // 꽃잎·낙엽 색
    if (L.fall) {
      const cols = L.fall === 'petal' ? [0xffc4d8, 0xffd9e6, 0xfff0f5, 0xf7a8c4] : [0xe0802c, 0xd4372c, 0xe8b23a, 0xa8642a];
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

  updateFall(dt) {
    const g = this.game, w = g.world;
    const on = !!this.fallKind && !g.home?.inside && (w.weatherCur?.precip || 0) < 0.25 && (w.daylight ?? 1) > 0.15;
    this.fall.visible = on;
    if (!on) { this.fallSeeded = false; return; }
    const c = g.followCam.target, R = 9;
    const wind = w.weatherCur?.wind ?? 0.15;
    for (let i = 0; i < FALL_N; i++) {
      const p = this.fallP[i];
      if (!this.fallSeeded || p.y < 0 || Math.abs(p.x - c.x) > R || Math.abs(p.z - c.z) > R) {
        p.x = c.x + (Math.random() - 0.5) * 2 * R; p.z = c.z + (Math.random() - 0.5) * 2 * R;
        p.y = this.fallSeeded ? 6 + Math.random() * 2 : Math.random() * 8;
        p.vy = (this.fallKind === 'petal' ? 0.45 : 0.75) * (0.7 + Math.random() * 0.6);
      }
      p.ph += dt * p.spin;
      p.y -= p.vy * dt;
      p.x += (Math.sin(p.ph) * 0.5 + wind * 1.6) * dt;
      p.z += Math.cos(p.ph * 0.7) * 0.35 * dt;
      this._e.set(p.ph, p.ph * 0.6, p.ph * 0.3);
      this._q.setFromEuler(this._e);
      this._m.compose(this._p.set(p.x, p.y, p.z), this._q, this._s);
      this.fall.setMatrixAt(i, this._m);
    }
    this.fallSeeded = true;
    this.fall.instanceMatrix.needsUpdate = true;
  }
}

function hash(x) { const s = Math.sin(x * 12.9898) * 43758.5453; return s - Math.floor(s); }
