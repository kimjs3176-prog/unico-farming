import { josa } from '../sim/josa.js';
import * as THREE from 'three';
import { HILLS, CHESTS, heightAt } from '../terrain.js';
import { CROPS } from '../sim/crops.js';
import { ITEMS } from '../sim/items.js';

/**
 * 언덕 탐험: 꼭대기 전망대(처음 오르면 파노라마 연출 + 보상), 비탈의 숨은 보물 상자(하루 한 번)
 */
export class ExploreView {
  constructor(game) {
    this.game = game;
    const W = game.world;
    this.seen = {};   // 전망대 id → true
    this.opened = {}; // 상자 id → 연 날
    this.t = 0;
    // 전망대: 나무 데크 + 벤치 + 이름 표지판
    this.lookouts = HILLS.map((H) => {
      const L = H.lookout;
      W.place('dock', L.x, L.z, L.rot, 0.75, { collide: false, dynamic: true });
      const fx = Math.sin(L.rot), fz = Math.cos(L.rot);
      W.place('bench', L.x - fx * 0.9, L.z - fz * 0.9, L.rot + Math.PI, 1, { r: 0.6 });
      const sign = W.place('sign', L.x + fz * 2.2, L.z - fx * 2.2, L.rot, 1, { collide: false, dynamic: true });
      W.signText(sign, `⛰️ ${H.name}`, '전망대 · 올라와 보세요');
      return { H, x: L.x, z: L.z };
    });
    // 보물 상자: 나무 상자 + 금빛 띠, 근처에 오면 반짝
    this.chests = CHESTS.map((c) => {
      const m = game.assets.clone('crate');
      m.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.color.multiply(new THREE.Color(0xffe0a0)); o.material.emissive = new THREE.Color(0x553300); o.material.emissiveIntensity = 0.25; } });
      m.scale.setScalar(0.8);
      m.position.set(c.x, heightAt(c.x, c.z) - 0.05, c.z);
      m.rotation.y = (c.x * 7 + c.z * 3) % 6.28;
      W.scene.add(m);
      return { ...c, m, glint: Math.random() * 3 };
    });
  }

  toJSON() { return { seen: this.seen, opened: this.opened }; }
  load(s) { if (!s) return; this.seen = s.seen || {}; this.opened = s.opened || {}; }

  available(c) { return this.opened[c.id] !== this.game.world.day; }

  update(dt, pp) {
    this.t += dt;
    let best = null;
    for (const c of this.chests) {
      const ok = this.available(c);
      c.m.visible = ok;
      if (!ok) continue;
      c.m.position.y = heightAt(c.x, c.z) - 0.05 + Math.max(0, Math.sin(this.t * 2 + c.glint)) * 0.04;
      const d = Math.hypot(c.x - pp.x, c.z - pp.z);
      c.glint -= dt;
      if (d < 14 && c.glint <= 0) { c.glint = 1.6 + Math.random(); this.game.fx.burst(c.x, c.m.position.y + 0.7, c.z, 0xffe27a, 5); }
      if (d < 1.7 && (!best || d < best.d)) best = { d, label: '🎁 숨은 보물 상자 열기', key: 'chest', onInteract: () => this.openChest(c) };
    }
    for (const L of this.lookouts) {
      const d = Math.hypot(L.x - pp.x, L.z - pp.z);
      if (d < 2.6 && (!best || d < best.d)) best = { d, label: `🔭 ${L.H.name}에서 경치 감상${this.seen[L.H.id] ? '' : ' (첫 방문 보상!)'}`, key: 'lookout', onInteract: () => this.view(L) };
    }
    return best;
  }

  /** 전망 감상: 꼭대기를 천천히 도는 카메라 + 한마디. 첫 방문이면 보상 */
  view(L) {
    const g = this.game, H = L.H, hy = heightAt(H.x, H.z);
    const first = !this.seen[H.id];
    const toCenter = Math.atan2(-H.x, -H.z); // 마을 쪽
    const cx = H.x + Math.sin(toCenter + Math.PI) * 7, cz = H.z + Math.cos(toCenter + Math.PI) * 7;
    g.player.unico.facing = toCenter;
    g.player.unico.playAction('cheer', 1.2);
    const me = { speaker: g.player.unico, name: `⭐ ${g.playerName}`, color: '#30b6aa' };
    const count = Object.keys(this.seen).length + (first ? 1 : 0);
    g.cinema.play([
      { cam: [[cx, hy + 6.5, cz], [H.x + Math.sin(toCenter) * 18, 1, H.z + Math.cos(toCenter) * 18], 2.2] },
      { cam: [[cx, hy + 6.5, cz], [H.x, hy + 1.2, H.z], 3.6, { orbit: 0.22 }] },
      { say: [{ ...me, text: first ? `와… ${H.name}에서 보니 농장이 한눈에 보여! (전망대 ${count}/${HILLS.length})` : `역시 ${H.name} 경치는 언제 봐도 좋아.` }] },
      { run: () => {
        if (!first) return;
        this.seen[H.id] = true;
        g.economy.earn(100);
        g.audio.play('levelup');
        g.fx.burst(L.x, hy + 1.2, L.z, 0xfff3a0, 18);
        g.ui.toast(`🔭 ${H.name} 전망대 첫 방문! +100🪙 (${count}/${HILLS.length})`);
        g.onEvent('lookout', count);
      } },
    ]);
  }

  /** 보물: 코인 / 씨앗 / 과일 중 하나 (하루에 한 번씩 다시 채워짐) */
  openChest(c) {
    const g = this.game, eco = g.economy;
    this.opened[c.id] = g.world.day;
    const r = Math.random();
    let text;
    if (r < 0.5) { const n = 60 + Math.floor(Math.random() * 11) * 10; eco.earn(n); text = `🪙 ${n} 코인`; }
    else if (r < 0.78) {
      const crops = Object.keys(CROPS).filter((k) => CROPS[k].unlockLevel <= g.quests.level);
      const k = crops[Math.floor(Math.random() * crops.length)];
      eco.inventory.seeds[k] = (eco.inventory.seeds[k] || 0) + 3;
      text = `${CROPS[k].emoji} ${CROPS[k].name} 씨앗 3개`;
    } else {
      const k = ['fruit_apple', 'fruit_peach', 'fruit_pear', 'fruit_persimmon'][Math.floor(Math.random() * 4)];
      eco.addItem(k, 2);
      text = `${ITEMS[k].emoji} ${ITEMS[k].name} 2개`;
    }
    g.audio.play('coin');
    g.audio.play('win', 0.6);
    g.player.unico.playAction('cheer', 1.2);
    g.fx.burst(c.x, c.m.position.y + 0.6, c.z, 0xffd75a, 20);
    g.fx.pop(c.x, c.z, '🎁');
    g.ui.toast(`🎁 보물 상자에서 ${text}${josa(text, '을/를')} 찾았어요! (내일 다시 채워져요)`);
    g.onEvent('chest');
  }
}
