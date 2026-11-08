import * as THREE from 'three';
import { LAYOUT } from '../world.js';
import { heightAt } from '../terrain.js';
import { playClip } from './ranch_view.js';
import { releaseRig } from './pests.js';
import { mgIntro, mgCountdown, mgResult, mgTick } from '../../ui/minigame_frame.js';

const DUR = 70, N = 6;

/**
 * 미니게임: 양 몰이 (밭 남쪽 들판)
 *  흩어진 양 6마리를 70초 안에 우리(서쪽 입구)로 몰아넣기. 양은 플레이어와 반려견을 피해 달아나고
 *  무리를 지어 움직임(가까운 양 쪽으로 살짝 모임). 우리에 들어간 양은 그대로 머묾.
 *  보상: 넣은 양 1마리당 양털 1 + 25🪙, 모두 넣으면 남은 시간 보너스.
 */
export class Herding {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.best = +(safeGet('unico.herd.best') || 0);
    this.hud = document.createElement('div');
    this.hud.className = 'herd-hud hidden';
    document.getElementById('ui').append(this.hud);
  }

  /** 시작 표지판 근처 안내 */
  prompt(pp) {
    if (this.active) return null;
    const S = LAYOUT.herd.sign, d = Math.hypot(S.x - pp.x, S.z - pp.z);
    return d < 2.4 ? { d, label: `🐑 양 몰이 미니게임 (최고 ${this.best}마리)`, key: 'herd', onInteract: () => this.begin() } : null;
  }

  begin() {
    mgIntro(this.game, {
      id: 'herd', icon: '🐑', title: '양 몰이', unit: '마리', th: [3, 5, 6], countdown: false,
      rules: [['🐑', `흩어진 양 ${N}마리를 ${DUR}초 안에 오른쪽 우리로 몰아요 (입구는 서쪽)`], ['🏃', '양은 나와 콩이를 피해 달아나요. 뒤에서 살살 밀어 주세요'], ['⏱️', '모두 넣으면 남은 시간만큼 보너스']],
      controls: ['WASD·방향키', '조이스틱', '화면 클릭 이동'],
      onStart: () => this.start(),
    });
  }

  start() {
    const g = this.game, H = LAYOUT.herd, P = H.pen;
    if (!g.assets.has('q_sheep')) return;
    this.active = true; this.t = 0; this.done = false; this.counting = true; this.tickRef = {};
    g.player.frozen = true;
    mgCountdown(g).then(() => { this.counting = false; g.player.frozen = false; });
    this.sheep = [];
    for (let i = 0; i < N; i++) {
      const rig = g.assets.cloneAnimated('q_sheep');
      let x, z;
      do { x = H.x0 + 1.5 + Math.random() * (P.x0 - H.x0 - 4); z = H.z0 + 1 + Math.random() * (H.z1 - H.z0 - 2); } while (this.sheep.some((s) => Math.hypot(s.m.position.x - x, s.m.position.z - z) < 1.6));
      rig.root.position.set(x, heightAt(x, z), z);
      rig.root.rotation.y = Math.random() * 6.28;
      g.world.scene.add(rig.root);
      const s = { m: rig.root, mixer: rig.mixer, clips: rig.clips, vx: 0, vz: 0, penned: false, wander: Math.random() * 3 };
      playClip(s, 'idle', 0);
      this.sheep.push(s);
    }
    // 들판이 한눈에 보이게 카메라를 높이
    const fc = g.followCam;
    this.cam = { pitch: fc.pitch, distance: fc.distance };
    fc.pitch = 0.82; fc.distance = 17;
    g.player.position.set(H.sign.x + 1.5, 0, H.sign.z + 1.2);
    g.audio.play('win', 0.5);
    this.hud.classList.remove('hidden');
  }

  update(dt, pp) {
    if (!this.active) return this.prompt(pp);
    const g = this.game, H = LAYOUT.herd, P = H.pen;
    if (this.counting) { for (const s of this.sheep) s.mixer.update(dt); return { d: -1, label: '🐑 준비…', key: 'herd' }; }
    if (!this.done) this.t += dt;
    const chasers = [{ x: pp.x, z: pp.z, r: 3.4, k: 1 }];
    const pet = g.pet?.e?.m.position;
    if (pet) chasers.push({ x: pet.x, z: pet.z, r: 2.6, k: 0.8 });
    let penned = 0;
    for (const s of this.sheep) {
      const p = s.m.position;
      let ax = 0, az = 0;
      if (!s.penned) {
        // 쫓는 쪽에서 멀어지기
        for (const c of chasers) {
          const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz);
          if (d < c.r && d > 0.01) { const f = (1 - d / c.r) * 9 * c.k; ax += (dx / d) * f; az += (dz / d) * f; }
        }
        // 무리 짓기: 가까운 양 쪽으로 살짝, 너무 붙으면 떨어짐
        for (const o of this.sheep) {
          if (o === s) continue;
          const dx = o.m.position.x - p.x, dz = o.m.position.z - p.z, d = Math.hypot(dx, dz);
          if (d < 4 && d > 1.2) { ax += dx / d * 0.5; az += dz / d * 0.5; } else if (d <= 1.0 && d > 0.01) { ax -= dx / d * 3; az -= dz / d * 3; }
        }
        // 가끔 혼자 풀 뜯으며 어슬렁
        s.wander -= dt;
        if (s.wander <= 0) { s.wander = 2 + Math.random() * 3; s.wx = (Math.random() - 0.5) * 1.2; s.wz = (Math.random() - 0.5) * 1.2; }
        ax += s.wx || 0; az += s.wz || 0;
        // 들판 경계는 부드럽게 밀어냄
        const m = 1.2;
        if (p.x < H.x0 + m) ax += 6; if (p.x > H.x1 - m) ax -= 6; if (p.z < H.z0 + m) az += 6; if (p.z > H.z1 - m) az -= 6;
      } else {
        // 우리 안: 안쪽에서 천천히 어슬렁 (밖으로 안 나감)
        const cx = (P.x0 + P.x1) / 2 + 0.6, cz = (P.z0 + P.z1) / 2;
        ax += (cx - p.x) * 0.6; az += (cz - p.z) * 0.6;
      }
      // 관성 있는 이동 (최대 3.2m/s)
      s.vx += (ax - s.vx * 1.8) * dt * 2.2; s.vz += (az - s.vz * 1.8) * dt * 2.2;
      const sp = Math.hypot(s.vx, s.vz), max = s.penned ? 0.6 : 3.2;
      if (sp > max) { s.vx *= max / sp; s.vz *= max / sp; }
      const nv = (this._v ||= new THREE.Vector3()).set(p.x + s.vx * dt, 0, p.z + s.vz * dt);
      g.world.resolveCollision(nv, 0.5);
      p.x = nv.x; p.z = nv.z; p.y = heightAt(p.x, p.z);
      const v = Math.hypot(s.vx, s.vz);
      if (v > 0.25) {
        const yaw = Math.atan2(s.vx, s.vz), diff = ((yaw - s.m.rotation.y + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
        s.m.rotation.y += diff * (1 - Math.exp(-dt * 6));
      }
      playClip(s, v > 0.35 ? 'walk' : 'idle', 0.3);
      s.mixer.update(dt * (v > 0.35 ? Math.max(0.6, v / 0.9) * 1.7 : 1));
      // 우리 안에 들어오면 고정
      if (!s.penned && p.x > P.x0 + 0.6 && p.x < P.x1 - 0.3 && p.z > P.z0 + 0.4 && p.z < P.z1 - 0.4) {
        s.penned = true;
        g.audio.play('pop'); g.fx.burst(p.x, p.y + 1, p.z, 0xfff2b0, 10);
        g.fx.pop(p.x, p.z, '🐑');
      }
      if (s.penned) penned++;
    }
    this.penned = penned;
    const left = Math.max(0, DUR - this.t);
    const warn = !this.done && mgTick(g, left, this.tickRef);
    const html = `🐑 우리에 넣은 양 <b>${penned}/${N}</b> <span class="pips">${'●'.repeat(penned)}${'○'.repeat(N - penned)}</span> · ⏱ <b class="${left < 15 ? 'warn' : ''}">${Math.ceil(left)}초</b>`;
    if (html !== this._hudHtml) { this._hudHtml = html; this.hud.innerHTML = html; }
    this.hud.classList.toggle('pulse', warn);
    if (!this.done && (penned === N || left <= 0)) this.finish();
    return null;
  }

  finish() {
    const g = this.game, n = this.penned;
    this.done = true;
    const bonus = n === N ? Math.round((DUR - this.t) * 3) : 0;
    const coins = n * 25 + bonus;
    g.economy.addProduct('wool', n);
    g.economy.earn(coins);
    g.audio.play(n === N ? 'levelup' : 'win');
    g.player.unico.playAction('cheer', 2);
    const prev = this.best;
    if (n > this.best) this.best = n;
    g.onEvent('herd', n);
    this._cl = setTimeout(() => this.cleanup(), 2600);
    setTimeout(() => mgResult(g, {
      id: 'herd', icon: '🐑', title: n === N ? '양 몰이 성공!' : '양 몰이 결과', score: n, unit: '마리', th: [3, 5, 6], prevBest: prev,
      lines: [`🧶 양털 +${n} · 🪙 +${n * 25}`, bonus ? `⏱️ 남은 시간 보너스 +${bonus}🪙` : `모두 넣으면 남은 시간만큼 보너스`, `총 보상 <b>+${coins}🪙</b>`],
      onRetry: () => { clearTimeout(this._cl); this.cleanup(); this.begin(); },
    }), 900);
  }

  cleanup() {
    const g = this.game;
    for (const s of this.sheep || []) { g.world.scene.remove(s.m); releaseRig(s); }
    this.sheep = [];
    this.active = false;
    this.hud.classList.add('hidden');
    if (this.cam) { g.followCam.pitch = this.cam.pitch; g.followCam.distance = this.cam.distance; }
  }
}

function safeGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
