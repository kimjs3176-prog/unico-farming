import * as THREE from 'three';
import { LAYOUT } from '../world.js';
import { heightAt } from '../terrain.js';
import { playClip } from './ranch_view.js';
import { makeLabel } from '../label.js';

/**
 * 해로운 동물과 쫓아내기
 *  - 까마귀: 작물이 자라는 밭에 날아와 쪼아 먹음 (성장 진행이 뒤로 밀림, 다 익은 작물은 망가짐)
 *  - 여우·늑대: 밤에 숲 가장자리에서 목장으로 다가옴 (울타리에 붙으면 동물들이 겁먹어 생산 멈춤)
 *  - 가까이 가서 E: 주인공이 두 팔을 휘저으며 발을 구르고(쫓기 동작), 반려견이 짖으며 달려들고,
 *    까마귀는 날갯짓하며 날아가고, 여우·늑대는 뒤돌아 숲으로 달아남
 */
export class Pests {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.crowTimer = 40 + Math.random() * 30;
    this.predTimer = 30;
    this.t = 0;
  }

  /** 목장을 노리는 포식자가 울타리에 붙어 있는지 (목장 생산 멈춤) */
  get ranchThreat() { return this.list.some((p) => p.kind !== 'crow' && p.state === 'lurk'); }

  _warn(p, text) {
    const g = this.game;
    p.mark = makeLabel('❗', { color: '#ffffff', bg: 'rgba(217,56,76,0.95)', size: 40 });
    p.mark.position.y = p.kind === 'crow' ? 0.9 : 1.7;
    p.root.add(p.mark);
    g.ui.toast(text);
  }

  spawnCrow() {
    const g = this.game, F = g.farm;
    const plots = F.sim.plots.map((pl, i) => ({ pl, i })).filter(({ pl, i }) => (pl.state === 'growing' || pl.state === 'ready') && !this.list.some((p) => p.plot === i));
    if (!plots.length) return;
    const { i } = plots[Math.floor(Math.random() * plots.length)];
    const t = F.tiles[i];
    const root = g.assets.clone('crow');
    root.scale.setScalar(1.6);
    const tx = t.x + (Math.random() - 0.5) * 0.8, tz = t.z + (Math.random() - 0.5) * 0.8;
    const from = new THREE.Vector3(tx + 18 * (Math.random() < 0.5 ? -1 : 1), 14, tz - 14);
    root.position.copy(from);
    g.world.scene.add(root);
    const p = { kind: 'crow', name: '까마귀', root, plot: i, state: 'arrive', t: 0, from, to: new THREE.Vector3(tx, 0.2, tz),
      wings: [root.getObjectByName('WingL'), root.getObjectByName('WingR')], head: root.getObjectByName('Head'), body: root.getObjectByName('Body') };
    this.list.push(p);
    g.audio.play('caw');
    this._warn(p, '🐦‍⬛ 까마귀가 밭에 내려앉았어요! 가까이 가서 쫓아내세요 (E)');
  }

  spawnPredator() {
    const g = this.game, R = LAYOUT.ranch;
    const wolf = Math.random() < 0.35 && g.assets.has('q_wolf');
    const model = wolf ? 'q_wolf' : 'q_fox';
    if (!g.assets.has(model)) return;
    const rig = g.assets.cloneAnimated(model);
    // 숲 가장자리(목장 바깥쪽)에서 출발 → 목장 울타리 바깥 지점으로
    const side = Math.random();
    const target = side < 0.5 ? new THREE.Vector3(R.x0 + 3 + Math.random() * (R.x1 - R.x0 - 6), 0, R.z0 - 1.4) : new THREE.Vector3(R.x1 + 1.4, 0, R.z0 + 3 + Math.random() * (R.z1 - R.z0 - 6));
    const a = Math.atan2(target.z, target.x);
    const start = new THREE.Vector3(Math.cos(a) * 38, 0, Math.sin(a) * 38);
    rig.root.position.copy(start);
    g.world.scene.add(rig.root);
    const p = { kind: wolf ? 'wolf' : 'fox', name: wolf ? '늑대' : '여우', root: rig.root, mixer: rig.mixer, clips: rig.clips, state: 'approach', t: 0, target, home: start };
    playClip(p, 'walk', 0);
    this.list.push(p);
    g.audio.play(wolf ? 'howl' : 'caw', wolf ? 1 : 0.5);
    this._warn(p, wolf ? '🐺 늑대가 목장 쪽으로 다가와요! 쫓아내세요' : '🦊 여우가 닭장을 노리고 있어요! 쫓아내세요');
  }

  update(dt, pp) {
    const g = this.game;
    this.t += dt;
    const night = g.world.daylight < 0.35;
    // 등장 타이밍
    if (!g.cinema.locked) {
      this.crowTimer -= dt;
      if (this.crowTimer <= 0) { this.crowTimer = 55 + Math.random() * 50; if (this.list.filter((p) => p.kind === 'crow').length < 2) this.spawnCrow(); }
      this.predTimer -= dt;
      if (this.predTimer <= 0) { this.predTimer = 80 + Math.random() * 60; if (night && !this.list.some((p) => p.kind !== 'crow')) this.spawnPredator(); }
    }
    let best = null;
    for (const p of [...this.list]) {
      p.t += dt;
      if (p.kind === 'crow') this._crow(p, dt); else this._predator(p, dt);
      if (p.state === 'gone') { g.world.scene.remove(p.root); this.list.splice(this.list.indexOf(p), 1); continue; }
      if (p.state === 'flee') continue;
      const d = Math.hypot(p.root.position.x - pp.x, p.root.position.z - pp.z);
      if (d < 3.6 && (!best || d < best.d)) best = { d: Math.min(0.2, d - 1), label: `👋 ${p.name} 쫓아내기`, key: 'shoo', onInteract: () => this.shoo(p) };
    }
    return best;
  }

  _crow(p, dt) {
    const r = p.root, F = this.game.farm;
    const flap = (speed, amp) => { for (const [k, w] of p.wings.entries()) if (w) w.rotation.z = (k ? -1 : 1) * Math.sin(this.t * speed) * amp; }; // 날개: 앞뒤 축으로 위아래
    if (p.state === 'arrive') { // 활공해서 내려앉기
      const k = Math.min(1, p.t / 2.4), e = 1 - (1 - k) ** 3;
      r.position.lerpVectors(p.from, p.to, e);
      r.position.y = heightAt(r.position.x, r.position.z) + p.to.y + (1 - e) * 14 + Math.sin(k * Math.PI) * 1.5;
      r.rotation.y = Math.atan2(p.to.x - p.from.x, p.to.z - p.from.z);
      flap(22, 0.9 * (1 - e * 0.6));
      if (k >= 1) { p.state = 'peck'; p.t = 0; }
    } else if (p.state === 'peck') { // 통통 뛰며 쪼기
      flap(3, 0.08);
      if (p.head) p.head.rotation.x = Math.max(0, Math.sin(p.t * 6)) ** 4 * 0.9;
      r.position.y = 0.2 + Math.max(0, Math.sin(p.t * 1.7)) ** 8 * 0.12;
      if (Math.random() < dt * 0.5) r.rotation.y += (Math.random() - 0.5) * 1.5;
      const pl = F.sim.plots[p.plot];
      if (pl.state === 'growing') pl.progress = Math.max(0, pl.progress - dt * 0.012);
      else if (pl.state === 'ready' && p.t > 6) { pl.state = 'growing'; pl.progress = 0.8; F.refresh(p.plot); this.game.ui.toast('🐦‍⬛ 까마귀가 다 익은 작물을 쪼아 버렸어요…'); }
      else if (pl.state !== 'ready') this._flee(p, false); // 밭이 비면 떠남
      if (Math.random() < dt * 0.15) this.game.audio.play('caw', 0.4);
    } else if (p.state === 'flee') { // 날갯짓하며 하늘로
      flap(30, 1.0);
      p.vel.y += dt * 6;
      r.position.addScaledVector(p.vel, dt);
      if (p.t > 3) p.state = 'gone';
    }
  }

  _predator(p, dt) {
    const r = p.root, pos = r.position;
    const go = (target, speed, clip) => {
      const dx = target.x - pos.x, dz = target.z - pos.z, d = Math.hypot(dx, dz);
      const yaw = Math.atan2(dx, dz), diff = ((yaw - r.rotation.y + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
      r.rotation.y += diff * (1 - Math.exp(-dt * 5));
      const step = Math.min(d, speed * dt * Math.max(0.2, Math.cos(diff)));
      const nv = (this._nv ||= new THREE.Vector3()).set(pos.x + Math.sin(r.rotation.y) * step, 0, pos.z + Math.cos(r.rotation.y) * step);
      this.game.world.resolveCollision(nv, 0.4);
      pos.x = nv.x; pos.z = nv.z;
      playClip(p, clip, 0.3);
      return d;
    };
    if (p.state === 'approach') { if (go(p.target, 1.3, 'walk') < 0.4) { p.state = 'lurk'; p.t = 0; } }
    else if (p.state === 'lurk') { // 울타리에 붙어 으르렁 (목장 동물 겁먹음)
      const R = LAYOUT.ranch;
      r.rotation.y += (Math.atan2((R.x0 + R.x1) / 2 - pos.x, (R.z0 + R.z1) / 2 - pos.z) - r.rotation.y) * (1 - Math.exp(-dt * 3));
      playClip(p, Math.sin(p.t * 0.8) > 0.6 ? 'attack' : 'look', 0.4);
      if (p.t > 4 && Math.random() < dt * 0.05) this.game.audio.play(p.kind === 'wolf' ? 'howl' : 'caw', 0.4);
    } else if (p.state === 'flee') {
      if (go(p.home, 6.2, 'run') < 1 || p.t > 7) p.state = 'gone';
    }
    pos.y = heightAt(pos.x, pos.z);
    p.mixer.update(dt * (p.cur === 'run' ? 1.4 : 1));
  }

  _flee(p, byPlayer) {
    p.state = 'flee'; p.t = 0;
    if (p.mark) { p.root.remove(p.mark); p.mark = null; }
    if (p.kind === 'crow') {
      const away = new THREE.Vector3(p.root.position.x - this.game.player.position.x, 0, p.root.position.z - this.game.player.position.z).normalize();
      p.vel = new THREE.Vector3(away.x * 6, 3, away.z * 6);
      p.root.rotation.y = Math.atan2(away.x, away.z);
      if (byPlayer) this.game.audio.play('caw', 0.8);
    }
  }

  /** 쫓아내기: 주인공 동작 + 반려견 달려들기 + 보상 */
  shoo(p) {
    const g = this.game, me = g.player;
    me.unico.facing = Math.atan2(p.root.position.x - me.position.x, p.root.position.z - me.position.z);
    me.unico.playAction('shoo', 1.3);
    g.audio.play('shoo');
    g.juice?.shake?.(0.15);
    g.pet?.chase?.(p.root.position);
    this._flee(p, true);
    const coins = p.kind === 'crow' ? 15 : p.kind === 'fox' ? 30 : 50;
    g.economy.earn(coins);
    g.fx.pop(p.root.position.x, p.root.position.z, '💨');
    g.ui.toast(`👋 ${p.name}를 쫓아냈어요! 밭과 목장을 지켰어요 +${coins}🪙`);
    g.onEvent('shoo');
  }

  /** 미니맵용 위치 */
  markers() { return this.list.filter((p) => p.state !== 'flee').map((p) => p.root.position); }
}
