import { LAYOUT } from './world.js';
import { CROPS, PRODUCTS } from './sim/crops.js';
import { chooseTask, shopList, bestSeed, TASK_LABEL } from './sim/autoplay.js';

/**
 * 오토플레이 모드: 유니코가 알아서 밭·목장 일을 하고 장터에서 사고팜
 *  - 할 일 고르기는 sim/autoplay.js (수확 > 거두기 > 물 > 김매기 > 사료 > 심기 > 퇴비 > 밭 갈기 > 빗질 > 쓰다듬기)
 *  - 직접 움직이면(키보드·조이스틱·클릭 이동) 잠깐 멈췄다가 4초 뒤 다시 이어감
 *  - 창·대화·컷신·미니게임·트랙터 중에는 쉬고, 끝나면 다시 시작
 *  - 막혀서 못 가는 대상은 30초 동안 건너뜀
 */
const REACH = { plot: 1.1, animal: 1.6, market: 1.4 };
const HOLD_MANUAL = 4;      // 직접 조작 후 다시 이어가기까지 (초)
const TASK_TIMEOUT = 25;    // 한 일에 이만큼 넘게 걸리면 포기
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
    if (v) { this.done = 0; this.earned = 0; }
    g.ui.toast(v ? '🤖 오토플레이 시작! 유니코가 알아서 농사·목장 일을 하고 장터에서 사고팔아요 (P 또는 🤖 버튼으로 끄기 · 직접 움직이면 잠깐 멈춤)'
      : `🤖 오토플레이 끔${this.done ? ` · 한 일 ${this.done}가지${this.earned ? ` · 판매 +${this.earned}🪙` : ''}` : ''}`);
    g.audio.play('click');
    g.ui.setAuto?.(v ? '준비 중…' : null, v);
  }

  _stopMove() { const p = this.g.player; if (p.moveTarget && p.moveTarget === this.mt) p.moveTarget = null; this.mt = null; }

  /** 다른 일(창·대화·미니게임 등) 때문에 쉬어야 하나 */
  _busy() {
    const g = this.g;
    return !!(g.ui.panel || g.dialogue.active || g.cinema.locked || g.tractor.driving || g.player.frozen || g.farm.job
      || g.herding?.active || g.smartfarm?.active || document.querySelector('.mg-count, .mg-wrap'));
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
    const shop = shopList({ money: eco.money + sellValue, level: g.quests.level, seedsOwned, plotsFree, feed: eco.inventory.feed + rs.trough, hungry });
    return { pos: g.player.position, plots, animals, feed: eco.inventory.feed, sellCount, shop, market: this._marketSpot(), skip: new Set(this.skip.keys()) };
  }

  _marketSpot() {
    if (!this._mk) { const m = LAYOUT.npcs.merchant; this._mk = this.g.findOpenSpot(m.x, m.z + 1.6); }
    return this._mk;
  }

  /** 작업 대상의 현재 위치 */
  _goal(t) {
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
    if (d <= REACH[t.kind] + 0.15) { this._stopMove(); this.task = null; this._act(t); return; }
    // 목장 울타리를 넘나들 때는 출입구(서쪽)를 거쳐 감
    if (!t.via) t.via = this._via(goal);
    if (t.via.length && Math.hypot(t.via[0].x - p.position.x, t.via[0].z - p.position.z) < 0.6) { t.via.shift(); this._stopMove(); }
    if (!p.moveTarget) {
      // 이동이 끝났는데 아직 멀고, 지난번보다 별로 가까워지지 않았으면 막힌 것
      if (this.mt) { if (t.lastD !== undefined && t.lastD - d < 0.3) t.stuck = (t.stuck || 0) + 1; if (t.stuck > 2) return this._fail(t); }
      t.lastD = d;
      const wp = t.via[0];
      if (wp) p.goTo(() => wp, 0.35, false);
      else p.goTo(() => this._goal(t) || p.position, REACH[t.kind], false);
      this.mt = p.moveTarget;
    }
  }

  /** 울타리 출입구 경유점 */
  _via(goal) {
    const R = LAYOUT.ranch, p = this.g.player.position;
    const inR = (q) => q.x > R.x0 && q.x < R.x1 && q.z > R.z0 && q.z < R.z1;
    const out = { x: R.gate.x - 1.8, z: R.gate.z }, inn = { x: R.gate.x + 1.8, z: R.gate.z };
    if (inR(goal) === inR(p)) return [];
    return inR(p) ? [inn, out] : [out, inn];
  }

  _fail(t) { this.skip.set(t.key, SKIP_FOR); this._stopMove(); this.task = null; }

  _targetName(t) {
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
    });
    const bought = [];
    if (list.feed && eco.buyFeed(list.feed)) bought.push(`🌾 사료 ${list.feed}개`);
    if (list.seeds && eco.buySeed(list.seeds.crop, list.seeds.n)) { const C = CROPS[list.seeds.crop]; bought.push(`${C.emoji} ${C.name} 씨앗 ${list.seeds.n}개`); }
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
