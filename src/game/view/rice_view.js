import * as THREE from 'three';
import { RiceSim, RICE_STAGES, WATER_MAX, thresh } from '../sim/rice.js';
import { LAYOUT } from '../world.js';
import { ITEMS } from '../sim/items.js';

const CLUMPS = 5; // 한 논에 5x5 포기
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _c = new THREE.Color();
const GREEN = [new THREE.Color(0x9fdc6a), new THREE.Color(0x6fbf45), new THREE.Color(0x5aa83a), new THREE.Color(0xe8c24a)];

/** 사쿠나히메풍 논: 논두렁, 물 높이, 벼 포기(성장 단계별), 잡초, 탈곡장 */
export class RiceView {
  constructor(game) {
    this.game = game;
    const P = LAYOUT.paddy;
    this.sim = new RiceSim(P.cols * P.rows);
    this.batches = []; // 탈곡 전 벼 묶음 { n, q }
    this.paddies = [];
    const scene = game.world.scene;
    // 논두렁 (풀 덮인 흙둑) — 가로/세로 줄을 하나로 병합
    const bundMat = new THREE.MeshStandardMaterial({ color: 0x7fae4e, roughness: 1 });
    const W = P.cols * P.size + (P.cols + 1) * P.bund, H = P.rows * P.size + (P.rows + 1) * P.bund;
    for (let r = 0; r <= P.rows; r++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(W, 0.22, P.bund), bundMat);
      b.position.set(P.x0 + W / 2, 0.11, P.z0 + r * (P.size + P.bund) + P.bund / 2);
      b.receiveShadow = b.castShadow = true;
      scene.add(b);
    }
    for (let c = 0; c <= P.cols; c++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(P.bund, 0.22, H), bundMat);
      b.position.set(P.x0 + c * (P.size + P.bund) + P.bund / 2, 0.11, P.z0 + H / 2);
      b.receiveShadow = b.castShadow = true;
      scene.add(b);
    }
    // 각 논: 바닥 흙 + 물 + 벼 포기 인스턴스
    const blade = new THREE.ConeGeometry(0.025, 0.55, 3);
    blade.translate(0, 0.275, 0);
    const clumpGeo = mergeBlades(blade);
    const panicleGeo = new THREE.SphereGeometry(0.05, 6, 4).scale(0.6, 1.8, 0.6).translate(0, 0.5, 0);
    this.riceMesh = new THREE.InstancedMesh(clumpGeo, new THREE.MeshStandardMaterial({ roughness: 0.85 }), CLUMPS * CLUMPS * P.cols * P.rows);
    this.panicleMesh = new THREE.InstancedMesh(panicleGeo, new THREE.MeshStandardMaterial({ roughness: 0.6 }), CLUMPS * CLUMPS * P.cols * P.rows);
    this.weedMesh = new THREE.InstancedMesh(new THREE.ConeGeometry(0.12, 0.3, 5).translate(0, 0.15, 0), new THREE.MeshStandardMaterial({ color: 0x3e7a2a, roughness: 1 }), 5 * P.cols * P.rows);
    for (const m of [this.riceMesh, this.panicleMesh, this.weedMesh]) { m.castShadow = true; m.receiveShadow = true; scene.add(m); }
    const soilMat = { dry: new THREE.Color(0xb2946a), tilled: new THREE.Color(0x6b4a2e) };
    for (let r = 0; r < P.rows; r++) {
      for (let c = 0; c < P.cols; c++) {
        const x = P.x0 + P.bund + c * (P.size + P.bund) + P.size / 2, z = P.z0 + P.bund + r * (P.size + P.bund) + P.size / 2;
        const soil = new THREE.Mesh(new THREE.PlaneGeometry(P.size, P.size), new THREE.MeshStandardMaterial({ color: soilMat.dry, roughness: 1 }));
        soil.rotation.x = -Math.PI / 2;
        soil.position.set(x, 0.015, z);
        soil.receiveShadow = true;
        scene.add(soil);
        const water = new THREE.Mesh(new THREE.PlaneGeometry(P.size, P.size), new THREE.MeshStandardMaterial({ color: 0x6fb7c9, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.0, depthWrite: false }));
        water.rotation.x = -Math.PI / 2;
        water.position.set(x, 0.03, z);
        water.renderOrder = 2;
        scene.add(water);
        const jitter = Array.from({ length: CLUMPS * CLUMPS }, () => [(Math.random() - 0.5) * 0.12, (Math.random() - 0.5) * 0.12, Math.random() * 6.28, 0.85 + Math.random() * 0.3]);
        const weeds = Array.from({ length: 5 }, () => [(Math.random() - 0.5) * P.size * 0.8, (Math.random() - 0.5) * P.size * 0.8]);
        this.paddies.push({ x, z, soil, water, soilMat, jitter, weeds });
      }
    }
    // 탈곡장
    const T = LAYOUT.thresher;
    this.thresher = game.world.place('thresher', T.x, T.z, -0.5, 1, { r: 0.9 });
    this.drum = this.thresher.getObjectByName('Drum');
    this.threshing = null;
    this.sim.on((t) => { if (t !== 'weedgrow') this.dirty = true; });
    this.dirty = true;
    this.t = 0;
  }

  /** 논 칸 중심 근처 판정 */
  paddyAt(x, z, pad = 0) {
    const half = LAYOUT.paddy.size / 2 + pad;
    return this.paddies.findIndex((p) => Math.abs(x - p.x) < half && Math.abs(z - p.z) < half);
  }

  refresh() {
    const P = LAYOUT.paddy;
    let k = 0, w = 0;
    this.paddies.forEach((v, i) => {
      const s = this.sim.paddies[i];
      v.soil.material.color.copy(s.state === 'dry' ? v.soilMat.dry : v.soilMat.tilled);
      const growing = s.state === 'growing' || s.state === 'ripe';
      const stage = s.state === 'ripe' ? 3 : s.stage;
      const grow = growing ? Math.min(1, (stage + s.progress) / 3) : 0;
      for (let a = 0; a < CLUMPS; a++) for (let b = 0; b < CLUMPS; b++, k++) {
        const j = v.jitter[a * CLUMPS + b];
        const gx = v.x + (a - (CLUMPS - 1) / 2) * (P.size / CLUMPS) + j[0], gz = v.z + (b - (CLUMPS - 1) / 2) * (P.size / CLUMPS) + j[1];
        const sc = growing ? (0.3 + grow * 0.85) * j[3] : 0.0001;
        const droop = s.state === 'ripe' ? 0.35 : 0;
        _q.setFromEuler(new THREE.Euler(droop * Math.sin(j[2]), j[2], droop * Math.cos(j[2])));
        _m.compose(_p.set(gx, 0.02, gz), _q, _s.set(sc, sc, sc));
        this.riceMesh.setMatrixAt(k, _m);
        this.riceMesh.setColorAt(k, _c.copy(GREEN[Math.min(3, stage)]).lerp(GREEN[Math.min(3, stage + 1)], growing ? s.progress : 0));
        const showP = growing && stage >= 2;
        _m.compose(_p.set(gx, 0.02, gz), _q, _s.set(showP ? sc : 0.0001, showP ? sc : 0.0001, showP ? sc : 0.0001));
        this.panicleMesh.setMatrixAt(k, _m);
        this.panicleMesh.setColorAt(k, _c.setHex(stage >= 3 ? 0xf2c94c : 0xc9d77a));
      }
      for (let n = 0; n < 5; n++, w++) {
        const on = n < s.weeds;
        _m.compose(_p.set(v.x + v.weeds[n][0], 0.02, v.z + v.weeds[n][1]), _q.identity(), _s.setScalar(on ? 1 : 0.0001));
        this.weedMesh.setMatrixAt(w, _m);
      }
    });
    for (const m of [this.riceMesh, this.panicleMesh, this.weedMesh]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
  }

  update(dt, playerPos) {
    this.t += dt;
    const raining = ['rain', 'storm'].includes(this.game.world.weatherKind);
    this.sim.tick(dt, { raining });
    // 물 높이 표시 (매 프레임, 가벼움)
    this.paddies.forEach((v, i) => {
      const s = this.sim.paddies[i];
      const wl = s.state === 'dry' || s.state === 'tilled' ? 0 : s.water;
      v.water.position.y = 0.02 + (wl / WATER_MAX) * 0.17;
      v.water.material.opacity = wl > 0.05 ? 0.55 + Math.min(0.3, wl * 0.05) : 0;
    });
    this.acc = (this.acc || 0) + dt;
    if (this.dirty || this.acc > 0.5) { this.acc = 0; this.dirty = false; this.refresh(); }
    if (this.drum) this.drum.rotation.x += dt * (0.5 + (this.threshing?.gauge || 0) * 25);
    // 탈곡 미니게임 진행
    if (this.threshing) return this.updateThreshing(dt);
    // 근처 논
    const i = this.paddyAt(playerPos.x, playerPos.z, 0.9);
    const T = LAYOUT.thresher;
    const dT = Math.hypot(T.x - playerPos.x, T.z - playerPos.z);
    if (dT < 2.4) {
      const n = this.game.economy.count('paddy');
      this.game.ui.hideRice?.();
      return { d: dT, label: n ? `탈곡하기 (벼 ${n}단)` : '탈곡기 (벼를 수확해 오세요)', key: 'thresh', onInteract: n ? () => this.startThreshing() : null };
    }
    if (i < 0) { this.game.ui.hideRice?.(); return null; }
    const s = this.sim.paddies[i];
    this.game.ui.showRice?.(s, this.sim);
    const acts = this.sim.actionsFor(i, this.game.economy.count('rice_seed') > 0);
    const a = acts[0];
    const d = Math.hypot(this.paddies[i].x - playerPos.x, this.paddies[i].z - playerPos.z);
    return { d, label: `🌾 ${a.label}`, key: 'rice', onInteract: ['check'].includes(a.type) ? null : () => this.act(i, a.type) };
  }

  act(i, type) {
    const g = this.game, u = g.player.unico;
    switch (type) {
      case 'till': this.sim.till(i); g.audio.play('dig'); g.juice.shake(0.2); u.playAction('think', 0.6); break;
      case 'flood': this.sim.flood(i); g.audio.play('water'); u.playAction('water', 1.2); g.fx.sprinkle(this.paddies[i].x, this.paddies[i].z); break;
      case 'plant':
        if (!g.economy.useItem('rice_seed')) return g.ui.toast('볍씨가 없어요. 장터에서 사 오세요 🛒');
        this.sim.plant(i); g.audio.play('plant'); u.playAction('water', 1.2); g.onEvent('riceplant'); g.ui.toast('🌱 모내기 완료! 물 높이를 단계별 적정 범위로 맞춰 주세요'); break;
      case 'need_seed': g.ui.toast('볍씨가 없어요. 장터에서 사 오세요 🛒'); break;
      case 'water': this.sim.water(i); g.audio.play('water'); u.playAction('water', 1); g.fx.sprinkle(this.paddies[i].x, this.paddies[i].z); break;
      case 'drain': this.sim.drain(i); g.audio.play('click'); u.playAction('think', 0.8); g.ui.toast('💧 물꼬를 터서 물을 뺐어요'); break;
      case 'weed': this.sim.weed(i); g.audio.play('harvest'); u.playAction('cheer', 0.6); g.fx.pop(this.paddies[i].x, this.paddies[i].z, '🌿'); break;
      case 'harvest': {
        const r = this.sim.harvest(i);
        if (!r) return;
        this.batches.push({ n: r.amount, q: r.quality });
        g.economy.addItem('paddy', r.amount);
        g.audio.play('harvest'); u.playAction('cheer', 1.5); g.juice.pop(u.group, 0.2);
        g.fx.pop(this.paddies[i].x, this.paddies[i].z, '🌾');
        g.ui.toast(`🌾 벼 ${r.amount}단 수확! 예상 등급 ${'★'.repeat(RiceSim.grade(r.quality))} · 숙련도 Lv.${this.sim.skillLevel} · 탈곡장에서 쌀로 만드세요`);
        break;
      }
    }
    this.dirty = true;
  }

  // ---- 탈곡: 연타로 드럼 게이지를 유지 (5초) ----
  startThreshing() {
    const g = this.game;
    this.threshing = { t: 0, gauge: 0, sum: 0 };
    g.player.frozen = true;
    g.player.unico.playAction('cheer', 0);
    g.ui.showThresh?.(() => this.mash());
    g.ui.toast('⚙️ 탈곡! E 키 또는 화면 버튼을 빠르게 연타해 드럼을 돌리세요');
  }

  mash() { if (this.threshing) { this.threshing.gauge = Math.min(1, this.threshing.gauge + 0.11); this.game.audio.play('click', 0.3); } }

  updateThreshing(dt) {
    const th = this.threshing, g = this.game;
    if (g.input.justPressed('KeyE') || g.input.justPressed('Space') || g.input.interactTap) this.mash();
    th.t += dt;
    th.gauge = Math.max(0, th.gauge - dt * 0.4);
    th.sum += th.gauge * dt;
    g.ui.updateThresh?.(th.gauge, 5 - th.t);
    if (th.t >= 5) this.finishThreshing();
    return { d: -1, label: '⚙️ 탈곡 중! 연타하세요', key: 'thresh' };
  }

  finishThreshing() {
    const g = this.game, th = this.threshing;
    const eff = th.sum / 5 / 0.75; // 평균 게이지 0.75 이상이면 최고 효율
    const made = {};
    for (const b of this.batches) {
      const grade = RiceSim.grade(b.q);
      const n = thresh(b.n, eff);
      made[grade] = (made[grade] || 0) + n;
      g.economy.addItem(`rice_${grade}`, n);
    }
    g.economy.take('paddy', g.economy.count('paddy'));
    this.batches = [];
    this.threshing = null;
    g.player.frozen = false;
    g.player.unico.clearAction();
    g.ui.hideThresh?.();
    g.onEvent('thresh');
    g.audio.play('win');
    const lines = Object.entries(made).map(([gr, n]) => `${ITEMS['rice_' + gr].name} × ${n}`);
    g.ui.result('🍚 탈곡 완료!', [`탈곡 효율 ${Math.round(Math.min(1, eff) * 100)}%`, ...lines, `농사 숙련도 Lv.${this.sim.skillLevel} (수확할수록 품질이 잘 올라요)`]);
  }

  toJSON() { return { ...this.sim.toJSON(), batches: this.batches }; }
  load(d) { if (!d) return; this.sim.load(d); this.batches = d.batches || []; this.dirty = true; }
}

function mergeBlades(blade) {
  const parts = [];
  for (let i = 0; i < 7; i++) {
    const g = blade.clone();
    const a = (i / 7) * Math.PI * 2;
    g.rotateZ(0.18 + (i % 3) * 0.08);
    g.rotateY(a);
    parts.push(g.toNonIndexed());
  }
  const pos = [], nor = [];
  for (const g of parts) { pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return geo;
}
