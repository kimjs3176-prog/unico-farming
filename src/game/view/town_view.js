import * as THREE from 'three';
import { LAYOUT } from '../world.js';
import { TownSim, BUILDINGS } from '../sim/town.js';
import { ITEMS } from '../sim/items.js';
import { confetti } from '../../ui/minigame_frame.js';

/**
 * 새 마을 부지 (서쪽): 코인을 내고 건물 짓기
 *  - 빈 부지: 말뚝·줄·흙 + 표지판 → 가까이에서 E: 건물 고르기 창
 *  - 공사 중: 비계(나무 기둥·발판)가 둘러싸고 건물이 아래부터 차오름, 흙먼지·망치 소리, 진행률 표시. 코인을 더 내면 바로 완성
 *  - 완공: 비계가 걷히며 건물이 통 튀어나옴, 꽃가루·축하 소리. 농장 전체에 효과 (sim/town.js)
 * 건물 모양은 모두 코드로 만든 저폴리 (게임 팔레트)
 */
const M = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.82, ...o });
const MAT = {
  wood: M(0xa8784a), woodD: M(0x7a5232), roofR: M(0xd9534f), roofB: M(0x3f7cc2), white: M(0xf6f1e6), stone: M(0xcfc4b2),
  glass: new THREE.MeshStandardMaterial({ color: 0xcfeefc, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.38, depthWrite: false }),
  leaf: M(0x6dbb4f), leafD: M(0x4f9a3a), metal: M(0x9aa3ab, { roughness: 0.4, metalness: 0.5 }), water: M(0x6fc3e8, { roughness: 0.2 }),
  dirt: M(0x9c7550, { roughness: 1 }), rope: M(0xe9d7a8), red: M(0xe35d5d), yellow: M(0xfac03e), orange: M(0xf28c28), green: M(0x7ac943),
};
const box = (w, h, d, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); return o; };
const cyl = (rt, rb, h, m, seg = 10, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m); o.position.set(x, y, z); return o; };
const ball = (r, m, x, y, z, sy = 1) => { const o = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), m); o.position.set(x, y, z); o.scale.y = sy; return o; };

/** 건물 모양 (원점 = 바닥 가운데, 앞 = +z) */
const SHAPES = {
  pavilion() { // 육각 정자: 돌 기단 + 기둥 6개 + 붉은 육각 지붕 + 긴 의자
    const g = new THREE.Group();
    g.add(cyl(2.0, 2.15, 0.3, MAT.stone, 6, 0, 0.15, 0));
    for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; g.add(cyl(0.09, 0.11, 2.1, MAT.woodD, 8, Math.cos(a) * 1.65, 1.35, Math.sin(a) * 1.65)); }
    const roof = cyl(0.05, 2.45, 1.1, MAT.roofR, 6, 0, 2.95, 0); g.add(roof);
    g.add(cyl(2.5, 2.5, 0.12, MAT.woodD, 6, 0, 2.38, 0));
    g.add(ball(0.16, MAT.yellow, 0, 3.58, 0));
    g.add(box(1.8, 0.1, 0.45, MAT.wood, 0, 0.75, -0.6), box(0.12, 0.45, 0.4, MAT.woodD, -0.75, 0.5, -0.6), box(0.12, 0.45, 0.4, MAT.woodD, 0.75, 0.5, -0.6));
    return g;
  },
  tank() { // 물탱크: 네 다리 + 파란 원통 + 원뿔 뚜껑 + 사다리
    const g = new THREE.Group();
    for (const [x, z] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]]) g.add(box(0.16, 2.6, 0.16, MAT.woodD, x, 1.3, z));
    g.add(box(2.1, 0.12, 0.12, MAT.wood, 0, 1.2, 0.9), box(2.1, 0.12, 0.12, MAT.wood, 0, 1.2, -0.9), box(0.12, 0.12, 2.1, MAT.wood, 0.9, 1.2, 0), box(0.12, 0.12, 2.1, MAT.wood, -0.9, 1.2, 0));
    g.add(cyl(1.25, 1.25, 1.7, MAT.roofB, 16, 0, 3.45, 0));
    for (const y of [2.85, 3.45, 4.05]) g.add(cyl(1.28, 1.28, 0.07, MAT.metal, 16, 0, y, 0));
    g.add(cyl(0.05, 1.4, 0.7, MAT.white, 16, 0, 4.65, 0));
    for (let y = 0.3; y < 2.6; y += 0.35) g.add(box(0.5, 0.05, 0.05, MAT.metal, 0, y, 1.3));
    g.add(box(0.05, 2.7, 0.05, MAT.metal, -0.24, 1.35, 1.3), box(0.05, 2.7, 0.05, MAT.metal, 0.24, 1.35, 1.3));
    const drip = cyl(0.04, 0.04, 0.5, MAT.metal, 6, 0.9, 2.4, 1.1); drip.rotation.z = 0.5; g.add(drip);
    return g;
  },
  stand() { // 직판장: 나무 판매대 + 줄무늬 차양 + 채소 상자
    const g = new THREE.Group();
    g.add(box(3.4, 0.9, 1.3, MAT.wood, 0, 0.45, 0.3), box(3.5, 0.08, 1.4, MAT.woodD, 0, 0.92, 0.3));
    for (const x of [-1.6, 1.6]) { g.add(box(0.14, 2.6, 0.14, MAT.woodD, x, 1.3, 0.95)); g.add(box(0.14, 2.6, 0.14, MAT.woodD, x, 1.3, -0.4)); }
    for (let k = 0; k < 7; k++) { const s = box(0.52, 0.08, 1.9, k % 2 ? MAT.white : MAT.red, -1.56 + k * 0.52, 2.62, 0.35); s.rotation.x = -0.28; g.add(s); }
    g.add(box(3.4, 1.4, 0.1, MAT.wood, 0, 1.6, -0.45));
    const veg = [[MAT.orange, -1.1], [MAT.red, -0.35], [MAT.green, 0.4], [MAT.yellow, 1.15]];
    for (const [m, x] of veg) { g.add(box(0.62, 0.22, 0.5, MAT.woodD, x, 1.07, 0.45)); for (let k = 0; k < 4; k++) g.add(ball(0.11, m, x - 0.15 + (k % 2) * 0.3, 1.24, 0.35 + Math.floor(k / 2) * 0.2)); }
    const sign = box(1.6, 0.42, 0.06, MAT.yellow, 0, 2.15, 1.0); g.add(sign);
    return g;
  },
  glasshouse() { // 유리 온실: 흰 뼈대 + 유리 + 박공 지붕 + 안쪽 화분 줄
    const g = new THREE.Group();
    const W = 3.4, D = 2.6, H = 1.8;
    g.add(box(W + 0.2, 0.18, D + 0.2, MAT.stone, 0, 0.09, 0));
    for (const x of [-W / 2, -W / 6, W / 6, W / 2]) for (const z of [-D / 2, D / 2]) g.add(box(0.07, H, 0.07, MAT.white, x, 0.18 + H / 2, z));
    for (const z of [-D / 2, D / 2]) g.add(box(W, 0.07, 0.07, MAT.white, 0, 0.18 + H, z));
    g.add(box(W, H, 0.04, MAT.glass, 0, 0.18 + H / 2, D / 2), box(W, H, 0.04, MAT.glass, 0, 0.18 + H / 2, -D / 2), box(0.04, H, D, MAT.glass, W / 2, 0.18 + H / 2, 0), box(0.04, H, D, MAT.glass, -W / 2, 0.18 + H / 2, 0));
    for (const s of [-1, 1]) { const r = box(W + 0.1, 0.04, D * 0.58, MAT.glass, 0, 0.18 + H + 0.42, s * D * 0.25); r.rotation.x = s * 0.62; g.add(r); const e = box(W + 0.1, 0.06, 0.06, MAT.white, 0, 0.18 + H + 0.84, 0); g.add(e); }
    for (const z of [-0.6, 0.6]) { g.add(box(W - 0.5, 0.4, 0.5, MAT.woodD, 0, 0.4, z)); for (let k = 0; k < 5; k++) g.add(ball(0.22, k % 2 ? MAT.leaf : MAT.leafD, -1.2 + k * 0.6, 0.78, z, 1.3)); }
    return g;
  },
  mill() { // 풍차 방앗간: 돌 탑 + 원뿔 지붕 + 도는 날개 4장
    const g = new THREE.Group();
    g.add(cyl(1.0, 1.45, 3.6, MAT.stone, 12, 0, 1.8, 0));
    g.add(cyl(0.05, 1.3, 1.3, MAT.roofR, 12, 0, 4.25, 0));
    g.add(box(0.7, 1.1, 0.12, MAT.woodD, 0, 0.55, 1.36));
    g.add(box(0.45, 0.45, 0.08, MAT.white, 0, 2.6, 1.18));
    const hub = new THREE.Group(); hub.position.set(0, 3.3, 1.35); hub.name = 'blades';
    const axle = cyl(0.16, 0.16, 0.3, MAT.woodD, 8, 0, 0, 0); axle.rotation.x = Math.PI / 2; hub.add(axle);
    for (let k = 0; k < 4; k++) { const a = new THREE.Group(); a.rotation.z = k * Math.PI / 2; a.add(box(0.1, 2.0, 0.06, MAT.woodD, 0, 1.05, 0.05), box(0.5, 1.6, 0.03, MAT.white, 0.3, 1.2, 0.08)); hub.add(a); }
    g.add(hub);
    g.userData.spin = hub;
    return g;
  },
};

/** 빈 부지: 흙 + 말뚝 4개 + 줄 */
function siteMarker() {
  const g = new THREE.Group();
  const dirt = new THREE.Mesh(new THREE.CircleGeometry(2.1, 24), MAT.dirt);
  dirt.rotation.x = -Math.PI / 2; dirt.position.y = 0.02; dirt.receiveShadow = true; g.add(dirt);
  const P = [[-1.7, -1.7], [1.7, -1.7], [1.7, 1.7], [-1.7, 1.7]];
  for (const [x, z] of P) g.add(box(0.1, 0.7, 0.1, MAT.woodD, x, 0.35, z));
  for (let k = 0; k < 4; k++) { const [x0, z0] = P[k], [x1, z1] = P[(k + 1) % 4]; const r = box(Math.hypot(x1 - x0, z1 - z0), 0.03, 0.03, MAT.rope, (x0 + x1) / 2, 0.6, (z0 + z1) / 2); r.rotation.y = -Math.atan2(z1 - z0, x1 - x0); g.add(r); }
  return g;
}

/** 비계: 기둥 4개 + 층마다 발판 (진행률만큼 보임) */
function scaffold() {
  const g = new THREE.Group(), levels = [];
  for (const [x, z] of [[-1.9, -1.9], [1.9, -1.9], [1.9, 1.9], [-1.9, 1.9]]) g.add(box(0.1, 4.2, 0.1, MAT.wood, x, 2.1, z));
  for (let k = 0; k < 4; k++) {
    const y = 0.8 + k * 0.95, lv = new THREE.Group();
    lv.add(box(3.9, 0.06, 0.4, MAT.woodD, 0, y, 1.9), box(3.9, 0.06, 0.4, MAT.woodD, 0, y, -1.9), box(0.4, 0.06, 3.9, MAT.woodD, 1.9, y, 0), box(0.4, 0.06, 3.9, MAT.woodD, -1.9, y, 0));
    const brace = box(0.05, 1.3, 0.05, MAT.wood, 1.9, y - 0.45, 1.9); brace.rotation.z = 0.7; lv.add(brace);
    levels.push(lv); g.add(lv);
  }
  g.add(box(0.8, 0.5, 0.6, MAT.woodD, 2.6, 0.25, 1.2), box(0.6, 0.35, 0.5, MAT.wood, 2.6, 0.67, 1.2));
  g.userData.levels = levels;
  return g;
}

export class TownView {
  constructor(game) {
    this.game = game;
    const L = LAYOUT.town;
    this.sim = new TownSim(L.sites.length);
    this.sites = L.sites.map((p, i) => {
      const root = new THREE.Group();
      root.position.set(p.x, 0, p.z);
      root.rotation.y = Math.atan2(L.entry.x - p.x, L.entry.z - p.z); // 길(입구) 쪽을 바라봄
      const marker = siteMarker(); root.add(marker);
      game.world.scene.add(root);
      const obstacle = { x: p.x, z: p.z, r: 0 };
      game.world.obstacles.push(obstacle);
      return { i, p, root, marker, obstacle, mesh: null, scaf: null, type: null, pop: 0, dust: 0 };
    });
    // 표지판
    const S = L.sign;
    if (game.world.signText) game.world.signText(game.world.place('sign', S.x, S.z, -0.9, 1, { collide: false, dynamic: true }), '🏗️ 새 마을 부지', '코인으로 건물을 지어요');
    this.t = 0;
    this.apply();
  }

  /** 부지 모습 맞추기 (불러오기·건설·완공 뒤) */
  sync(i) {
    const s = this.sites[i], st = this.sim.sites[i];
    if (st.type !== s.type) {
      if (s.mesh) s.root.remove(s.mesh);
      s.mesh = st.type ? SHAPES[st.type]() : null;
      if (s.mesh) { s.mesh.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); s.root.add(s.mesh); }
      s.type = st.type;
    }
    const building = st.state === 'building';
    if (building && !s.scaf) { s.scaf = scaffold(); s.root.add(s.scaf); }
    if (!building && s.scaf) { s.root.remove(s.scaf); s.scaf = null; }
    s.marker.visible = st.state !== 'done';
    s.obstacle.r = st.state === 'empty' ? 0 : 2.1;
  }

  /** 완성된 건물 효과를 농장·장터에 반영 */
  apply() {
    const e = this.sim.effects(), g = this.game;
    g.farm.sim.buildMult = e.growMult;
    g.farm.sim.waterMult = e.waterMult;
    g.economy.sellMult = e.sellMult;
  }

  update(dt, pp) {
    const g = this.game;
    this.t += dt;
    for (const i of this.sim.tick(dt)) this._finish(i);
    let best = null, bd = 3.2;
    for (const s of this.sites) {
      const st = this.sim.sites[s.i];
      if (s.type !== st.type || (st.state === 'building') !== !!s.scaf) this.sync(s.i);
      if (s.mesh) {
        // 공사 중: 아래부터 차오름 · 완공 직후: 통 튀어나옴
        const k = st.state === 'building' ? 0.08 + 0.92 * this.sim.progress(s.i) : 1;
        let pop = 1;
        if (s.pop > 0) { s.pop = Math.max(0, s.pop - dt); pop = 1 + Math.sin((1 - s.pop / 0.6) * Math.PI) * 0.18; }
        s.mesh.scale.set(pop, k * pop, pop);
        s.mesh.userData.spin?.rotation.set(0, 0, s.mesh.userData.spin.rotation.z - dt * 0.9);
      }
      if (s.scaf) {
        const pr = this.sim.progress(s.i);
        s.scaf.userData.levels.forEach((lv, k) => { lv.visible = pr >= k * 0.22; });
        s.dust -= dt;
        const near = Math.hypot(s.p.x - pp.x, s.p.z - pp.z) < 14;
        if (s.dust <= 0) { s.dust = 1.1 + Math.random() * 0.6; g.fx.burst(s.p.x + (Math.random() - 0.5) * 3, 0.3, s.p.z + (Math.random() - 0.5) * 3, 0xb89a74, 6); if (near) g.audio.play('dig', 0.35); }
      }
      const d = Math.hypot(s.p.x - pp.x, s.p.z - pp.z);
      if (d < bd) { bd = d; best = s; }
    }
    if (!best) return null;
    const st = this.sim.sites[best.i];
    if (st.state === 'empty') return { d: bd, label: '🏗️ 건설 부지 · 건물 짓기', key: 'build', onInteract: () => this.openBuild(best.i) };
    const B = BUILDINGS[st.type];
    if (st.state === 'building') return { d: bd, label: `🔨 ${B.name} 공사 중 ${Math.floor(this.sim.progress(best.i) * 100)}% · 바로 완성 ${this.sim.rushCost(best.i)}🪙`, key: 'rush', onInteract: () => this.openRush(best.i) };
    return { d: bd, label: `${B.emoji} ${B.name}: ${B.desc}`, key: 'building', onInteract: () => { g.audio.play('click'); g.ui.toast(`${B.emoji} ${B.name} — ${B.desc}`); } };
  }

  /** 건물 고르기 창 */
  openBuild(i) {
    const g = this.game, eco = g.economy, ui = g.ui;
    const p = ui.openPanel('🏗️ 건물 짓기');
    p.classList.add('build-panel');
    const n = this.sim.doneCount;
    p.append(Object.assign(document.createElement('p'), { className: 'mk-note', innerHTML: `코인을 내면 공사가 시작되고, 완공되면 농장 전체에 효과가 생겨요. 건물마다 하나씩 · 지은 건물 <b>${n}/${Object.keys(BUILDINGS).length}</b> · 보유 <b>${eco.money.toLocaleString()}🪙</b>` }));
    const rows = document.createElement('div'); rows.className = 'rows';
    for (const [type, B] of Object.entries(BUILDINGS)) {
      const why = this.sim.whyNot(i, type, eco.money, g.quests.level);
      const r = document.createElement('div');
      r.className = 'row mk-row build-row' + (this.sim.has(type) ? ' none' : '');
      r.innerHTML = `<span class="ic">${B.emoji}</span><span class="nm">${B.name} <span class="qty">공사 ${B.time}초</span><br><small>${B.desc}</small></span><span class="pr">${B.price.toLocaleString()}🪙</span>`;
      const b = document.createElement('button');
      b.className = why ? '' : 'gold';
      b.textContent = this.sim.has(type) ? '✅ 지음' : why && /Lv/.test(why) ? `🔒 ${why.split('부터')[0]}` : '짓기';
      b.disabled = !!why;
      if (why && !this.sim.has(type)) b.title = why;
      b.onclick = () => this.build(i, type);
      r.append(b);
      rows.append(r);
    }
    p.append(rows);
  }

  build(i, type) {
    const g = this.game, eco = g.economy, B = BUILDINGS[type];
    const cost = this.sim.build(i, type, eco.money, g.quests.level);
    if (!cost) return;
    eco.money -= cost; eco.stats.spent += cost;
    g.ui.closePanel();
    this.sync(i);
    g.audio.play('coin');
    g.player.unico.playAction('cheer', 1.4);
    g.juice.shake(0.15);
    g.fx.burst(this.sites[i].p.x, 0.5, this.sites[i].p.z, 0xb89a74, 24);
    g.ui.toast(`🔨 ${B.emoji} ${B.name} 공사를 시작했어요! (${B.time}초 · 가까이에서 E: 바로 완성)`);
    g.onEvent('build');
  }

  openRush(i) {
    const g = this.game, eco = g.economy, st = this.sim.sites[i], B = BUILDINGS[st.type];
    const cost = this.sim.rushCost(i);
    const p = g.ui.openPanel(`🔨 ${B.name} 공사 중`);
    p.append(Object.assign(document.createElement('p'), { innerHTML: `진행 <b>${Math.floor(this.sim.progress(i) * 100)}%</b> · 남은 시간 약 ${Math.ceil(st.left)}초<br>일꾼을 더 불러 바로 완성할 수 있어요.` }));
    const b = document.createElement('button');
    b.className = 'gold'; b.textContent = `⚡ 바로 완성 (${cost}🪙)`;
    b.disabled = eco.money < cost;
    b.onclick = () => { if (eco.money < cost || !this.sim.rush(i)) return; eco.money -= cost; eco.stats.spent += cost; g.ui.closePanel(); this._finish(i); };
    const c = document.createElement('button'); c.className = 'ghost'; c.textContent = '기다릴게요'; c.onclick = () => g.ui.closePanel();
    const row = document.createElement('div'); row.className = 'mg-btns'; row.append(c, b);
    p.append(row);
  }

  _finish(i) {
    const g = this.game, s = this.sites[i], B = BUILDINGS[this.sim.sites[i].type];
    this.sync(i);
    s.pop = 0.6;
    this.apply();
    g.audio.play('levelup');
    g.fx.burst(s.p.x, 2.5, s.p.z, 0xfff3a0, 36);
    g.ui.toast(`🎉 ${B.emoji} ${B.name} 완공! ${B.desc}`);
    g.onEvent('built');
    const host = document.getElementById('ui');
    if (host) { const fx = document.createElement('div'); fx.className = 'build-confetti'; host.append(fx); confetti(fx, 30); setTimeout(() => fx.remove(), 2400); }
  }

  /** 새 날: 방앗간 임대 수입·정자 선물 */
  newDay() {
    const g = this.game, r = this.sim.newDay();
    if (r.coins) { g.economy.earn(r.coins); g.ui.toast(`🌬️ 풍차 방앗간 임대 수입 +${r.coins}🪙`); }
    for (const [id, n] of r.gifts) { g.economy.addItem(id, n); g.ui.toast(`⛩️ 쉼터 정자에 주민 선물: ${ITEMS[id]?.emoji || '🎁'} ${ITEMS[id]?.name || id} ×${n}`); }
  }

  toJSON() { return this.sim.toJSON(); }
  load(d) { this.sim.load(d); this.sites.forEach((_, i) => this.sync(i)); this.apply(); }
}
