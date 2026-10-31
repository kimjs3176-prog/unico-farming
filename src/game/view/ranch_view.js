import * as THREE from 'three';
import { RanchSim } from '../sim/ranch.js';
import { LAYOUT } from '../world.js';
import { PRODUCTS, ANIMALS } from '../sim/crops.js';
import { makeLabel } from '../label.js';

const ANIMAL_LIST = [
  { type: 'cow' }, { type: 'cow' }, { type: 'cow' },
  { type: 'sheep' }, { type: 'sheep' }, { type: 'sheep' },
  { type: 'chicken' }, { type: 'chicken' }, { type: 'chicken' }, { type: 'chicken' },
];

/** 목장: 동물 배회 + 사료/수확 상호작용 */
export class RanchView {
  constructor(game) {
    this.game = game;
    this.sim = new RanchSim(ANIMAL_LIST);
    const R = LAYOUT.ranch;
    this.ents = this.sim.animals.map((a) => {
      const m = game.assets.clone(a.type);
      const x = R.x0 + 2 + Math.random() * (R.x1 - R.x0 - 4), z = R.z0 + 2 + Math.random() * (R.z1 - R.z0 - 4);
      m.position.set(x, 0, z);
      game.world.scene.add(m);
      const legs = ['LegFL', 'LegFR', 'LegBL', 'LegBR'].map((n) => m.getObjectByName(n)).filter(Boolean);
      const head = m.getObjectByName('Head');
      const mark = makeLabel('!', { color: '#231916', bg: '#ffe066', size: 40 });
      mark.position.y = a.type === 'chicken' ? 1.2 : 2.2;
      mark.visible = false;
      m.add(mark);
      return { a, m, legs, head, mark, target: new THREE.Vector2(x, z), wait: Math.random() * 3, t: Math.random() * 10, speed: a.type === 'chicken' ? 1.2 : 0.8 };
    });
    this.near = null;
  }

  update(dt, playerPos) {
    const R = LAYOUT.ranch;
    for (const r of this.sim.tick(dt)) this.game.ui.toast(`${ANIMALS[r.type].emoji} ${PRODUCTS[r.product].name}이(가) 준비됐어요!`);
    let best = null, bd = 2.4;
    for (const e of this.ents) {
      e.t += dt;
      e.mark.visible = !!e.a.product;
      // 배회
      const p = e.m.position;
      const dx = e.target.x - p.x, dz = e.target.y - p.z, d = Math.hypot(dx, dz);
      if (d < 0.3) {
        e.wait -= dt;
        if (e.wait <= 0) { e.target.set(R.x0 + 2 + Math.random() * (R.x1 - R.x0 - 4), R.z0 + 2 + Math.random() * (R.z1 - R.z0 - 4)); e.wait = 2 + Math.random() * 5; }
        for (const l of e.legs) l.rotation.x *= 0.9;
        if (e.head) e.head.rotation.x = Math.sin(e.t * 1.5) * 0.15 + 0.1; // 풀 뜯기
      } else {
        const step = Math.min(d, e.speed * dt);
        const nx = p.x + (dx / d) * step, nz = p.z + (dz / d) * step;
        p.x = nx; p.z = nz;
        e.m.rotation.y = Math.atan2(dx, dz);
        e.legs.forEach((l, i) => (l.rotation.x = Math.sin(e.t * 6 + (i % 2) * Math.PI) * 0.5));
        if (e.head) e.head.rotation.x = 0;
        if (e.a.type === 'chicken') p.y = Math.abs(Math.sin(e.t * 12)) * 0.08;
      }
      const dp = Math.hypot(p.x - playerPos.x, p.z - playerPos.z);
      if (dp < bd) { bd = dp; best = e; }
    }
    this.near = best;
    if (!best) return null;
    const act = this.sim.actionFor(best.a);
    const name = ANIMALS[best.a.type].name;
    if (act.type === 'wait') return { d: bd, label: `${name}: ${act.label}`, key: 'wait' };
    if (act.type === 'feed') return { d: bd, label: `${name}에게 ${act.label} (사료 ${this.game.economy.inventory.feed}개)`, key: 'feed', onInteract: () => this.feed(best) };
    return { d: bd, label: `${name}: ${act.label}`, key: 'collect', onInteract: () => this.collect(best) };
  }

  feed(e) {
    const g = this.game;
    if (!g.economy.useFeed()) return g.ui.toast('사료가 없어요. 장터에서 구매하세요 🛒');
    this.sim.feed(e.a);
    g.onEvent('feed');
    g.audio.play('plant');
    g.player.unico.playAction('heart', 1.2);
    g.fx.pop(e.m.position.x, e.m.position.z, '❤️');
  }

  collect(e) {
    const g = this.game;
    const p = this.sim.collect(e.a);
    if (!p) return;
    g.economy.addProduct(p, 1);
    g.onEvent('collect');
    g.audio.play('harvest');
    g.ui.toast(`${PRODUCTS[p].emoji} ${PRODUCTS[p].name} 획득!`);
    g.juice.pop(e.m, 0.2);
    g.fx.pop(e.m.position.x, e.m.position.z, PRODUCTS[p].emoji);
  }
}
