import * as THREE from 'three';
import { LAYOUT } from '../world.js';
import { CROPS, PRODUCTS } from '../sim/crops.js';
import { ITEMS } from '../sim/items.js';
import { Composter, Processor, Orders, RECIPES, COMPOST_MAX, COMPOST_PER, ORDER_ALL_BONUS } from '../sim/farmcraft.js';
import { FARM_LEVELS } from '../sim/farm.js';
import { makeLabel } from '../label.js';

const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
const info = (k) => CROPS[k] || PRODUCTS[k] || ITEMS[k];

/** 장독 하나 (옹기: 둥근 몸통 + 뚜껑) */
function makeJar(scale = 1) {
  const g = new THREE.Group();
  const pts = [[0, 0], [0.2, 0.0], [0.3, 0.12], [0.36, 0.3], [0.34, 0.48], [0.24, 0.6], [0.2, 0.64], [0.21, 0.66]].map(([x, y]) => new THREE.Vector2(x, y));
  const onggi = new THREE.MeshStandardMaterial({ color: 0x5a3523, roughness: 0.32, metalness: 0.05 });
  const body = new THREE.Mesh(new THREE.LatheGeometry(pts, 20), onggi);
  const lid = new THREE.Mesh(new THREE.SphereGeometry(0.24, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2.6), onggi);
  lid.scale.y = 0.55; lid.position.y = 0.64;
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), onggi);
  knob.position.y = 0.76;
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.355, 0.012, 6, 28), new THREE.MeshStandardMaterial({ color: 0x3e2316, roughness: 0.5 }));
  band.rotation.x = Math.PI / 2; band.position.y = 0.36;
  g.add(body, lid, knob, band);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.scale.setScalar(scale);
  g.userData.lid = lid; g.userData.knob = knob;
  return g;
}

/**
 * 밭 서쪽 농사 시설: 퇴비통 · 주문 게시판 · 장독대(가공) + 밭 스프링클러
 */
export class FarmCraftView {
  constructor(game) {
    this.game = game;
    const W = game.world, C = LAYOUT.craft;
    this.compost = new Composter();
    this.proc = new Processor();
    this.orders = new Orders();
    this.t = 0;
    const wood = new THREE.MeshStandardMaterial({ color: 0x8a5a36, roughness: 0.85 });
    const woodD = new THREE.MeshStandardMaterial({ color: 0x5e3c22, roughness: 0.9 });
    // ---- 퇴비통: 나무 판자 상자 + 안에 흙더미(재료 양만큼 높아짐) ----
    const bin = new THREE.Group();
    for (const [x, z, w, d] of [[0, -0.55, 1.3, 0.08], [0, 0.55, 1.3, 0.08], [-0.6, 0, 0.08, 1.1], [0.6, 0, 0.08, 1.1]]) {
      for (let k = 0; k < 3; k++) { const b = new THREE.Mesh(new THREE.BoxGeometry(w, 0.16, d), k % 2 ? woodD : wood); b.position.set(x, 0.12 + k * 0.2, z); bin.add(b); }
    }
    for (const [x, z] of [[-0.6, -0.55], [0.6, -0.55], [-0.6, 0.55], [0.6, 0.55]]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.72, 0.1), woodD); p.position.set(x, 0.36, z); bin.add(p); }
    this.heap = new THREE.Mesh(new THREE.SphereGeometry(0.55, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x4a3322, roughness: 1 }));
    this.heap.scale.set(1, 0.2, 0.9); this.heap.position.y = 0.05;
    bin.add(this.heap);
    bin.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    bin.position.set(C.compost.x, 0, C.compost.z);
    W.scene.add(bin);
    W.obstacles.push({ x: C.compost.x, z: C.compost.z, r: 0.75 });
    this.binLabel = null;
    // ---- 주문 게시판 ----
    this.board = W.place('sign', C.board.x, C.board.z, Math.PI / 2, 1.3, { collide: true, dynamic: true, r: 0.45 });
    W.signText(this.board, '📋 오늘의 주문서', '로컬푸드 직매장 납품');
    // ---- 장독대: 돌 단 + 장독 4개 (사지 않은 장독은 빈 자리) ----
    const J = C.jars;
    const stone = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.22, 1.5), new THREE.MeshStandardMaterial({ color: 0xa7a39a, roughness: 0.95 }));
    stone.position.set(J.x, 0.11, J.z); stone.castShadow = stone.receiveShadow = true;
    W.scene.add(stone);
    W.boxes.push({ x0: J.x - 1.75, z0: J.z - 0.8, x1: J.x + 1.75, z1: J.z + 0.8 });
    this.jars = [0, 1, 2, 3].map((i) => {
      const m = makeJar(i % 2 ? 0.95 : 1.1);
      m.position.set(J.x - 1.2 + i * 0.8, 0.22, J.z + (i % 2 ? 0.15 : -0.12));
      W.scene.add(m);
      return { m, label: null, state: '' };
    });
    // ---- 스프링클러 (밭 줄마다 2개, 산 줄만 보임) ----
    const F = LAYOUT.farm;
    this.sprinklers = [];
    const metal = new THREE.MeshStandardMaterial({ color: 0x8f9aa3, roughness: 0.35, metalness: 0.6 });
    const brass = new THREE.MeshStandardMaterial({ color: 0xc9a24a, roughness: 0.3, metalness: 0.7 });
    for (let r = 0; r < F.rows; r++) {
      const z = F.origin.z + (r - (F.rows - 1) / 2) * F.tile;
      for (const x of [-2.4, 2.4]) {
        const s = new THREE.Group();
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.5, 8), metal); post.position.y = 0.25;
        const head = new THREE.Group(); head.position.y = 0.52;
        const nz = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.025, 0.22, 6), brass); nz.rotation.z = Math.PI / 2 - 0.35; nz.position.x = 0.08;
        const hub = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), brass);
        head.add(hub, nz);
        s.add(post, head);
        s.position.set(F.origin.x + x, 0, z);
        s.visible = false;
        W.scene.add(s);
        this.sprinklers.push({ s, head, row: r, spray: 0 });
      }
    }
    game.farm.sim.on((type, i) => { if (type === 'sprinkle') { const r = Math.floor(i / game.farm.sim.cols); for (const sp of this.sprinklers) if (sp.row === r) sp.spray = 2.5; } });
  }

  toJSON() { return { compost: this.compost.toJSON(), proc: this.proc.toJSON(), orders: this.orders.toJSON() }; }
  load(d) { if (!d) return; this.compost.load(d.compost); this.proc.load(d.proc); this.orders.load(d.orders); }

  get farmLevel() { return this.game.farm.sim.level; }

  /** 밭농사 경험치 (주문·가공) */
  addXp(n) {
    const sim = this.game.farm.sim, lv = sim.level;
    sim.xp += n;
    if (sim.level > lv) this.levelUp(sim.level);
  }

  levelUp(lv) {
    const g = this.game;
    g.audio.play('levelup');
    g.player.unico.playAction('cheer', 1.5);
    const unlock = Object.entries(RECIPES).filter(([, r]) => r.level === lv).map(([k]) => ITEMS[k].name);
    g.ui.toast(`🌾 밭농사 숙련도 Lv.${lv}! 작물 품질이 더 좋아져요${unlock.length ? ` · 새 가공: ${unlock.join(', ')}` : ''}`);
    g.onEvent('farmlv', lv);
  }

  update(dt, pp) {
    const g = this.game, C = LAYOUT.craft;
    this.t += dt;
    // 퇴비 숙성
    if (this.compost.tick(dt) > 0) g.ui.toast('🟫 퇴비가 다 됐어요! 퇴비통에서 꺼내 밭에 주세요');
    this.heap.scale.y = 0.12 + Math.min(1, (this.compost.mats + this.compost.ready * COMPOST_PER) / COMPOST_MAX) * 0.55;
    this.heap.material.color.setHex(this.compost.ready ? 0x2f2117 : 0x4a3322);
    this._mark('binLabel', this.heap.parent, this.compost.ready ? `🟫 퇴비 ${this.compost.ready}` : '', 1.15);
    // 장독 (숙성 끝나면 반짝)
    for (const i of this.proc.tick(dt)) { const id = this.proc.slots[i]?.id; if (id) g.ui.toast(`🏺 ${ITEMS[id].name}이(가) 다 익었어요! 장독대에서 꺼내세요`); }
    this.jars.forEach((j, i) => {
      j.m.visible = i < this.proc.jars;
      const s = this.proc.slots[i], done = this.proc.isDone(i);
      const st = !s ? '' : done ? `✨ ${ITEMS[s.id].emoji}` : `${Math.floor((s.t / RECIPES[s.id].time) * 100)}%`;
      const key = !s ? '' : done ? 'done' : 'brew';
      if (key !== j.state || (key === 'brew' && Math.random() < dt)) { j.state = key; this._mark2(j, st); }
      j.m.userData.lid.position.y = 0.64 + (done ? Math.abs(Math.sin(this.t * 4 + i)) * 0.03 : 0);
    });
    // 스프링클러
    const rows = g.farm.sim.sprinklerRows;
    for (const sp of this.sprinklers) {
      sp.s.visible = sp.row < rows;
      if (!sp.s.visible) continue;
      sp.head.rotation.y += dt * (sp.spray > 0 ? 6 : 0.4);
      if (sp.spray > 0) {
        sp.spray -= dt;
        if (Math.random() < dt * 20) {
          const a = sp.head.rotation.y, p = sp.s.position;
          g.waterfx?.spray(p.x + Math.cos(a) * 0.1, 0.55, p.z - Math.sin(a) * 0.1, 2, { up: 1.6, spread: 0.2, dx: Math.cos(a), dz: -Math.sin(a), push: 2.2, size: 0.05, ttl: 0.9 });
        }
      }
    }
    // 상호작용
    let best = null;
    const near = (o, r, p) => { const d = Math.hypot(o.x - pp.x, o.z - pp.z); if (d < r && (!best || d < best.d)) best = { ...p, d }; };
    const cm = this.compost;
    near(C.compost, 2.0, { label: `🟫 퇴비통 (재료 ${cm.mats}/${COMPOST_MAX}${cm.ready ? ` · 퇴비 ${cm.ready}개 완성!` : cm.brewing ? ` · 숙성 ${Math.floor(cm.progress * 100)}%` : ''})`, key: 'compost', onInteract: () => this.openCompost() });
    near(C.board, 2.0, { label: `📋 오늘의 주문서 (${this.orders.today(g.world.day, g.quests.level, this.farmLevel).filter((o) => o.done).length}/3 납품)`, key: 'orders', onInteract: () => this.openOrders() });
    const used = this.proc.slots.slice(0, this.proc.jars).filter(Boolean).length, ready = this.proc.slots.filter((_, i) => this.proc.isDone(i)).length;
    near(LAYOUT.craft.jars, 2.4, { label: `🏺 장독대 가공 (${used}/${this.proc.jars} 사용 중${ready ? ` · ${ready}개 완성!` : ''})`, key: 'jars', onInteract: () => this.openJars() });
    return best;
  }

  _mark(key, parent, text, y) {
    if ((this[key + 'T'] || '') === text) return;
    this[key + 'T'] = text;
    if (this[key]) { parent.remove(this[key]); this[key].userData.dispose(); this[key] = null; }
    if (!text) return;
    this[key] = makeLabel(text, { color: '#231916', bg: 'rgba(255,248,225,0.92)', size: 34 });
    this[key].position.y = y;
    parent.add(this[key]);
  }

  _mark2(j, text) {
    if (j.label) { j.m.remove(j.label); j.label.userData.dispose(); j.label = null; }
    if (!text) return;
    j.label = makeLabel(text, { color: '#231916', bg: 'rgba(255,248,225,0.92)', size: 30 });
    j.label.position.y = 1.15;
    j.m.add(j.label);
  }

  // ------------------------------------------------------------ 퇴비통
  openCompost() {
    const g = this.game, eco = g.economy, cm = this.compost;
    const p = g.ui.openPanel('🟫 퇴비통');
    const render = () => {
      p.querySelectorAll('.body').forEach((e) => e.remove());
      const body = h('div', 'body');
      body.append(h('div', 'chip', `재료 ${cm.mats}/${COMPOST_MAX} · 재료 ${COMPOST_PER}개 = 퇴비 1개 (${cm.brewing ? `숙성 중 ${Math.floor(cm.progress * 100)}%` : '재료를 넣으면 숙성 시작'}) · 완성 ${cm.ready}개`));
      if (cm.ready) {
        const tk = h('button', 'gold', `🟫 퇴비 ${cm.ready}개 꺼내기`);
        tk.onclick = () => { const n = cm.take(); eco.addItem('compost', n); g.audio.play('harvest'); g.player.unico.playAction('pull', 0.7); g.ui.toast(`🟫 퇴비 ${n}개! 갈아 둔 밭이나 자라는 밭에 주면 빨리 자라고 품질이 좋아져요`); g.onEvent('compost', n); render(); };
        body.append(tk);
      }
      body.append(h('h3', '', '넣을 재료 (김매기한 잡초, 남는 작물)'));
      const rows = h('div', 'rows');
      const room = COMPOST_MAX - cm.mats;
      const addRow = (k, n) => {
        const it = info(k);
        const r = h('div', 'row', `<span>${it.emoji}</span><span class="nm">${it.name} <span class="qty">보유 ${n}</span></span>`);
        const all = Math.min(n, room);
        for (const m of all > 1 ? [1, all] : [1]) {
          const b = h('button', '', m === 1 ? '1개' : `${m}개`);
          b.disabled = room <= 0 || n < m;
          b.onclick = () => { const k2 = cm.add(m); eco.take(k, k2); g.audio.play('dig', 0.5); g.player.unico.playAction('scatter', 0.8); render(); };
          r.append(b);
        }
        rows.append(r);
      };
      if (eco.count('weed')) addRow('weed', eco.count('weed'));
      for (const [k, n] of Object.entries(eco.inventory.crops)) if (n > 0) addRow(k, n);
      if (!rows.children.length) rows.append(h('div', 'row', '<span>🌿</span><span class="nm">밭에서 김매기를 하면 잡초가 모여요</span>'));
      body.append(rows);
      p.append(body);
    };
    render();
  }

  // ------------------------------------------------------------ 장독대
  openJars() {
    const g = this.game, eco = g.economy, P = this.proc;
    const p = g.ui.openPanel('🏺 장독대 — 농산물 가공');
    const render = () => {
      p.querySelectorAll('.body').forEach((e) => e.remove());
      const body = h('div', 'body');
      body.append(h('div', 'chip', `🌾 밭농사 숙련도 Lv.${this.farmLevel} · 장독 ${P.jars}개${P.nextJarPrice ? ` (장터에서 장독 추가 ${P.nextJarPrice}🪙)` : ''}`));
      const slots = h('div', 'rows');
      for (let i = 0; i < P.jars; i++) {
        const s = P.slots[i];
        if (!s) { slots.append(h('div', 'row', `<span>🏺</span><span class="nm">장독 ${i + 1} · 비어 있음</span>`)); continue; }
        const it = ITEMS[s.id], done = P.isDone(i);
        const r = h('div', 'row', `<span>${it.emoji}</span><span class="nm">${it.name}<br><small>${done ? '다 익었어요!' : `숙성 ${Math.floor((s.t / RECIPES[s.id].time) * 100)}% · ${Math.ceil(RECIPES[s.id].time - s.t)}초 남음`}</small></span>`);
        if (done) {
          const b = h('button', 'gold', '꺼내기');
          b.onclick = () => {
            const id = P.collect(i);
            eco.addItem(id, 1);
            this.addXp(15);
            g.audio.play('harvest'); g.player.unico.playAction('pull', 0.7);
            g.fx.pop(this.jars[i].m.position.x, this.jars[i].m.position.z, ITEMS[id].emoji);
            g.ui.toast(`🏺 ${ITEMS[id].name} 완성! 장터에서 ${eco.sellPrice(id)}🪙에 팔거나 주문에 납품할 수 있어요`);
            g.onEvent('process');
            render();
          };
          r.append(b);
        }
        slots.append(r);
      }
      body.append(slots);
      body.append(h('h3', '', '📜 담글 수 있는 것 (재료 → 가공품, 그냥 팔 때보다 비싸요)'));
      const rows = h('div', 'rows');
      for (const [id, R] of Object.entries(RECIPES)) {
        const it = ITEMS[id], locked = this.farmLevel < R.level;
        const need = Object.entries(R.input).map(([k, n]) => `${info(k).emoji}${info(k).name} ${eco.count(k)}/${n}`).join(' · ');
        const raw = Object.entries(R.input).reduce((a, [k, n]) => a + (CROPS[k]?.basePrice ?? PRODUCTS[k]?.basePrice ?? 0) * n, 0);
        const r = h('div', 'row', `<span>${it.emoji}</span><span class="nm">${it.name} <span class="qty">${it.price}🪙 (재료값 ${raw})</span><br><small>${need} · ${R.time}초</small></span>`);
        const b = h('button', '', locked ? `숙련 Lv.${R.level}` : '담그기');
        const slot = P.freeSlot();
        b.disabled = locked || slot < 0 || !Processor.canMake(id, (k) => eco.count(k));
        b.onclick = () => {
          const sl = P.freeSlot();
          if (sl < 0 || !Processor.canMake(id, (k) => eco.count(k))) return;
          for (const [k, n] of Object.entries(R.input)) eco.take(k, n);
          P.start(sl, id);
          g.audio.play('plant'); g.player.unico.playAction('plant', 1.0);
          g.ui.toast(`🏺 장독 ${sl + 1}에 ${it.name}을(를) 담갔어요 (${R.time}초)`);
          render();
        };
        r.append(b);
        rows.append(r);
      }
      body.append(rows);
      p.append(body);
    };
    render();
    this._jarTimer = setInterval(() => { if (g.ui.panel === p) render(); else clearInterval(this._jarTimer); }, 1000);
  }

  // ------------------------------------------------------------ 주문서
  openOrders() {
    const g = this.game, eco = g.economy, O = this.orders;
    const p = g.ui.openPanel('📋 오늘의 주문서 — 로컬푸드 납품');
    const render = () => {
      p.querySelectorAll('.body').forEach((e) => e.remove());
      const body = h('div', 'body');
      const list = O.today(g.world.day, g.quests.level, this.farmLevel);
      body.append(h('div', 'chip', `매일 아침 새 주문 · 3건 모두 납품하면 보너스 ${ORDER_ALL_BONUS}🪙 · 지금까지 ${O.count}건 납품`));
      const rows = h('div', 'rows');
      list.forEach((o, i) => {
        const it = info(o.item), have = eco.count(o.item);
        const r = h('div', 'row', `<span>${it.emoji}</span><span class="nm">${o.from}<br><small>${o.name} ${o.n}개 · 보유 ${have}</small></span><span class="pr">${o.reward}🪙</span>`);
        const b = h('button', o.done ? '' : 'gold', o.done ? '✅ 납품 완료' : '납품하기');
        b.disabled = o.done || have < o.n;
        b.onclick = () => {
          const res = O.deliver(i, g.world.day, g.quests.level, this.farmLevel, (k, n) => eco.take(k, n));
          if (!res) return;
          eco.earn(res.reward + res.allBonus);
          this.addXp(res.xp);
          g.audio.play('coin'); g.player.unico.playAction('cheer', 1.2);
          g.ui.toast(`📦 ${o.from}에 ${o.name} ${o.n}개 납품! +${res.reward}🪙${res.allBonus ? ` · 🎉 오늘 주문 모두 완료 보너스 +${res.allBonus}🪙` : ''}`);
          g.onEvent('order');
          render();
        };
        r.append(b);
        rows.append(r);
      });
      body.append(rows);
      const sim = g.farm.sim, lv = sim.level, nx = FARM_LEVELS[lv];
      body.append(h('p', 'map-tip', `🌾 밭농사 숙련도 Lv.${lv}${nx ? ` (${sim.xp}/${nx})` : ' (최고)'} — 수확·가공·납품으로 올라가요. 레벨이 오를수록 작물 품질이 좋아지고 새 가공품이 열려요.`));
      p.append(body);
    };
    render();
  }
}
