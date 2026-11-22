import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { heightAt } from '../terrain.js';
import { ITEMS } from '../sim/items.js';
import { festivalAt, festivalOf, festivalKey, festState, saleTokens, actTokens } from '../sim/festival.js';
import { mgResult } from '../../ui/minigame_frame.js';
import { openFestival, FEST_COIN } from '../../ui/panels/festival.js';

/**
 * 계절 축제 마당 (규칙은 sim/festival.js)
 *  - 축제 마당이 열려 있는 동안(축제 날 6시 ~ 다음 날 6시)만 보임: 장터 앞 줄 깃발(오방색·계절색)·연등·축제 가판대
 *  - 그리기 2번: 깃발·줄·기둥·가판대를 한 덩어리(정점 색), 연등 한 덩어리(밤에 빛남 — 빛 없이 재질만). 그림자 없음
 *  - 처음 열릴 때 만듦 (축제 날이 아니면 아무것도 만들지 않음)
 *  - 가판대 앞에서 '축제 마당' 창: 축제 놀이(달걀 받기 규칙 + 계절 그림) · 엽전 장터
 *  - 꾸미기 모델(연등·연·눈사람·진달래 화분) 을 assets 에 등록 → 꾸미기 소품으로 놓을 수 있음 (불러오기 전에)
 */
/** 축제 가판대 자리 (밭·자전거 자리·주민 축제 자리 밖, 장터 오른쪽 앞) — r 은 길막이 반지름 */
export const BOOTH = { x: 6.0, z: -6.6, r: 1.2, rot: -Math.PI / 3 };
/** 가판대 크기 배율 (탁자·차양·기둥) */
const BK = 1.3;
/** 줄 깃발을 거는 곳: [x, 높이, z] — 가로등 옆·장터 지붕 앞 두 모서리·가판대 앞 기둥·서쪽 기둥, 자리마다 깃대를 세움
 *  주민 이름표(2.4~2.8m) 위로 지나가게 3.8m 에 걸고 처짐은 0.3m (가장 낮은 곳 3.5m, 연등 밑동 3.0m) */
const HANG = 3.8;
const LAMP = [-1.6, HANG, -4.91], POLE = [-8.6, HANG, -6.4], MKT_L = [-1.2, HANG, -8.6], MKT_R = [1.2, HANG, -8.6];
/** 가판대 앞쪽 두 기둥 (로컬 좌표) — 깃발 줄·연등을 검 */
const BOOTH_FRONT = [[-0.85 * BK, 0.42 * BK], [0.85 * BK, 0.42 * BK]];
const boothAt = (lx, lz) => { const c = Math.cos(BOOTH.rot), s = Math.sin(BOOTH.rot); return [BOOTH.x + lx * c + lz * s, BOOTH.z - lx * s + lz * c]; };
const BOOTH_TOP = (() => { const [x, z] = boothAt(...BOOTH_FRONT[0]); return [x, HANG, z]; })();
const GARLANDS = [[LAMP, MKT_L], [MKT_L, MKT_R], [MKT_R, BOOTH_TOP], [LAMP, POLE]];
/** 깃대를 세우는 곳 (가판대 기둥은 가판대가 세움) */
const MASTS = [LAMP, POLE, MKT_L, MKT_R];
const FLAG_STEP = 0.42, LANTERN_STEP = 1.2, SAG = 0.3;
/** 연등 빛: 낮엔 은은하게, 밤엔 이만큼까지 (번짐 효과가 잡을 만큼) */
const GLOW_DAY = 0.1, GLOW_NIGHT = 1.2;
/** 연등 빛 색 (따뜻한 주황) — 등 색과 섞어 파란 등도 속은 주황으로 */
const LANTERN_EMIT = 0xffb060;
/** 연등 둘레 빛무리: 이 밝기(0~1)부터 보임, 크기(m) */
const HALO_FROM = 0.3, HALO_SIZE = 1.3;
/** 다섯 방향 색(오방색) — 계절색과 섞어 깃발에 */
const OBANG = [0x3170c9, 0xd4372c, 0xf6c63c, 0xffffff, 0x2b2b2b];
/** 축제 음식 색 (가판대 위 음식 더미): [떡 색, 고명 색] */
const FOOD_LOOK = {
  fest_hwajeon: [0xfff1dc, 0xf28bb0], fest_surichwi: [0x6f9a3a, 0x93b85a],
  fest_songpyeon: [0xf6f1e4, 0x9cc46a], fest_patjuk: [0x7a2a22, 0xfaf6ee],
};
const CHECK = 1; // 축제 마당이 열렸는지 확인 간격(초)

export class FestivalView {
  constructor(game) {
    this.game = game;
    this.cur = null;   // 지금 열린 축제 (festivalAt 결과)
    this.t = CHECK;
    this.group = null;
    this.ob = { x: BOOTH.x, z: BOOTH.z, r: BOOTH.r }; // 가판대 장애물 (축제 때만 넣음)
    this._registerModels();
  }

  /** 지금 축제 기록 (축제가 바뀌면 새로) */
  state(key = this.cur?.key) {
    const f = (this.game.flags ||= {});
    return (f.fest = festState(f.fest, key));
  }

  /** 1초마다 축제 마당이 열렸는지 보고 꾸밈을 켜고 끔. 가판대 앞이면 안내 */
  update(dt, pp) {
    const g = this.game, W = g.world;
    if ((this.t += dt) >= CHECK) {
      this.t = 0;
      const f = festivalAt(W.day ?? 1, W.time ?? 0.3);
      if ((f?.key ?? null) !== (this.cur?.key ?? null) || f?.id !== this.cur?.id) this._switch(f);
      else this.cur = f;
      this._bannerGap();
    }
    if (!this.cur || !this.group) return null;
    // 연등: 해가 지면 서서히 밝게 (빛 없이 재질만)
    const glow = THREE.MathUtils.clamp(1 - (W.daylight ?? 1) * 1.25, 0, 1);
    this.lanternMat.emissiveIntensity = GLOW_DAY + glow * (GLOW_NIGHT - GLOW_DAY);
    // 빛무리: 어두워졌을 때만 (그리기 1번, 낮엔 아예 안 그림)
    const halo = glow > HALO_FROM;
    if (this.halo.visible !== halo) this.halo.visible = halo;
    if (halo) this.halo.material.uniforms.uA.value = Math.min(1, (glow - HALO_FROM) / (1 - HALO_FROM));
    if (!pp) return null;
    const d = Math.hypot(pp.x - BOOTH.x, pp.z - BOOTH.z);
    if (d > 2.8) return null;
    return { d: Math.max(0.1, d - 0.8), label: `${this.cur.icon} ${this.cur.name} 마당 · 놀이·축제 장터`, key: 'festival', onInteract: () => this.open() };
  }

  /** 축제가 열리거나 끝남 */
  _switch(f) {
    const g = this.game, was = this.cur;
    this.cur = f;
    if (f && (!this.group || this.builtFor !== f.id)) this._build(f);
    if (this.group) this.group.visible = !!f;
    this._bannerGap();
    const obs = g.world.obstacles, k = obs ? obs.indexOf(this.ob) : -1;
    if (f && k < 0) obs?.push(this.ob); else if (!f && k >= 0) obs.splice(k, 1);
    if (f && !was) {
      const fl = (g.flags ||= {});
      if (fl.festOpen !== f.key) { // 같은 축제는 한 번만 알림 (다시 불러와도)
        fl.festOpen = f.key;
        g.ui?.toast?.(`🎪 ${f.name}가 열렸어요! 장터 앞 축제 마당에서 놀이하고 엽전을 모아 보세요`, { type: 'info' });
        g.audio?.play?.('fest'); // 축제 전용 소리 (음악을 4dB 낮춤)
        g.onEvent?.(`festival_${f.id}`);
      }
    }
  }

  /** 판 금액 → 축제 날이면 엽전 (상한까지) */
  onSale(coins) {
    const g = this.game, W = g.world;
    if (!g.economy.festival) return;
    if (!festivalOf(W.day ?? 1)) return;
    const n = saleTokens(this.state(festivalKey(W.day)), coins);
    if (n > 0) { g.economy.addItem('fest_token', n); g.ui?.toast?.(`${ITEMS.fest_token.emoji} 축제 날 판매 보너스! 축제 엽전 +${n}`, { key: 'festsale' }); }
  }

  /** 축제 마당 창 */
  open() {
    this.t = CHECK; this.update(0, null); // 날짜·시각이 막 바뀌었어도 바로 확인
    if (!this.cur) { this.game.ui?.toast?.('🎪 축제 날(계절 7일째)에 열려요'); return; }
    openFestival(this.game, this);
  }

  /** 축제 놀이: 계절 그림의 받기 놀이 → 결과 카드 → 별만큼 엽전 */
  async play() {
    const g = this.game, f = this.cur;
    if (!f) return;
    g.ui.closePanel?.();
    const { playEggCatch } = await import('../../ui/minigames/egg_catch.js'); // 처음 할 때 받음
    const r = await playEggCatch(g, f.skin);
    if (!r.over) return;
    g.onEvent('festplay', r.score);
    const th = [15, 30, 45];
    const stars = r.score >= th[2] ? 3 : r.score >= th[1] ? 2 : r.score >= th[0] ? 1 : 0;
    const n = actTokens(this.state(f.key), stars);
    if (n > 0) g.economy.addItem('fest_token', n);
    mgResult(g, {
      id: 'fest', icon: f.icon, title: `${f.skin.title} 결과`, score: r.score, unit: '점', th, prevBest: r.prev,
      lines: [`🔗 최대 ${r.maxCombo} 연속`, n > 0 ? `${FEST_COIN} 축제 엽전 +${n}` : '오늘 받을 수 있는 엽전은 다 받았어요'],
      onRetry: () => this.play(),
      onClose: () => this.open(),
    });
  }

  // ------------------------------------------------------------ 꾸밈 만들기
  /** 처음 열릴 때 (또는 계절이 바뀐 축제) 만듦: 깃발·줄·기둥·가판대 한 덩어리 + 연등 한 덩어리 */
  _build(f) {
    const scene = this.game.world.scene;
    if (this.group) { scene.remove(this.group); this.group.traverse((o) => { if (o.isMesh) o.geometry.dispose(); }); this.halo?.material.dispose(); }
    this.builtFor = f.id;
    const B = new Builder();
    const cols = [...f.colors, ...OBANG];
    let ci = 0;
    const lanterns = [];
    for (const [a, b] of GARLANDS) {
      const len = Math.hypot(b[0] - a[0], b[2] - a[2]);
      const at = (t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - Math.sin(t * Math.PI) * SAG, a[2] + (b[2] - a[2]) * t];
      // 줄
      const seg = Math.max(6, Math.ceil(len / 0.6));
      for (let i = 0; i < seg; i++) B.ribbon(at(i / seg), at((i + 1) / seg), 0.025, 0x5a3a22);
      // 깃발 (아래로 뾰족한 삼각형)
      const nf = Math.floor(len / FLAG_STEP);
      for (let i = 1; i < nf; i++) { const t = i / nf; B.flag(at(t), at(Math.min(1, t + 0.01)), 0.26, 0.34, cols[ci++ % cols.length]); }
      const nl = Math.max(1, Math.floor(len / LANTERN_STEP));
      for (let i = 1; i < nl; i++) lanterns.push(at(i / nl));
    }
    // 깃대 (나무 막대 + 꼭대기 금색 꼭지)
    const gy = (x, z) => heightAt(x, z);
    for (const [x, y, z] of MASTS) {
      const y0 = gy(x, z);
      B.box(x, y0 + (y + 0.1) / 2, z, 0.1, y + 0.1, 0.1, 0x8a5a32);
      B.box(x, y0 + y + 0.16, z, 0.16, 0.12, 0.16, 0xf6c63c);
    }
    this._booth(B, f, lanterns);
    // 연등: 정점 색이 빛 색이 되게 (재질만, 빛 없음)
    const lg = new LanternGeo();
    lanterns.forEach((p, i) => lg.add(p[0], p[1] - (p[3] ?? 0.24), p[2], i % 2 ? 0xd4372c : f.lantern)); // 계절색·붉은색 번갈아 (p[3]: 매단 길이)
    // 깃발·줄·가판대와 연등을 한 덩어리로 (그리기 1번): 빛 표시(glow) 0 = 꾸밈, 1 = 연등
    this.lanternMat ||= lanternMaterial();
    const parts = [glowAttr(B.geometry(), 0), glowAttr(lg.geometry(), 1)];
    const deco = new THREE.Mesh(mergeGeometries(parts), this.lanternMat);
    for (const q of parts) q.dispose();
    // 빛무리: 연등마다 카메라를 보는 네모 하나 (한 덩어리, 더하기 섞기, 깊이 안 씀)
    this.halo = new THREE.Mesh(haloGeometry(lanterns.map((p) => [p[0], p[1] - (p[3] ?? 0.24), p[2]])), haloMaterial());
    this.halo.visible = false;
    this.halo.frustumCulled = false; // 정점 셰이더에서 펼치므로 경계 구를 믿지 않음 (12개뿐)
    this.halo.renderOrder = 2;
    this.group = new THREE.Group();
    this.group.add(deco, this.halo);
    for (const m of [deco, this.halo]) { m.castShadow = false; m.receiveShadow = false; m.matrixAutoUpdate = false; m.updateMatrix(); }
    this.group.name = 'festival';
    scene.add(this.group);
  }

  /** 축제 가판대 (탁자·치마·기둥·줄무늬 차양·간판·음식 더미, 앞 기둥에 연등 둘) → B 에 더하고 연등 자리는 lanterns 에 */
  _booth(B, f, lanterns) {
    const bx = BOOTH.x, bz = BOOTH.z, by = heightAt(bx, bz), rot = BOOTH.rot, K = BK;
    const P = boothAt;
    const [c0, c1] = f.colors;
    // 탁자 + 계절색 천 치마 (앞쪽에 흰 띠)
    B.box(bx, by + 0.45, bz, 1.7 * K, 0.9, 0.8 * K, 0xb07a4a, rot);
    B.box(bx, by + 0.44, bz, 1.74 * K, 0.7, 0.84 * K, c0, rot);
    { const [x, z] = P(0, 0.43 * K); B.box(x, by + 0.78, z, 1.74 * K, 0.08, 0.02, 0xffffff, rot); }
    B.box(bx, by + 0.92, bz, 1.8 * K, 0.06, 0.9 * K, 0x8a5a32, rot);
    // 기둥 넷 (앞 둘은 깃발 줄을 걸게 높이)
    for (const [lx, lz] of [[-0.85, -0.42], [0.85, -0.42], [-0.85, 0.42], [0.85, 0.42]]) {
      const [x, z] = P(lx * K, lz * K), hgt = lz > 0 ? HANG + 0.1 : 2.5 * K;
      B.box(x, by + hgt / 2, z, 0.09, hgt, 0.09, 0x8a5a32, rot);
      if (lz > 0) B.box(x, by + hgt + 0.06, z, 0.15, 0.12, 0.15, 0xf6c63c, rot);
    }
    // 줄무늬 차양 (흰색·계절색)
    for (let i = 0; i < 6; i++) { const [x, z] = P((-0.75 + i * 0.3) * K, 0); B.box(x, by + 2.5 * K + 0.02, z, 0.3 * K, 0.06, 1.1 * K, i % 2 ? 0xffffff : c0, rot); }
    // 간판: 차양 앞에 매단 나무판 + 축제 색 글자 칸 넷 (글자 대신 색 칸, 그리기 수 그대로)
    { const [x, z] = P(0, 0.58 * K); B.box(x, by + 2.5 * K - 0.32, z, 1.25 * K, 0.42, 0.05, 0x6e4626, rot);
      const cols = [c0, 0xd4372c, 0xf6c63c, c1 === 0xffffff ? 0x3170c9 : c1];
      for (let i = 0; i < 4; i++) { const [lx2, lz2] = P((-0.42 + i * 0.28) * K, 0.6 * K); B.box(lx2, by + 2.5 * K - 0.32, lz2, 0.2 * K, 0.26, 0.03, cols[i], rot); }
      for (const sx of [-0.5, 0.5]) { const [x2, z2] = P(sx * K, 0.58 * K); B.box(x2, by + 2.5 * K - 0.06, z2, 0.025, 0.14, 0.025, 0x5a3a22, rot); } }
    // 축제 음식 더미 (아래 셋·위 하나, 납작한 떡/그릇) + 나무 쟁반
    const [food, top] = FOOD_LOOK[f.food] || [0xf6f1e4, c0];
    for (const [lx, lz, sz] of [[-0.55, 0.05, 1.3], [0.55, 0.05, 1.3]]) { const [x, z] = P(lx * K, lz * K); B.box(x, by + 0.97, z, 0.42 * sz * 0.6, 0.04, 0.42 * sz * 0.6, 0xd8b07a, rot); }
    for (const sx of [-0.55, 0.55]) {
      for (const [dx, dz, dy] of [[-0.1, -0.08, 0], [0.1, -0.08, 0], [0, 0.1, 0], [0, 0, 0.1]]) {
        const [x, z] = P((sx + dx) * K, (0.05 + dz) * K);
        B.dome(x, by + 1.0 + dy, z, 0.11 * K, 0.07, dy ? top : food);
      }
    }
    // 앞 기둥 연등 (기둥 꼭대기 바로 아래, 짧게 매달기)
    for (const [lx, lz] of BOOTH_FRONT) { const [x, z] = P(lx, lz + 0.12); lanterns.push([x, by + HANG - 0.3, z, 0.1]); }
  }

  /** 좁은 화면: 축제 띠가 여러 줄이면 그 아래로 알림을 내림 (--ban-b, css/festival.css) */
  _bannerGap() {
    const ui = this.game.ui, b = ui?.banner, root = b?.parentNode;
    if (!b || !root?.style) return;
    const v = b.style.display !== 'none' && b.offsetHeight ? `${b.offsetTop + b.offsetHeight}px` : '';
    if (v !== this._banB) { this._banB = v; if (v) root.style.setProperty('--ban-b', v); else root.style.removeProperty('--ban-b'); }
  }

  /** 꾸미기 소품 모델 (연등·연·눈사람·진달래 화분) → assets 에 등록 (풍년 허수아비는 있는 허수아비 모델) */
  _registerModels() {
    const a = this.game.assets;
    if (!a?.scenes?.set) return;
    const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, ...o });
    const mesh = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); return m; };
    const wood = M(0x8a5a32);
    // 연등 (나무 받침대 + 붉은 등)
    const lantern = new THREE.Group();
    lantern.add(mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.5, 6), wood, 0, 0.75, 0));
    lantern.add(mesh(new THREE.BoxGeometry(0.6, 0.05, 0.05), wood, 0.2, 1.48, 0));
    const lb = mesh(new THREE.SphereGeometry(0.22, 12, 10), M(0xd4372c, { emissive: 0xff7a3a, emissiveIntensity: 0.6 }), 0.42, 1.18, 0);
    lb.scale.y = 1.25; lantern.add(lb);
    lantern.add(mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.05, 8), M(0xf6c63c), 0.42, 1.46, 0));
    // 방패연 (기둥 + 네모 연 + 꼬리)
    const kite = new THREE.Group();
    kite.add(mesh(new THREE.CylinderGeometry(0.04, 0.05, 2.0, 6), wood, 0, 1.0, 0));
    const k = mesh(new THREE.BoxGeometry(0.7, 0.85, 0.03), M(0xffffff), 0, 1.75, 0.05); k.rotation.z = 0.15; kite.add(k);
    const hole = mesh(new THREE.CircleGeometry(0.13, 12), M(0x3170c9), 0, 1.78, 0.075); hole.rotation.z = 0.15; kite.add(hole);
    for (const [c, y] of [[0xd4372c, 2.12], [0x3170c9, 1.38]]) { const b = mesh(new THREE.BoxGeometry(0.72, 0.1, 0.035), M(c), 0, y, 0.052); b.rotation.z = 0.15; kite.add(b); }
    // 눈사람
    const snow = M(0xf4f7fb, { roughness: 0.9 });
    const snowman = new THREE.Group();
    snowman.add(mesh(new THREE.SphereGeometry(0.45, 14, 12), snow, 0, 0.42, 0), mesh(new THREE.SphereGeometry(0.32, 14, 12), snow, 0, 1.0, 0));
    snowman.add(mesh(new THREE.ConeGeometry(0.05, 0.22, 6), M(0xf28c28), 0, 1.0, 0.36).rotateX(Math.PI / 2));
    for (const x of [-0.1, 0.1]) snowman.add(mesh(new THREE.SphereGeometry(0.035, 6, 5), M(0x231916), x, 1.1, 0.28));
    snowman.add(mesh(new THREE.TorusGeometry(0.27, 0.06, 6, 14), M(0xd4372c), 0, 0.8, 0).rotateX(Math.PI / 2));
    // 진달래 화분 (항아리 + 분홍 꽃 덤불)
    const azalea = new THREE.Group();
    azalea.add(mesh(new THREE.CylinderGeometry(0.32, 0.24, 0.45, 10), M(0x8a4a2a), 0, 0.22, 0));
    const pink = M(0xf28bb0), leaf = M(0x5f9e3a);
    for (const [x, y, z, r, m] of [[0, 0.62, 0, 0.3, leaf], [-0.18, 0.7, 0.1, 0.17, pink], [0.16, 0.74, -0.05, 0.18, pink], [0.02, 0.86, 0.12, 0.15, pink], [-0.05, 0.78, -0.18, 0.14, pink]]) azalea.add(mesh(new THREE.SphereGeometry(r, 10, 8), m, x, y, z));
    for (const [n, g] of [['fest_lantern', lantern], ['fest_kite', kite], ['fest_snowman', snowman], ['fest_azalea', azalea]]) if (!a.scenes.has(n)) a.scenes.set(n, g);
  }
}

/** 빛 표시 붙이기 (모든 정점에 같은 값) */
function glowAttr(g, v) { g.setAttribute('glow', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count).fill(v), 1)); return g; }

/** 축제 꾸밈 재질: 연등(glow 1)만 정점 색으로 빛남, 깃발·가판대(glow 0)는 보통 재질 */
function lanternMaterial() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.7, emissive: LANTERN_EMIT, emissiveIntensity: 0.4 });
  // 빛 = 주황 × (등 색과 진한 주황을 반반) × glow: 파란·보라 등도 속은 따뜻하게, 붉은 등은 더 붉게
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float glow;\nvarying float vGlow;').replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvGlow = glow;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vGlow;').replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance *= mix(vec3(1.0, 0.55, 0.25), vColor.rgb, 0.5) * vGlow;');
  };
  m.customProgramCacheKey = () => 'fest-lantern2';
  return m;
}

/** 빛무리 덩어리: 연등마다 네 꼭짓점이 같은 자리(중심) + 모서리 방향(corner) → 정점 셰이더가 화면 쪽으로 펼침 */
function haloGeometry(pts) {
  const n = pts.length, pos = new Float32Array(n * 12), cor = new Float32Array(n * 8), idx = [];
  pts.forEach((p, i) => {
    for (let k = 0; k < 4; k++) { pos.set(p, i * 12 + k * 3); cor.set([k % 2 ? 1 : -1, k < 2 ? -1 : 1], i * 8 + k * 2); }
    const o = i * 4; idx.push(o, o + 1, o + 2, o + 2, o + 1, o + 3);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('corner', new THREE.BufferAttribute(cor, 2));
  g.setIndex(idx);
  return g;
}

/** 빛무리 재질: 가운데가 밝은 둥근 주황빛 (그림 없이 셰이더로), 더하기 섞기 */
function haloMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uA: { value: 0 }, uSize: { value: HALO_SIZE }, uCol: { value: new THREE.Color(LANTERN_EMIT) } },
    vertexShader: `attribute vec2 corner; uniform float uSize; varying vec2 vC;
      void main() { vC = corner; vec4 mv = modelViewMatrix * vec4(position, 1.0); mv.xy += corner * uSize * 0.5; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform float uA; uniform vec3 uCol; varying vec2 vC;
      void main() { float r = length(vC); float a = smoothstep(1.0, 0.0, r); a *= a; gl_FragColor = vec4(uCol * a * uA * 0.75, 1.0); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false,
  });
}

/** 정점 색 덩어리 만들기 (상자·띠·깃발) */
class Builder {
  constructor() { this.pos = []; this.col = []; this.nrm = []; }
  _tri(a, b, c, col) {
    const ab = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), ac = new THREE.Vector3(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
    const n = ab.cross(ac).normalize();
    const C = new THREE.Color(col);
    for (const p of [a, b, c]) { this.pos.push(p[0], p[1], p[2]); this.nrm.push(n.x, n.y, n.z); this.col.push(C.r, C.g, C.b); }
  }
  /** 두 점 사이 얇은 띠 (줄) */
  ribbon(a, b, w, col) {
    const a2 = [a[0], a[1] - w, a[2]], b2 = [b[0], b[1] - w, b[2]];
    this._tri(a, b, b2, col); this._tri(a, b2, a2, col);
  }
  /** 줄에 매단 깃발: p 에서 아래로 뾰족 (q 는 줄 방향) */
  flag(p, q, w, h, col) {
    const dx = q[0] - p[0], dz = q[2] - p[2], l = Math.hypot(dx, dz) || 1, ux = (dx / l) * w / 2, uz = (dz / l) * w / 2;
    this._tri([p[0] - ux, p[1], p[2] - uz], [p[0] + ux, p[1], p[2] + uz], [p[0], p[1] - h, p[2]], col);
  }
  /** 상자 (가운데 x,y,z, 크기, y축 회전) */
  box(x, y, z, sx, sy, sz, col, rot = 0) {
    const c = Math.cos(rot), s = Math.sin(rot);
    const v = (lx, ly, lz) => [x + lx * c + lz * s, y + ly, z - lx * s + lz * c];
    const X = sx / 2, Y = sy / 2, Z = sz / 2;
    const P = [v(-X, -Y, -Z), v(X, -Y, -Z), v(X, Y, -Z), v(-X, Y, -Z), v(-X, -Y, Z), v(X, -Y, Z), v(X, Y, Z), v(-X, Y, Z)];
    const F = [[4, 5, 6, 7], [1, 0, 3, 2], [5, 1, 2, 6], [0, 4, 7, 3], [7, 6, 2, 3], [0, 1, 5, 4]];
    for (const [a, b, cc, d] of F) { this._tri(P[a], P[b], P[cc], col); this._tri(P[a], P[cc], P[d], col); }
  }
  /** 납작한 반구 (떡·그릇): 가운데 x,y(바닥),z, 반지름 r, 높이 hgt — 8조각 */
  dome(x, y, z, r, hgt, col) {
    const N = 8, ring = (k, t) => { const a = (k / N) * Math.PI * 2, rr = r * Math.cos(t * Math.PI / 2); return [x + Math.cos(a) * rr, y + Math.sin(t * Math.PI / 2) * hgt, z + Math.sin(a) * rr]; };
    for (let k = 0; k < N; k++) {
      const a0 = ring(k, 0), a1 = ring(k + 1, 0), b0 = ring(k, 0.6), b1 = ring(k + 1, 0.6), top = [x, y + hgt, z];
      this._tri(a0, b0, b1, col); this._tri(a0, b1, a1, col); this._tri(b0, top, b1, col);
    }
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeBoundingSphere();
    return g;
  }
}

/** 연등 덩어리: 둥근 등(정이십면체) + 위아래 금색 테 */
class LanternGeo {
  constructor() { this.parts = []; this.base = new THREE.IcosahedronGeometry(0.17, 1).toNonIndexed(); this.base.scale(1, 1.25, 1); this.cap = new THREE.CylinderGeometry(0.08, 0.08, 0.05, 8).toNonIndexed(); }
  add(x, y, z, col) {
    const body = this.base.clone().translate(x, y, z), top = this.cap.clone().translate(x, y + 0.22, z), bot = this.cap.clone().translate(x, y - 0.22, z);
    for (const [g, c] of [[body, col], [top, 0xf6c63c], [bot, 0xf6c63c]]) {
      const C = new THREE.Color(c), n = g.attributes.position.count, arr = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { arr[i * 3] = C.r; arr[i * 3 + 1] = C.g; arr[i * 3 + 2] = C.b; }
      g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
      g.deleteAttribute('uv');
      this.parts.push(g);
    }
  }
  geometry() {
    let n = 0;
    for (const g of this.parts) n += g.attributes.position.count;
    const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), col = new Float32Array(n * 3);
    let o = 0;
    for (const g of this.parts) { pos.set(g.attributes.position.array, o); nrm.set(g.attributes.normal.array, o); col.set(g.attributes.color.array, o); o += g.attributes.position.count * 3; g.dispose(); }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    out.computeBoundingSphere();
    return out;
  }
}
