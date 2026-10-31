import * as THREE from 'three';
import { LAYOUT } from '../world.js';
import { ITEMS } from '../sim/items.js';
import { FishingSim, rollBug } from '../sim/fishing.js';
import { makeLabel } from '../label.js';

const FRUIT_COLOR = { fruit_apple: 0xe0413a, fruit_peach: 0xf7a8a0, fruit_pear: 0xd9d26a, fruit_persimmon: 0xf08a24 };
const BUG_COLOR = { bug_butterfly: 0xffffff, bug_swallowtail: 0xf6d64a, bug_dragonfly: 0xe0413a, bug_ladybug: 0xd93025, bug_beetle: 0x5a3a22, bug_firefly: 0xd8ff6a };

/**
 * 동물의 숲풍 자연 요소
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
    this.ripple = new THREE.Mesh(new THREE.RingGeometry(0.15, 0.2, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
    this.ripple.rotation.x = -Math.PI / 2;
    scene.add(this.ripple);
    this.lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    this.line = new THREE.Line(this.lineGeo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 }));
    this.line.visible = false;
    scene.add(this.line);
    // 낚싯대 (대나무 느낌)
    const rodGeo = new THREE.CylinderGeometry(0.012, 0.03, 1.8, 6).translate(0, 0.9, 0);
    this.rod = new THREE.Mesh(rodGeo, new THREE.MeshStandardMaterial({ color: 0xc9a35a, roughness: 0.6 }));
    this.rod.castShadow = true;
    this.rod.visible = false;
    scene.add(this.rod);
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
    b.mat.color.setHex(BUG_COLOR[b.kind]);
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
      if ((b.kind === 'bug_firefly') !== night && Math.random() < dt * 0.2) { this.spawnBug(b); continue; }
      b.phase += dt;
      const fly = b.kind !== 'bug_ladybug' && b.kind !== 'bug_beetle';
      const r = fly ? 1.6 : 0.3;
      b.g.position.set(b.home.x + Math.sin(b.phase * 0.7) * r + Math.sin(b.phase * 1.9) * 0.4, (fly ? 0.7 + Math.sin(b.phase * 2.3) * 0.35 : 0.08), b.home.z + Math.cos(b.phase * 0.5) * r);
      b.g.rotation.y = b.phase * 0.7 + Math.PI / 2;
      const flap = fly ? Math.sin(b.phase * (b.kind === 'bug_dragonfly' ? 50 : 18)) * 0.9 : 0;
      b.l.rotation.y = flap; b.r.rotation.y = -flap;
      const d = Math.hypot(b.g.position.x - playerPos.x, b.g.position.z - playerPos.z);
      if (d < 1.9) consider(d, { label: `곤충 잡기 (${ITEMS[b.kind].emoji} ${ITEMS[b.kind].name})`, key: 'bug', onInteract: () => this.catchBug(b) });
    }
    // ---- 낚시 ----
    if (this.fishing) return this.updateFishing(dt);
    const P = LAYOUT.pond;
    const dc = Math.hypot(P.x - playerPos.x, P.z - playerPos.z);
    if (dc > P.r - 0.6 && dc < P.r + 2.2) consider(Math.max(0.1, dc - P.r), { label: '🎣 낚시하기', key: 'fish', onInteract: () => this.startFishing(playerPos) });
    this.ripple.material.opacity = Math.max(0, this.ripple.material.opacity - dt * 1.5);
    this.ripple.scale.multiplyScalar(1 + dt * 2.5);
    return best;
  }

  shakeTree(tr) {
    const g = this.game;
    tr.shakenDay = g.world.day;
    tr.shake = 0.8;
    g.audio.play('dig', 0.5);
    g.player.unico.playAction('wave', 0.8);
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
    g.player.unico.playAction('cheer', 1);
    g.fx.pop(b.g.position.x, b.g.position.z, ITEMS[b.kind].emoji);
    g.ui.toast(`${ITEMS[b.kind].emoji} ${ITEMS[b.kind].name}을(를) 잡았다!${rec.isNew ? ' 📖 도감 등록!' : ''}`);
    g.afterCollect?.();
  }

  // ---- 낚시 ----
  startFishing(pos) {
    const g = this.game, P = LAYOUT.pond;
    const dir = new THREE.Vector3(P.x - pos.x, 0, P.z - pos.z).normalize();
    g.player.unico.facing = Math.atan2(dir.x, dir.z);
    g.player.frozen = true;
    const dist = Math.hypot(P.x - pos.x, P.z - pos.z);
    const cast = Math.min(dist - 0.6, 2.8);
    this.spot = new THREE.Vector3(pos.x + dir.x * (dist - P.r + 0.9 + cast * 0.5), 0.05, pos.z + dir.z * (dist - P.r + 0.9 + cast * 0.5));
    this.fishing = { phase: 'cast', t: 0, dir };
    this.fsim.cast({ night: this.night, raining: ['rain', 'storm'].includes(g.world.weatherKind) });
    this.bobber.position.copy(this.spot).add(new THREE.Vector3(0, 0.6, 0));
    this.bobber.visible = true;
    this.line.visible = true;
    this.rod.visible = true;
    this.fishShadow.visible = true;
    const a = Math.random() * 6.28;
    this.fishShadow.position.set(this.spot.x + Math.cos(a) * 2, 0.04, this.spot.z + Math.sin(a) * 2);
    g.audio.play('water', 0.5);
    g.ui.toast('🎣 찌가 쑥 들어갈 때 E 또는 화면 말풍선을 눌러 당기세요! (톡톡 건드리는 건 가짜 입질)');
  }

  splash(scale = 1) {
    this.ripple.position.set(this.spot.x, 0.06, this.spot.z);
    this.ripple.scale.setScalar(scale);
    this.ripple.material.opacity = 0.9;
  }

  updateFishing(dt) {
    const g = this.game, f = this.fishing;
    f.t += dt;
    // 찌 착수 애니메이션
    if (f.phase === 'cast') {
      this.bobber.position.y = Math.max(0.06, this.bobber.position.y - dt * 3);
      if (this.bobber.position.y <= 0.06) { f.phase = 'wait'; this.splash(1); }
    }
    // 물고기 그림자가 찌 쪽으로 다가옴
    const sh = this.fishShadow.position;
    const to = new THREE.Vector3(this.spot.x - sh.x, 0, this.spot.z - sh.z);
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
    // 낚싯대: 머리 옆에서 찌 쪽으로 비스듬히, 입질 때 휘청
    const grip = g.player.position.clone().add(new THREE.Vector3(0, 1.35, 0)).addScaledVector(f.dir, 0.35);
    const bend = this.fsim.state === 'bite' ? 0.35 : (this.bobber.userData.dip || 0) * 0.2;
    const tipDir = f.dir.clone().multiplyScalar(0.85).add(new THREE.Vector3(0, 0.55 - bend, 0)).normalize();
    this.rod.position.copy(grip);
    this.rod.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tipDir);
    const tip = grip.clone().addScaledVector(tipDir, 1.8);
    this.lineGeo.setFromPoints([tip, this.bobber.position]);
    if (ev === 'escaped') return this.endFishing({ ok: false });
    const reel = g.input.justPressed('KeyE') || g.input.justPressed('Space') || g.input.interactTap;
    if (reel && f.t > 0.4) return this.endFishing(this.fsim.reel());
    return { d: -1, label: this.fsim.state === 'bite' ? '❗ 지금 당기기! (E / 탭)' : '🎣 기다리는 중… (찌가 쑥 들어가면 당기기)', key: 'fishing', onInteract: () => {} };
  }

  endFishing(r) {
    const g = this.game;
    this.fishing = null;
    this.bobber.visible = this.line.visible = this.fishShadow.visible = this.rod.visible = false;
    if (this.alert) { g.world.scene.remove(this.alert); this.alert.userData.dispose(); this.alert = null; }
    g.player.frozen = false;
    this.fsim.reset();
    if (!r.ok) { g.ui.toast(r.early ? '💨 너무 빨랐어요! 물고기가 도망갔어요' : '💨 놓쳤어요… 찌가 쑥 들어갈 때 당기세요'); g.player.unico.playAction('think', 1); return null; }
    const it = ITEMS[r.fish];
    g.economy.addItem(r.fish, 1);
    const rec = g.collection.add(r.fish, { size: r.size, day: g.world.day });
    g.onEvent('fish');
    g.audio.play('win');
    g.player.unico.playAction('cheer', 1.6);
    g.juice.pop(g.player.group, 0.2);
    g.fx.pop(this.spot.x, this.spot.z, it.emoji);
    const lines = [`${it.emoji} ${it.name} ${r.size}cm`, `판매가 ${g.economy.sellPrice(r.fish)}🪙`];
    if (rec.isNew) lines.push('📖 도감에 새로 등록되었어요!');
    else if (rec.isRecord) lines.push('🏆 최대 크기 기록 경신!');
    g.ui.toast(`🎣 ${it.name}을(를) 낚았다! (${r.size}cm)${rec.isNew ? ' 📖 새 도감!' : rec.isRecord ? ' 🏆 신기록!' : ''}`);
    g.afterCollect?.();
    return null;
  }

  toJSON() { return { trees: this.trees.map((t) => t.shakenDay) }; }
  load(d) { d?.trees?.forEach((v, i) => { if (this.trees[i]) this.trees[i].shakenDay = v; }); }
}
