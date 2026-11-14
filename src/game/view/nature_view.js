import { josa } from '../sim/josa.js';
import * as THREE from 'three';
import { heightAt } from '../terrain.js';
import { LAYOUT } from '../world.js';
import { ITEMS } from '../sim/items.js';
import { FishingSim, rollBug } from '../sim/fishing.js';
import { ReelFight, needsFight, BAIT_RARE } from '../sim/angling.js';
import { makeFish, showLength } from '../fishmesh.js';
import { makeLabel } from '../label.js';
import { touchUI } from '../input.js';

const FRUIT_COLOR = { fruit_apple: 0xe0413a, fruit_peach: 0xf7a8a0, fruit_pear: 0xd9d26a, fruit_persimmon: 0xf08a24 };
const BUG_COLOR = { bug_butterfly: 0xffffff, bug_swallowtail: 0xf6d64a, bug_dragonfly: 0xe0413a, bug_ladybug: 0xd93025, bug_beetle: 0x5a3a22, bug_firefly: 0xd8ff6a };

/**
 * 자연 요소
 * - 과일 나무: 하루 한 번 흔들면 열매가 떨어짐 (가끔 곤충·코인)
 * - 나비/잠자리(낮), 반딧불이(밤): 가까이 가서 잡기
 * - 연못 낚시: 찌, 물고기 그림자, 입질 타이밍
 */
export class NatureView {
  constructor(game) {
    this.game = game;
    const scene = game.world.scene;
    this.t = 0;
    // ---- 과일 나무 ----
    this.trees = LAYOUT.orchard.map((o, i) => {
      const m = game.world.place('fruit_tree', o.x, o.z, i * 1.3, 1.1, { r: 0.5, dynamic: true });
      const mat = new THREE.MeshStandardMaterial({ color: FRUIT_COLOR[o.fruit], roughness: 0.45 });
      const fruits = [];
      for (let k = 0; k < 6; k++) {
        const sock = m.getObjectByName(`Fruit${k}`);
        if (!sock) continue;
        const f = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), mat);
        f.castShadow = true;
        sock.add(f);
        fruits.push(f);
      }
      const canopy = m.getObjectByName('Canopy');
      return { ...o, m, canopy, fruits, shakenDay: 0, shake: 0 };
    });
    // ---- 곤충 ----
    const wing = new THREE.PlaneGeometry(0.16, 0.12).translate(0.08, 0, 0);
    this.bugs = [];
    const n = game.quality?.level === 'low' ? 5 : 8;
    for (let i = 0; i < n; i++) {
      const g = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide, roughness: 0.6 });
      const l = new THREE.Mesh(wing, mat), r = new THREE.Mesh(wing, mat);
      r.scale.x = -1;
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.018, 0.08, 3, 6), new THREE.MeshStandardMaterial({ color: 0x2b2b2b }));
      body.rotation.z = Math.PI / 2;
      g.add(l, r, body);
      scene.add(g);
      const bug = { g, l, r, mat, home: null, phase: Math.random() * 6, respawn: 0 };
      this.spawnBug(bug);
      this.bugs.push(bug);
    }
    // 반딧불이 (밤)
    this.fireflyMat = new THREE.MeshBasicMaterial({ color: 0xd8ff6a, transparent: true, opacity: 0.9 });
    // ---- 낚시 ----
    this.fishing = null;
    this.fsim = new FishingSim();
    this.bobber = new THREE.Group();
    const bb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 10), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 }));
    const bt = new THREE.Mesh(new THREE.SphereGeometry(0.121, 12, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xe0413a, roughness: 0.3 }));
    this.bobber.add(bb, bt);
    this.bobber.visible = false;
    scene.add(this.bobber);
    this.fishShadow = new THREE.Mesh(new THREE.CircleGeometry(0.35, 16), new THREE.MeshBasicMaterial({ color: 0x1b2a33, transparent: true, opacity: 0.45, depthWrite: false }));
    this.fishShadow.rotation.x = -Math.PI / 2;
    this.fishShadow.scale.set(0.6, 1.4, 1);
    this.fishShadow.visible = false;
    scene.add(this.fishShadow);
    this.lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    this.line = new THREE.Line(this.lineGeo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 }));
    this.line.visible = false;
    scene.add(this.line);
  }

  get night() { return this.game.world.daylight < 0.35; }

  spawnBug(b) {
    const night = this.night;
    b.kind = rollBug(Math.random, { night, raining: ['rain', 'storm'].includes(this.game.world.weatherKind) });
    // 꽃·풀밭 위 아무 곳 (길·논·연못 제외)
    for (let k = 0; k < 30; k++) {
      const x = (Math.random() - 0.5) * 60, z = (Math.random() - 0.5) * 50;
      if (this.game.world.isBare(x, z) || this.game.world.isBlocked(x, z, 1) || Math.hypot(x, z - 9) < 6) continue;
      b.home = new THREE.Vector3(x, 0, z);
      break;
    }
    b.home = b.home || new THREE.Vector3(-6, 0, 4);
    const glow = b.kind === 'bug_firefly';
    b.mat.color.setHex(BUG_COLOR[b.kind] ?? ITEMS[b.kind]?.color ?? 0xffffff);
    b.mat.emissive = new THREE.Color(glow ? 0xd8ff6a : 0x000000);
    b.mat.emissiveIntensity = glow ? 3 : 0;
    b.g.visible = true;
    b.respawn = 0;
  }

  update(dt, playerPos) {
    this.t += dt;
    const day = this.game.world.day;
    let best = null;
    const consider = (d, p) => { if (d >= 0 && (!best || d < best.d)) best = { ...p, d }; };
    // ---- 과일 나무 ----
    for (const tr of this.trees) {
      const ripe = tr.shakenDay !== day;
      tr.fruits.forEach((f) => { if (!f.userData.falling) f.visible = ripe; });
      if (tr.shake > 0) {
        tr.shake -= dt;
        if (tr.canopy) tr.canopy.rotation.z = Math.sin(this.t * 40) * 0.06 * tr.shake;
      }
      for (const f of tr.fruits) {
        if (!f.userData.falling) continue;
        f.userData.v -= 9.8 * dt;
        f.position.y += f.userData.v * dt;
        if (f.position.y < f.userData.floor) { f.position.y = 0; f.userData.falling = false; f.visible = false; }
      }
      const d = Math.hypot(tr.x - playerPos.x, tr.z - playerPos.z);
      if (d < 2.6) consider(d, ripe ? { label: `나무 흔들기 (${ITEMS[tr.fruit].emoji} ${ITEMS[tr.fruit].name})`, key: 'shake', onInteract: () => this.shakeTree(tr) } : { label: `${ITEMS[tr.fruit].name} 나무 · 내일 다시 열려요`, key: 'tree' });
    }
    // ---- 곤충 ----
    const night = this.night;
    for (const b of this.bugs) {
      if (!b.g.visible) { b.respawn -= dt; if (b.respawn <= 0) this.spawnBug(b); continue; }
      if ((b.kind === 'bug_firefly' || !!ITEMS[b.kind]?.night) !== night && Math.random() < dt * 0.2) { this.spawnBug(b); continue; }
      b.phase += dt;
      const fly = b.kind !== 'bug_ladybug' && b.kind !== 'bug_beetle' && !ITEMS[b.kind]?.ground;
      const r = fly ? 1.6 : 0.3;
      const bx = b.home.x + Math.sin(b.phase * 0.7) * r + Math.sin(b.phase * 1.9) * 0.4, bz = b.home.z + Math.cos(b.phase * 0.5) * r;
      b.g.position.set(bx, heightAt(bx, bz) + (fly ? 0.7 + Math.sin(b.phase * 2.3) * 0.35 : 0.08), bz);
      b.g.rotation.y = b.phase * 0.7 + Math.PI / 2;
      const flap = fly ? Math.sin(b.phase * (b.kind === 'bug_dragonfly' ? 50 : 18)) * 0.9 : 0;
      b.l.rotation.y = flap; b.r.rotation.y = -flap;
      const d = Math.hypot(b.g.position.x - playerPos.x, b.g.position.z - playerPos.z);
      if (d < 1.9) consider(d, { label: `곤충 잡기 (${ITEMS[b.kind].emoji} ${ITEMS[b.kind].name})`, key: 'bug', onInteract: () => this.catchBug(b) });
    }
    // ---- 낚시 ----
    this._animateCatch(dt);
    if (this.fishing) return this.updateFishing(dt);
    const g = this.game;
    if (!g.player.swimming) {
      const P = LAYOUT.pond;
      const dc = Math.hypot(P.x - playerPos.x, P.z - playerPos.z);
      if (dc > P.r - 0.6 && dc < P.r + 2.2) consider(Math.max(0.1, dc - P.r), { label: '🎣 낚시하기', key: 'fish', onInteract: () => this.startFishing(playerPos) });
      const lk = g.lake?.castFrom(playerPos, g.player.unico.facing);
      if (lk) {
        const bait = g.angling.useBait ? g.economy.count('bait') : 0;
        consider(lk.pier ? 0.05 : 0.15, { label: `🎣 낚시터에서 낚시하기${bait ? ` · 🪱떡밥 ${bait}` : ''}`, key: 'fish', onInteract: () => this.startFishing(playerPos, lk) });
      }
    }
    return best;
  }

  shakeTree(tr) {
    const g = this.game;
    tr.shakenDay = g.world.day;
    tr.shake = 0.8;
    g.audio.play('dig', 0.5);
    g.player.unico.facing = Math.atan2(tr.x - g.player.position.x, tr.z - g.player.position.z);
    g.player.unico.playAction('push', 0.9);
    const wp = new THREE.Vector3();
    tr.fruits.forEach((f, i) => {
      if (i > 2) return; // 3개만 떨어짐
      f.getWorldPosition(wp);
      f.userData.falling = true;
      f.userData.v = 0;
      f.userData.floor = f.position.y - (wp.y - 0.1) / tr.m.scale.y;
    });
    g.economy.addItem(tr.fruit, 3);
    const rec = g.collection.add(tr.fruit, { day: g.world.day });
    g.onEvent('shake');
    let extra = '';
    const r = Math.random();
    if (r < 0.15) { const bug = Math.random() < 0.5 ? 'bug_beetle' : 'bug_ladybug'; g.economy.addItem(bug, 1); g.collection.add(bug, { day: g.world.day }); g.onEvent('bug'); extra = ` 앗, ${ITEMS[bug].emoji} ${ITEMS[bug].name}도 떨어졌어요!`; }
    else if (r < 0.25) { g.economy.earn(100); extra = ' 💰 나무에서 100코인 주머니가 떨어졌어요!'; }
    g.ui.toast(`${ITEMS[tr.fruit].emoji} ${ITEMS[tr.fruit].name} ×3${rec.isNew ? ' (도감 등록!)' : ''}.${extra}`);
    g.afterCollect?.();
  }

  catchBug(b) {
    const g = this.game;
    b.g.visible = false;
    b.respawn = 15 + Math.random() * 15;
    g.economy.addItem(b.kind, 1);
    const rec = g.collection.add(b.kind, { day: g.world.day });
    g.onEvent('bug');
    g.audio.play('harvest');
    g.player.unico.facing = Math.atan2(b.g.position.x - g.player.position.x, b.g.position.z - g.player.position.z);
    g.player.unico.playAction('net', 0.7);
    g.fx.pop(b.g.position.x, b.g.position.z, ITEMS[b.kind].emoji);
    g.ui.toast(`${ITEMS[b.kind].emoji} ${ITEMS[b.kind].name}${josa(ITEMS[b.kind].name, '을/를')} 잡았다!${rec.isNew ? ' 📖 도감 등록!' : ''}`);
    g.afterCollect?.();
  }

  // ---- 낚시 (연못·낚시터 공통) ----
  /** @param lake 낚시터면 LakeView.castFrom 결과 { dir, spot } */
  startFishing(pos, lake = null) {
    const g = this.game, u = g.player.unico, A = g.angling;
    let dir, spot;
    if (lake) { dir = lake.dir.clone(); spot = lake.spot.clone(); }
    else {
      const P = LAYOUT.pond;
      dir = new THREE.Vector3(P.x - pos.x, 0, P.z - pos.z).normalize();
      const dist = Math.hypot(P.x - pos.x, P.z - pos.z);
      const cast = Math.min(dist - 0.6, 2.8);
      spot = new THREE.Vector3(pos.x + dir.x * (dist - P.r + 0.9 + cast * 0.5), 0.05, pos.z + dir.z * (dist - P.r + 0.9 + cast * 0.5));
    }
    u.facing = Math.atan2(dir.x, dir.z);
    g.player.frozen = true;
    this.spot = spot;
    let bait = false;
    if (lake && A.useBait && g.economy.useItem('bait', 1)) bait = true;
    const rod = A.rodInfo;
    const W = g.world, cold = W.weatherKind === 'snow' || (W.weatherCur?.temperature ?? 20) < 8;
    this.fsim.cast({ night: this.night, raining: ['rain', 'storm'].includes(W.weatherKind), lake: !!lake, cold, rare: lake ? rod.rare * (bait ? BAIT_RARE : 1) : 1, bait });
    this.fishing = { phase: 'cast', t: 0, dir, lake: !!lake, bait, rod };
    // 낚싯대 들고 던지기 동작 → 찌가 포물선으로 날아가 착수
    u.holding = 'rod';
    u.prop('rod')?.userData.rod.material.color.setHex(rod.color);
    u.playAction('cast', 0.6);
    this.bobber.visible = this.line.visible = true;
    this.fishShadow.visible = true;
    const a = Math.random() * 6.28;
    this.fishShadow.position.set(spot.x + Math.cos(a) * 2, 0.04, spot.z + Math.sin(a) * 2);
    g.audio.play('click', 0.5);
    g.ui.toast(bait ? `🪱 떡밥을 달았어요 (남은 ${g.economy.count('bait')}) · 찌가 쑥 들어가면 E/탭으로 당기기!` : '🎣 찌가 쑥 들어갈 때 E 또는 화면을 눌러 당기세요! (톡톡 건드리는 건 가짜 입질)');
  }

  /** 찌·물고기 물결: 수면 파문 (크면 물방울도) */
  splash(scale = 1, at = this.spot) {
    const W = this.game.waterfx;
    if (!W) return;
    W.ripple(at.x, at.z, Math.min(1.5, scale * 0.55));
    if (scale >= 1.5) W.spray(at.x, 0.05, at.z, Math.round(scale * 7), { up: 1.6 + scale * 0.4, spread: 0.5, size: 0.05 });
  }

  /** 낚싯대 끝 (손에 든 도구) */
  _tip() {
    const g = this.game, out = (this._tipV ||= new THREE.Vector3());
    return g.player.unico.rodTip(out) || out.copy(g.player.position).add(new THREE.Vector3(0, 1.6, 0)).addScaledVector(this.fishing.dir, 1.2);
  }

  /** 힘겨루기 화면 (줄 길이·텐션 게이지 + 누르고 있는 버튼) */
  _reelHud(show) {
    if (!this.hud) {
      const el = document.createElement('div');
      el.className = 'reel-hud hidden';
      el.innerHTML = `<div class="rh-title">🎣 <span class="nm">힘겨루기!</span></div>
        <div class="rh-row"><span>남은 줄</span><div class="rh-bar line"><i class="fish">🐟</i><i class="me">🦄</i></div></div>
        <div class="rh-row"><span>텐션</span><div class="rh-bar ten"><em></em><b></b></div></div>
        <div class="rh-tip">꾹 누르면 감기 · <b>빨간 구간</b>이거나 물고기가 <b>몸부림</b>치면 손을 떼세요!</div>
        <button class="rh-hold">🎣 꾹 눌러 감기</button>`;
      document.getElementById('ui').append(el);
      const btn = el.querySelector('.rh-hold');
      const on = (e) => { this.holdBtn = true; e.preventDefault(); }, off = () => { this.holdBtn = false; };
      btn.addEventListener('pointerdown', on);
      btn.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false }); // iOS 길게 누르기가 감기를 끊지 않게
      for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) btn.addEventListener(ev, off);
      this.hud = { el, fish: el.querySelector('.fish'), ten: el.querySelector('.ten b'), tip: el.querySelector('.rh-tip'), name: el.querySelector('.nm') };
    }
    this.hud.el.classList.toggle('hidden', !show);
    if (!show) this.holdBtn = false;
  }

  updateFishing(dt) {
    const g = this.game, f = this.fishing, u = g.player.unico, input = g.input;
    f.t += dt;
    const tip = this._tip();
    // 던지기: 손을 앞으로 휘두르는 순간(0.42초)부터 찌가 포물선으로 날아감
    if (f.phase === 'cast') {
      const k = Math.min(1, Math.max(0, (f.t - 0.42) / 0.5));
      this.bobber.position.lerpVectors(tip, this.spot, k);
      this.bobber.position.y = k <= 0 ? tip.y : THREE.MathUtils.lerp(tip.y, 0.06, k) + Math.sin(k * Math.PI) * 1.1;
      if (k >= 1) { f.phase = 'wait'; this.splash(1.5); g.audio.play('stroke', 0.4); u.playAction('fishwait', 0); }
    }
    if (f.phase === 'fight') return this._updateFight(dt, tip);
    // 물고기 그림자가 찌 쪽으로 다가옴
    const sh = this.fishShadow.position;
    const to = (this._to ||= new THREE.Vector3()).set(this.spot.x - sh.x, 0, this.spot.z - sh.z);
    if (to.length() > 0.25) { sh.addScaledVector(to.normalize(), dt * 0.6); this.fishShadow.rotation.z = Math.atan2(to.x, to.z); }
    const ev = f.phase === 'wait' ? this.fsim.tick(dt) : null;
    const base = 0.06 + Math.sin(f.t * 3) * 0.01;
    if (ev === 'nibble') { this.bobber.userData.dip = 0.25; g.audio.play('click', 0.3); this.splash(0.6); }
    if (ev === 'bite') {
      this.bobber.userData.dip = 1; this.splash(1.6); g.audio.play('bump', 0.6);
      this.alert = makeLabel('❗', { bg: 'rgba(0,0,0,0)', size: 72, scale: 0.01 });
      this.alert.position.copy(this.spot).add(new THREE.Vector3(0, 0.9, 0));
      g.world.scene.add(this.alert);
    }
    this.bobber.userData.dip = Math.max(0, (this.bobber.userData.dip || 0) - dt * (this.fsim.state === 'bite' ? 0.6 : 3));
    if (f.phase === 'wait') this.bobber.position.y = base - this.bobber.userData.dip * 0.12;
    // 입질에 낚싯대 끝이 휘청
    const rp = u.props.rod;
    if (rp) rp.rotation.x = this.fsim.state === 'bite' ? 0.35 + Math.sin(f.t * 30) * 0.05 : (this.bobber.userData.dip || 0) * 0.15;
    this.lineGeo.setFromPoints([tip, this.bobber.position]);
    if (ev === 'escaped') return this.endFishing({ ok: false });
    const reel = g.input.justPressed('KeyE') || g.input.justPressed('Space') || g.input.interactTap;
    if (reel && f.phase === 'wait' && f.t > 0.4) {
      const r = this.fsim.reel();
      if (r.ok && f.lake && needsFight(r.fish, r.size)) return this._startFight(r);
      return this.endFishing(r);
    }
    void input;
    return { d: -1, label: f.phase === 'cast' ? '🎣 휙~' : this.fsim.state === 'bite' ? '❗ 지금 당기기! (E / 탭)' : '🎣 기다리는 중… (찌가 쑥 들어가면 당기기)', key: 'fishing', onInteract: () => {} };
  }

  /** 큰 물고기: 힘겨루기 시작 */
  _startFight(r) {
    const g = this.game, f = this.fishing, u = g.player.unico;
    if (this.alert) { g.world.scene.remove(this.alert); this.alert.userData.dispose(); this.alert = null; }
    f.phase = 'fight';
    f.result = r;
    f.fightT = 0;
    this.fight = new ReelFight(r.fish, r.size, f.rod);
    u.playAction('reel', 0);
    this._reelHud(true);
    const it = ITEMS[r.fish];
    this.hud.name.textContent = it.rarity >= 4 ? '엄청난 녀석이다!!' : it.rarity >= 3 ? '묵직한 녀석이다!' : '힘겨루기!';
    this.splash(2);
    g.audio.play('bump', 0.8);
    g.juice.shake(0.2);
    g.ui.toast('🎣 큰 녀석이 물었다! 꾹 눌러 감고, 빨개지거나 몸부림치면 잠깐 놓아 주세요');
    return { d: -1, label: '🎣 힘겨루기!', key: 'fishing', onInteract: () => {} };
  }

  _updateFight(dt, tip) {
    const g = this.game, f = this.fishing, u = g.player.unico, F = this.fight, input = g.input;
    const reeling = !!(input.isDown('KeyE') || input.isDown('Space') || this.holdBtn || input.looking || input.joy.active);
    const ev = F.tick(dt, reeling);
    f.fightT += dt;
    u.reelTension = reeling ? F.tension : F.tension * 0.4;
    // 물고기: 줄 길이만큼 떨어진 곳에서 좌우로 몸부림
    const side = (this._side ||= new THREE.Vector3()).set(f.dir.z, 0, -f.dir.x);
    const pp = g.player.position, dist = 1.6 + F.line * 7.5;
    const sway = Math.sin(f.fightT * (F.surging ? 7 : 2.3)) * (F.surging ? 1.4 : 0.8);
    const fx = pp.x + f.dir.x * dist + side.x * sway, fz = pp.z + f.dir.z * dist + side.z * sway;
    // 물 밖(물가·부두)으로 그려지지 않게 호수 안으로 당김
    const lake = f.lake ? LAYOUT.lake : LAYOUT.pond;
    const dl = Math.hypot(fx - lake.x, fz - lake.z), lim = lake.r - 0.5;
    const k = dl > lim ? lim / dl : 1;
    this.bobber.position.set(lake.x + (fx - lake.x) * k, 0.02 + (F.surging ? Math.abs(Math.sin(f.fightT * 14)) * 0.08 : 0), lake.z + (fz - lake.z) * k);
    this.fishShadow.position.set(this.bobber.position.x, 0.04, this.bobber.position.z);
    this.fishShadow.rotation.z = Math.atan2(f.dir.x, f.dir.z) + sway * 0.4;
    this.fishShadow.scale.set(0.8, 1.9, 1);
    if (F.surging && Math.random() < dt * 14) { g.waterfx.spray(this.bobber.position.x, 0.05, this.bobber.position.z, 4, { up: 2.0, spread: 0.6, size: 0.05 }); g.waterfx.ripple(this.bobber.position.x, this.bobber.position.z, 0.5); }
    if (ev === 'surge') { g.waterfx.splash(this.bobber.position.x, this.bobber.position.z, 0.8); g.audio.play('splash', 0.5); g.juice.shake(0.12); }
    // 낚싯대 휨·줄 색 (텐션)
    const rp = u.props.rod;
    if (rp) rp.rotation.x = 0.15 + F.tension * 0.5 + Math.sin(f.fightT * 25) * 0.03 * F.tension;
    this.line.material.color.setRGB(1, 1 - F.tension * 0.7, 1 - F.tension * 0.8);
    this.lineGeo.setFromPoints([tip, this.bobber.position]);
    // 화면 게이지
    const H = this.hud;
    H.fish.style.left = `${Math.round(F.line * 92)}%`;
    H.ten.style.width = `${Math.round(F.tension * 100)}%`;
    H.ten.className = F.tension > 0.75 ? 'hot' : F.tension > 0.55 ? 'warm' : '';
    H.el.classList.toggle('surge', F.surging);
    H.el.classList.toggle('reeling', reeling);
    if (ev === 'landed') return this.endFishing({ ok: true, fish: f.result.fish, size: f.result.size, fought: true });
    if (ev === 'snapped') return this.endFishing({ ok: false, snapped: true });
    if (ev === 'escaped') return this.endFishing({ ok: false, ran: true });
    return { d: -1, label: F.surging ? '🌊 몸부림친다! 손을 떼요!' : reeling ? '🎣 감는 중…' : touchUI() ? '🎣 화면 꾹 눌러 감기' : '🎣 꾹 눌러 감기 (E · 스페이스 · 화면 꾹)', key: 'fishing', onInteract: () => {} };
  }

  /** 낚은 물고기를 머리 위로 들어 보이기 (1.8초) */
  _showCatch(fish, size) {
    const g = this.game;
    if (this.catchShow) { g.world.scene.remove(this.catchShow.m); this.catchShow.m.userData.dispose(); }
    const m = makeFish(fish, showLength(fish, size));
    g.world.scene.add(m);
    this.catchShow = { m, t: 0 };
    // 이름표·화살표가 물고기를 가리지 않게 잠깐 숨김
    const P = g.player;
    if (P.unico.label) P.unico.label.visible = false;
    P.arrow.visible = false;
  }

  _animateCatch(dt) {
    const c = this.catchShow;
    if (!c) return;
    c.t += dt;
    const p = this.game.player.position, u = this.game.player.unico;
    const rise = Math.min(1, c.t / 0.25);
    c.m.position.set(p.x, p.y + 1.55 + rise * 0.6 + Math.sin(c.t * 6) * 0.03, p.z);
    c.m.rotation.set(0, u.yaw + Math.PI / 2, Math.sin(c.t * 9) * 0.25 * Math.max(0, 1 - c.t / 1.6));
    c.m.userData.tail.rotation.y = Math.sin(c.t * 22) * 0.6 * Math.max(0.2, 1 - c.t);
    if (c.t > 1.9) {
      this.game.world.scene.remove(c.m); c.m.userData.dispose(); this.catchShow = null;
      this.game.fx.burst(p.x, p.y + 2.2, p.z, 0xfff3a0, 8);
      if (u.label) u.label.visible = true;
      this.game.player.arrow.visible = true;
    }
  }

  endFishing(r) {
    const g = this.game, f = this.fishing, u = g.player.unico;
    this.fishing = null;
    this.bobber.visible = this.line.visible = this.fishShadow.visible = false;
    this.fishShadow.scale.set(0.6, 1.4, 1);
    this.line.material.color.set(0xffffff);
    this._reelHud(false);
    if (this.alert) { g.world.scene.remove(this.alert); this.alert.userData.dispose(); this.alert = null; }
    g.player.frozen = false;
    this.fsim.reset();
    this.fight = null;
    u.holding = null; u.reelTension = 0;
    if (u.props.rod) u.props.rod.rotation.x = 0;
    u.clearAction();
    if (!r.ok) {
      if (r.snapped) { g.audio.play('bump'); g.juice.shake(0.2); g.ui.toast('💥 툭! 줄이 끊어졌어요… 빨갛게 팽팽할 땐 손을 놓아 주세요'); }
      else if (r.ran) g.ui.toast('🌊 줄이 다 풀려 물고기가 도망갔어요. 텐션이 낮을 때는 계속 감아 주세요!');
      else g.ui.toast(r.early ? '💨 너무 빨랐어요! 물고기가 도망갔어요' : '💨 놓쳤어요… 찌가 쑥 들어갈 때 당기세요');
      u.playAction('think', 1);
      return null;
    }
    const it = ITEMS[r.fish];
    g.economy.addItem(r.fish, 1);
    const rec = g.collection.add(r.fish, { size: r.size, day: g.world.day });
    g.onEvent('fish');
    g.audio.play(r.fought ? 'levelup' : 'win');
    u.playAction('lift', 1.8);
    this._showCatch(r.fish, r.size);
    g.juice.pop(g.player.group, 0.2);
    if (this.spot) g.waterfx.splash(this.spot.x, this.spot.z, 0.7); // 물고기를 끌어 올린 자리
    let extra = '';
    if (f?.lake) {
      g.onEvent('lakefish');
      if (r.fought) g.onEvent('fightwin');
      const out = g.angling.record(r.fish, r.size, g.world.day, { fought: r.fought });
      if (out.request) extra += ' 📋 오늘의 의뢰 달성! 낚시꾼에게 보고하세요';
      else if (out.biggest) extra += ' 🏅 낚시터 최고 기록!';
    }
    g.ui.toast(`🎣 ${it.name}${josa(it.name, '을/를')} 낚았다! (${r.size}cm)${rec.isNew ? ' 📖 새 도감!' : rec.isRecord ? ' 🏆 신기록!' : ''}${extra}`);
    g.afterCollect?.();
    return null;
  }

  toJSON() { return { trees: this.trees.map((t) => t.shakenDay) }; }
  load(d) { d?.trees?.forEach((v, i) => { if (this.trees[i]) this.trees[i].shakenDay = v; }); }
}
