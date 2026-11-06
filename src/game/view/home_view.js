import * as THREE from 'three';
import { LAYOUT } from '../world.js';
import { HomeSim, HOME_LEVELS } from '../sim/home.js';
import { ITEMS } from '../sim/items.js';
import { saveGame } from '../save.js';

/**
 * 유니코 집 (밭 남쪽): 문 앞에서 E → 집 창
 *  - 🛏️ 잠자기: 저녁 6시~새벽 6시. 화면이 어두워졌다 밝아지며 다음 날 아침 6시 30분, 그날 하루 걷기 +15%
 *  - 🏡 집 넓히기: 오두막 → 아늑한 집(큰 창·꽃밭·우편함) → 2층 집(2층·정원 등불·굴뚝 연기)
 *  - 밤에는 창문에 불이 켜짐, 아늑한 집부터 매일 아침 우편함 선물
 * 모양은 모두 코드로 만든 저폴리 (게임 팔레트)
 */
const M = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...o });
const MAT = {
  wall: M(0xfff4e2), wallB: M(0xf3e2c6), roof: M(0x2fa89c), roofD: M(0x24877e), wood: M(0xa8784a), woodD: M(0x7a5232),
  stone: M(0xcfc4b2), door: M(0xe58a3a), knob: M(0xfac03e, { metalness: 0.4, roughness: 0.4 }), white: M(0xffffff),
  leaf: M(0x6dbb4f), red: M(0xe35d5d), pink: M(0xf28bb0), yellow: M(0xfac03e), purple: M(0x9b7fd1), mail: M(0x4a90d9),
};
const box = (w, h, d, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); return o; };
const ball = (r, m, x, y, z) => { const o = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), m); o.position.set(x, y, z); return o; };

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
  return g;
}

/** 마당: 꽃밭·우편함(1단계부터), 정원 등불(2단계) */
function buildYard(level, lampMat) {
  const g = new THREE.Group();
  if (level >= 1) {
    for (let k = 0; k < 7; k++) { const a = k / 7; g.add(ball(0.11, [MAT.red, MAT.pink, MAT.yellow, MAT.purple][k % 4], -2.6 + a * 0.9, 0.18, 1.2 + (k % 2) * 0.25)); g.add(box(0.03, 0.18, 0.03, MAT.leaf, -2.6 + a * 0.9, 0.09, 1.2 + (k % 2) * 0.25)); }
    g.add(box(0.08, 1.0, 0.08, MAT.woodD, 1.6, 0.5, 2.3));                  // 우편함 기둥
    g.add(box(0.36, 0.3, 0.5, MAT.mail, 1.6, 1.1, 2.3));
    g.add(box(0.04, 0.22, 0.12, MAT.red, 1.8, 1.25, 2.4));                    // 깃발
  }
  if (level >= 2) for (const x of [-1.0, 1.0]) { g.add(box(0.08, 0.9, 0.08, MAT.woodD, x, 0.45, 3.0)); g.add(box(0.22, 0.22, 0.22, lampMat, x, 1.0, 3.0)); }
  return g;
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
    this.obstacle = { x: H.x, z: H.z, r: 2.3 };
    game.world.obstacles.push(this.obstacle);
    this.smokeT = 0;
    this.build();
  }

  build() {
    if (this.house) this.root.remove(this.house, this.yard);
    this.house = buildHouse(this.sim.level, this.glass);
    this.yard = buildYard(this.sim.level, this.lamp);
    for (const o of [this.house, this.yard]) { o.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } }); this.root.add(o); }
    this.obstacle.r = [2.1, 2.5, 2.7][this.sim.level];
  }

  update(dt, pp) {
    const g = this.game, w = g.world;
    // 밤엔 창문·등불에 불, 굴뚝 연기 (저녁·아침과 2층 집은 늘)
    const night = 1 - THREE.MathUtils.clamp(w.daylight * 2.2, 0, 1);
    this.glass.emissiveIntensity = night * 1.1;
    this.lamp.emissiveIntensity = night * 1.6;
    this.smokeT -= dt;
    if (this.smokeT <= 0 && (night > 0.2 || this.sim.level >= 2) && Math.hypot(pp.x - this.root.position.x, pp.z - this.root.position.z) < 30) {
      this.smokeT = 0.7;
      const c = this.house.userData.chimney.clone().applyMatrix4(this.root.matrixWorld);
      g.fx.burst(c.x, c.y, c.z, 0xdedede, 3);
    }
    g.player.speedMult = this.sim.speedMult(w.day);
    const D = LAYOUT.home.door, d = Math.hypot(D.x - pp.x, D.z - pp.z);
    if (d > 2.0) return null;
    const can = this.sim.canSleep(w.time);
    return { d, label: `🏠 ${this.sim.info.name} · ${can ? '🛏️ 잠자기 가능' : '들어가기'}`, key: 'home', onInteract: () => this.open() };
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
    eco.money -= cost; eco.stats.spent += cost;
    g.ui.closePanel();
    this.build();
    g.audio.play('levelup');
    g.juice.pop(this.root, 0.25);
    g.fx.burst(this.root.position.x, 2.5, this.root.position.z, 0xfff3a0, 34);
    g.ui.toast(`🏡 집을 '${this.sim.info.name}'으로 넓혔어요! ${this.sim.info.desc}`);
    g.onEvent('homeup');
    saveGame(g);
  }

  /** 잠자기: 화면이 어두워졌다가 아침으로 */
  sleep() {
    const g = this.game, w = g.world;
    const r = this.sim.sleep(w.time, w.day);
    if (!r) return;
    g.ui.closePanel();
    g.player.frozen = true;
    const fade = document.createElement('div');
    fade.className = 'sleep-fade';
    fade.innerHTML = '<span>💤 쿨쿨…</span>';
    document.getElementById('ui').append(fade);
    g.audio.play('pop', 0.4);
    requestAnimationFrame(() => fade.classList.add('on'));
    setTimeout(() => {
      w.time = r.time;
      if (r.newDay) { w.day = r.day; w.onNewDay?.(r.day); }
      g.player.unico.playAction('cheer', 1.2);
      fade.classList.remove('on');
      setTimeout(() => fade.remove(), 900);
      g.player.frozen = false;
      g.ui.toast(`☀️ ${w.day}일차 아침! 푹 자서 개운해요 · 오늘 하루 걷는 속도 +15%`);
      g.onEvent('sleep');
      saveGame(g);
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
  load(d) { this.sim.load(d); this.build(); }
}

export { HOME_LEVELS };
