import * as THREE from 'three';
import { LAYOUT } from '../world.js';
import { heightAt } from '../terrain.js';
import { makeLabel } from '../label.js';
import { radialTexture } from '../world.js';

const FILL_TIME = 150; // 꿀이 가득 차는 데 걸리는 시간(초, 낮·맑은 날 기준)

/** 양봉: 벌통 주위를 벌들이 날고, 낮에 꿀이 차면 거두기 (비·밤에는 벌이 쉼) */
export class Bees {
  constructor(game) {
    this.game = game;
    const W = game.world;
    this.hives = LAYOUT.hives.map((h, i) => {
      W.place('beehive', h.x, h.z, 0.4 + i * 0.7, 1, { r: 0.5 });
      const label = makeLabel('🍯', { color: '#5a3a1a', bg: 'rgba(255,224,102,0.95)', size: 40 });
      label.position.set(h.x, heightAt(h.x, h.z) + 1.8, h.z);
      label.visible = false;
      W.scene.add(label);
      return { ...h, honey: Math.random() * 0.6, label };
    });
    // 벌: 벌통마다 8마리, 노란 점이 8자로 날아다님
    const N = this.hives.length * 8;
    this.pos = new Float32Array(N * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffc53a, size: 0.13, map: radialTexture(), transparent: true, depthWrite: false, sizeAttenuation: true }));
    this.points.frustumCulled = false;
    W.scene.add(this.points);
    this.t = 0;
  }

  toJSON() { return this.hives.map((h) => +h.honey.toFixed(3)); }
  load(s) { if (Array.isArray(s)) s.forEach((v, i) => { if (this.hives[i]) this.hives[i].honey = v; }); }

  update(dt, pp) {
    const g = this.game, W = g.world;
    this.t += dt;
    const working = W.daylight > 0.35 && !['rain', 'storm', 'snow'].includes(W.weatherKind);
    let k = 0, best = null;
    for (const h of this.hives) {
      if (working && h.honey < 1) h.honey = Math.min(1, h.honey + dt / FILL_TIME);
      h.label.visible = h.honey >= 1;
      h.label.position.y = heightAt(h.x, h.z) + 1.8 + Math.sin(this.t * 2) * 0.06;
      const y0 = heightAt(h.x, h.z);
      for (let b = 0; b < 8; b++, k++) {
        const ph = this.t * (1.6 + b * 0.13) + b * 0.8;
        const r = working ? 0.7 + (b % 3) * 0.35 : 0.25;
        this.pos[k * 3] = h.x + Math.sin(ph) * r;
        this.pos[k * 3 + 1] = y0 + (working ? 0.9 + Math.sin(ph * 2.3) * 0.35 + (b % 2) * 0.3 : 0.55);
        this.pos[k * 3 + 2] = h.z + Math.sin(ph * 2) * r * 0.6;
      }
      const d = Math.hypot(h.x - pp.x, h.z - pp.z);
      if (d < 1.9 && (!best || d < best.d)) {
        best = h.honey >= 1
          ? { d, label: '🍯 꿀 거두기', key: 'honey', onInteract: () => this.collect(h) }
          : { d: d + 1, label: `🐝 꿀 모으는 중 ${Math.floor(h.honey * 100)}%${working ? '' : ' (벌들이 쉬는 중)'}`, key: 'hive' };
      }
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    if (best && working && Math.random() < dt * 1.5) g.audio.tone(220 + Math.random() * 40, 0.25, 'sawtooth', 0.012, 10, { lp: 700, rev: 0.05 }); // 윙윙
    return best;
  }

  collect(h) {
    const g = this.game;
    h.honey = 0;
    g.economy.addProduct('honey', 1);
    g.audio.play('harvest');
    g.player.unico.playAction('heart', 1);
    g.fx.pop(h.x, h.z, '🍯');
    g.fx.burst(h.x, heightAt(h.x, h.z) + 1, h.z, 0xffc53a, 10);
    g.ui.toast('🍯 달콤한 꿀 1병을 거뒀어요! 장터에서 팔 수 있어요');
    g.onEvent('honey');
  }
}
