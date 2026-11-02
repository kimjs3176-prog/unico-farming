import * as THREE from 'three';
import { FarmSim } from '../sim/farm.js';
import { LAYOUT } from '../world.js';
import { CROPS } from '../sim/crops.js';

/** 경작지 3D 표현 + 근접 상호작용 */
// 갈지 않은 밭: 거친 흙 (지면 페인트 위에 살짝 진하게)
/** 한 칸 안 세 포기 위치 (삼각형) */
const PLANT_SPOTS = [[-0.42, -0.3], [0.42, -0.3], [0, 0.42]];

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
        this.tiles.push({ x, z, plot, empty, ring, crop: null, cropKey: '', drops: null, seed: (r * 7 + c * 13) % 10 });
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
      const grew = t.cropKey && key && t.cropKey.split('_')[0] === key.split('_')[0];
      t.cropKey = key;
      if (p.crop) {
        // 한 칸에 세 포기 (조금씩 다른 크기·방향) → 풍성한 밭
        t.crop = new THREE.Group();
        t.plants = PLANT_SPOTS.map(([dx, dz], k) => {
          const m = this.game.assets.cloneCrop(p.crop, stage);
          m.position.set(dx, 0, dz);
          m.rotation.y = (t.seed + k * 2.3) % 6.28;
          m.userData.jit = 0.9 + ((t.seed * 3 + k * 7) % 10) / 45; // 0.9~1.1
          m.userData.ph = t.seed + k * 1.7;
          t.crop.add(m);
          return m;
        });
        t.crop.position.set(t.x, 0.2, t.z);
        this.game.world.scene.add(t.crop);
        t.pop = grew ? 0.45 : 0.3; // 단계가 바뀌면 쑥 자라는 반동, 막 심으면 흙에서 솟아남
        if (grew) this.game.fx.burst?.(t.x, 0.6, t.z, stage === 2 ? 0xffd75a : 0xa9e07a, stage === 2 ? 14 : 8);
      }
    }
  }

  refreshAll() { this.tiles.forEach((_, i) => this.refresh(i)); }

  /** 시간에 따른 성장: 단계 안에서도 조금씩 커지고, 단계가 바뀌면 반동, 다 익으면 살랑+반짝 */
  _animateCrops(dt) {
    this.t = (this.t || 0) + dt;
    const ease = (x) => 1 - (1 - x) * (1 - x);
    this.tiles.forEach((t, i) => {
      if (!t.crop) return;
      const p = this.sim.plots[i];
      let g = 1;
      if (p.state === 'growing') {
        const pr = Math.min(1, p.progress * 2), st = Math.min(1, Math.floor(p.progress * 2));
        const local = st === 0 ? pr : p.progress * 2 - 1;
        g = st === 0 ? 0.3 + 0.7 * ease(local) : 0.72 + 0.28 * ease(local);
      }
      let pop = 1;
      if (t.pop > 0) { t.pop = Math.max(0, t.pop - dt); pop = 1 + Math.sin((1 - t.pop / 0.45) * Math.PI) * 0.22 * (t.pop / 0.45 + 0.3); }
      const ripe = p.state === 'ready';
      for (const m of t.plants) {
        const s = g * pop * m.userData.jit;
        const sway = Math.sin(this.t * 1.6 + m.userData.ph) * (ripe ? 0.06 : 0.035);
        m.scale.set(s, s * (ripe ? 1 + Math.sin(this.t * 2.2 + m.userData.ph) * 0.02 : 1), s);
        m.rotation.z = sway; m.rotation.x = sway * 0.6;
      }
      // 다 익은 칸: 이따금 반짝
      if (ripe) { t.sparkle = (t.sparkle ?? t.seed * 0.3) - dt; if (t.sparkle <= 0) { t.sparkle = 2.5 + (t.seed % 3); this.game.fx.burst?.(t.x, 0.9, t.z, 0xfff3a0, 5); } }
    });
  }

  update(dt, playerPos) {
    this._animateCrops(dt);
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
