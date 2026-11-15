import * as THREE from 'three';
import { FarmSim } from '../sim/farm.js';
import { LAYOUT } from '../world.js';
import { CROPS } from '../sim/crops.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { touchUI } from '../input.js';
import { josa } from '../sim/josa.js';
import { ProduceFactory } from './farm_produce.js';
import { SeedChip } from '../../ui/seed_chip.js';

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

/** 빈 밭 흙 질감: 갈기 전의 다져진 맨흙 (고랑 없음) — 큰 얼룩 + 옅은 자갈 + 가장자리는 풀빛으로 부드럽게 사라짐 */
function soilTexture() {
  if (typeof document === 'undefined') return null;
  const N = 128, c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d'), img = g.createImageData(N, N);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  // 큰 얼룩: 8x8 격자 값 노이즈를 부드럽게 보간 (가장자리 이어지게 감쌈)
  const G = 8, cell = Array.from({ length: G * G }, rnd);
  const at = (i, j) => cell[((j + G) % G) * G + ((i + G) % G)];
  const sm = (t) => t * t * (3 - 2 * t);
  const blotch = (u, v) => {
    const x = u * G, y = v * G, i = Math.floor(x), j = Math.floor(y), fx = sm(x - i), fy = sm(y - j);
    const a = at(i, j) + (at(i + 1, j) - at(i, j)) * fx, b = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * fx;
    return a + (b - a) * fy;
  };
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / (N - 1), v = y / (N - 1);
    const grain = rnd();
    let shade = 1 + (blotch(u, v) - 0.5) * 0.2 + (grain - 0.5) * 0.08; // 얼룩 ±0.10, 알갱이 ±0.04
    if (grain > 0.98) shade *= 1.14;                                  // 옅은 자갈 (약 2%)
    const edge = Math.min(u, 1 - u, v, 1 - v);                        // 가장자리까지 거리
    const a = Math.min(1, edge / 0.12) ** 1.5;
    const green = Math.max(0, 1 - edge / 0.2) * 0.35;                 // 가장자리 띠는 풀빛이 살짝
    const i = (y * N + x) * 4;
    img.data[i] = (150 + (118 - 150) * green) * shade;
    img.data[i + 1] = (120 + (128 - 120) * green) * shade;
    img.data[i + 2] = (88 + (70 - 88) * green) * shade;
    img.data[i + 3] = 255 * a;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
const EMPTY_MAT = new THREE.MeshStandardMaterial({ color: 0xffffff, map: soilTexture(), roughness: 1, transparent: true, opacity: 0.95, depthWrite: false });

/**
 * 마른 밭 💧 표시: 점 하나짜리 Points (질감·재질·지오메트리 하나를 모든 칸이 함께 씀)
 * 스프라이트는 주변광 차폐(GTAO)의 법선 그리기에 사각형으로 들어가 검은 판이 생김 → 점은 그 패스가 건너뜀.
 * 깊이 검사는 켜 둠 (작물·주인공 뒤로 가려짐)
 */
let DRY = null;
function dryShared(fov = 45) {
  if (DRY) return DRY;
  let map = null;
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const x = c.getContext('2d');
    x.fillStyle = 'rgba(255,255,255,0.92)';
    x.beginPath(); x.arc(32, 32, 27, 0, Math.PI * 2); x.fill();
    x.lineWidth = 3; x.strokeStyle = 'rgba(70,150,210,0.9)'; x.stroke();
    x.font = '34px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('💧', 32, 35);
    map = new THREE.CanvasTexture(c);
    map.colorSpace = THREE.SRGBColorSpace;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3));
  // 점 크기는 화면 높이 기준이라 시야각 보정: 지름 약 0.62m
  const mat = new THREE.PointsMaterial({ map, size: 0.62 / Math.tan((fov * Math.PI) / 360), sizeAttenuation: true, transparent: true, depthWrite: false, alphaTest: 0.05 });
  DRY = { geo, mat };
  return DRY;
}

const TILL_POP = 0.35;      // 갈린 밭 이랑이 솟는 시간
const PULL_FALLBACK = 0.45; // 뽑는 순간 신호가 안 오면 이때 수확물 등장
const ITEM_ARC = 0.3;       // 흙 → 머리 위
const ITEM_HOLD = 0.4;      // 머리 위에서 보여 주기
const CHAIN = new Set(['till', 'weed', 'plant', 'water', 'fert', 'harvest']);
const easeOutBack = (k) => { const c = 1.70158; return 1 + (c + 1) * (k - 1) ** 3 + c * (k - 1) ** 2; };

export class FarmView {
  constructor(game) {
    this.game = game;
    const { cols, rows, tile, origin } = LAYOUT.farm;
    this.sim = new FarmSim(cols * rows);
    this.sim.weedChance = 1 / 160; // 자라는 밭에 가끔 잡초 (호미로 김매기). 첫 수확 전에는 0
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
        const D = dryShared(game.camera?.fov);
        const dry = new THREE.Points(D.geo, D.mat);
        dry.position.set(x, 1.3, z);
        dry.renderOrder = 1;
        dry.visible = false;
        game.world.scene.add(dry);
        this.tiles.push({ x, z, plot, empty, ring, dry, crop: null, cropKey: '', drops: null, seed: (r * 7 + c * 13) % 10 });
      }
    }
    this.sim.on((type, i) => this.refresh(i));
    this.near = -1;
    this.produce = new ProduceFactory(game.assets);
    this.leaving = []; // 수확 뒤 줄어들며 사라지는 포기
    this.item = null;  // 머리 위로 들어 보이는 수확물 (한 번에 하나)
    this.buffered = false; // 호미질 중 누른 E (끝나면 이어서)
    this.seedChip = typeof document !== 'undefined' ? new SeedChip(game, this) : null;
  }

  /** 첫 수확 보호 기간: '첫 수확 5개' 를 채우기 전 (잡초·까마귀 없음, 별 2개 보장) */
  get grace() {
    const q = this.game.quests;
    if (!q) return false;
    return !(q.claimed?.harvest5 || (q.progress?.harvest5 || 0) >= 5);
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
    t.dry.visible = p.state === 'growing' && p.water <= 0 && !p.weeds;
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

  refreshAll() { this.flushItem(); this.tiles.forEach((_, i) => this.refresh(i)); }

  /** 시간에 따른 성장: 단계 안에서도 조금씩 커지고, 단계가 바뀌면 반동, 다 익으면 살랑+반짝 */
  _animateCrops(dt) {
    this.t = (this.t || 0) + dt;
    const ease = (x) => 1 - (1 - x) * (1 - x);
    this.tiles.forEach((t, i) => {
      // 막 간 밭: 이랑이 흙에서 쑥 솟았다가 살짝 넘치고 제자리 (끝은 정확히 1)
      if (t.tillPop > 0) {
        t.tillPop = Math.max(0, t.tillPop - dt);
        const k = 1 - t.tillPop / TILL_POP;
        t.plot.scale.y = t.tillPop > 0 ? 0.2 + 0.8 * ease(k) + Math.sin(k * Math.PI) * 0.22 : 1;
      }
      if (t.dry.visible) t.dry.position.y = 1.3 + Math.sin(this.t * 3 + t.seed) * 0.06;
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
    // 수확한 포기: 0.3초 동안 위로 살짝 뜨며 줄어들어 사라짐 (공유 지오메트리라 해제하지 않음)
    for (let k = this.leaving.length - 1; k >= 0; k--) {
      const l = this.leaving[k];
      l.t += dt;
      const e = Math.min(1, l.t / 0.3);
      l.obj.scale.setScalar(Math.max(0.001, 1 - e * e));
      l.obj.position.y = l.y0 + e * 0.35;
      if (e >= 1) { this.game.world.scene.remove(l.obj); this.leaving.splice(k, 1); }
    }
  }

  /** 그 칸을 바라보기 */
  face(i) { const t = this.tiles[i], p = this.game.player.position; this.game.player.unico.facing = Math.atan2(t.x - p.x, t.z - p.z); }

  /**
   * 호미질: 칸을 바라보고 n번 내리찍기(흙 튐·소리). 마지막으로 내리찍는 순간 strike (흙이 그때 바뀜),
   * 동작 신호가 오지 않으면 끝날 때라도 strike. 끝나면 done
   */
  hoe(i, n, strike, done) {
    const g = this.game, u = g.player.unico;
    this.face(i);
    g.player.frozen = true;
    u.playAction('hoe', n * 0.6 + 0.05);
    let hits = 0, struck = false;
    const fire = () => { if (struck) return; struck = true; strike?.(); };
    u.onHit = (kind) => {
      if (kind !== 'hoe') return;
      const p = g.player.position, f = u.facing;
      const hx = p.x + Math.sin(f) * 0.75, hz = p.z + Math.cos(f) * 0.75;
      g.fx.burst(hx, 0.15, hz, 0x7a5636, 7);
      g.audio.play('dig', 0.7);
      g.juice.shake(0.08);
      if (++hits >= n) fire();
    };
    this.job = { t: 0, dur: n * 0.6 + 0.05, done: () => { u.onHit = null; g.player.frozen = false; fire(); done?.(); } };
  }

  // ---------------------------------------------------------------- 씨앗 고르기 (한 번 고르면 계속 그 씨앗)
  ownedSeeds() { const s = this.game.economy.inventory.seeds; return Object.keys(CROPS).filter((k) => (s[k] || 0) > 0); }

  /** 이번에 심을 씨앗: { crop, from?(떨어져서 바뀜), ask?(처음이고 여러 종류 → 고르기 창) } */
  seedChoice() {
    const owned = this.ownedSeeds();
    if (!owned.length) return null;
    const sel = this.game.flags.seedSel;
    if (sel && owned.includes(sel)) return { crop: sel };
    if (sel && CROPS[sel]) { // 떨어짐 → 다음 씨앗으로
      const keys = Object.keys(CROPS), at = keys.indexOf(sel);
      for (let k = 1; k <= keys.length; k++) { const c = keys[(at + k) % keys.length]; if (owned.includes(c)) return { crop: c, from: sel }; }
    }
    if (owned.length === 1) return { crop: owned[0] };
    return { crop: owned[0], ask: true };
  }

  /** 퇴비도 함께 줄지 (고르기 창에서 정한 대로, 기본은 줌) */
  seedFert() { return this.game.flags.seedFert !== false && this.game.economy.count('compost') > 0; }

  /** 가진 씨앗 사이를 돌아가며 고르기 (R 키) */
  cycleSeed(dir = 1) {
    const owned = this.ownedSeeds();
    if (!owned.length) return null;
    const at = owned.indexOf(this.seedChoice()?.crop);
    const next = owned[((at < 0 ? 0 : at + dir) % owned.length + owned.length) % owned.length];
    this.game.flags.seedSel = next;
    return next;
  }

  /** 고르기 창 (고른 씨앗을 기억. onPick 이 있으면 고른 뒤 실행) */
  pickSeed(onPick) {
    const g = this.game;
    g.ui.openSeedPicker((crop, fert) => { g.flags.seedSel = crop; g.flags.seedFert = !!fert; onPick?.(crop, fert); }, { fert: g.economy.count('compost') });
  }

  plantLabel() {
    const c = this.seedChoice();
    if (!c) return '씨앗 심기';
    if (c.ask) return '🌱 씨앗 골라 심기';
    const C = CROPS[c.crop];
    return `${C.emoji} ${C.name} 심기${this.seedFert() ? ' +🟫' : ''}${!touchUI() && this.ownedSeeds().length > 1 ? ' · R 바꾸기' : ''}`;
  }

  /** 고른 씨앗 바로 심기 (처음 한 번만 고르기 창, 떨어지면 다음 씨앗으로 바꾸고 알림) */
  plantSelected(i) {
    const g = this.game, c = this.seedChoice();
    if (!c) { g.ui.toast('씨앗이 없어요. 장터에서 씨앗을 구매하세요 🛒'); return false; }
    if (c.ask) { this.pickSeed((crop, fert) => this.plantCrop(i, crop, fert)); return false; }
    if (c.from) {
      const A = CROPS[c.from], B = CROPS[c.crop];
      g.ui.toast(`${A.emoji} ${A.name} 씨앗이 떨어져 ${B.emoji} ${B.name}${josa(B.name, '으로/로')} 바꿨어요`);
    }
    g.flags.seedSel = c.crop;
    return this.plantCrop(i, c.crop, this.seedFert());
  }

  // ---------------------------------------------------------------- 수확 순간: 흙에서 뽑아 머리 위로 → 가방
  /** 머리 위 위치 */
  _headTop(out) {
    const P = this.game.player, u = P.unico;
    if (u.headG?.getWorldPosition) { u.headG.getWorldPosition(out); out.y += 0.62; }
    else out.set(P.position.x, P.position.y + 2.15, P.position.z);
    return out;
  }

  _spawnItem() {
    const it = this.item, g = this.game;
    if (!it || it.phase !== 'wait') return;
    const u = g.player.unico;
    if (u.onHit === it.hit) u.onHit = null;
    it.phase = 'arc'; it.t = 0;
    const t = this.tiles[it.i], r = it.r;
    it.m = this.produce.make(r.crop);
    it.s = (r.giant ? 1.6 : 1) * 1.8;
    it.m.scale.setScalar(it.s * 0.4);
    it.m.position.copy(it.from);
    g.world.scene.add(it.m);
    g.fx.burst(t.x, 0.3, t.z, 0x7a5636, 8);
    g.audio.play('dig', 0.6);
    g.audio.play(r.stars === 3 || r.giant ? 'levelup' : 'harvest');
    if (r.giant) { g.juice.shake(0.25); g.fx.burst(t.x, 1.2, t.z, 0xfff3a0, 26); }
    if (r.stars > 1) g.fx.pop(t.x, t.z, '⭐'.repeat(r.stars), { fly: false }); // 별은 떠오르기만 (가방으로는 작물만)
    // 이름표·화살표가 수확물을 가리지 않게 잠깐 숨김
    if (u.label) u.label.visible = false;
    if (g.player.arrow) g.player.arrow.visible = false;
  }

  _endItem() {
    const it = this.item, g = this.game;
    if (!it) return;
    this.item = null;
    const u = g.player.unico;
    if (u.onHit === it.hit) u.onHit = null;
    const pos = it.m ? it.m.position.clone() : it.from.clone();
    if (it.m) g.world.scene.remove(it.m);
    if (it.phase !== 'wait') {
      if (u.label) u.label.visible = true;
      if (g.player.arrow) g.player.arrow.visible = true;
      if (it.phase === 'hold' && !it.lifted && !g.home?.inside && (u.action === 'pull' || !u.action)) u.playAction('lift', 0.6); // 일찍 끝나도 번쩍은 꼭
    }
    g.ui.flyToBag?.(CROPS[it.r.crop].emoji, pos);
  }

  /** 진행 중인 수확 연출을 바로 끝냄 (새 수확·장면 바뀜·다시 읽기) */
  flushItem() { this._endItem(); }

  _animateItem(dt) {
    const it = this.item;
    if (!it) return;
    const g = this.game, P = g.player, u = P.unico;
    it.t += dt; it.total += dt;
    // 집 안으로 들어가거나 멀리 이동하면 바로 가방으로
    if (g.home?.inside || Math.hypot(P.position.x - it.from.x, P.position.z - it.from.z) > 14) { this._endItem(); return; }
    if (it.phase === 'wait') { if (it.t >= PULL_FALLBACK) this._spawnItem(); return; }
    // 뽑기 동작이 끝나면 두 팔 벌려 번쩍
    if (!it.lifted && it.total >= 1.0 && (u.action === 'pull' || !u.action)) { it.lifted = true; u.playAction('lift', 0.6); }
    const head = this._headTop(it.head);
    const m = it.m;
    if (it.phase === 'arc') {
      const k = Math.min(1, it.t / ITEM_ARC), e = easeOutBack(k);
      m.position.lerpVectors(it.from, head, e);
      m.position.y += Math.sin(k * Math.PI) * 0.5;
      m.scale.setScalar(it.s * (0.4 + 0.6 * Math.min(1, k * 1.6)));
      m.rotation.set(0.25, m.rotation.y + dt * 6, 0);
      if (k >= 1) {
        it.phase = 'hold'; it.t = 0;
        const special = it.r.stars === 3 || it.r.giant;
        g.fx.burst(head.x, head.y, head.z, special ? 0xffd75a : 0xfff3a0, special ? 14 : 6);
        if (special) g.juice.pop(P.group, 0.2);
      }
    } else {
      m.position.copy(head);
      m.position.y += Math.sin(it.t * 9) * 0.04;
      m.rotation.set(0.25, m.rotation.y + dt * 2.5, Math.sin(it.t * 7) * 0.12);
      if (it.t >= ITEM_HOLD) this._endItem();
    }
  }

  /** 수확: 뽑는 순간(동작 신호 또는 0.45초) 수확물이 흙에서 솟아 머리 위로 → 가방 */
  harvest(i) {
    const g = this.game, t = this.tiles[i], p = this.sim.plots[i];
    if (p.state !== 'ready') return null;
    this.flushItem();
    // 다시 열리지 않는 작물: 남은 포기는 줄어들며 사라짐
    if (!(p.regrowLeft > 0) && t.crop) { this.leaving.push({ obj: t.crop, t: 0, y0: t.crop.position.y }); t.crop = null; t.plants = null; t.cropKey = ''; }
    const grace = this.grace;
    const r = this.sim.harvest(i, grace ? 2 : 1);
    if (!r) return null;
    const C = CROPS[r.crop], u = g.player.unico;
    g.economy.addCrop(r.crop, r.amount); g.onEvent('harvest', r.amount);
    this.face(i); u.playAction('pull', 1.05);
    const it = { i, r, t: 0, total: 0, phase: 'wait', m: null, from: new THREE.Vector3(t.x, 0.35, t.z), head: new THREE.Vector3(), lifted: false };
    it.hit = (kind) => { if (kind === 'pull') this._spawnItem(); };
    u.onHit = it.hit;
    this.item = it;
    if (r.giant) g.onEvent('giant');
    if (r.stars === 3) g.onEvent('star3');
    const stars = '⭐'.repeat(r.stars);
    const grade = r.stars === 3 ? '특상품' : r.stars === 2 ? '상품' : '보통';
    g.ui.toast(`${r.giant ? '🎉 대왕 ' : ''}${C.emoji} ${C.name} ×${r.amount} 수확! ${stars} ${grade}${r.regrow ? ` · 🌱 다시 열려요 (남은 ${r.left + 1}번)` : ''}`);
    if (r.stars === 1 && !grace && !g.flags.qualityTip) {
      g.flags.qualityTip = true;
      const tip = '💡 물이 마르지 않게, 잡초 없이, 퇴비까지 주면 ⭐⭐⭐ 특상품이 나와요 (수확량 +1, 물을 안 주면 -1)';
      if (g.ui.tip) g.ui.tip('quality', tip); else g.ui.toast(tip);
    }
    if (r.levelUp) g.farmcraft?.levelUp(r.levelUp);
    return r;
  }

  /** 호미질 중 눌러 둔 E: 가장 가까운 칸에서 할 수 있는 다음 일 */
  _chain(pos) {
    const hasSeed = this.ownedSeeds().length > 0, hasFert = this.game.economy.count('compost') > 0;
    let best = -1, bd = 2.6, type = null;
    this.tiles.forEach((t, i) => {
      const d = Math.hypot(t.x - pos.x, t.z - pos.z);
      if (d >= bd) return;
      const a = this.sim.actionFor(i, hasSeed, hasFert);
      if (a && CHAIN.has(a.type)) { bd = d; best = i; type = a.type; }
    });
    if (best >= 0) this.interact(best, type);
  }

  update(dt, playerPos) {
    this._animateCrops(dt);
    this._animateItem(dt);
    this.sim.weedChance = this.grace ? 0 : 1 / 160;
    if (this.job) {
      const inp = this.game.input;
      if (inp?.interact?.()) this.buffered = true;
      if (inp?.manual?.() || this.game.ui?.panel) this.buffered = false; // 움직이거나 창을 열면 취소
      this.job.t += dt;
      if (this.job.t >= this.job.dur) {
        const j = this.job; this.job = null; j.done();
        if (this.buffered) { this.buffered = false; this._chain(playerPos); }
      }
      if (this.job) { this.seedChip?.update(); return { d: -1, label: '⛏️ 호미질 중…', key: 'hoeing' }; }
    }
    const stagesBefore = this.sim.plots.map((_, i) => `${this.sim.stage(i)}${this.sim.plots[i].water > 0}`);
    this.sim.tick(dt);
    this.sim.plots.forEach((_, i) => { if (`${this.sim.stage(i)}${this.sim.plots[i].water > 0}` !== stagesBefore[i]) this.refresh(i); });
    this.seedChip?.update();
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
      if (!act) return null;
      const label = act.type === 'plant' ? this.plantLabel() : act.label;
      return { d: bd, label, key: act.type, onInteract: () => this.interact(best, act.type) };
    }
    return null;
  }

  /** 씨앗 심기 (고른 씨앗·오토플레이 공용). fert 면 퇴비도 같이 */
  plantCrop(i, crop, fert = false) {
    const g = this.game, t = this.tiles[i];
    if (!g.economy.useSeed(crop)) return false;
    if (!this.sim.plant(i, crop)) { g.economy.inventory.seeds[crop]++; return false; }
    let extra = '';
    if (fert && !this.sim.plots[i].fert && g.economy.useItem('compost', 1)) { this.sim.fertilize(i); extra = ' + 🟫 퇴비'; g.onEvent('fert'); }
    g.onEvent('plant'); g.audio.play('plant'); g.ui.toast(`${CROPS[crop].emoji} ${CROPS[crop].name} 씨앗을 심었어요${extra}${CROPS[crop].regrow ? ` (수확 후 ${CROPS[crop].regrow}번 더 열려요)` : ''}`);
    this.face(i); g.player.unico.playAction('plant', 1.0); g.fx.burst(t.x, 0.25, t.z, 0x8a6a45, 6);
    return true;
  }

  interact(i, type) {
    const g = this.game;
    const t = this.tiles[i];
    if (type === 'till') this.hoe(i, 1, () => {
      if (!this.sim.till(i)) return;
      t.tillPop = TILL_POP; t.plot.scale.y = 0.2; // 이랑이 흙에서 솟아오름
      g.fx.burst(t.x, 0.25, t.z, 0x7a5636, 10);
      g.onEvent('till');
    });
    else if (type === 'weed') this.hoe(i, 2, () => {
      if (!this.sim.weed(i)) return;
      g.onEvent('weed'); g.audio.play('harvest', 0.6);
      const wn = 1 + (Math.random() < 0.5 ? 1 : 0);
      g.economy.addItem('weed', wn);
      g.fx.pop(t.x, t.z, '🌿'); g.ui.toast(`🌿 김매기 완료! 흙이 부드러워져 한동안 더 잘 자라요 (잡초 ${wn}개 → 퇴비통 재료)`);
    });
    else if (type === 'plant') this.plantSelected(i);
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
    else if (type === 'harvest') this.harvest(i);
  }
}
