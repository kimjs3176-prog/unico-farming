import * as THREE from 'three';
import { FarmSim } from '../sim/farm.js';
import { LAYOUT } from '../world.js';
import { CROPS } from '../sim/crops.js';

/** 경작지 3D 표현 + 근접 상호작용 */
// 갈지 않은 밭: 거친 흙 (지면 페인트 위에 살짝 진하게)
const EMPTY_MAT = new THREE.MeshStandardMaterial({ color: 0x8d6a45, roughness: 1, transparent: true, opacity: 0.85 });

export class FarmView {
  constructor(game) {
    this.game = game;
    const { cols, rows, tile, origin } = LAYOUT.farm;
    this.sim = new FarmSim(cols * rows);
    this.tiles = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = origin.x + (c - (cols - 1) / 2) * tile, z = origin.z + (r - (rows - 1) / 2) * tile;
        const plot = game.assets.clone('plot');
        plot.position.set(x, 0, z);
        plot.visible = false;
        game.world.scene.add(plot);
        // 빈 밭 표시(풀밭 위 연한 사각형)
        const empty = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 2.1), EMPTY_MAT);
        empty.rotation.x = -Math.PI / 2;
        empty.position.set(x, 0.015, z);
        empty.receiveShadow = true;
        game.world.scene.add(empty);
        const ring = new THREE.Mesh(new THREE.RingGeometry(1.22, 1.32, 4, 1, Math.PI / 4), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75, depthWrite: false }));
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(x, 0.03, z);
        ring.visible = false;
        game.world.scene.add(ring);
        this.tiles.push({ x, z, plot, empty, ring, crop: null, cropKey: '', drops: null });
      }
    }
    this.sim.on((type, i) => this.refresh(i));
    // 비로 물이 뿌려지면 흙 색만 갱신
    this.near = -1;
  }

  refresh(i) {
    const t = this.tiles[i], p = this.sim.plots[i];
    t.plot.visible = p.state !== 'empty';
    t.empty.visible = p.state === 'empty';
    // 물 준 흙은 어둡게
    t.plot.traverse((o) => { if (o.isMesh && !o.userData.mat) { o.userData.mat = o.material.clone(); o.material = o.userData.mat; o.userData.base = o.material.color.clone(); } });
    t.plot.traverse((o) => { if (o.isMesh) o.material.color.copy(o.userData.base).multiplyScalar(p.water > 0 ? 0.7 : 1); });
    const stage = this.sim.stage(i);
    const key = p.crop ? `${p.crop}_${stage}` : '';
    if (key !== t.cropKey) {
      if (t.crop) this.game.world.scene.remove(t.crop);
      t.crop = null;
      t.cropKey = key;
      if (p.crop) {
        t.crop = this.game.assets.cloneCrop(p.crop, stage);
        t.crop.position.set(t.x, 0.2, t.z);
        this.game.world.scene.add(t.crop);
      }
    }
  }

  refreshAll() { this.tiles.forEach((_, i) => this.refresh(i)); }

  update(dt, playerPos) {
    const stagesBefore = this.sim.plots.map((_, i) => `${this.sim.stage(i)}${this.sim.plots[i].water > 0}`);
    this.sim.tick(dt);
    this.sim.plots.forEach((_, i) => { if (`${this.sim.stage(i)}${this.sim.plots[i].water > 0}` !== stagesBefore[i]) this.refresh(i); });
    // 가장 가까운 플롯
    let best = -1, bd = 2.2;
    this.tiles.forEach((t, i) => { const d = Math.hypot(t.x - playerPos.x, t.z - playerPos.z); if (d < bd) { bd = d; best = i; } });
    this.nearD = bd;
    if (best !== this.near) {
      if (this.near >= 0) this.tiles[this.near].ring.visible = false;
      this.near = best;
      if (best >= 0) this.tiles[best].ring.visible = true;
    }
    if (best >= 0) {
      const eco = this.game.economy;
      const hasSeed = Object.values(eco.inventory.seeds).some((n) => n > 0);
      const act = this.sim.actionFor(best, hasSeed);
      return act ? { d: bd, label: act.label, key: act.type, onInteract: () => this.interact(best, act.type) } : null;
    }
    return null;
  }

  interact(i, type) {
    const g = this.game;
    if (type === 'till') { this.sim.till(i); g.onEvent('till'); g.audio.play('dig'); g.juice.shake(0.2); g.player.unico.playAction('think', 0.6); }
    else if (type === 'plant') g.ui.openSeedPicker((crop) => {
      if (g.economy.useSeed(crop) && this.sim.plant(i, crop)) { g.onEvent('plant'); g.audio.play('plant'); g.ui.toast(`${CROPS[crop].emoji} ${CROPS[crop].name} 씨앗을 심었어요`); }
    });
    else if (type === 'need_seed') g.ui.toast('씨앗이 없어요. 장터에서 씨앗을 구매하세요 🛒');
    else if (type === 'water') { this.sim.water(i); g.onEvent('water'); g.audio.play('water'); g.player.unico.playAction('water', 1.4); g.fx.sprinkle(this.tiles[i].x, this.tiles[i].z); }
    else if (type === 'harvest') {
      const r = this.sim.harvest(i);
      if (r) { g.economy.addCrop(r.crop, r.amount); g.onEvent('harvest', r.amount); g.audio.play('harvest'); g.player.unico.playAction('cheer', 1.2); g.juice.pop(g.player.group, 0.18); g.ui.toast(`${CROPS[r.crop].emoji} ${CROPS[r.crop].name} ×${r.amount} 수확!`); g.fx.pop(this.tiles[i].x, this.tiles[i].z, CROPS[r.crop].emoji); }
    }
  }
}
