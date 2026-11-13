import { PLOTS, RANCH } from './map.js';

/**
 * 해로운 동물 (3D 판 pests.js 와 같은 규칙)
 *  - 까마귀: 낮에 자라는 밭에 내려앉아 쪼아 먹음 (성장이 뒤로 밀리고, 다 익은 작물은 6초 뒤 망가짐)
 *  - 여우·늑대: 밤에 숲에서 목장 울타리로 다가와 으르렁 (동물들이 겁먹어 생산이 멈춤)
 *  - 가까이 가서 E → 배틀 (battle.js)
 */
const T = 32;

export function initPests(g) { g.pests = []; g.crowT = 40 + Math.random() * 30; g.predT = 30; }

export const PestMethods = {
  ranchThreat() { return this.pests.some((p) => p.kind !== 'crow' && p.state === 'lurk'); },

  pestTick(dt, busy) {
    if (!busy && !this.battle) {
      this.crowT -= dt;
      if (this.crowT <= 0) { this.crowT = 55 + Math.random() * 50; if (this.night < 0.5 && this.pests.filter((p) => p.kind === 'crow').length < 2) this.spawnCrow(); }
      this.predT -= dt;
      if (this.predT <= 0) { this.predT = 80 + Math.random() * 60; if (this.night > 0.6 && !this.pests.some((p) => p.kind !== 'crow')) this.spawnPredator(); }
    }
    for (const p of [...this.pests]) {
      if (p.inBattle) continue;
      p.t += dt;
      if (p.kind === 'crow') this.crowStep(p, dt); else this.predStep(p, dt);
      if (p.state === 'gone') this.pests.splice(this.pests.indexOf(p), 1);
    }
  },

  spawnCrow() {
    const F = this.farm;
    const ok = F.plots.map((pl, i) => ({ pl, i })).filter(({ pl, i }) => (pl.state === 'growing' || pl.state === 'ready') && !this.pests.some((p) => p.plot === i));
    if (!ok.length) return;
    const { i } = ok[Math.floor(Math.random() * ok.length)];
    const tx = (PLOTS.x + (i % PLOTS.cols)) * T + 16 + (Math.random() - 0.5) * 10, ty = (PLOTS.y + Math.floor(i / PLOTS.cols)) * T + 22;
    const from = { x: tx + (Math.random() < 0.5 ? -1 : 1) * 420, y: ty - 300 };
    this.pests.push({ kind: 'crow', name: '까마귀', plot: i, state: 'arrive', t: 0, x: from.x, y: from.y, from, to: { x: tx, y: ty }, face: from.x < tx ? 0 : 1 });
    this.audio.play('caw');
    this.ui.toast('까마귀가 밭에 내려앉았어요! 가까이 가서 E — 배틀로 쫓아내요', 'star');
  },

  spawnPredator() {
    const wolf = Math.random() < 0.35;
    const ty = (RANCH.y0 + 2 + Math.floor(Math.random() * (RANCH.y1 - RANCH.y0 - 3))) * T + 26;
    const tx = (RANCH.x1 + 1) * T + 16;
    this.pests.push({ kind: wolf ? 'wolf' : 'fox', name: wolf ? '늑대' : '산여우', state: 'approach', t: 0, x: (RANCH.x1 + 5) * T, y: ty, home: { x: (RANCH.x1 + 6) * T, y: ty }, to: { x: tx, y: ty }, face: 1 });
    this.audio.play(wolf ? 'howl' : 'caw', wolf ? 1 : 0.5);
    this.ui.toast(wolf ? '늑대가 목장으로 다가와요! 동쪽 울타리로 가서 E — 배틀!' : '여우가 닭장을 노려요! 동쪽 울타리로 가서 E — 배틀!', 'star');
  },

  crowStep(p, dt) {
    if (p.state === 'arrive') {
      const k = Math.min(1, p.t / 2.4), e = 1 - (1 - k) ** 3;
      p.x = p.from.x + (p.to.x - p.from.x) * e; p.y = p.from.y + (p.to.y - p.from.y) * e - Math.sin(k * Math.PI) * 30;
      if (k >= 1) { p.state = 'peck'; p.t = 0; }
    } else if (p.state === 'peck') {
      const pl = this.farm.plots[p.plot];
      if (pl.state === 'growing') pl.progress = Math.max(0, pl.progress - dt * 0.012);
      else if (pl.state === 'ready' && p.t > 6) { pl.state = 'growing'; pl.progress = 0.8; this.ui.toast('까마귀가 다 익은 작물을 쪼아 버렸어요…', 'tomato'); }
      else if (pl.state !== 'ready') this.pestFlee(p);
      if (Math.random() < dt * 0.15) this.audio.play('caw', 0.35);
    } else if (p.state === 'flee') {
      p.vy -= dt * 260; p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.t > 2.5) p.state = 'gone';
    }
  },

  predStep(p, dt) {
    const go = (to, sp) => { const dx = to.x - p.x, dy = to.y - p.y, d = Math.hypot(dx, dy); if (d > 1) { const s = Math.min(d, sp * dt); p.x += (dx / d) * s; p.y += (dy / d) * s; p.face = dx > 0 ? 0 : 1; p.walk = (p.walk || 0) + s; } return d; };
    if (p.state === 'approach') { if (go(p.to, 42) < 2) { p.state = 'lurk'; p.t = 0; p.face = 1; } }
    else if (p.state === 'lurk') { if (p.t > 4 && Math.random() < dt * 0.05) this.audio.play(p.kind === 'wolf' ? 'howl' : 'caw', 0.35); }
    else if (p.state === 'flee') { if (go(p.home, 190) < 4 || p.t > 4) p.state = 'gone'; }
  },

  pestFlee(p) {
    p.state = 'flee'; p.t = 0; p.inBattle = false;
    if (p.kind === 'crow') { const away = Math.sign(p.x - this.player.wx) || 1; p.vx = away * 180; p.vy = -60; p.face = away > 0 ? 0 : 1; }
  },

  /** 바라보는 곳 근처의 해로운 동물 */
  pestNear() {
    const pl = this.player;
    const fx = pl.wx + ({ left: -18, right: 18 }[pl.dir] || 0), fy = pl.wy - 8 + ({ up: -18, down: 18 }[pl.dir] || 0);
    return this.pests.find((p) => p.state !== 'flee' && p.state !== 'arrive' && Math.hypot(p.x - fx, p.y - fy) < 36);
  },

  drawPests(out) {
    const S = this.S, t = performance.now() / 1000;
    for (const p of this.pests) {
      if (p.inBattle) continue;
      let img;
      if (p.kind === 'crow') {
        const flying = p.state !== 'peck';
        img = S.pest.crow[flying ? 2 + (Math.floor(t * 12) % 2) : Math.floor(t * 3 + p.plot) % 4 === 0 ? 1 : 0][p.face];
        out.push({ img, x: p.x - 13, y: p.y - 20, sy: p.state === 'peck' ? p.y : p.y + 400, shadow: flying ? null : 's', sx: p.x, shy: p.y, bubble: p.state === 'peck' ? '!' : null });
      } else {
        const moving = p.state !== 'lurk';
        img = S.pest[p.kind][moving ? Math.floor((p.walk || 0) / 10) % 2 : Math.floor(t * 2) % 2 && Math.sin(t) > 0.6 ? 1 : 0][p.face];
        const w = img.width;
        out.push({ img, x: p.x - w / 2, y: p.y - img.height + 2, sy: p.y, shadow: 'l', sx: p.x, shy: p.y, bubble: p.state === 'lurk' ? '!' : null });
      }
    }
  },
};
