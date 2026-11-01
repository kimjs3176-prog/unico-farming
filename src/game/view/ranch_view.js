import * as THREE from 'three';
import { RanchSim } from '../sim/ranch.js';
import { LAYOUT } from '../world.js';
import { PRODUCTS, ANIMALS } from '../sim/crops.js';
import { makeLabel } from '../label.js';

/** 뼈대 애니메이션 모델(CC0, Quaternius)을 쓰는 동물. 없으면 기존 절차적 다리 흔들기 모델 사용 */
const RIGGED = { cow: 'q_cow' };
/** 뼈대 모델 키(m) — 머리 위 '!' 표시 높이 */
const HEIGHT = { q_cow: 1.45, q_horse: 1.75, q_donkey: 1.3, q_alpaca: 1.6 };
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
    const spawn = (model, speed) => {
      const x = R.x0 + 2 + Math.random() * (R.x1 - R.x0 - 4), z = R.z0 + 2 + Math.random() * (R.z1 - R.z0 - 4);
      const rig = game.assets.anims.get(model)?.length ? game.assets.cloneAnimated(model) : null;
      const m = rig ? rig.root : game.assets.clone(model);
      m.position.set(x, 0, z);
      m.rotation.y = Math.random() * Math.PI * 2;
      game.world.scene.add(m);
      const e = { m, target: new THREE.Vector2(x, z), wait: Math.random() * 3, t: Math.random() * 10, speed };
      if (rig) {
        Object.assign(e, { mixer: rig.mixer, clips: rig.clips });
        playClip(e, 'idle', 0);
        e.mixer.update(Math.random() * 3);
        e.height = HEIGHT[model] || 1.4;
      } else {
        e.legs = ['LegFL', 'LegFR', 'LegBL', 'LegBR'].map((n) => m.getObjectByName(n)).filter(Boolean);
        e.head = m.getObjectByName('Head');
      }
      return e;
    };
    this.ents = this.sim.animals.map((a) => {
      const model = RIGGED[a.type] && game.assets.has(RIGGED[a.type]) ? RIGGED[a.type] : a.type;
      const e = spawn(model, a.type === 'chicken' ? 1.2 : 0.8);
      e.a = a;
      e.mark = makeLabel('!', { color: '#231916', bg: '#ffe066', size: 40 });
      e.mark.position.y = a.type === 'chicken' ? 1.2 : (e.height || 1.7) + 0.5;
      e.mark.visible = false;
      e.m.add(e.mark);
      return e;
    });
    this.visitors = VISITORS.filter((v) => game.assets.has(v.model)).map((v) => Object.assign(spawn(v.model, v.speed), { v, petT: 0 }));
    this.near = null;
  }

  /** 배회 + 애니메이션 (생산 동물·구경 동물 공통) */
  _move(e, dt) {
    const R = LAYOUT.ranch;
    e.t += dt;
    const p = e.m.position;
    const dx = e.target.x - p.x, dz = e.target.y - p.z, d = Math.hypot(dx, dz);
    if (e.petT > 0) { // 쓰다듬는 중: 멈춰서 고개 들기
      e.petT -= dt;
      if (e.mixer) playClip(e, 'look');
    } else if (d < 0.3) {
      e.wait -= dt;
      if (e.wait <= 0) {
        e.target.set(R.x0 + 2 + Math.random() * (R.x1 - R.x0 - 4), R.z0 + 2 + Math.random() * (R.z1 - R.z0 - 4));
        e.wait = 3 + Math.random() * 6;
        e.rest = Math.random() < 0.55 ? 'eat' : Math.random() < 0.5 ? 'look' : 'idle';
      }
      if (e.mixer) playClip(e, e.rest || 'idle');
      else {
        for (const l of e.legs) l.rotation.x *= 0.9;
        if (e.head) e.head.rotation.x = Math.sin(e.t * 1.5) * 0.15 + 0.1; // 풀 뜯기
      }
    } else {
      const step = Math.min(d, e.speed * dt);
      p.x += (dx / d) * step; p.z += (dz / d) * step;
      // 부드럽게 방향 전환
      const want = Math.atan2(dx, dz);
      const diff = ((want - e.m.rotation.y + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
      e.m.rotation.y += diff * Math.min(1, dt * 4);
      if (e.mixer) playClip(e, 'walk');
      else {
        e.legs.forEach((l, i) => (l.rotation.x = Math.sin(e.t * 6 + (i % 2) * Math.PI) * 0.5));
        if (e.head) e.head.rotation.x = 0;
        if (e.a?.type === 'chicken') p.y = Math.abs(Math.sin(e.t * 12)) * 0.08;
      }
    }
    if (e.mixer) e.mixer.update(dt * (e.cur === 'walk' ? e.speed / 0.9 : 1));
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
