import * as THREE from 'three';
import { FarmSim } from '../sim/farm.js';
import { LAYOUT } from '../world.js';
import { CROPS } from '../sim/crops.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** 경작지 3D 표현 + 근접 상호작용 */
// 갈지 않은 밭: 거친 흙 (지면 페인트 위에 살짝 진하게)
/** 한 칸 안 세 포기 위치 (삼각형) */
const PLANT_SPOTS = [[-0.42, -0.3], [0.42, -0.3], [0, 0.42]];

/** 잡초 (가늘고 뾰족한 풀 다발) */
const WEED_GEO = (() => {
  const parts = [];
  for (let k = 0; k < 7; k++) {
    const c = new THREE.ConeGeometry(0.045, 0.32 + (k % 3) * 0.08, 4);
    c.rotateZ(((k % 2) - 0.5) * 0.5).rotateY(k * 0.9);
    c.translate(Math.cos(k * 2.1) * 0.12, 0.16, Math.sin(k * 2.1) * 0.12);
    parts.push(c);
  }
  return mergeGeometries(parts);
})();
const FERT_TINT = new THREE.Color(0.78, 0.68, 0.62);
const WEED_MAT = new THREE.MeshStandardMaterial({ color: 0x5e8f2e, roughness: 0.9 });

/** 빈 밭 흙 질감: 고랑 줄무늬 + 흙 알갱이 + 가장자리는 풀밭으로 부드럽게 사라짐 (딱 잘린 사각형처럼 보이지 않게) */
function soilTexture() {
  if (typeof document === 'undefined') return null;
  const N = 128, c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d'), img = g.createImageData(N, N);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / (N - 1), v = y / (N - 1);
    const furrow = 0.5 + 0.5 * Math.cos(v * Math.PI * 2 * 5);        // 고랑 5줄
    const grain = rnd();
    const shade = 0.78 + furrow * 0.26 + (grain - 0.5) * 0.16;
    const edge = Math.min(u, 1 - u, v, 1 - v);                        // 가장자리까지 거리
    const a = Math.min(1, edge / 0.12) ** 1.5;
    const i = (y * N + x) * 4;
    img.data[i] = 141 * shade; img.data[i + 1] = 106 * shade; img.data[i + 2] = 69 * shade;
    img.data[i + 3] = 255 * a * (grain > 0.985 ? 0.6 : 1);           // 군데군데 흙덩이 틈
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
const EMPTY_MAT = new THREE.MeshStandardMaterial({ color: 0xffffff, map: soilTexture(), roughness: 1, transparent: true, opacity: 0.95, depthWrite: false });

export class FarmView {
  constructor(game) {
    this.game = game;
    const { cols, rows, tile, origin } = LAYOUT.farm;
    this.sim = new FarmSim(cols * rows);
    this.sim.weedChance = 1 / 160; // 자라는 밭에 가끔 잡초 (호미로 김매기)
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
    if (p.weeds && !t.weeds) {
      t.weeds = new THREE.Group();
      for (const [dx, dz] of [[-0.7, 0.55], [0.65, 0.2], [-0.05, -0.75], [0.75, -0.65]]) { const w = new THREE.Mesh(WEED_GEO, WEED_MAT); w.position.set(dx, 0.12, dz); w.rotation.y = dx * 5; t.weeds.add(w); }
      t.weeds.position.set(t.x, 0, t.z);
      this.game.world.scene.add(t.weeds);
    }
    if (t.weeds) t.weeds.visible = !!p.weeds;
    t.empty.visible = p.state === 'empty';
    // 물 준 흙은 어둡게
    t.plot.traverse((o) => { if (o.isMesh && !o.userData.mat) { o.userData.mat = o.material.clone(); o.material = o.userData.mat; o.userData.base = o.material.color.clone(); } });
    // 물 준 흙은 어둡게, 퇴비 준 흙은 검붉은 기름진 흙
    t.plot.traverse((o) => { if (o.isMesh) { o.material.color.copy(o.userData.base).multiplyScalar(p.water > 0 ? 0.7 : 1); if (p.fert) o.material.color.multiply(FERT_TINT); } });
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
      // 대왕 작물: 다 익으면 포기가 쑥 커짐
      t.giantK = (t.giantK || 1) + (((p.giant && ripe) ? 2.2 : 1) - (t.giantK || 1)) * Math.min(1, dt * 3);
      for (const m of t.plants) {
        const s = g * pop * m.userData.jit * t.giantK;
        const sway = Math.sin(this.t * 1.6 + m.userData.ph) * (ripe ? 0.06 : 0.035);
        m.scale.set(s, s * (ripe ? 1 + Math.sin(this.t * 2.2 + m.userData.ph) * 0.02 : 1), s);
        m.rotation.z = sway; m.rotation.x = sway * 0.6;
      }
      // 다 익은 칸: 이따금 반짝
      if (ripe) { t.sparkle = (t.sparkle ?? t.seed * 0.3) - dt; if (t.sparkle <= 0) { t.sparkle = 2.5 + (t.seed % 3); this.game.fx.burst?.(t.x, 0.9, t.z, 0xfff3a0, 5); } }
    });
  }

  /** 그 칸을 바라보기 */
  face(i) { const t = this.tiles[i], p = this.game.player.position; this.game.player.unico.facing = Math.atan2(t.x - p.x, t.z - p.z); }

  /** 호미질: 칸을 바라보고 n번 내리찍기(흙 튐·소리), 끝나면 done */
  hoe(i, n, done) {
    const g = this.game, u = g.player.unico, t = this.tiles[i];
    this.face(i);
    g.player.frozen = true;
    u.playAction('hoe', n * 0.6 + 0.05);
    u.onHit = (kind) => {
      if (kind !== 'hoe') return;
      const p = g.player.position, f = u.facing;
      const hx = p.x + Math.sin(f) * 0.75, hz = p.z + Math.cos(f) * 0.75;
      g.fx.burst(hx, 0.15, hz, 0x7a5636, 7);
      g.audio.play('dig', 0.7);
      g.juice.shake(0.08);
    };
    this.job = { t: 0, dur: n * 0.6 + 0.05, done: () => { u.onHit = null; g.player.frozen = false; done(); } };
    void t;
  }

  update(dt, playerPos) {
    this._animateCrops(dt);
    if (this.job) {
      this.job.t += dt;
      if (this.job.t >= this.job.dur) { const j = this.job; this.job = null; j.done(); }
      else return { d: -1, label: '⛏️ 호미질 중…', key: 'hoeing' };
    }
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
      const act = this.sim.actionFor(best, hasSeed, eco.count('compost') > 0);
      return act ? { d: bd, label: act.label, key: act.type, onInteract: () => this.interact(best, act.type) } : null;
    }
    return null;
  }

  /** 씨앗 심기 (씨앗 고르기 창·오토플레이 공용). fert 면 퇴비도 같이 */
  plantCrop(i, crop, fert = false) {
    const g = this.game, t = this.tiles[i];
    if (!g.economy.useSeed(crop)) return false;
    if (!this.sim.plant(i, crop)) { g.economy.addSeeds(crop, 1); return false; } // 못 심었으면 씨앗 되돌려 줌
    let extra = '';
    if (fert && !this.sim.plots[i].fert && g.economy.useItem('compost', 1)) { this.sim.fertilize(i); extra = ' + 🟫 퇴비'; g.onEvent('fert'); }
    g.onEvent('plant'); g.audio.play('plant'); g.ui.toast(`${CROPS[crop].emoji} ${CROPS[crop].name} 씨앗을 심었어요${extra}${CROPS[crop].regrow ? ` (수확 후 ${CROPS[crop].regrow}번 더 열려요)` : ''}`);
    this.face(i); g.player.unico.playAction('plant', 1.0); g.fx.burst(t.x, 0.25, t.z, 0x8a6a45, 6);
    return true;
  }

  interact(i, type) {
    const g = this.game;
    const t = this.tiles[i];
    if (type === 'till') this.hoe(i, 2, () => { this.sim.till(i); g.onEvent('till'); });
    else if (type === 'weed') this.hoe(i, 3, () => {
      this.sim.weed(i); g.onEvent('weed'); g.audio.play('harvest', 0.6);
      const wn = 1 + (Math.random() < 0.5 ? 1 : 0);
      g.economy.addItem('weed', wn);
      g.fx.pop(t.x, t.z, '🌿'); g.ui.toast(`🌿 김매기 완료! 흙이 부드러워져 한동안 더 잘 자라요 (잡초 ${wn}개 → 퇴비통 재료)`);
    });
    else if (type === 'plant') g.ui.openSeedPicker((crop, fert) => this.plantCrop(i, crop, fert), { fert: g.economy.count('compost') });
    else if (type === 'fert') {
      if (g.economy.useItem('compost', 1) && this.sim.fertilize(i)) {
        this.face(i); g.player.unico.playAction('scatter', 1.1); g.audio.play('plant');
        g.fx.burst(t.x, 0.3, t.z, 0x4a3322, 12);
        g.ui.toast('🟫 퇴비를 줬어요! 30% 빨리 자라고 품질이 좋아져요 (대왕 작물 확률도 ↑)');
        g.onEvent('fert');
      }
    }
    else if (type === 'need_seed') g.ui.toast('씨앗이 없어요. 장터에서 씨앗을 구매하세요 🛒');
    else if (type === 'water') { this.sim.water(i); g.onEvent('water'); g.audio.play('water'); this.face(i); g.player.unico.playAction('water', 1.4); g.fx.sprinkle(this.tiles[i].x, this.tiles[i].z); }
    else if (type === 'harvest') {
      const r = this.sim.harvest(i);
      if (r) {
        const C = CROPS[r.crop];
        g.economy.addCrop(r.crop, r.amount); g.onEvent('harvest', r.amount);
        g.audio.play(r.stars === 3 || r.giant ? 'levelup' : 'harvest');
        this.face(i); g.player.unico.playAction('pull', 0.75);
        setTimeout(() => { if (g.player.unico.action === 'pull') g.player.unico.playAction('cheer', 0.9); }, 700);
        g.juice.pop(g.player.group, r.giant ? 0.35 : 0.18);
        if (r.giant) { g.juice.shake(0.25); g.fx.burst(t.x, 1.2, t.z, 0xfff3a0, 26); g.onEvent('giant'); }
        if (r.stars === 3) g.onEvent('star3');
        const stars = '⭐'.repeat(r.stars);
        g.fx.pop(t.x, t.z, r.stars > 1 ? stars : C.emoji);
        const grade = r.stars === 3 ? '특상품' : r.stars === 2 ? '상품' : '보통';
        g.ui.toast(`${r.giant ? '🎉 대왕 ' : ''}${C.emoji} ${C.name} ×${r.amount} 수확! ${stars} ${grade}${r.regrow ? ` · 🌱 다시 열려요 (남은 ${r.left + 1}번)` : ''}`);
        if (r.stars === 1 && !g.flags.qualityTip) { g.flags.qualityTip = true; g.ui.toast('💡 물이 마르지 않게, 잡초 없이, 퇴비까지 주면 ⭐⭐⭐ 특상품이 나와요 (수확량 +1, 물을 안 주면 -1)'); }
        if (r.levelUp) g.farmcraft?.levelUp(r.levelUp);
      }
    }
  }
}
