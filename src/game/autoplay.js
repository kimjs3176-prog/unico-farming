import { LAYOUT } from './world.js';
import { CROPS, PRODUCTS } from './sim/crops.js';
import { chooseTask, shopList, bestSeed, categoryOf, TASK_LABEL } from './sim/autoplay.js';
import { NavGrid } from './sim/path.js';

/**
 * 오토플레이 모드: 유니코가 알아서 밭·목장 일을 하고 장터에서 사고팜
 *  - 할 일 고르기는 sim/autoplay.js (수확 > 거두기 > 물 > 김매기 > 사료 > 심기 > 퇴비 > 밭 갈기 > 빗질 > 쓰다듬기)
 *  - 직접 움직이면(키보드·조이스틱·클릭 이동) 잠깐 멈췄다가 4초 뒤 다시 이어감
 *  - 대화·컷신 대사는 읽을 시간만큼 기다렸다 자동으로 넘기고, 결과 창(레벨 업 등)은 3초 뒤 닫음
 *  - 그 밖의 창·미니게임·트랙터 중에는 쉬고, 끝나면 다시 시작
 *  - 길찾기(sim/path.js)로 건물·울타리·연못을 돌아서 감. 막히면 비켜서 길을 다시 찾고, 그래도 못 가면 30초 동안 건너뜀
 */
const REACH = { plot: 1.1, animal: 1.6, market: 1.4 };
const HOLD_MANUAL = 4;      // 직접 조작 후 다시 이어가기까지 (초)
const TASK_TIMEOUT = 40;    // 한 일에 이만큼 넘게 걸리면 포기
const MAX_STUCK = 4;        // 막혀서 길을 다시 찾는 최대 횟수
const WP_STOP = 0.35;       // 경유점 도착 거리
const SKIP_FOR = 30;        // 못 간 대상 건너뛰는 시간

export class AutoPlay {
  constructor(game) {
    this.g = game;
    this.on = false;
    this.task = null;
    this.hold = 0;          // 직접 조작 대기
    this.cool = 0;          // 동작 애니메이션 기다리기
    this.skip = new Map();  // key → 남은 초
    this.status = '';
    this.done = 0;          // 이번에 한 일 수
    this.earned = 0;
    this.think = 0;
  }

  toggle(v = !this.on) {
    const g = this.g;
    this.on = v;
    this._stopMove();
    this.task = null; this.hold = 0; this.cool = 0; this.skip.clear();
    if (v) { this.done = 0; this.earned = 0; this.nav = null; this.recent = []; }
    g.ui.toast(v ? '🤖 오토플레이 시작! 유니코가 알아서 농사·목장 일을 하고 장터에서 사고팔아요 (P 또는 🤖 버튼으로 끄기 · 직접 움직이면 잠깐 멈춤)'
      : `🤖 오토플레이 끔${this.done ? ` · 한 일 ${this.done}가지${this.earned ? ` · 판매 +${this.earned}🪙` : ''}` : ''}`);
    g.audio.play('click');
    g.ui.setAuto?.(v ? '준비 중…' : null, v);
  }

  _stopMove() { const p = this.g.player; if (p.moveTarget && p.moveTarget === this.mt) p.moveTarget = null; this.mt = null; }

  /** 다른 일(창·대화·미니게임 등) 때문에 쉬어야 하나 */
  _busy() {
    const g = this.g;
    return !!(g.home?.inside || g.ui.panel || g.dialogue.active || g.cinema.locked || g.tractor.driving || g.player.frozen || g.farm.job
      || g.herding?.active || g.smartfarm?.active || g.decor?.mode || document.querySelector('.mg-count, .mg-wrap'));
  }

  /** 계획에 넘길 현재 상태 */
  _state() {
    const g = this.g, eco = g.economy, fs = g.farm.sim, rs = g.ranch.sim, day = g.world.day;
    const seedsOwned = Object.values(eco.inventory.seeds).reduce((a, n) => a + (n || 0), 0);
    const hasFert = eco.count('compost') > 0;
    const plots = g.farm.tiles.map((t, i) => ({ i, x: t.x, z: t.z, type: fs.actionFor(i, seedsOwned > 0, hasFert)?.type }));
    const sleeping = !!g.ranch.sleeping;
    const animals = g.ranch.ents.filter((e) => e.a).map((e) => ({ id: e.a.id, x: e.m.position.x, z: e.m.position.z, type: rs.actionFor(e.a, day).type, sleeping }));
    let sellCount = 0, sellValue = 0;
    for (const bag of [eco.inventory.crops, eco.inventory.products]) for (const [k, n] of Object.entries(bag)) if (n > 0) { sellCount += n; sellValue += eco.sellPrice(k) * n; }
    const plotsFree = fs.plots.filter((p) => p.state === 'empty' || p.state === 'tilled').length;
    const hungry = rs.animals.filter((a) => !rs.isBaby(a) && !a.product && a.fedTimer <= 0).length;
    const rice = this._riceInfo();
    const shop = shopList({ money: eco.money + sellValue, level: g.quests.level, seedsOwned, plotsFree, feed: eco.inventory.feed + rs.trough, hungry, riceFree: rice.free, riceSeeds: eco.count('rice_seed') });
    return { pos: g.player.position, plots, animals, feed: eco.inventory.feed, sellCount, shop, market: this._marketSpot(), skip: new Set(this.skip.keys()),
      extra: this._extras(), riceBlocked: rice.blocked, recent: this.recent };
  }

  _riceInfo() {
    const ps = this.g.rice?.sim?.paddies || [];
    const free = ps.filter((p) => p.state === 'dry' || p.state === 'tilled' || p.state === 'flooded').length;
    return { free, blocked: this.g.economy.count('rice_seed') <= 0 && ps.some((p) => p.state === 'flooded') };
  }

  /**
   * 밭·목장 말고 다른 콘텐츠의 할 일 (미니게임이 없는 것만)
   * 각 항목: { kind: 'spot', type, key, x, z, reach, name?, goal?() 움직이는 대상 위치, valid?() 도착했을 때 아직 할 수 있나, act() }
   */
  _extras() {
    const g = this.g, eco = g.economy, day = g.world.day, out = [], pos = g.player.position;
    const spot = (o) => { const p = o.goal ? o.goal() : o; if (p) out.push({ kind: 'spot', reach: 1.2, ...o, x: p.x, z: p.z }); };
    // 불청객 (까마귀·여우·늑대): 쫓아내기
    for (const pe of g.pests?.list || []) {
      if (pe.state === 'flee' || pe.state === 'gone') continue;
      spot({ type: 'shoo', key: `shoo:${(pe._aid ||= ++this._uid || (this._uid = 1))}`, name: pe.name, reach: 2.6, goal: () => (pe.state === 'flee' || pe.state === 'gone' ? null : pe.root.position), valid: () => pe.state !== 'flee' && pe.state !== 'gone', act: () => g.pests.shoo(pe) });
    }
    // 주민 부탁: 가진 것으로 들어줄 수 있으면 가져다 줌
    if (g.npcs && g.villagers) {
      const pool = g.npcs.requestPool();
      for (const e of g.npcs.list) {
        const r = g.villagers.requestFor(e.id, day, pool);
        if (r.done || eco.count(r.item) < r.n) continue;
        spot({ type: 'deliver', key: `deliver:${e.id}`, name: e.name ?? e.n.name, reach: 1.8, goal: () => e.u.group.position, valid: () => !r.done && eco.count(r.item) >= r.n, act: () => this._deliver(e, r) });
      }
    }
    // 논농사 (탈곡은 미니게임이라 사람이 직접)
    const R = g.rice;
    if (R?.sim) R.sim.paddies.forEach((_, i) => {
      const a = R.sim.actionsFor(i, eco.count('rice_seed') > 0)[0];
      if (!a || a.type === 'check' || a.type === 'need_seed') return;
      const v = R.paddies[i];
      spot({ type: `rice_${a.type}`, key: `rice:${i}`, x: v.x, z: v.z, reach: 1.0, valid: () => R.sim.actionsFor(i, eco.count('rice_seed') > 0)[0]?.type === a.type, act: () => R.act(i, a.type) });
    });
    // 꿀
    g.bees?.hives.forEach((h, i) => { if (h.honey >= 1) spot({ type: 'honey', key: `honey:${i}`, x: h.x, z: h.z, reach: 1.6, valid: () => h.honey >= 1, act: () => g.bees.collect(h) }); });
    // 과일 나무 (하루 한 번)
    g.nature?.trees.forEach((tr, i) => { if (tr.shakenDay !== day) spot({ type: 'shake', key: `shake:${i}`, x: tr.x, z: tr.z, reach: 2.2, valid: () => tr.shakenDay !== day, act: () => g.nature.shakeTree(tr) }); });
    // 곤충: 가까운 것만 (멀리까지 쫓아가지 않게)
    g.nature?.bugs.forEach((b, i) => {
      if (!b.g.visible || Math.hypot(b.g.position.x - pos.x, b.g.position.z - pos.z) > 14) return;
      spot({ type: 'bug', key: `bug:${i}`, reach: 1.5, goal: () => (b.g.visible ? b.g.position : null), valid: () => b.g.visible, act: () => g.nature.catchBug(b) });
    });
    // 보물 상자 (하루 한 번) · 전망대 첫 방문
    const X = g.explore;
    X?.chests.forEach((c) => { if (X.available(c)) spot({ type: 'chest', key: `chest:${c.id}`, x: c.x, z: c.z, reach: 1.3, valid: () => X.available(c), act: () => X.openChest(c) }); });
    X?.lookouts.forEach((L) => { if (!X.seen[L.H.id]) spot({ type: 'lookout', key: `lookout:${L.H.id}`, name: L.H.name, x: L.x, z: L.z, reach: 2.0, valid: () => !X.seen[L.H.id], act: () => X.view(L) }); });
    // 강아지: 찾아 온 것 받기 · 쓰다듬기
    const P = g.pet;
    if (P?.e && P.e.m.visible !== false) {
      if (P.sim.found) spot({ type: 'petfind', key: 'petfind', reach: 1.6, goal: () => P.e.m.position, valid: () => !!P.sim.found, act: () => P.takeFound() });
      else if (P.sim.petCool <= 0 && P.sim.hearts < 5) spot({ type: 'petdog', key: 'petdog', reach: 1.3, goal: () => P.e.m.position, valid: () => P.sim.petCool <= 0, act: () => P.pet() });
    }
    // 여물통: 거의 비었고 사료가 넉넉하면 채움
    const rs = g.ranch?.sim, T = LAYOUT.trough;
    if (rs && T && rs.trough < 2 && eco.inventory.feed >= 3) spot({ type: 'trough', key: 'trough', x: T.x, z: T.z, reach: 1.5, valid: () => eco.inventory.feed > 0, act: () => g.ranch.fillTrough() });
    return out;
  }

  /** 주민 부탁 들어주기 (대화창 없이) */
  _deliver(e, r) {
    const g = this.g;
    if (!g.economy.take(r.item, r.n)) return;
    const rr = g.villagers.fulfill(e.id);
    if (!rr) return;
    g.economy.earn(rr.reward);
    g.audio.play('coin');
    e.u.playAction('cheer', 1.2);
    g.npcs.applyRewards(e, rr);
    g.ui.toast(`🤖📝 ${e.name ?? e.n.name}의 부탁을 들어줬어요! +${rr.reward}🪙 · 우정 +${rr.gained}`);
  }

  _reach(t) { return t.reach ?? REACH[t.kind];
  }

  _marketSpot() {
    if (!this._mk) { const m = LAYOUT.npcs.merchant; this._mk = this.g.findOpenSpot(m.x, m.z + 1.6); }
    return this._mk;
  }

  /** 작업 대상의 현재 위치 */
  _goal(t) {
    if (t.goal) return t.goal();
    if (t.kind === 'animal') { const e = this.g.ranch.ents.find((x) => x.a?.id === t.id); return e ? e.m.position : null; }
    return t;
  }

  update(dt, input) {
    if (!this.on) return;
    const g = this.g, p = g.player;
    for (const [k, v] of this.skip) { if (v - dt <= 0) this.skip.delete(k); else this.skip.set(k, v - dt); }
    // 직접 조작: 키보드·조이스틱 또는 내가 시키지 않은 클릭 이동
    if (input.manual?.() || (p.moveTarget && p.moveTarget !== this.mt)) {
      if (this.hold <= 0) g.ui.setAuto?.('✋ 직접 조작 중 · 손을 떼면 다시 이어가요', true);
      this.hold = HOLD_MANUAL; this.mt = null; this.task = null;
      return;
    }
    if (this.hold > 0) { this.hold -= dt; return; }
    if (this._autoDismiss()) return;
    if (this._busy()) { this._stopMove(); this.task = null; g.ui.setAuto?.('⏸ 잠깐 쉬는 중 · 창·대화·미니게임이 끝나면 이어가요', true); return; }
    if (this.cool > 0) { this.cool -= dt; return; }
    if (!this.task) {
      this.think -= dt;
      if (this.think > 0) return;
      this.think = 0.4;
      const t = chooseTask(this._state());
      if (!t) { g.ui.setAuto?.(this._idleText(), true); return; }
      this.task = { ...t, t: 0 };
      g.ui.setAuto?.(`${TASK_LABEL[t.type]}${this._targetName(t)} 하러 가는 중`, true);
    }
    const t = this.task;
    t.t += dt;
    const goal = this._goal(t);
    if (!goal || t.t > TASK_TIMEOUT) return this._fail(t);
    const d = Math.hypot(goal.x - p.position.x, goal.z - p.position.z);
    if (d <= this._reach(t) + 0.15) { this._stopMove(); this.task = null; this._act(t); return; }
    // 길: 처음, 막혔을 때, 움직이는 동물이 길 끝에서 멀어졌을 때 다시 찾음
    if (!t.path || t.replan || (t.kind === 'animal' && Math.hypot(goal.x - t.end.x, goal.z - t.end.z) > 1.5)) {
      this._stopMove();
      t.path = this._plan(goal, t);
      t.end = { x: goal.x, z: goal.z }; t.replan = false;
      if (!t.path) return this._fail(t);
    }
    // 경유점에 닿으면 다음으로
    while (t.path.length > 1 && Math.hypot(t.path[0].x - p.position.x, t.path[0].z - p.position.z) < WP_STOP + 0.25) { t.path.shift(); this._stopMove(); }
    if (!p.moveTarget) {
      // 이동이 멈췄는데 목표(경유점) 근처가 아니면 막힌 것 → 비켜서 길을 다시 찾음
      if (this.mt && t.leg) {
        const w = t.leg.last ? goal : t.leg;
        if (Math.hypot(w.x - p.position.x, w.z - p.position.z) > (t.leg.last ? this._reach(t) : WP_STOP) + 0.3) {
          t.stuck = (t.stuck || 0) + 1;
          if (t.stuck > MAX_STUCK) return this._fail(t);
          t.replan = true; this.mt = null;
          return;
        }
      }
      const last = t.path.length === 1, wp = t.path[0];
      t.leg = { x: wp.x, z: wp.z, last };
      if (last) p.goTo(() => this._goal(t) || p.position, this._reach(t), false);
      else p.goTo(() => wp, WP_STOP, false);
      this.mt = p.moveTarget;
    }
  }

  /** 대화 자동 넘김 · 결과 창 자동 닫기. 처리 중이면 true (이번 프레임은 그것만) */
  _autoDismiss() {
    const g = this.g;
    if (g.dialogue.active) {
      if (g.dialogue.autoStep()) { this._stopMove(); this.task = null; g.ui.setAuto?.('💬 대화 자동으로 넘기는 중', true); return true; }
      return false;
    }
    const P = g.ui.panel;
    if (P?.dataset.kind === 'result' && !g.cinema.locked) {
      const now = performance.now();
      if (P !== this._resPanel) { this._resPanel = P; this._resAt = now; }
      if (now - this._resAt > 3000) { g.ui.closePanel(); this._resPanel = null; }
      return true;
    }
    return false;
  }

  /** 길찾기 격자 (정적 장애물, 캐릭터 반지름 반영). 막혔을 때 오래된 격자면 다시 만듦 */
  _grid(fresh = false) {
    const now = performance.now();
    if (!this.nav || (fresh && now - this.navAt > 5000)) {
      const w = this.g.world;
      this.nav = new NavGrid((x, z) => w.isBlocked(x, z, 0.6), LAYOUT.bounds - 1, 0.5);
      this.navAt = now;
    }
    return this.nav;
  }

  /** 현재 위치 → 목표 경유점. 막혀서 다시 찾는 중이면 옆으로 비켜서는 점을 먼저 넣음 (동물·주민 같은 움직이는 장애물) */
  _plan(goal, t) {
    const p = this.g.player.position, nav = this._grid(!!t.stuck);
    const path = nav.find(p, goal, Math.max(0, this._reach(t) - 0.3));
    if (!path) return null;
    if (t.stuck) {
      const n = path[0], dx = n.x - p.x, dz = n.z - p.z, l = Math.hypot(dx, dz) || 1;
      const side = t.stuck % 2 ? 1 : -1;
      for (const k of [side, -side]) {
        const sx = p.x + (-dz / l) * 1.3 * k - (dx / l) * 0.4, sz = p.z + (dx / l) * 1.3 * k - (dz / l) * 0.4;
        if (nav.lineFree(p, { x: sx, z: sz })) { const rest = nav.find({ x: sx, z: sz }, goal, Math.max(0, this._reach(t) - 0.3)); if (rest) return [{ x: sx, z: sz }, ...rest]; }
      }
    }
    return path;
  }

  _fail(t) { this.skip.set(t.key, SKIP_FOR); this._stopMove(); this.task = null; }

  _targetName(t) {
    if (t.name) return ` (${t.name})`;
    if (t.kind === 'plot') { const c = this.g.farm.sim.plots[t.i]?.crop; return c ? ` (${CROPS[c].emoji}${CROPS[c].name})` : ''; }
    if (t.kind === 'animal') { const a = this.g.ranch.sim.animals.find((x) => x.id === t.id); return a ? ` (${a.name})` : ''; }
    return '';
  }

  _idleText() {
    const fs = this.g.farm.sim;
    const grow = fs.plots.filter((p) => p.state === 'growing');
    if (grow.length) { const m = Math.max(...grow.map((p) => p.progress)); return `☕ 쉬는 중 · 작물이 자라고 있어요 (가장 많이 자란 밭 ${Math.floor(m * 100)}%)`; }
    return '☕ 쉬는 중 · 지금은 할 일이 없어요';
  }

  /** 도착: 상태를 다시 확인하고 실행 */
  _act(t) {
    const g = this.g, eco = g.economy;
    (this.recent ||= []).push(categoryOf(t));
    if (this.recent.length > 8) this.recent.shift();
    this.cool = 0.9;
    if (t.kind === 'plot') {
      const seeds = eco.inventory.seeds;
      const a = g.farm.sim.actionFor(t.i, Object.values(seeds).some((n) => n > 0), eco.count('compost') > 0);
      if (!a || a.type === 'wait' || a.type === 'need_seed') return;
      if (a.type === 'plant') { const c = bestSeed(seeds); if (!c || !g.farm.plantCrop(t.i, c, eco.count('compost') > 0)) return; }
      else g.farm.interact(t.i, a.type);
      if (a.type === 'harvest') this.cool = 1.5;
    } else if (t.kind === 'animal') {
      const e = g.ranch.ents.find((x) => x.a?.id === t.id);
      if (!e) return;
      const a = g.ranch.sim.actionFor(e.a, g.world.day);
      if (g.ranch.sleeping && a.type !== 'collect') return;
      if (a.type === 'feed') { if (eco.inventory.feed <= 0) return; g.ranch.feed(e); }
      else if (a.type === 'collect') g.ranch.collect(e);
      else if (a.type === 'brush') g.ranch.brush(e);
      else if (a.type === 'pet') g.ranch.pet(e);
      else return;
      this.cool = 1.3;
    } else if (t.kind === 'market') this._shop();
    else if (t.kind === 'spot') {
      if (t.valid && !t.valid()) return;
      const pp = g.player.position, q = this._goal(t);
      if (q) g.player.unico.facing = Math.atan2(q.x - pp.x, q.z - pp.z);
      t.act();
      this.cool = 1.1;
    }
    this.done++;
  }

  /** 장터: 작물·생산물을 팔고(가공품·특별한 생산물·물고기 등은 남겨 둠) 씨앗·사료를 삼 */
  _shop() {
    const g = this.g, eco = g.economy;
    let sold = 0;
    for (const k of Object.keys(eco.inventory.crops)) sold += eco.sell(k, eco.inventory.crops[k]);
    for (const k of Object.keys(eco.inventory.products)) sold += eco.sell(k, eco.inventory.products[k]);
    this.earned += sold;
    const fs = g.farm.sim, rs = g.ranch.sim;
    const seedsOwned = Object.values(eco.inventory.seeds).reduce((a, n) => a + (n || 0), 0);
    const list = shopList({
      money: eco.money, level: g.quests.level, seedsOwned,
      plotsFree: fs.plots.filter((p) => p.state === 'empty' || p.state === 'tilled').length,
      feed: eco.inventory.feed + rs.trough,
      hungry: rs.animals.filter((a) => !rs.isBaby(a) && !a.product && a.fedTimer <= 0).length,
      riceFree: this._riceInfo().free, riceSeeds: eco.count('rice_seed'),
    });
    const bought = [];
    if (list.feed && eco.buyFeed(list.feed)) bought.push(`🌾 사료 ${list.feed}개`);
    if (list.seeds && eco.buySeed(list.seeds.crop, list.seeds.n)) { const C = CROPS[list.seeds.crop]; bought.push(`${C.emoji} ${C.name} 씨앗 ${list.seeds.n}개`); }
    if (list.rice && eco.buyItem('rice_seed', list.rice)) bought.push(`🌾 볍씨 ${list.rice}개`);
    if (sold) { g.onEvent('sell', sold); g.onEvent('money', eco.money); }
    g.audio.play(sold || bought.length ? 'coin' : 'click');
    g.player.unico.playAction('cheer', 1);
    const parts = [];
    if (sold) parts.push(`판매 +${sold}🪙`);
    if (bought.length) parts.push(`구매: ${bought.join(', ')}`);
    g.ui.toast(`🤖🛒 장터 ${parts.length ? parts.join(' · ') : '— 살 것도 팔 것도 없어요'}`);
    // 팔 것도 살 것도 없으면 한동안 장터는 건너뜀 (왔다 갔다 반복 방지)
    if (!sold && !bought.length) this.skip.set('market', 60);
    this.cool = 1.2;
  }
}

/** 상품 이름 (토스트 등) */
export const productName = (k) => (CROPS[k] || PRODUCTS[k])?.name || k;
