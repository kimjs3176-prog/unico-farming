import * as THREE from 'three';
import { playClip } from './ranch_view.js';
import { makeLabel } from '../label.js';

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
  }

  update(dt, playerPos, hidden = false) {
    if (!this.ok) return null;
    const e = this.e, p = e.m.position;
    e.m.visible = !hidden;
    const dx = playerPos.x - p.x, dz = playerPos.z - p.z, d = Math.hypot(dx, dz);
    if (d > 22) { // 순간이동(체험관 이동 등) 따라가기
      p.set(playerPos.x - 1.2, 0, playerPos.z + 1.2);
      this.vel = 0;
    }
    let want = 0;
    if (this.petT > 0) this.petT -= dt;
    else if (d > 6) want = 5.2;
    else if (d > 2.2) want = 2.4;
    this.vel += (want - this.vel) * Math.min(1, dt * 5);
    if (this.vel > 0.05 && d > 0.6) {
      const step = this.vel * dt;
      const next = new THREE.Vector3(p.x + (dx / d) * step, 0, p.z + (dz / d) * step);
      this.game.world.resolveCollision(next, 0.3);
      p.copy(next);
      const yaw = Math.atan2(dx, dz);
      const diff = ((yaw - e.m.rotation.y + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
      e.m.rotation.y += diff * Math.min(1, dt * 8);
      playClip(e, this.vel > 3.6 ? 'run' : 'walk', 0.25);
      this.idleT = 0;
    } else {
      this.idleT += dt;
      if (this.petT > 0) playClip(e, 'look');
      else playClip(e, this.idleT > 6 ? 'idle2' : this.idleT > 3 ? 'look' : 'idle', 0.4);
      if (this.idleT > 12) this.idleT = 0;
    }
    const rate = e.cur === 'walk' ? this.vel / 1.6 : e.cur === 'run' ? this.vel / 4.5 : 1;
    e.mixer.update(dt * THREE.MathUtils.clamp(rate, 0.5, 1.8));
    // 이름표는 가까울 때만 (화면 정리), 쓰다듬기는 다른 할 일보다 우선순위 낮게
    this.label.visible = d < 4.5;
    if (d < 1.4 && !hidden) return { d: d + 1.2, label: '🐕 콩이 쓰다듬기', key: 'pet', onInteract: () => this.pet() };
    return null;
  }

  pet() {
    const g = this.game;
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
