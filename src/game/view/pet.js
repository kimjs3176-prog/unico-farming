import * as THREE from 'three';
import { heightAt } from '../terrain.js';
import { playClip } from './ranch_view.js';
import { makeLabel } from '../label.js';
import { PetSim, TRICKS, TRICK_TIME } from '../sim/pet.js';
import { CROPS } from '../sim/crops.js';
import { ITEMS } from '../sim/items.js';

/**
 * 반려견 '콩이' (CC0 Quaternius 시바견, 뼈대 애니메이션)
 * 플레이어를 졸졸 따라다니고, 멀어지면 뛰어오고, 가만히 있으면 앉아 쉬거나 냄새를 맡는다. E/탭으로 쓰다듬기.
 */
export class Pet {
  constructor(game) {
    this.game = game;
    this.ok = game.assets.has('q_shiba') && game.assets.anims.get('q_shiba')?.length;
    if (!this.ok) return;
    const rig = game.assets.cloneAnimated('q_shiba');
    this.e = { m: rig.root, mixer: rig.mixer, clips: rig.clips };
    const p = game.player.position;
    this.e.m.position.set(p.x + 1.5, 0, p.z + 1);
    game.world.scene.add(this.e.m);
    playClip(this.e, 'idle', 0);
    const label = makeLabel('🐕 콩이', { color: '#5a3a1a', bg: 'rgba(255,248,230,0.92)', size: 30, scale: 0.0042 });
    label.position.y = 1.15;
    this.e.m.add(label);
    this.label = label;
    this.idleT = 0;
    this.petT = 0;
    this.vel = 0;
    this.sim = new PetSim();
    this.trick = null; // { id, t }
    this.digging = null; // { t, x, z }
  }

  load(s) { this.sim.load(s); this._label(); }
  toJSON() { return this.sim.toJSON(); }

  _label() {
    if (!this.ok) return;
    const sim = this.sim, txt = `🐕 ${sim.name} ${'❤️'.repeat(sim.hearts) || '🤍'}${sim.mood === 'hungry' ? ' 💧배고파요' : ''}`;
    if (txt === this._lt) return;
    this._lt = txt;
    const old = this.label;
    this.label = makeLabel(txt, { color: '#5a3a1a', bg: 'rgba(255,248,230,0.92)', size: 30, scale: 0.0042 });
    this.label.position.y = 1.15;
    this.e.m.remove(old); old.userData.dispose?.();
    this.e.m.add(this.label);
  }

  update(dt, playerPos, hidden = false) {
    if (!this.ok) return null;
    const e = this.e, p = e.m.position;
    e.m.visible = !hidden;
    if (this.chaseT > 0) { this.chaseT -= dt; playerPos = this.chaseTo; } // 쫓기 중엔 목표가 해로운 동물
    const dx = playerPos.x - p.x, dz = playerPos.z - p.z, d = Math.hypot(dx, dz);
    if (d > 22) { // 순간이동(체험관 이동 등) 따라가기
      p.set(playerPos.x - 1.2, 0, playerPos.z + 1.2);
      this.vel = 0;
    }
    // 키우기: 배고픔·애정, 행복하면 가끔 땅을 팜
    if (this.sim.tick(dt) === 'dig' && !this.digging && !this.trick) {
      const a = Math.random() * Math.PI * 2;
      this.digging = { t: 0, x: playerPos.x + Math.cos(a) * 2.2, z: playerPos.z + Math.sin(a) * 2.2 };
    }
    this._label();
    if (this.trick) return this._doTrick(dt, d);
    if (this.digging) return this._doDig(dt, playerPos);
    let want = 0;
    if (this.petT > 0) this.petT -= dt;
    else if (this.chaseT > 0) want = d > 1.2 ? 6 : 0;
    else if (d > 6) want = this.sim.mood === 'hungry' ? 3.4 : 5.2; // 배고프면 기운이 없음
    else if (d > 2.2) want = this.sim.mood === 'hungry' ? 1.7 : 2.4;
    this.vel += (want - this.vel) * (1 - Math.exp(-dt * 5));
    if (this.vel > 0.05 && d > 0.6) {
      // 몸을 돌리면서 바라보는 방향으로 달림 (옆걸음 방지)
      const yaw = Math.atan2(dx, dz);
      const diff = ((yaw - e.m.rotation.y + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
      e.m.rotation.y += diff * (1 - Math.exp(-dt * 7));
      const step = this.vel * dt * Math.max(0.15, Math.cos(diff));
      const next = (this._next ||= new THREE.Vector3()).set(p.x + Math.sin(e.m.rotation.y) * step, 0, p.z + Math.cos(e.m.rotation.y) * step);
      this.game.world.resolveCollision(next, 0.3);
      p.copy(next);
      playClip(e, this.vel > 3.6 ? 'run' : 'walk', 0.25);
      this.idleT = 0;
    } else {
      this.idleT += dt;
      if (this.petT > 0) playClip(e, 'look');
      else playClip(e, this.idleT > 6 ? 'idle2' : this.idleT > 3 ? 'look' : 'idle', 0.4);
      if (this.idleT > 12) this.idleT = 0;
    }
    p.y = heightAt(p.x, p.z);
    const rate = e.cur === 'walk' ? this.vel / 1.6 : e.cur === 'run' ? this.vel / 4.5 : 1;
    e.mixer.update(dt * THREE.MathUtils.clamp(rate, 0.5, 1.8));
    // 이름표는 가까울 때만 (화면 정리), 쓰다듬기는 다른 할 일보다 우선순위 낮게
    this.label.visible = d < 4.5;
    if (this.sim.found && d < 2 && !hidden) return { d: d - 0.5, label: `🐕 ${this.sim.name}가 찾아 온 것 받기`, key: 'petfind', onInteract: () => this.takeFound() };
    if (d < 1.4 && !hidden) return { d: d + 1.2, label: `🐕 ${this.sim.name} 돌보기`, key: 'pet', onInteract: () => this.care() };
    return null;
  }

  _mix(dt, rate = 1) { this.e.mixer.update(dt * rate); this.e.m.position.y = heightAt(this.e.m.position.x, this.e.m.position.z) + (this._hop || 0); }

  /** 재주: 앉아(앉는 동작) · 빙글빙글(제자리 한 바퀴 달리기) · 점프 · 손!(앉아서 앞발 톡) · 춤추기(통통 뛰며 좌우로 흔들고 한 바퀴) */
  _doTrick(dt, d) {
    const tr = this.trick, e = this.e, g = this.game, p = e.m.position;
    const prev = tr.t;
    tr.t += dt;
    const at = (s) => prev < s && tr.t >= s; // 이번 프레임에 s 초를 지났나
    if (tr.id === 'sit') { playClip(e, 'idle2', 0.2); }
    else if (tr.id === 'spin') { playClip(e, 'run', 0.15); e.m.rotation.y += dt * Math.PI * 2 / 1.1; }
    else if (tr.id === 'jump') { playClip(e, 'jump', 0.1); this._hop = Math.max(0, Math.sin(Math.min(1, tr.t / 0.7) * Math.PI)) * 0.55; }
    else if (tr.id === 'paw') {
      // 주인 쪽을 보고 앉았다가 앞발을 톡 (몸이 살짝 들림), 주인은 손바닥을 내밀며 하트
      const pp = g.player.position; e.m.rotation.y = Math.atan2(pp.x - p.x, pp.z - p.z);
      playClip(e, 'idle2', 0.2);
      this._hop = tr.t > 0.7 && tr.t < 1.3 ? Math.sin((tr.t - 0.7) / 0.6 * Math.PI) * 0.12 : 0;
      if (at(0.75)) { g.fx.pop(p.x, p.z, '🐾'); g.audio.play('pop', 0.6); g.player.unico.playAction('heart', 1.1); }
    } else if (tr.id === 'dance') {
      // 통통 뛰며 좌우로 흔들다가 마지막에 한 바퀴, 박자마다 음표
      playClip(e, tr.t < 1.8 ? 'jump' : 'run', 0.12);
      this._hop = Math.abs(Math.sin(tr.t * Math.PI * 2.5)) * 0.22;
      if (tr.t < 1.8) e.m.rotation.y += Math.cos(tr.t * Math.PI * 2.5) * dt * 3.2;
      else e.m.rotation.y += dt * Math.PI * 2 / 0.8;
      for (let k = 0; k < 5; k++) if (at(0.2 + k * 0.4)) { g.fx.pop(p.x, p.z, k % 2 ? '🎶' : '🎵'); g.audio.pluck([784, 988, 1175, 988, 1319][k], 0.35, 0, undefined, 0.12); }
    }
    this._mix(dt);
    if (tr.t > (TRICK_TIME[tr.id] || 1.2)) {
      this.trick = null; this._hop = 0;
      this.game.fx.pop(e.m.position.x, e.m.position.z, '✨');
    }
    this.label.visible = d < 4.5;
    return null;
  }

  /** 땅 파기: 그 자리로 가서 코를 박고 흙을 튀기다가 무언가를 찾아 옴 */
  _doDig(dt, playerPos) {
    const g = this.game, dg = this.digging, e = this.e, p = e.m.position;
    const dx = dg.x - p.x, dz = dg.z - p.z, d = Math.hypot(dx, dz);
    if (d > 0.3 && dg.t === 0) {
      e.m.rotation.y = Math.atan2(dx, dz);
      const step = Math.min(d, 2.4 * dt);
      p.x += Math.sin(e.m.rotation.y) * step; p.z += Math.cos(e.m.rotation.y) * step;
      playClip(e, 'walk', 0.2);
      this._mix(dt, 1.5);
      return null;
    }
    dg.t += dt;
    playClip(e, 'eat', 0.3);
    if (Math.random() < dt * 6) g.fx.dust(p.x + Math.sin(e.m.rotation.y) * 0.4, p.z + Math.cos(e.m.rotation.y) * 0.4);
    this._mix(dt);
    if (dg.t > 2.6) {
      this.digging = null;
      const f = this.sim.dig();
      g.audio.play('bark');
      g.fx.pop(p.x, p.z, f.type === 'coin' ? '🪙' : f.type === 'seed' ? '🌱' : '🎁');
      g.ui.toast(`🐕 ${this.sim.name}가 땅을 파서 무언가를 찾았어요! 가까이 가서 받아 주세요`);
    }
    void playerPos;
    return null;
  }

  takeFound() {
    const g = this.game, eco = g.economy, f = this.sim.take();
    if (!f) return;
    let text;
    if (f.type === 'coin') { eco.earn(f.n); text = `🪙 ${f.n} 코인`; }
    else if (f.type === 'seed') {
      const ks = Object.keys(CROPS).filter((k) => CROPS[k].unlockLevel <= g.quests.level), k = ks[Math.floor(Math.random() * ks.length)];
      eco.inventory.seeds[k] = (eco.inventory.seeds[k] || 0) + 2; text = `${CROPS[k].emoji} ${CROPS[k].name} 씨앗 2개`;
    } else { eco.addItem('fruit_apple', 1); eco.addItem('pet_treat', 1); text = `${ITEMS.fruit_apple.emoji} 사과와 🦴 간식`; }
    g.audio.play('coin');
    g.player.unico.playAction('heart', 1);
    g.ui.toast(`🐕 ${this.sim.name}가 ${text}을(를) 물어 왔어요! 착하다~`);
    this.sim.affection = Math.min(100, this.sim.affection + 2);
  }

  /** 돌보기 대화: 쓰다듬기 · 간식/작물 주기 · 재주 · 이름 짓기 */
  async care() {
    const g = this.game, sim = this.sim, eco = g.economy;
    if (g.dialogue.active) return;
    const p = this.e.m.position, pp = g.player.position;
    this.e.m.rotation.y = Math.atan2(pp.x - p.x, pp.z - p.z);
    g.player.unico.facing = Math.atan2(p.x - pp.x, p.z - pp.z);
    g.cinema.focusTalk(pp, p);
    g.cinema.hideLabelsOf(g.player.unico);
    this.label.visible = false;
    const treats = eco.count('pet_treat');
    const crop = Object.keys(eco.inventory.crops).find((k) => eco.inventory.crops[k] > 0);
    const moodText = { hungry: '배가 고파서 기운이 없어 보여요…', happy: '꼬리를 신나게 흔들고 있어요!', calm: '얌전히 기다리고 있어요.' }[sim.mood];
    const choices = [
      { label: '🤲 쓰다듬기', value: 'pet', note: sim.petCool > 0 ? '방금 쓰다듬었어요 (조금 뒤에 애정이 올라요)' : '' },
      { label: `🦴 간식 주기 (보유 ${treats})`, value: 'treat', disabled: !treats || sim.hunger >= 98, note: treats ? '' : '장터에서 강아지 간식을 살 수 있어요' },
    ];
    if (crop) choices.push({ label: `${CROPS[crop].emoji} ${CROPS[crop].name} 나눠 주기`, value: 'crop', disabled: sim.hunger >= 98 });
    for (const t of TRICKS) choices.push({ label: `${t.emoji} 재주: ${t.name}`, value: 'trick:' + t.id, disabled: !sim.unlocked(t.id), note: sim.unlocked(t.id) ? '' : `하트 ${t.hearts}개가 되면 배워요` });
    choices.push({ label: '✏️ 이름 짓기', value: 'name' }, { label: '👋 그만', value: 'bye' });
    const c = await g.dialogue.say({ speaker: null, portrait: 'dog', name: `🐕 ${sim.name}`, color: '#e39a4a', sub: `애정 ${'❤️'.repeat(sim.hearts)}${'🤍'.repeat(5 - sim.hearts)} · 배부름 ${Math.round(sim.hunger)}%`, text: `${sim.name}는 ${moodText}`, choices });
    g.cinema.release();
    if (c === 'pet') this.pet();
    else if (c === 'treat' && eco.take('pet_treat', 1)) this._fed(sim.feed('treat'), '🦴');
    else if (c === 'crop' && eco.take(crop, 1)) this._fed(sim.feed('crop'), CROPS[crop].emoji);
    else if (c?.startsWith('trick:')) { this.trick = { id: c.slice(6), t: 0 }; g.audio.play('bark'); g.player.unico.playAction('present', 1); }
    else if (c === 'name') {
      const n = (prompt('반려견 이름을 지어 주세요 (최대 6글자)', sim.name) || '').trim().slice(0, 6);
      if (n) { sim.name = n; this._lt = ''; this._label(); g.ui.toast(`🐕 이제 이름은 '${n}'!`); }
    }
  }

  _fed(r, emoji) {
    const g = this.game, p = this.e.m.position;
    if (!r) return g.ui.toast('🐕 배가 불러서 더 못 먹겠대요');
    this.petT = 2; playClip(this.e, 'eat', 0.2);
    g.audio.play('plant');
    g.fx.pop(p.x, p.z, emoji);
    g.ui.toast(`🐕 ${this.sim.name}가 맛있게 먹었어요! 배부름 +${r.hunger}, 애정 +${r.affection}`);
    g.onEvent?.('petfeed');
  }

  /** 해로운 동물을 쫓을 때: 짖으며 그쪽으로 달려들었다가 돌아옴 */
  chase(pos) {
    if (!this.ok) return;
    this.chaseT = 2.2; this.chaseTo = pos.clone();
    this.game.audio.play('bark');
    setTimeout(() => this.game.audio.play('bark', 0.8), 450);
  }

  pet() {
    const g = this.game;
    const gain = this.sim.pet();
    if (gain) g.ui.toast(`💕 ${this.sim.name} 애정 +${gain} (${'❤️'.repeat(this.sim.hearts) || '🤍'})`);
    this.petT = 2;
    this.idleT = 0;
    const p = this.e.m.position;
    this.e.m.rotation.y = Math.atan2(g.player.position.x - p.x, g.player.position.z - p.z);
    g.audio.play('plant');
    g.player.unico.playAction('heart', 1.2);
    g.fx.pop(p.x, p.z, '💕');
    g.onEvent?.('pet');
  }
}
