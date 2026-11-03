import * as THREE from 'three';
import { RanchSim, ANIMAL_PRICES, BARN, TROUGH_MAX, RANCH_LEVELS } from '../sim/ranch.js';
import { Processor, RANCH_RECIPES, WORKSHOP_PRICES } from '../sim/farmcraft.js';
import { ITEMS } from '../sim/items.js';
import { processorPanel } from './farmcraft_view.js';
import { signTexture, attachSign } from './koat_view.js';
import { LAYOUT } from '../world.js';
import { PRODUCTS, ANIMALS } from '../sim/crops.js';
import { makeLabel } from '../label.js';

const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
const BABY = { cow: '송아지', sheep: '어린 양', chicken: '병아리' };
import { playEggCatch } from '../../ui/minigames/egg_catch.js';

/**
 * 동물 종류 → 모델. 젖소·양은 뼈대 애니메이션(CC0, Quaternius), 닭은 저폴리 암탉(blender hen, 코드로 다리·머리 움직임).
 * 새 모델이 없으면 예전 모델(cow/sheep/chicken)로 대체
 */
const MODEL = { cow: 'q_cow', sheep: 'q_sheep', chicken: 'hen' };
/** 모델 키(m) — 머리 위 '!' 표시 높이 */
const HEIGHT = { q_cow: 1.45, q_sheep: 1.15, q_horse: 1.75, q_donkey: 1.3, q_alpaca: 1.6, hen: 0.75 };
/** 몸 반지름(m) — 겹침 방지·장애물 충돌 */
const RADIUS = { q_cow: 0.75, q_sheep: 0.5, hen: 0.25, chicken: 0.25, q_horse: 0.7, q_donkey: 0.55, q_alpaca: 0.5 };
/** 걷기 동작 재생 속도 배율 (발이 미끄러지지 않게) */
const WALK_RATE = { q_sheep: 1.7 };
/** 목장 구경 동물(생산 없음, 쓰다듬기만) */
const VISITORS = [
  { model: 'q_horse', name: '말', emoji: '🐴', speed: 1.1 },
  { model: 'q_donkey', name: '당나귀', emoji: '🫏', speed: 0.9 },
  { model: 'q_alpaca', name: '알파카', emoji: '🦙', speed: 0.9 },
];

/** 애니메이션 상태 전환(크로스페이드) */
export function playClip(e, name, fade = 0.35) {
  const clip = e.clips[name] || e.clips.idle;
  if (!clip || e.cur === clip.name) return;
  const next = e.mixer.clipAction(clip);
  next.reset().setEffectiveWeight(1).fadeIn(fade).play();
  if (e.curAction) e.curAction.fadeOut(fade);
  e.curAction = next;
  e.cur = clip.name;
}

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
    this.taken = [];
    this.ents = [];
    this.sync();
    this.visitors = VISITORS.filter((v) => game.assets.has(v.model)).map((v) => Object.assign(this._spawn(v.model, v.speed), { v, petT: 0 }));
    this.near = null;
    this.t = 0;
    // ---- 목장 가공소 (치즈 공방): 노란 지붕 부스 + 치즈 바퀴 ----
    const W = game.world, WS = LAYOUT.ranchWork;
    this.work = new Processor({ recipes: RANCH_RECIPES, prices: WORKSHOP_PRICES, jars: 2 });
    this.booth = W.place('booth', WS.x, WS.z, WS.rot, 0.95);
    this.booth.traverse((o) => { if (o.isMesh && (o.parent?.name === 'RoofTint' || o.name === 'RoofTint')) { o.material = o.material.clone(); o.material.color.setHex(0xf2c84b); } });
    attachSign(this.booth, signTexture('🧀 목장 가공소', '치즈 · 털실 · 카스텔라', '#ffffff', '#7a5418'));
    const cheese = new THREE.MeshStandardMaterial({ color: 0xf5c84c, roughness: 0.55 });
    this.wheels = [0, 1, 2].map((k) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.16, 18), cheese);
      m.position.set(WS.x - 1.75, 0.08 + (k === 2 ? 0.16 : 0), WS.z - 0.9 + (k === 1 ? 0.5 : 0) + (k === 2 ? 0.25 : 0));
      m.castShadow = true;
      W.scene.add(m);
      return m;
    });
    // ---- 여물통 자동 급이: 사료(건초)가 차 있는 높이 ----
    const T = LAYOUT.trough;
    this.hay = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.12, 0.42), new THREE.MeshStandardMaterial({ color: 0xd9b45a, roughness: 1 }));
    this.hay.position.set(T.x, 0.3, T.z);
    W.scene.add(this.hay);
  }

  /** 동물 하나 만들기 (장애물·다른 동물과 겹치지 않는 자리) */
  _spawn(model, speed) {
    const game = this.game, R = LAYOUT.ranch, taken = this.taken;
    const rad = RADIUS[model] ?? 0.5;
    let x = 0, z = 0;
    for (let k = 0; k < 30; k++) {
      x = R.x0 + 2 + Math.random() * (R.x1 - R.x0 - 4); z = R.z0 + 2 + Math.random() * (R.z1 - R.z0 - 4);
      if (!game.world.isBlocked(x, z, rad + 0.2) && taken.every((t) => Math.hypot(t.x - x, t.z - z) > t.r + rad + 0.3)) break;
    }
    taken.push({ x, z, r: rad });
    const rig = game.assets.anims.get(model)?.length ? game.assets.cloneAnimated(model) : null;
    const m = rig ? rig.root : game.assets.clone(model);
    m.position.set(x, 0, z);
    m.rotation.y = Math.random() * Math.PI * 2;
    game.world.scene.add(m);
    const e = { m, model, rad, baseRad: rad, target: new THREE.Vector2(x, z), wait: Math.random() * 3, t: Math.random() * 10, speed, walkRate: WALK_RATE[model] || 1 };
    if (rig) {
      Object.assign(e, { mixer: rig.mixer, clips: rig.clips });
      playClip(e, 'idle', 0);
      e.mixer.update(Math.random() * 3);
      e.height = HEIGHT[model] || 1.4;
    } else {
      e.legs = ['LegFL', 'LegFR', 'LegBL', 'LegBR', 'LegL', 'LegR'].map((n) => m.getObjectByName(n)).filter(Boolean);
      e.body = m.getObjectByName('Body');
      e.head = m.getObjectByName('Head');
    }
    return e;
  }

  /** 시뮬레이션 동물마다 3D 개체 (저장 불러오기·새끼 들이기 뒤 호출) */
  sync() {
    const game = this.game;
    for (const a of this.sim.animals) {
      if (this.ents.some((e) => e.a === a)) continue;
      const model = MODEL[a.type] && game.assets.has(MODEL[a.type]) ? MODEL[a.type] : a.type;
      const e = this._spawn(model, a.type === 'chicken' ? 1.2 : 0.8);
      e.a = a;
      e.top = (HEIGHT[model] || e.height || (a.type === 'chicken' ? 0.7 : 1.7));
      e.mark = makeLabel('!', { color: '#231916', bg: '#ffe066', size: 40 });
      e.mark.visible = false;
      e.m.add(e.mark);
      e.zzz = makeLabel('💤', { bg: 'rgba(0,0,0,0)', size: 48, scale: 0.006 });
      e.zzz.visible = false;
      e.m.add(e.zzz);
      this.ents.push(e);
    }
    this._all = null;
  }

  /** 이름·하트 이름표 (가까이 있을 때만) */
  _tag(e, show) {
    const a = e.a, H = this.sim.hearts(a);
    const text = show ? `${this.sim.isBaby(a) ? '🍼 ' : ''}${a.name} ${'♥'.repeat(H)}${'♡'.repeat(5 - H)}` : '';
    if (text === e.tagText) return;
    e.tagText = text;
    if (e.tag) { e.m.remove(e.tag); e.tag.userData.dispose(); e.tag = null; }
    if (!text) return;
    e.tag = makeLabel(text, { color: '#231916', bg: 'rgba(255,248,225,0.92)', size: 30 });
    e.tag.position.y = e.top + 0.3;
    e.m.add(e.tag);
  }

  /** 목장 안 빈자리(닭장·여물통·건초 피해서) 고르기 */
  _pickTarget(e) {
    const R = LAYOUT.ranch, W = this.game.world;
    for (let i = 0; i < 12; i++) {
      const x = R.x0 + 2 + Math.random() * (R.x1 - R.x0 - 4), z = R.z0 + 2 + Math.random() * (R.z1 - R.z0 - 4);
      if (!W.isBlocked(x, z, (e.rad || 0.5) + 0.4)) { e.target.set(x, z); return; }
    }
  }

  /** 동물끼리 겹치지 않게 살짝 밀어내기 + 장애물 충돌 */
  _separate(list) {
    const W = this.game.world, v = (this._v ||= new THREE.Vector3());
    for (let i = 0; i < list.length; i++) {
      const a = list[i], pa = a.m.position;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j], pb = b.m.position;
        const dx = pb.x - pa.x, dz = pb.z - pa.z, d = Math.hypot(dx, dz), min = (a.rad || 0.5) + (b.rad || 0.5);
        // 한 번에 확 밀지 않고 몇 프레임에 걸쳐 비켜섬
        if (d < min && d > 1e-4) { const push = (min - d) * 0.15, ux = dx / d, uz = dz / d; pa.x -= ux * push; pa.z -= uz * push; pb.x += ux * push; pb.z += uz * push; }
      }
      v.set(pa.x, 0, pa.z);
      W.resolveCollision(v, a.rad || 0.5);
      pa.x = v.x; pa.z = v.z;
    }
  }

  /** 배회 + 애니메이션 (생산 동물·구경 동물 공통) */
  _move(e, dt) {
    const R = LAYOUT.ranch;
    e.t += dt;
    const p = e.m.position;
    const dx = e.target.x - p.x, dz = e.target.y - p.z, d = Math.hypot(dx, dz);
    const ease = 1 - Math.exp(-dt * 3);
    if (this.sleeping && !(e.petT > 0)) { // 밤: 제자리에서 꾸벅꾸벅 (숨 쉬듯 천천히)
      e.vel = 0;
      if (e.mixer) { playClip(e, 'idle', 0.8); e.mixer.update(dt * 0.3); }
      else { const k = Math.exp(-dt * 6); for (const l of e.legs) l.rotation.x *= k; if (e.head) e.head.rotation.x += (0.35 - e.head.rotation.x) * ease; if (e.a?.type === 'chicken') p.y *= k; }
      return;
    }
    if (e.petT > 0) { // 쓰다듬는 중: 멈춰서 고개 들기
      e.petT -= dt;
      e.vel = 0;
      if (e.mixer) playClip(e, 'look');
    } else if (d < 0.6) { // 도착 (곧장 비틀어 들어가지 않고 그 자리에 멈춤)
      e.wait -= dt;
      e.vel = 0;
      if (e.wait <= 0) {
        this._pickTarget(e);
        e.wait = 3 + Math.random() * 6;
        e.rest = Math.random() < 0.55 ? 'eat' : Math.random() < 0.5 ? 'look' : 'idle';
      }
      if (e.mixer) playClip(e, e.rest || 'idle');
      else {
        const k = Math.exp(-dt * 8);
        for (const l of e.legs) l.rotation.x *= k;
        if (e.head && e.model === 'hen') e.head.rotation.x = Math.max(0, Math.sin(e.t * 2.3)) ** 6 * 0.9; // 콕콕 모이 쪼기
        else if (e.head) e.head.rotation.x += (Math.sin(e.t * 1.5) * 0.15 + 0.1 - e.head.rotation.x) * ease; // 풀 뜯기
        if (e.a?.type === 'chicken') p.y *= k;
      }
    } else {
      // 먼저 몸을 돌리고(옆걸음 방지) 바라보는 쪽으로 걸음. 출발은 천천히, 도착 전엔 감속
      const want = Math.atan2(dx, dz);
      const diff = ((want - e.m.rotation.y + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
      e.m.rotation.y += diff * (1 - Math.exp(-dt * 3.5));
      const align = Math.max(0, Math.cos(diff));
      let target = e.speed * align * align * Math.min(1, d / 1.2 + 0.3);
      // 바로 앞에 다른 동물이 있으면 부딪혀 밀치지 않고 속도를 줄여 기다림 (막히면 아래 stuck 으로 목적지 변경)
      const fx = Math.sin(e.m.rotation.y), fz = Math.cos(e.m.rotation.y);
      for (const o of this._all || []) {
        if (o === e) continue;
        const ox = o.m.position.x - p.x, oz = o.m.position.z - p.z, od = Math.hypot(ox, oz);
        if (od < (e.rad || 0.5) + (o.rad || 0.5) + 0.7 && (ox * fx + oz * fz) / (od || 1) > 0.5) { target *= 0.15; break; }
      }
      e.vel = (e.vel || 0) + (target - (e.vel || 0)) * (1 - Math.exp(-dt * 4));
      const step = Math.min(d, e.vel * dt);
      p.x += fx * step; p.z += fz * step;
      // 다른 동물·장애물에 막혀 2초 넘게 못 가면 목적지 변경
      const dd = Math.hypot(p.x - (e.lx ?? p.x), p.z - (e.lz ?? p.z)); e.lx = p.x; e.lz = p.z;
      e.stuck = (e.vel > 0.2 && dd < e.vel * dt * 0.3) || target < e.speed * 0.2 ? (e.stuck || 0) + dt : 0;
      if (e.stuck > 2) { e.stuck = 0; this._pickTarget(e); }
      const moving = e.vel > 0.12;
      if (e.mixer) playClip(e, moving ? 'walk' : 'idle', 0.3);
      else {
        const hen = e.legs.length === 2, amp = Math.min(1, e.vel / e.speed);
        e.gait = (e.gait || 0) + dt * (hen ? 11 : 6) * Math.max(0.4, amp); // 걸음 주기도 속도에 비례
        e.legs.forEach((l, i) => (l.rotation.x = Math.sin(e.gait + (i % 2) * Math.PI) * (hen ? 0.6 : 0.5) * amp));
        if (e.head) e.head.rotation.x = hen ? Math.sin(e.gait) * 0.12 * amp : e.head.rotation.x * (1 - ease);
        if (e.a?.type === 'chicken') p.y = Math.abs(Math.sin(e.gait)) * (hen ? 0.03 : 0.08) * amp;
      }
    }
    // 걷기 동작 재생 속도 = 실제 이동 속도에 맞춤 (발 미끄러짐 방지)
    if (e.mixer) e.mixer.update(dt * (e.cur === 'walk' ? Math.max(0.35, (e.vel || 0) / 0.9) * (e.walkRate || 1) : 1));
  }

  async eggCatch() {
    const g = this.game;
    const r = await playEggCatch(g);
    if (!r.eggs && !r.coins) return;
    g.economy.addProduct('egg', r.eggs);
    g.economy.earn(r.coins);
    g.audio.play('coin');
    g.ui.toast(`🥚 달걀 ${r.eggs}개 + ${r.coins}🪙 획득!${r.score >= r.best ? ' 🏆 최고 기록' : ''}`);
    g.onEvent('eggcatch', r.score);
  }

  pet(e) {
    const g = this.game;
    if (e.a) { const r = this.sim.pet(e.a, g.world.day); if (r) { this._face(e); this._careFx(e, r, '💕'); this._levelCheck(); } }
    e.petT = 2.2;
    e.wait = Math.max(e.wait, 2.2);
    e.m.rotation.y = Math.atan2(g.player.position.x - e.m.position.x, g.player.position.z - e.m.position.z);
    g.audio.play('plant');
    g.player.unico.playAction('heart', 1.2);
    if (!e.a) g.fx.pop(e.m.position.x, e.m.position.z, '💕');
  }

  update(dt, playerPos) {
    const g = this.game, day = g.world.day, S = this.sim;
    this.t += dt;
    // 밤에는 동물들이 잠듦 (생산은 계속)
    this.sleeping = g.world.daylight < 0.22;
    // 여우·늑대가 울타리에 붙어 있으면 동물들이 겁먹어 생산이 멈추고 그쪽을 바라봄
    const threat = g.pests?.ranchThreat;
    if (threat) for (const e of this._all || []) { e.rest = 'look'; e.wait = Math.max(e.wait, 1); }
    for (const r of S.tick(threat ? 0 : dt, day)) g.ui.toast(`${ANIMALS[r.type].emoji} ${r.name}의 ${PRODUCTS[r.product].name}이(가) 준비됐어요!`);
    for (const a of S.lastGrown) { g.ui.toast(`🎉 ${BABY[a.type]} ${a.name}이(가) 다 자랐어요!`); g.audio.play('levelup'); }
    if (S.lastAutoFed.length && !this._autoTip) { this._autoTip = true; g.ui.toast('🌾 여물통 자동 급이: 배고픈 동물이 알아서 사료를 먹었어요'); }
    // 목장 가공소 숙성
    for (const i of this.work.tick(dt)) { const id = this.work.slots[i]?.id; if (id) g.ui.toast(`🧀 ${ITEMS[id].name}이(가) 다 됐어요! 목장 가공소에서 꺼내세요`); }
    this.wheels.forEach((m, k) => { m.visible = k < 1 + this.work.slots.filter(Boolean).length; });
    this.hay.scale.y = 0.2 + (S.trough / TROUGH_MAX) * 1.8;
    this.hay.position.y = 0.26 + (S.trough / TROUGH_MAX) * 0.12;
    this.hay.visible = S.trough > 0;
    let best = null, bd = 2.6;
    for (const e of this.ents) {
      const a = e.a, baby = S.isBaby(a);
      e.mark.visible = !!a.product && !this.sleeping;
      e.mark.position.y = e.top * (baby ? 0.6 : 1) + 0.45;
      e.zzz.visible = this.sleeping && (a.id % 2 === 0);
      e.zzz.position.y = e.top * (baby ? 0.6 : 1) + 0.25 + Math.sin(this.t * 1.5 + a.id) * 0.06;
      // 새끼는 작게, 자라면서 커짐
      const sc = baby ? 0.5 + 0.45 * S.growth(a) : 1;
      e.m.scale.setScalar(sc);
      e.rad = e.baseRad * sc;
      this._move(e, dt);
      const dp = Math.hypot(e.m.position.x - playerPos.x, e.m.position.z - playerPos.z);
      e.dp = dp;
      if (dp < bd) { bd = dp; best = e; }
    }
    // 이름표는 가까운 4마리만 (화면이 복잡하지 않게)
    const near4 = (this._near4 ||= []);
    near4.length = 0;
    for (const e of this.ents) if (e.dp < 3.6) near4.push(e);
    near4.sort((x, y) => x.dp - y.dp);
    for (const e of this.ents) this._tag(e, near4.indexOf(e) > -1 && near4.indexOf(e) < 4);
    this._all ||= [...this.ents, ...this.visitors];
    this._separate(this._all);
    for (const e of this.visitors) {
      this._move(e, dt);
      const dp = Math.hypot(e.m.position.x - playerPos.x, e.m.position.z - playerPos.z);
      if (dp < bd - 0.2) { bd = dp; best = e; }
    }
    this.near = best;
    // 시설: 닭장(달걀 받기), 축사 앞(우리 목장), 여물통, 목장 가공소
    const opts = [];
    const C = LAYOUT.coop, dc = Math.hypot(C.x - 1.6 - playerPos.x, C.z - playerPos.z);
    if (dc < 2.2) opts.push({ d: dc, label: '🥚 달걀 받기 미니게임', key: 'eggcatch', onInteract: () => this.eggCatch() });
    const B = LAYOUT.ranchWork.barn, db = Math.hypot(B.x - playerPos.x, B.z - playerPos.z);
    if (db < 2.4) opts.push({ d: db, label: `🐄 우리 목장 (동물 ${S.animals.length}마리 · 가축 들이기 · 축사)`, key: 'barn', onInteract: () => this.openBarn() });
    const T = LAYOUT.trough, dt2 = Math.hypot(T.x - playerPos.x, T.z - playerPos.z);
    if (dt2 < 1.9) opts.push({ d: dt2 - 0.3, label: `🌾 자동 급이 여물통 (사료 ${S.trough}/${TROUGH_MAX}) · 가진 사료 ${g.economy.inventory.feed}개 채우기`, key: 'trough', onInteract: () => this.fillTrough() });
    const WS = LAYOUT.ranchWork, dw = Math.hypot(WS.x - 1.9 - playerPos.x, WS.z - playerPos.z);
    if (dw < 2.4) { const ready = this.work.slots.filter((_, i) => this.work.isDone(i)).length; opts.push({ d: dw, label: `🧀 목장 가공소${ready ? ` · ${ready}개 완성!` : ''}`, key: 'workshop', onInteract: () => this.openWorkshop() }); }
    for (const o of opts) if (!best || o.d < bd) return o;
    if (!best) return null;
    if (best.v) return { d: bd, label: `${best.v.emoji} ${best.v.name} 쓰다듬기`, key: 'pet', onInteract: () => this.pet(best) };
    const a = best.a, act = S.actionFor(a, day);
    const nm = `${S.isBaby(a) ? BABY[a.type] : ANIMALS[a.type].name} ${a.name}`;
    if (this.sleeping && act.type !== 'collect') return { d: bd, label: `💤 ${nm}이(가) 자고 있어요`, key: 'sleep' };
    if (act.type === 'wait') return { d: bd, label: `${nm}: ${act.label}`, key: 'wait' };
    if (act.type === 'feed') return { d: bd, label: `${nm}에게 ${act.label} (사료 ${g.economy.inventory.feed}개)`, key: 'feed', onInteract: () => this.feed(best) };
    if (act.type === 'brush') return { d: bd, label: `🪮 ${nm} ${act.label} (하루 한 번 · 생산이 빨라져요)`, key: 'brush', onInteract: () => this.brush(best) };
    if (act.type === 'pet') return { d: bd, label: `💕 ${nm} ${act.label}`, key: 'pet', onInteract: () => this.pet(best) };
    return { d: bd, label: `${nm}: ${act.label}`, key: 'collect', onInteract: () => this.collect(best) };
  }

  /** 동물 쪽 바라보기 */
  _face(e) { const g = this.game; g.player.unico.facing = Math.atan2(e.m.position.x - g.player.position.x, e.m.position.z - g.player.position.z); }

  _careFx(e, r, what) {
    const g = this.game;
    g.fx.pop(e.m.position.x, e.m.position.z, r.heartUp ? '💖' : '💕');
    if (r.heartUp) {
      g.audio.play('levelup', 0.7);
      g.ui.toast(`💖 ${e.a.name}와(과) 더 친해졌어요! 하트 ${r.hearts}개${r.hearts === 3 ? ' · 이제 생산물이 2개씩!' : r.hearts === 4 ? ' · 가끔 특별한 생산물을 줘요!' : ''}`);
      g.onEvent('animalheart', Math.max(...this.sim.animals.map((a) => this.sim.hearts(a))));
    } else g.ui.toast(`${what} ${e.a.name} 기분이 좋아 보여요 ${'♥'.repeat(r.hearts)}`);
    g.onEvent('animalcare');
  }

  /** 빗질: 빗을 들고 쓱쓱 */
  brush(e) {
    const g = this.game, r = this.sim.brush(e.a, g.world.day);
    if (!r) return;
    this._face(e);
    g.player.unico.playAction('brush', 1.4);
    e.petT = 1.8; e.wait = Math.max(e.wait, 1.8);
    e.m.rotation.y = Math.atan2(g.player.position.x - e.m.position.x, g.player.position.z - e.m.position.z) + Math.PI / 2; // 옆구리를 내줌
    g.audio.play('shoo', 0.3);
    for (let k = 0; k < 3; k++) setTimeout(() => g.fx.burst(e.m.position.x, (e.top || 1) * 0.6, e.m.position.z, e.a.type === 'sheep' ? 0xffffff : 0xd8c8a8, 5), k * 380);
    this._careFx(e, r, '🪮');
    this._levelCheck();
  }

  _levelCheck() {
    const lv = this.sim.level;
    if (this._lv && lv > this._lv) {
      const g = this.game;
      g.audio.play('levelup');
      const unlock = Object.entries(RANCH_RECIPES).filter(([, r]) => r.level === lv).map(([k]) => ITEMS[k].name);
      g.ui.toast(`🐄 목장 숙련도 Lv.${lv}!${unlock.length ? ` 목장 가공소에서 ${unlock.join(', ')}을(를) 만들 수 있어요` : ''}`);
    }
    this._lv = lv;
  }

  /** 여물통에 사료 채우기 */
  fillTrough() {
    const g = this.game, eco = g.economy;
    if (eco.inventory.feed <= 0) return g.ui.toast('사료가 없어요. 장터에서 사 오세요 🛒');
    const n = this.sim.fillTrough(eco.inventory.feed);
    if (!n) return g.ui.toast('여물통이 가득 찼어요');
    eco.inventory.feed -= n;
    g.player.unico.playAction('scatter', 1.2);
    g.audio.play('plant');
    g.fx.burst(LAYOUT.trough.x, 0.5, LAYOUT.trough.z, 0xe8c66a, 12);
    g.ui.toast(`🌾 여물통에 사료 ${n}개를 채웠어요 (${this.sim.trough}/${TROUGH_MAX}) — 배고픈 동물이 알아서 먹어요`);
  }

  openWorkshop() {
    const g = this.game;
    processorPanel(g, {
      title: '🧀 목장 가공소', proc: this.work, level: () => this.sim.level, levelName: '목장', unit: '숙성 칸',
      shopNote: '우리 목장(축사)에서 숙성 칸 추가', addXp: (n) => { this.sim.xp += n; this._levelCheck(); }, event: 'rprocess',
      anchor: () => LAYOUT.ranchWork,
    });
  }

  /** 축사 창: 동물 목록(이름 바꾸기), 가축 들이기, 축사 증축, 숙련도 */
  openBarn() {
    const g = this.game, eco = g.economy, S = this.sim;
    const p = g.ui.openPanel('🐄 우리 목장');
    const render = () => {
      p.querySelectorAll('.body').forEach((e) => e.remove());
      const body = h('div', 'body');
      const nx = RANCH_LEVELS[S.level];
      body.append(h('div', 'chip', `🪙 ${eco.money.toLocaleString()} · 목장 숙련도 Lv.${S.level}${nx ? ` (${S.xp}/${nx})` : ''} · 여물통 ${S.trough}/${TROUGH_MAX}`));
      body.append(h('p', 'map-tip', '매일 사료·빗질·쓰다듬기로 돌봐 주면 하트가 올라요. ♥3: 생산물 2개 · ♥4~5: 가끔 황금 달걀·특급 우유·고급 양털'));
      const rows = h('div', 'rows');
      for (const a of S.animals) {
        const baby = S.isBaby(a), H = S.hearts(a), act = S.actionFor(a, g.world.day);
        const st = baby ? `${BABY[a.type]} · ${Math.floor(S.growth(a) * 100)}% 자람` : a.product ? `${PRODUCTS[a.product].emoji} 수확 가능` : a.fedTimer > 0 ? `생산 중 ${Math.ceil(a.fedTimer)}초` : '배고파요';
        const r = h('div', 'row', `<span>${ANIMALS[a.type].emoji}</span>`);
        const nm = h('span', 'nm');
        const inp = h('input'); inp.value = a.name; inp.maxLength = 8; inp.className = 'name-input';
        inp.onchange = () => { if (S.rename(a, inp.value)) { this.ents.find((e) => e.a === a).tagText = null; g.audio.play('pop'); } };
        nm.append(inp, h('small', '', `<br>${'♥'.repeat(H)}${'♡'.repeat(5 - H)} · ${st}${act.type === 'brush' ? ' · 빗질 가능' : ''}`));
        r.append(nm);
        rows.append(r);
      }
      body.append(rows);
      body.append(h('h3', '', '🐣 가축 들이기 (새끼가 와서 자라요)'));
      const shop = h('div', 'rows');
      for (const [type, price] of Object.entries(ANIMAL_PRICES)) {
        const room = S.room(type);
        const r = h('div', 'row', `<span>${ANIMALS[type].emoji}</span><span class="nm">${BABY[type]} <span class="qty">자리 ${Math.max(0, room)}</span></span><span class="pr">${price}🪙</span>`);
        const b = h('button', 'gold', room > 0 ? '들이기' : '축사가 꽉 찼어요');
        b.disabled = room <= 0 || eco.money < price;
        b.onclick = () => {
          if (eco.money < price) return;
          const a = S.buy(type);
          if (!a) return;
          eco.money -= price; eco.stats.spent += price;
          this.sync();
          const e = this.ents.find((x) => x.a === a);
          g.fx.burst(e.m.position.x, 0.6, e.m.position.z, 0xfff3a0, 16);
          g.audio.play('levelup');
          g.ui.toast(`🎉 ${BABY[type]} ${a.name}이(가) 목장에 왔어요! 쓰다듬어 주면 더 빨리 자라요`);
          g.onEvent('buyanimal');
          render();
        };
        r.append(b);
        shop.append(r);
      }
      body.append(shop);
      body.append(h('h3', '', '🏠 축사 · 가공소'));
      const fac = h('div', 'rows');
      const nb = BARN[S.barn + 1];
      const br = h('div', 'row', `<span>🏚️</span><span class="nm">축사 증축 <span class="qty">${S.barn + 1}/${BARN.length}단계</span><br><small>소·양 ${BARN[S.barn].big}마리, 닭 ${BARN[S.barn].small}마리까지${nb ? ` → ${nb.big} / ${nb.small}` : ''}</small></span><span class="pr">${nb ? `${nb.price}🪙` : '완료'}</span>`);
      if (nb) { const b = h('button', 'gold', '증축'); b.disabled = eco.money < nb.price; b.onclick = () => { if (eco.money < nb.price || !S.upgradeBarn()) return; eco.money -= nb.price; eco.stats.spent += nb.price; g.audio.play('levelup'); g.ui.toast('🏚️ 축사를 넓혔어요! 가축을 더 들일 수 있어요'); render(); }; br.append(b); }
      fac.append(br);
      const wp = this.work.nextJarPrice;
      const wr = h('div', 'row', `<span>🧀</span><span class="nm">가공소 숙성 칸 <span class="qty">${this.work.jars}/4</span></span><span class="pr">${wp ? `${wp}🪙` : '완료'}</span>`);
      if (wp) { const b = h('button', 'gold', '추가'); b.disabled = eco.money < wp; b.onclick = () => { if (eco.money < wp || !this.work.buyJar()) return; eco.money -= wp; eco.stats.spent += wp; g.audio.play('levelup'); render(); }; wr.append(b); }
      fac.append(wr);
      body.append(fac);
      p.append(body);
    };
    render();
  }

  toJSON() { return { ...this.sim.toJSON(), work: this.work.toJSON() }; }
  load(d) { if (!d) return; this.sim.load(d); this.work.load(d.work); this.sync(); this._lv = this.sim.level; }

  feed(e) {
    const g = this.game;
    if (!g.economy.useFeed()) return g.ui.toast('사료가 없어요. 장터에서 구매하세요 🛒');
    this.sim.feed(e.a, g.world.day);
    g.onEvent('feed');
    g.audio.play('plant');
    g.player.unico.facing = Math.atan2(e.m.position.x - g.player.position.x, e.m.position.z - g.player.position.z);
    g.player.unico.playAction('scatter', 1.3);
    g.fx.burst(e.m.position.x, 0.4, e.m.position.z, 0xe8c66a, 10);
    g.fx.pop(e.m.position.x, e.m.position.z, '❤️');
  }

  collect(e) {
    const g = this.game;
    const r = this.sim.harvest(e.a);
    if (!r) return;
    const P = PRODUCTS[r.product];
    g.economy.addProduct(r.product, r.amount);
    if (r.gold) g.economy.addItem(r.gold, 1);
    g.onEvent('collect', r.amount);
    if (r.gold) g.onEvent('rgold');
    g.audio.play(r.gold ? 'levelup' : 'harvest');
    this._face(e);
    g.player.unico.playAction(e.a.type === 'chicken' ? 'plant' : 'pull', 0.8);
    g.ui.toast(`${P.emoji} ${e.a.name}의 ${P.name} ×${r.amount}${r.gold ? ` + ✨ ${ITEMS[r.gold].name}!` : ''}${r.amount > 1 ? ' (♥3 보너스)' : ''}`);
    g.juice.pop(e.m, 0.2);
    g.fx.pop(e.m.position.x, e.m.position.z, r.gold ? '✨' : P.emoji);
    if (r.gold) g.fx.burst(e.m.position.x, 1, e.m.position.z, 0xffe27a, 18);
    this._levelCheck();
  }
}
