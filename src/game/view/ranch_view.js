import * as THREE from 'three';
import { RanchSim } from '../sim/ranch.js';
import { LAYOUT } from '../world.js';
import { PRODUCTS, ANIMALS } from '../sim/crops.js';
import { makeLabel } from '../label.js';

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
    const R = LAYOUT.ranch;
    const taken = [];
    const spawn = (model, speed) => {
      // 시작 위치: 장애물·다른 동물과 겹치지 않는 곳 (처음부터 서로 밀어내며 미끄러지지 않게)
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
      const e = { m, model, rad: RADIUS[model] ?? 0.5, target: new THREE.Vector2(x, z), wait: Math.random() * 3, t: Math.random() * 10, speed, walkRate: WALK_RATE[model] || 1 };
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
    };
    this.ents = this.sim.animals.map((a) => {
      const model = MODEL[a.type] && game.assets.has(MODEL[a.type]) ? MODEL[a.type] : a.type;
      const e = spawn(model, a.type === 'chicken' ? 1.2 : 0.8);
      e.a = a;
      e.mark = makeLabel('!', { color: '#231916', bg: '#ffe066', size: 40 });
      e.mark.position.y = (HEIGHT[model] || e.height || (a.type === 'chicken' ? 0.7 : 1.7)) + 0.45;
      e.mark.visible = false;
      e.m.add(e.mark);
      return e;
    });
    this.visitors = VISITORS.filter((v) => game.assets.has(v.model)).map((v) => Object.assign(spawn(v.model, v.speed), { v, petT: 0 }));
    this.near = null;
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

  pet(e) {
    const g = this.game;
    e.petT = 2.2;
    e.wait = Math.max(e.wait, 2.2);
    e.m.rotation.y = Math.atan2(g.player.position.x - e.m.position.x, g.player.position.z - e.m.position.z);
    g.audio.play('plant');
    g.player.unico.playAction('heart', 1.2);
    g.fx.pop(e.m.position.x, e.m.position.z, '💕');
  }

  update(dt, playerPos) {
    for (const r of this.sim.tick(dt)) this.game.ui.toast(`${ANIMALS[r.type].emoji} ${PRODUCTS[r.product].name}이(가) 준비됐어요!`);
    let best = null, bd = 2.6;
    for (const e of this.ents) {
      e.mark.visible = !!e.a.product;
      this._move(e, dt);
      const dp = Math.hypot(e.m.position.x - playerPos.x, e.m.position.z - playerPos.z);
      if (dp < bd) { bd = dp; best = e; }
    }
    this._all ||= [...this.ents, ...this.visitors];
    this._separate(this._all);
    for (const e of this.visitors) {
      this._move(e, dt);
      const dp = Math.hypot(e.m.position.x - playerPos.x, e.m.position.z - playerPos.z);
      if (dp < bd - 0.2) { bd = dp; best = e; }
    }
    this.near = best;
    if (!best) return null;
    if (best.v) return { d: bd, label: `${best.v.emoji} ${best.v.name} 쓰다듬기`, key: 'pet', onInteract: () => this.pet(best) };
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
