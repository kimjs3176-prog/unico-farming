import * as THREE from 'three';
import { LAYOUT } from '../world.js';
import { ITEMS, itemsOf } from '../sim/items.js';
import { RODS } from '../sim/angling.js';
import { makeFish } from '../fishmesh.js';
import { signTexture, attachSign } from './koat_view.js';

const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };

/** 호수 전용 물고기 힌트 (기록판·도감) */
export const LAKE_HINT = (id) => {
  const it = ITEMS[id];
  if (it.legend) return '전설 · 좋은 낚싯대와 떡밥이 있으면…';
  if (it.night) return '밤에만 나와요';
  if (it.cold) return '추운 날·눈 오는 날에 잘 잡혀요';
  if (it.rain) return '비 오는 날에 잘 잡혀요';
  return it.rarity >= 2 ? '힘이 세서 힘겨루기가 필요해요' : '흔해요';
};

/**
 * 유니코 낚시터 (남서쪽 호수)
 *  - 부두·나룻배·물가 장식은 World._lake (정적 병합), 여기서는 움직이거나 상호작용하는 것
 *  - 낚시 가게 부스(낚싯대 업그레이드·떡밥), 기록판(오늘의 의뢰·최대어·호수 어종), 튀어 오르는 물고기, 첫 방문 컷신
 *  - 실제 낚시(찌·입질·힘겨루기)는 NatureView 가 연못과 함께 처리
 */
export class LakeView {
  constructor(game) {
    this.game = game;
    const W = game.world, K = LAYOUT.lake;
    this.t = 0;
    // 낚시 가게: 체험관 부스 모델 + 파란 지붕 + 간판
    const S = K.shop;
    this.shop = W.place('booth', S.x, S.z, S.rot, 0.95);
    this.shop.traverse((o) => { if (o.isMesh && (o.parent?.name === 'RoofTint' || o.name === 'RoofTint')) { o.material = o.material.clone(); o.material.color.setHex(0x3a8fd8); } });
    attachSign(this.shop, signTexture('🎣 유니코 낚시 가게', '낚싯대 · 떡밥 · 오늘의 의뢰', '#ffffff', '#1d4f7a'));
    // 가게 옆 낚싯대 거치대 + 물고기 양동이
    const rack = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: 0x7a5232, roughness: 0.85 });
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.08, 0.08), wood); bar.position.y = 1.0;
    const legs = [-0.6, 0.6].map((x) => { const l = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.05, 0.08), wood); l.position.set(x, 0.52, 0); return l; });
    rack.add(bar, ...legs);
    for (const [i, r] of RODS.entries()) {
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.025, 2.0, 6), new THREE.MeshStandardMaterial({ color: r.color, roughness: 0.4, metalness: r.id === 'gold' ? 0.6 : 0.1 }));
      rod.position.set(-0.4 + i * 0.4, 1.0, -0.12); rod.rotation.x = -0.22;
      rack.add(rod);
    }
    rack.position.set(S.x + 0.2, 0, S.z + 2.2);
    rack.rotation.y = S.rot + Math.PI;
    W.scene.add(rack);
    W.obstacles.push({ x: rack.position.x, z: rack.position.z, r: 0.5 });
    const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.17, 0.32, 14, 1, true), new THREE.MeshStandardMaterial({ color: 0x6f8fa8, roughness: 0.5, metalness: 0.4, side: THREE.DoubleSide }));
    bucket.position.set(S.x - 1.0, 0.16, S.z - 2.0);
    W.scene.add(bucket);
    const water = new THREE.Mesh(new THREE.CircleGeometry(0.2, 14), new THREE.MeshStandardMaterial({ color: 0x4c97c4, roughness: 0.1 }));
    water.rotation.x = -Math.PI / 2; water.position.set(bucket.position.x, 0.27, bucket.position.z);
    W.scene.add(water);
    const bf = makeFish('fish_crucian', 0.22); bf.position.set(bucket.position.x, 0.33, bucket.position.z); bf.rotation.z = 0.9;
    W.scene.add(bf);
    // 기록판
    const B = K.board;
    this.board = W.place('sign', B.x, B.z, -0.9, 1.25, { collide: true, dynamic: true, r: 0.45 });
    W.signText(this.board, '🏆 낚시터 기록판', '오늘의 의뢰 · 최대어');
    // 튀어 오르는 물고기 (가끔)
    this.jumper = makeFish('fish_trout', 0.45);
    this.jumper.visible = false;
    W.scene.add(this.jumper);
    this.jumpT = 3;
    this.jump = null;
    // 물결 고리 (튀어 오를 때·떨어질 때)
    this.ripples = [0, 1, 2].map(() => {
      const r = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.27, 28), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
      r.rotation.x = -Math.PI / 2;
      W.scene.add(r);
      return r;
    });
    this.ri = 0;
    // 물속 보물: 반짝이는 자리 + 올라오는 물방울 (헤엄쳐 가서 잠수하면 조개·진주·코인)
    const glintMat = new THREE.MeshBasicMaterial({ color: 0xfff6c0, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending });
    const bubMat = new THREE.MeshBasicMaterial({ color: 0xe8f8ff, transparent: true, opacity: 0.75, depthWrite: false });
    const bubGeo = new THREE.SphereGeometry(0.05, 8, 6);
    this.treasures = [0, 1].map(() => {
      const g2 = new THREE.Group();
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.25, 0.42, 24), glintMat);
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05;
      const bubbles = [0, 1, 2].map((k) => { const b = new THREE.Mesh(bubGeo, bubMat); b.userData.ph = k / 3; g2.add(b); return b; });
      g2.add(ring);
      W.scene.add(g2);
      const tr = { g: g2, ring, bubbles, respawn: 0 };
      this.placeTreasure(tr);
      return tr;
    });
    // 수영: 물에 들어가고 나올 때, 헤엄칠 때 물보라
    const P = game.player;
    P.onSwim = (on) => {
      const p = P.position;
      game.fx.burst(p.x, 0.2, p.z, 0xdff4ff, on ? 14 : 8);
      this.splash(p.x, p.z, on ? 1.6 : 1);
      game.audio.play('water', on ? 0.6 : 0.35);
      if (on) {
        game.onEvent('swim');
        if (!game.flags.swimTip) { game.flags.swimTip = true; game.ui.toast('🏊 첨벙! 헤엄치는 중이에요. 물속에서 반짝이는 곳에 가면 잠수해서 보물을 찾을 수 있어요 (E)'); }
      }
    };
    P.unico.onStroke = (x, z) => { this.splash(x, z, 0.7); if (Math.random() < 0.5) game.fx.burst(x, 0.12, z, 0xe8f8ff, 3); };
    // 물속을 천천히 헤엄치는 그림자 3마리
    const shMat = new THREE.MeshBasicMaterial({ color: 0x163040, transparent: true, opacity: 0.35, depthWrite: false });
    this.shadows = [0, 1, 2].map((i) => {
      const m = new THREE.Mesh(new THREE.CircleGeometry(0.3, 12), shMat);
      m.rotation.x = -Math.PI / 2;
      m.scale.set(0.5 + i * 0.12, 1.4 + i * 0.3, 1);
      W.scene.add(m);
      return { m, a: i * 2.1, r: 2 + i * 1.1, sp: 0.18 + i * 0.05 };
    });
  }

  /** 보물 자리 새로 정하기 (부두·물가에서 떨어진 곳) */
  placeTreasure(tr) {
    const K = LAYOUT.lake, W = this.game.world;
    for (let k = 0; k < 20; k++) {
      const a = Math.random() * 6.28, r = 1 + Math.random() * (K.r - 2.2);
      const x = K.x + Math.cos(a) * r, z = K.z + Math.sin(a) * r;
      if (W.onDeck(x, z, -2.2) || this.treasures?.some((o) => o !== tr && o.g.visible && Math.hypot(o.g.position.x - x, o.g.position.z - z) < 2.5)) continue;
      tr.g.position.set(x, 0, z);
      tr.g.visible = true;
      return;
    }
  }

  /** 잠수: 1.4초 동안 물속으로 쑥 → 보물 */
  dive(tr) {
    const g = this.game, P = g.player, u = P.unico;
    P.frozen = true;
    u.playAction('dive', 1.4);
    g.audio.play('water', 0.7);
    this.splash(P.position.x, P.position.z, 1.4);
    this.diving = { t: 0, tr };
  }

  _diveDone(tr) {
    const g = this.game, P = g.player;
    P.frozen = false;
    tr.g.visible = false;
    tr.respawn = 35 + Math.random() * 40;
    const p = P.position;
    g.fx.burst(p.x, 0.3, p.z, 0xdff4ff, 16);
    this.splash(p.x, p.z, 1.8);
    const r = Math.random();
    let text;
    if (r < 0.07) { g.economy.addItem('pearl', 1); text = `${ITEMS.pearl.emoji} 반짝반짝 ${ITEMS.pearl.name}!`; g.audio.play('levelup'); }
    else if (r < 0.62) { g.economy.addItem('clam', 1); text = `${ITEMS.clam.emoji} ${ITEMS.clam.name}`; g.audio.play('coin'); }
    else if (r < 0.82) { const n = 30 + Math.floor(Math.random() * 6) * 10; g.economy.earn(n); text = `🪙 물에 빠진 동전 ${n}`; g.audio.play('coin'); }
    else { g.economy.addItem('fish_snail', 1); const rec = g.collection.add('fish_snail', { size: 4 + Math.round(Math.random() * 3), day: g.world.day }); text = `🐌 우렁이${rec.isNew ? ' (도감 등록!)' : ''}`; g.afterCollect?.(); g.audio.play('harvest'); }
    g.fx.pop(p.x, p.z, text.split(' ')[0]);
    g.ui.toast(`🤿 잠수해서 ${text}을(를) 찾았어요!`);
    g.onEvent('dive');
  }

  /** 낚시터 근처인가 (첫 방문 컷신·안내) */
  near(p, pad = 5) { const K = LAYOUT.lake; return Math.hypot(p.x - K.x, p.z - K.z) < K.r + pad; }

  /**
   * 이 자리에서 호수에 낚싯대를 던질 수 있으면 { dir, spot } (물가 또는 부두 위)
   */
  castFrom(p, facing) {
    const K = LAYOUT.lake, W = this.game.world;
    const dc = Math.hypot(p.x - K.x, p.z - K.z);
    const okSpot = (x, z) => Math.hypot(x - K.x, z - K.z) < K.r - 0.7 && !W.onDeck(x, z, -0.7);
    if (W.onDeck(p.x, p.z)) {
      // 부두 위: 바라보는 쪽 → 좌우 → 뒤 순서로 물이 있는 쪽
      for (const off of [0, Math.PI / 2, -Math.PI / 2, Math.PI]) {
        const a = facing + off, dir = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
        const spot = new THREE.Vector3(p.x + dir.x * 2.8, 0.05, p.z + dir.z * 2.8);
        if (okSpot(spot.x, spot.z)) return { dir, spot, pier: true };
      }
      return null;
    }
    if (dc > K.r - 0.6 && dc < K.r + 2.2) {
      const dir = new THREE.Vector3(K.x - p.x, 0, K.z - p.z).normalize();
      const spot = new THREE.Vector3(p.x + dir.x * (dc - K.r + 2.2), 0.05, p.z + dir.z * (dc - K.r + 2.2));
      if (okSpot(spot.x, spot.z)) return { dir, spot, pier: false };
    }
    return null;
  }

  splash(x, z, s = 1) {
    const r = this.ripples[this.ri++ % this.ripples.length];
    r.position.set(x, 0.05, z);
    r.scale.setScalar(s);
    r.material.opacity = 0.85;
  }

  update(dt, pp) {
    const g = this.game, K = LAYOUT.lake;
    this.t += dt;
    const close = Math.hypot(pp.x - K.x, pp.z - K.z) < 32;
    // 물결 고리 퍼지기
    for (const r of this.ripples) if (r.material.opacity > 0) { r.material.opacity = Math.max(0, r.material.opacity - dt * 0.9); r.scale.multiplyScalar(1 + dt * 1.6); }
    // 물고기 그림자 헤엄
    for (const s of this.shadows) {
      s.m.visible = close;
      if (!close) continue;
      s.a += dt * s.sp;
      const x = K.x + Math.cos(s.a) * s.r + Math.sin(s.a * 2.3) * 0.6, z = K.z + Math.sin(s.a) * s.r * 0.8;
      s.m.position.set(x, 0.045, z);
      s.m.rotation.z = -s.a;
    }
    // 가끔 물고기가 수면 위로 튀어 오름
    if (close && !this.jump && (this.jumpT -= dt) <= 0) {
      const a = Math.random() * 6.28, r = 1.5 + Math.random() * (K.r - 2.5);
      const x = K.x + Math.cos(a) * r, z = K.z + Math.sin(a) * r;
      if (!g.world.onDeck(x, z, -1)) {
        this.jump = { x, z, t: 0, yaw: Math.random() * 6.28, dur: 0.75 + Math.random() * 0.3, hgt: 0.6 + Math.random() * 0.5 };
        this.jumper.visible = true;
        this.splash(x, z, 1.2);
        if (Math.hypot(pp.x - x, pp.z - z) < 14) g.audio.play('water', 0.25);
      }
      this.jumpT = 4 + Math.random() * 6;
    }
    if (this.jump) {
      const j = this.jump, k = (j.t += dt) / j.dur;
      const fwd = (k - 0.5) * 1.2;
      this.jumper.position.set(j.x + Math.sin(j.yaw) * fwd, 0.03 + Math.sin(Math.min(1, k) * Math.PI) * j.hgt, j.z + Math.cos(j.yaw) * fwd);
      this.jumper.rotation.set(0, j.yaw - Math.PI / 2, (0.5 - k) * 2.2);
      this.jumper.userData.tail.rotation.y = Math.sin(this.t * 30) * 0.5;
      if (k >= 1) { this.jumper.visible = false; this.splash(this.jumper.position.x, this.jumper.position.z, 1.4); this.jump = null; }
    }
    // 물속 보물: 반짝임·물방울, 헤엄쳐 가까이 가면 잠수
    for (const tr of this.treasures) {
      if (!tr.g.visible) { if ((tr.respawn -= dt) <= 0) this.placeTreasure(tr); continue; }
      if (!close) continue;
      const pulse = 0.5 + 0.5 * Math.sin(this.t * 3 + tr.g.position.x);
      tr.ring.scale.setScalar(0.8 + pulse * 0.4);
      tr.ring.material.opacity = 0.35 + pulse * 0.45;
      for (const b of tr.bubbles) { const k = (this.t * 0.6 + b.userData.ph) % 1; b.position.set(Math.sin(k * 9 + b.userData.ph * 7) * 0.15, 0.02 + k * 0.5, Math.cos(k * 7) * 0.15); b.scale.setScalar(1 - k * 0.6); }
    }
    if (this.diving) {
      const dv = this.diving;
      dv.t += dt;
      if (dv.t > 0.3 && dv.t < 1.1 && Math.random() < dt * 8) g.fx.burst(pp.x + (Math.random() - 0.5) * 0.4, 0.1, pp.z + (Math.random() - 0.5) * 0.4, 0xe8f8ff, 2);
      if (dv.t >= 1.4) { this.diving = null; this._diveDone(dv.tr); }
      return { d: -1, label: '🤿 잠수 중… 보글보글', key: 'diving' };
    }
    if (g.player.swimming) {
      let tb = null, td = 1.5;
      for (const tr of this.treasures) { if (!tr.g.visible) continue; const d = Math.hypot(tr.g.position.x - pp.x, tr.g.position.z - pp.z); if (d < td) { td = d; tb = tr; } }
      if (tb) return { d: -0.2, label: '🤿 잠수해서 반짝이는 곳 살펴보기', key: 'dive', onInteract: () => this.dive(tb) };
    }
    // 첫 방문: 낚시꾼이 소개 (컷신)
    if (!g.flags.lakeIntro && this.near(pp, 3) && !g.cinema.locked && !g.dialogue.active && !g.ui.panel && !g.nature.fishing) {
      g.flags.lakeIntro = true;
      this.intro();
    }
    // 상호작용: 가게 부스, 기록판
    let best = null;
    const S = K.shop, B = K.board;
    const ds = Math.hypot(pp.x - S.x, pp.z - S.z);
    if (ds < 2.6) best = { d: ds, label: '🎣 낚시 가게 (낚싯대 · 떡밥)', key: 'lakeshop', onInteract: () => this.openShop() };
    const db = Math.hypot(pp.x - B.x, pp.z - B.z);
    if (db < 2.2 && (!best || db < best.d)) best = { d: db, label: '🏆 낚시터 기록판 보기', key: 'lakeboard', onInteract: () => this.openBoard() };
    return best;
  }

  /** 첫 방문 컷신: 호수를 비추고 낚시꾼이 규칙 설명, 환영 선물 떡밥 */
  intro() {
    const g = this.game, K = LAYOUT.lake;
    const fisher = g.npcs.list.find((e) => e.id === 'fisher')?.u;
    const F = { speaker: fisher, name: '🎣 낚시꾼 유니코', color: '#3a7bd5', emote: 'wave' };
    const pe = K.pier[1];
    g.cinema.play([
      { cam: [[K.x + 9, 7.5, K.z - 9], [K.x, 0, K.z + 1], 2.4] },
      { say: [{ ...F, text: '어서 와! 여기는 유니코 낚시터야. 연못에서는 못 보는 물고기들이 산단다 🎣' }] },
      { cam: [[K.x - 3.5, 2.6, pe.z0 - 2.5], [K.x, 0.3, pe.z1 + 1.5], 2.0] },
      { say: [{ ...F, text: '부두 끝이나 물가에서 낚싯대를 던져 봐. 큰 녀석이 물면 힘겨루기가 시작돼!' }] },
      { say: [{ ...F, text: '꾹 눌러서 감고, 줄이 빨갛게 팽팽해지거나 물고기가 몸부림치면 잠깐 놓아 줘. 지치면 그때 확 감는 거야!' }] },
      { cam: [[K.shop.x - 4.2, 2.4, K.shop.z - 2.4], [K.shop.x, 1.2, K.shop.z], 1.8] },
      { say: [{ ...F, text: '떡밥이랑 더 좋은 낚싯대는 내 가게에서 팔아. 기록판에는 매일 바뀌는 의뢰가 붙어 있으니 꼭 확인하고!' }] },
      { run: () => {
        g.economy.addItem('bait', 3);
        g.audio.play('coin');
        g.ui.toast('🪱 환영 선물로 떡밥 3개를 받았어요! (떡밥이 있으면 자동으로 써요)');
      } },
    ]);
  }

  // ------------------------------------------------------------ 가게
  openShop() {
    const g = this.game, A = g.angling, eco = g.economy, ui = g.ui;
    const p = ui.openPanel('🎣 유니코 낚시 가게');
    p.dataset.kind = 'lakeshop';
    const render = () => {
      p.querySelectorAll('.body').forEach((e) => e.remove());
      const body = h('div', 'body');
      body.append(h('div', 'chip', `🪙 보유 <span class="money">${eco.money.toLocaleString()}</span> 코인`));
      body.append(h('h3', '', '🎣 낚싯대'));
      const rows = h('div', 'rows');
      for (const [i, r] of RODS.entries()) {
        const own = i <= A.rod, cur = i === A.rod, next = i === A.rod + 1;
        const row = h('div', 'row', `<span>${r.emoji}</span><span class="nm">${r.name}${cur ? ' <span class="qty">사용 중</span>' : ''}<br><small>${r.desc} · 버팀 ×${r.tension} · 감기 ×${r.reel}</small></span><span class="pr">${own ? '보유' : `${r.price.toLocaleString()}🪙 · Lv.${r.level}`}</span>`);
        if (next) {
          const c = A.canUpgrade(eco.money, g.quests.level);
          const b = h('button', '', c.ok ? '구매' : c.reason === 'level' ? `Lv.${c.need} 필요` : '코인 부족');
          b.disabled = !c.ok;
          b.onclick = () => {
            if (!A.canUpgrade(eco.money, g.quests.level).ok) return;
            eco.money -= r.price; eco.stats.spent += r.price;
            A.upgrade();
            g.audio.play('levelup');
            g.player.unico.playAction('cheer', 1.4);
            ui.toast(`${r.emoji} ${r.name}을(를) 손에 넣었어요! 줄이 더 튼튼해졌어요`);
            render();
          };
          row.append(b);
        }
        rows.append(row);
      }
      body.append(rows);
      body.append(h('h3', '', '🪱 떡밥 (던질 때 1개씩: 입질이 빨라지고 희귀한 물고기가 잘 와요)'));
      const bt = ITEMS.bait;
      const br = h('div', 'row', `<span>${bt.emoji}</span><span class="nm">${bt.name} <span class="qty">보유 ${eco.count('bait')}</span></span><span class="pr">${bt.price}🪙</span>`);
      for (const n of [1, 5, 10]) {
        const cost = n === 10 ? bt.price * 9 : bt.price * n; // 10개 묶음은 1개 덤
        const b = h('button', '', n === 10 ? `10개 (${cost}🪙)` : `${n}개`);
        b.disabled = eco.money < cost;
        b.onclick = () => { if (eco.money < cost) return; eco.money -= cost; eco.stats.spent += cost; eco.addItem('bait', n); g.audio.play('coin'); render(); };
        br.append(b);
      }
      const brRows = h('div', 'rows'); brRows.append(br); body.append(brRows);
      const tog = h('label', 'row', `<span>⚙️</span><span class="nm">떡밥 자동 사용</span>`);
      const cb = h('input'); cb.type = 'checkbox'; cb.checked = A.useBait;
      cb.onchange = () => { A.useBait = cb.checked; };
      tog.append(cb);
      const tgRows = h('div', 'rows'); tgRows.append(tog); body.append(tgRows);
      const req = A.today(g.world.day);
      if (req.done && !req.claimed) {
        const cl = h('button', '', `📋 의뢰 보고하고 보상 받기 (+${req.reward}🪙, 떡밥 ${req.bait})`);
        cl.style.marginTop = '10px';
        cl.onclick = () => { this.claimRequest(); render(); };
        body.append(cl);
      }
      p.append(body);
    };
    render();
  }

  /** 의뢰 보상 (가게·낚시꾼 대화에서) */
  claimRequest() {
    const g = this.game, r = g.angling.claim(g.world.day);
    if (!r) return null;
    g.economy.earn(r.money);
    g.economy.addItem('bait', r.bait);
    g.audio.play('levelup');
    g.ui.toast(`📋 낚시꾼의 의뢰 완료! +${r.money}🪙, 🪱 떡밥 ${r.bait}개`);
    g.onEvent('lakereq');
    return r;
  }

  // ------------------------------------------------------------ 기록판
  openBoard() {
    const g = this.game, A = g.angling, col = g.collection;
    const p = g.ui.openPanel('🏆 유니코 낚시터 기록판');
    p.dataset.kind = 'lakeboard';
    const req = A.today(g.world.day);
    const it = ITEMS[req.fish];
    const state = req.claimed ? '✅ 완료' : req.done ? '🎉 달성! 낚시꾼에게 보고하세요' : '진행 중';
    p.append(h('h3', '', '📋 오늘의 의뢰'));
    p.append(h('div', 'rows', `<div class="row"><span>${it.emoji}</span><span class="nm">${it.name} <b>${req.min}cm 이상</b> 낚기<br><small>보상 ${req.reward}🪙 + 떡밥 ${req.bait}개 · 내일 새 의뢰</small></span><span class="pr">${state}</span></div>`));
    p.append(h('h3', '', '🎣 내 기록'));
    const big = A.biggest ? `${ITEMS[A.biggest.fish].emoji} ${ITEMS[A.biggest.fish].name} ${A.biggest.size}cm` : '아직 없어요';
    p.append(h('div', 'rows', `<div class="row"><span>🏅</span><span class="nm">낚시터 최고의 한 마리</span><span class="pr">${big}</span></div><div class="row"><span>💪</span><span class="nm">힘겨루기 승리</span><span class="pr">${A.fights}번</span></div><div class="row"><span>${A.rodInfo.emoji}</span><span class="nm">사용 중인 낚싯대</span><span class="pr">${A.rodInfo.name}</span></div>`));
    p.append(h('h3', '', '🐟 낚시터 물고기'));
    const lake = itemsOf('fish').filter((k) => ITEMS[k].where === 'lake' || ['fish_crucian', 'fish_carp', 'fish_catfish', 'fish_goldfish'].includes(k));
    const rows = h('div', 'rows');
    for (const k of lake) {
      const e = col.entries[k], f = ITEMS[k];
      rows.append(h('div', 'row', e
        ? `<span>${f.emoji}</span><span class="nm">${f.name}<br><small>${LAKE_HINT(k)}</small></span><span class="pr">최대 ${e.best ?? '-'}cm · ${e.count}마리</span>`
        : `<span>❔</span><span class="nm">???<br><small>${LAKE_HINT(k)}</small></span><span class="pr">미발견</span>`));
    }
    p.append(rows);
  }
}
