import { josa } from '../sim/josa.js';
import * as THREE from 'three';
import { heightAt } from '../terrain.js';
import { LAYOUT } from '../world.js';
import { DecorSim, DECOR, DECOR_BY_ID, DECOR_CATS, DECOR_MAX, outsideZones, snapAhead } from '../sim/decor.js';
import { saveGame } from '../save.js';
import { touchUI } from '../input.js';

/**
 * 농장 꾸미기 화면 (규칙은 sim/decor.js)
 *  - 🪑 꾸미기 창에서 소품을 고르면 '놓기 모드': 유니코 앞 2.4m 에 반투명 미리보기 (초록 = 놓을 수 있음, 빨강 = 못 놓음)
 *    E/클릭 놓기 · R 돌리기(45°) · Esc 그만 — 화면 아래 버튼으로도 (마우스·터치)
 *  - '옮기기·치우기 모드': 앞에 있는 소품을 골라(발밑 금색 링) 치우거나(보관함) 옮김(무료)
 *  - 놓을 수 없는 곳: 물·밭·논·목장·트랙터 마당·건설 부지·주민 자리·문 앞·다른 물건 위·큰 물건은 흙길 위
 */
const OK_COL = new THREE.Color(0x4fd07a), BAD_COL = new THREE.Color(0xe35d5d);

export class DecorView {
  constructor(game) {
    this.game = game;
    this.sim = new DecorSim();
    this.group = new THREE.Group();
    game.world.scene.add(this.group);
    this.items = [];   // { obj, obstacle }
    this.mode = null;  // { id | null(옮기기·치우기), rot, ghost, move }
    this.zones = this._zones();
  }

  /** 보호 구역 (사각형·원) */
  _zones() {
    const L = LAYOUT, z = [];
    const Y = L.tractorYard; if (Y) z.push([Y.x0, Y.z0, Y.x1, Y.z1]);
    const F = L.farm; if (F) { const hw = (F.cols * F.tile) / 2 + 0.8, hh = (F.rows * F.tile) / 2 + 0.8; z.push([F.origin.x - hw, F.origin.z - hh, F.origin.x + hw, F.origin.z + hh]); }
    const R = L.ranch; if (R) z.push([R.x0, R.z0, R.x1, R.z1]);
    const P = L.paddy; if (P) z.push([P.x0 - 1, P.z0 - 1, P.x0 + P.cols * P.size + 1, P.z0 + P.rows * P.size + 1]);
    for (const s of L.town?.sites || []) z.push({ x: s.x, z: s.z, r: 3.4 });
    if (L.town?.sign) z.push({ ...L.town.sign, r: 1.2 });
    for (const n of Object.values(L.npcs || {})) if (!n.wander) z.push({ x: n.x, z: n.z, r: 1.6 });
    if (L.home?.door) z.push({ x: L.home.door.x, z: L.home.door.z, r: 2.2 });
    if (L.tractorHome) z.push({ x: L.tractorHome.x, z: L.tractorHome.z, r: 3 });
    for (const list of Object.values(L.rides || {})) for (const p of list) z.push({ x: p.x, z: p.z, r: 2.4 }); // 자전거·카트 세워 두는 자리
    for (const r of L.reserved || []) if (r[4] !== 'trees') z.push([r[0], r[1], r[2], r[3]]);
    return z;
  }

  /** 이 자리에 놓을 수 있나 → null 이면 가능, 아니면 이유 */
  whyNotHere(x, z, r) {
    const w = this.game.world, B = LAYOUT.bounds - 3, rr = Math.max(r, 0.3);
    if (Math.abs(x) > B || Math.abs(z) > B) return '농장 밖이에요';
    if (w.inWater(x, z, rr + 0.5)) return '물가에는 놓을 수 없어요';
    if (!outsideZones(x, z, rr, this.zones)) return '여기는 밭·목장·길목이라 비워 둬야 해요';
    if (w.isBlocked(x, z, rr)) return '다른 물건과 겹쳐요';
    if (r > 0 && w.isBare(x, z)) return '흙길 위에는 큰 물건을 놓을 수 없어요';
    return null;
  }

  /** 모델 하나 만들기 */
  _model(id) {
    const d = DECOR_BY_ID[id], a = this.game.assets;
    let obj;
    try { obj = a.clone(d.model); } catch { obj = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), new THREE.MeshStandardMaterial({ color: 0xc8a070 })); }
    obj.scale.multiplyScalar(d.scale);
    return obj;
  }

  build() {
    const w = this.game.world;
    this._highlight(-1);               // 목록을 다시 만들기 전에 표시 링 숨김
    if (this.mode) this.mode.sel = -1; // 순번이 밀리므로 다음 update 에서 다시 고름
    for (const it of this.items) { this.group.remove(it.obj); if (it.obstacle) { const k = w.obstacles.indexOf(it.obstacle); if (k >= 0) w.obstacles.splice(k, 1); } }
    this.items = this.sim.placed.map((p) => {
      const d = DECOR_BY_ID[p.id], obj = this._model(p.id);
      obj.position.set(p.x, heightAt(p.x, p.z), p.z);
      obj.rotation.y = (p.rot * Math.PI) / 4;
      this.group.add(obj);
      const obstacle = d.r > 0 ? { x: p.x, z: p.z, r: d.r } : null;
      if (obstacle) w.obstacles.push(obstacle);
      return { obj, obstacle };
    });
  }

  // ------------------------------------------------------------ 모드
  start(id) {
    const g = this.game;
    if (g.home?.inside) return g.ui.toast('🏠 집 밖에서 꾸밀 수 있어요');
    if (g.ride?.driving) return;
    this.stop(true);
    g.ui.closePanel();
    g.player.moveTarget = null; // 시작 전에 탭해 걷던 목표는 지움 (도착해서 그 대상이 실행되지 않게)
    this.mode = { id, rot: 0, ghost: id ? this._ghost(id) : null, sel: -1 };
    this._bar();
    const T = touchUI();
    g.ui.toast(id ? `${DECOR_BY_ID[id].icon} 놓고 싶은 곳으로 걸어가서 ${T ? 'E 버튼 (아래 ⟳ 돌리기 · ✖ 그만)' : 'E (R 돌리기 · Esc 그만)'}`
      : `✋ 옮기거나 치울 소품 앞으로 가서 ${T ? '아래 🧺 치우기 · ↔ 옮기기' : 'E'}`);
  }

  stop(silent = false) {
    if (!this.mode) return;
    if (this.mode.ghost) this.game.world.scene.remove(this.mode.ghost);
    this.mode = null;
    this.barEl?.remove(); this.barEl = null;
    this._highlight(-1);
    if (!silent) this.game.ui.toast('🪑 꾸미기를 마쳤어요');
  }

  _ghost(id) {
    const obj = this._model(id);
    obj.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = false;
      o.material = [].concat(o.material).map((m) => { const c = m.clone(); c.transparent = true; c.opacity = 0.62; c.depthWrite = false; if (c.emissive) c.emissiveIntensity = 0.55; return c; });
      if (o.material.length === 1) o.material = o.material[0];
    });
    this.game.world.scene.add(obj);
    return obj;
  }

  _tint(ghost, ok) {
    ghost.traverse((o) => { if (o.isMesh) for (const m of [].concat(o.material)) if (m.emissive) m.emissive.copy(ok ? OK_COL : BAD_COL); });
  }

  /**
   * 고른 소품 표시: 발밑 금색 링 하나만 옮겨 씀
   * (재질은 같은 모델·맵 소품과 함께 쓰므로 색을 바꾸면 같은 모델이 다 빛나거나, 치운 뒤 맵 가로등·소품에 색이 남음)
   */
  _highlight(i) {
    const p = i >= 0 ? this.sim.placed[i] : null;
    if (!p) { if (this.selRing) this.selRing.visible = false; return; }
    if (!this.selRing) {
      const geo = new THREE.RingGeometry(0.82, 1, 40).rotateX(-Math.PI / 2);
      this.selRing = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffd34d, transparent: true, opacity: 0.85, depthWrite: false }));
      this.selRing.renderOrder = 2;
      this.game.world.scene.add(this.selRing);
    }
    this.selRing.scale.setScalar(Math.max(0.45, DECOR_BY_ID[p.id].r + 0.25)); // 꽃밭·양동이는 r = 0
    this.selRing.position.set(p.x, heightAt(p.x, p.z) + 0.05, p.z);
    this.selRing.visible = true;
  }

  /** 화면 아래 버튼 (마우스·터치) */
  _bar() {
    const g = this.game, m = this.mode;
    this.barEl?.remove();
    const bar = document.createElement('div');
    bar.className = 'decor-bar';
    const btn = (label, cls, fn) => { const b = document.createElement('button'); b.className = cls; b.textContent = label; b.onclick = (e) => { e.stopPropagation(); fn(); }; bar.append(b); return b; };
    if (m.id) {
      const d = DECOR_BY_ID[m.id];
      const t = document.createElement('span'); t.className = 'decor-what'; t.textContent = `${d.icon} ${d.name} · ${this.sim.storedOf(m.id) > 0 ? '보관함 (무료)' : `${d.price}🪙`}`; bar.append(t);
      btn('⟳ 돌리기', 'ghost', () => this.rotate());
      btn('✔ 놓기', 'gold', () => this.confirm());
    } else {
      const t = document.createElement('span'); t.className = 'decor-what'; t.textContent = '✋ 옮기기·치우기'; bar.append(t);
      btn('↔ 옮기기', 'ghost', () => this.confirm('move'));
      btn('🧺 치우기', 'gold', () => this.confirm('pick'));
    }
    btn('✖ 그만', 'ghost', () => this.stop());
    document.getElementById('ui').append(bar);
    this.barEl = bar;
  }

  rotate() { if (this.mode) { this.mode.rot = (this.mode.rot + 1) % 8; this.game.audio.play('click', 0.4); } }

  spot() {
    const p = this.game.player;
    return snapAhead(p.position.x, p.position.z, p.unico.facing, 2.4);
  }

  confirm(kind) {
    const g = this.game, m = this.mode;
    if (!m) return;
    const s = this.spot();
    if (m.id) {
      const d = DECOR_BY_ID[m.id], why = this.whyNotHere(s.x, s.z, d.r) || this.sim.whyNot(m.id, { money: g.economy.money, level: g.quests.level });
      if (why) { g.audio.play('bump', 0.4); return g.ui.toast(`🚫 ${why}`); }
      const cost = this.sim.place(m.id, s.x, s.z, m.rot, { money: g.economy.money, level: g.quests.level });
      if (cost < 0) return;
      if (cost > 0) { g.economy.money -= cost; g.economy.stats.spent += cost; }
      this.build();
      g.audio.play('pop'); g.fx?.burst(s.x, 0.4, s.z, 0xfff1c4, 6);
      g.player.unico.playAction('cheer', 0.8);
      g.onEvent('decor', this.sim.count);
      saveGame(g);
      this._bar(); // 보관함 수·가격 갱신
      if (m.moving) this.stop(true); // 옮기기였으면 하나만
      return;
    }
    // 옮기기·치우기
    const i = this.sim.nearest(s.x, s.z, 1.8);
    if (i < 0) return g.ui.toast('앞에 옮길 소품이 없어요 · 소품 쪽으로 다가가 보세요');
    const p = this.sim.pickUp(i);
    this.build();
    g.audio.play('pop', 0.6);
    saveGame(g);
    if (kind === 'move') { this.start(p.id); this.mode.rot = p.rot; this.mode.moving = true; g.ui.toast(`${DECOR_BY_ID[p.id].icon} 새 자리로 가서 ${touchUI() ? 'E 버튼' : 'E'} (무료)`); }
    else g.ui.toast(`🧺 ${DECOR_BY_ID[p.id].name}${josa(DECOR_BY_ID[p.id].name, '을/를')} 보관함에 넣었어요 · 다시 놓을 때는 무료`);
  }

  update(dt, pp) {
    const g = this.game, m = this.mode;
    if (!m) return null;
    if (g.home?.inside || g.ride?.driving) { this.stop(true); return null; }
    const input = g.input;
    if (input.justPressed('KeyR')) this.rotate();
    if (input.justPressed('Escape') && !g.ui.panel) { this.stop(); return null; }
    const s = this.spot(), T = touchUI();
    if (m.id) {
      const d = DECOR_BY_ID[m.id], why = this.whyNotHere(s.x, s.z, d.r);
      m.ghost.position.set(s.x, heightAt(s.x, s.z) + 0.02, s.z);
      m.ghost.rotation.y = (m.rot * Math.PI) / 4;
      this._tint(m.ghost, !why);
      // E 는 안내 말풍선이 앞에 붙여 줌. 터치에서는 돌리기·그만을 아래 버튼이 맡으므로 짧게
      return { d: -1, label: why ? `🚫 ${why}` : T ? `✔ 여기에 ${d.name} 놓기` : `✔ 여기에 ${d.name} 놓기 · R 돌리기 · Esc 그만`, key: 'decor', onInteract: () => this.confirm() };
    }
    const i = this.sim.nearest(s.x, s.z, 1.8);
    if (i !== m.sel) { m.sel = i; this._highlight(i); }
    if (this.selRing?.visible) this.selRing.material.opacity = 0.65 + Math.sin(performance.now() / 160) * 0.2;
    const d = i >= 0 ? DECOR_BY_ID[this.sim.placed[i].id] : null;
    const label = d ? (T ? `✋ ${d.icon} ${d.name} · 눌러서 치우기 (보관함) · ↔ 버튼으로 옮기기` : `✋ ${d.icon} ${d.name} · E 치우기 (보관함) · 아래 버튼으로 옮기기`)
      : T ? '✋ 옮기거나 치울 소품 앞으로 가세요 · ✖ 그만' : '✋ 옮기거나 치울 소품 앞으로 가세요 · Esc 그만';
    return { d: -1, label, key: 'decor', onInteract: () => this.confirm('pick') };
  }

  // ------------------------------------------------------------ 꾸미기 창
  open(cat = this.cat || 'garden') {
    const g = this.game, ui = g.ui, sim = this.sim;
    this.cat = cat;
    const p = ui.openPanel('🪑 농장 꾸미기');
    p.classList.add('decor');
    const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt !== undefined) e.textContent = txt; return e; };
    p.append(el('p', 'soc-sub', `놓은 소품 ${sim.count}/${DECOR_MAX} · 고르면 유니코 앞에 미리보기가 나와요. 걸어가서 ${touchUI() ? 'E 버튼으로' : 'E 로'} 놓아요`));
    p.append(el('p', 'mk-note', '🏡 집 주변과 빈 풀밭에 놓을 수 있어요 (밭·논·목장·트랙터 마당·낚시터·길목·문 앞은 비워 둬요)'));
    const tabs = el('div', 'mk-tabs');
    for (const [id, label] of DECOR_CATS) { const t = el('button', id === cat ? 'on' : '', label); t.onclick = () => this.open(id); tabs.append(t); }
    p.append(tabs);
    const grid = el('div', 'cos-grid decor-grid');
    for (const d of DECOR.filter((x) => x.cat === cat)) {
      const st = sim.storedOf(d.id), locked = st <= 0 && g.quests.level < d.lv;
      const b = el('button', `cos-slot${locked ? ' locked' : ''}`);
      b.append(el('span', 'ic', d.icon), el('b', '', d.name), el('small', '', st > 0 ? `🧺 보관함 ${st}개 · 무료` : locked ? `🔒 Lv.${d.lv}` : `${d.price}🪙`));
      b.disabled = locked;
      b.onclick = () => this.start(d.id);
      grid.append(b);
    }
    p.append(grid);
    const row = el('div', 'decor-foot');
    const mv = el('button', 'ghost', '✋ 옮기기·치우기');
    mv.disabled = sim.count === 0;
    mv.onclick = () => this.start(null);
    row.append(mv);
    p.append(row);
  }

  toJSON() { return this.sim.toJSON(); }
  load(d) { this.sim.load(d); this.build(); }
}
