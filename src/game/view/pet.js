import { josa } from '../sim/josa.js';
import * as THREE from 'three';
import { heightAt } from '../terrain.js';
import { playClip } from './ranch_view.js';
import { makeLabel } from '../label.js';
import { PetSim, TRICKS, TRICK_TIME } from '../sim/pet.js';
import { CROPS } from '../sim/crops.js';
import { ITEMS } from '../sim/items.js';
import { speakerShot, cheatYaw } from '../cutscene.js';
import { sanitizeName } from '../../ui/dialogue.js';

/**
 * 돌보기 구도: 콩이 얼굴(0.45m)을 정면에서 60° 옆, 2.4m 떨어진 무릎 높이(0.9m)에서 (세로 폰은 3.4m 까지 물러남), 렌즈 올림으로 대화창 위에.
 * 옆으로 많이 돌아 내 몸은 화면 가장자리 밖으로 빠지고, 콩이는 카메라 쪽으로 50° 고개를 돌려 거의 정면 (올려다보는 강아지)
 */
const PET_SHOT = { theta: (60 * Math.PI) / 180, D: 2.4, maxD: 3.4, camY: 0.9, lookY: 0.45, lookMix: 0.15, faceS: 0.45, faceL: null };
const PET_CHEAT = (50 * Math.PI) / 180, ME_CHEAT = (12 * Math.PI) / 180;
/** 돌보기 구도 후보 각도: 60° 먼저 (지금 카메라 쪽 → 반대쪽), 그다음 75°·40°. 앞 2m 안 화면(3×3 칸)이나 카메라→콩이 선에 나무·기둥이 걸리면 다음 후보 */
const PET_THETA = [60, 75, 40].map((d) => (d * Math.PI) / 180);
const PET_NEAR = [0.6, 1.3, 2.0], PET_NEAR_X = [-0.85, 0, 0.85];

/**
 * 돌보기 구도가 얼마나 가리나 (0 = 깨끗): world.obstacles(원)·boxes(상자) 로 봄. 콩이·나 0.6m 안의 것은 셈하지 않음
 *  - 카메라→콩이 얼굴 선(0.25m 마다)에 걸리면 칸마다 2, 카메라 앞 2m 안 화면 3×3 칸(깊이 3 × 가로 3)에 걸리면 1, 카메라가 안에 있으면 3
 */
export function petShotBlock(shot, dog, me, world, fov = 45, aspect = 1.6) {
  if (!world) return 0;
  const far = (o) => Math.hypot(o.x - dog.x, o.z - dog.z) > 0.6 + o.r && Math.hypot(o.x - me.x, o.z - me.z) > 0.6 + o.r;
  const obs = (world.obstacles || []).filter(far), boxes = world.boxes || [];
  const inside = (x, z, pad = 0.1) => obs.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + pad) || boxes.some((b) => x > b.x0 - pad && x < b.x1 + pad && z > b.z0 - pad && z < b.z1 + pad);
  const [cx, , cz] = shot.pos;
  let n = inside(cx, cz) ? 3 : 0;
  const L = Math.hypot(dog.x - cx, dog.z - cz), steps = Math.max(2, Math.ceil((L * 0.9) / 0.25));
  for (let i = 1; i <= steps; i++) { const t = (i / steps) * 0.9; if (inside(cx + (dog.x - cx) * t, cz + (dog.z - cz) * t)) n += 2; }
  const fx = shot.look[0] - cx, fz = shot.look[2] - cz, fl = Math.hypot(fx, fz) || 1, ux = fx / fl, uz = fz / fl;
  const tanH = Math.tan(((fov * Math.PI) / 180) / 2) * aspect;
  for (const z of PET_NEAR) for (const u of PET_NEAR_X) if (inside(cx + ux * z - uz * u * z * tanH, cz + uz * z + ux * u * z * tanH, 0)) n++;
  return n;
}

/**
 * 반려견 '콩이' (CC0 Quaternius 시바견, 뼈대 애니메이션)
 * 플레이어를 졸졸 따라다니고, 멀어지면 뛰어오고, 가만히 있으면 앉아 쉬거나 냄새를 맡는다. E/탭으로 쓰다듬기.
 */
export class Pet {
  constructor(game) {
    this.game = game;
    this.ok = game.assets.has('q_shiba') && game.assets.anims.get('q_shiba')?.length;
    if (!this.ok) return;
    const rig = game.assets.cloneAnimated('q_shiba');
    this.e = { m: rig.root, mixer: rig.mixer, clips: rig.clips };
    // 머리·귀를 조금 크게 (아기 같은 비율). 동작에 배율 채널이 없어 그대로 유지됨. 귀가 머리 형제라 Head 대신 Neck3
    rig.root.getObjectByName('Neck3')?.scale.setScalar(1.2);
    const p = game.player.position;
    this.e.m.position.set(p.x + 1.5, 0, p.z + 1);
    game.world.scene.add(this.e.m);
    playClip(this.e, 'idle', 0);
    const label = makeLabel('🐕 콩이', { color: '#5a3a1a', bg: 'rgba(255,248,230,0.92)', size: 30, scale: 0.0042 });
    label.position.y = 1.15;
    this.e.m.add(label);
    this.label = label;
    this.idleT = 0;
    this.petT = 0;
    this.vel = 0;
    this.sim = new PetSim();
    this.trick = null; // { id, t }
    this.digging = null; // { t, x, z }
  }

  load(s) { this.sim.load(s); this._label(); }
  toJSON() { return this.sim.toJSON(); }

  _label() {
    if (!this.ok) return;
    const sim = this.sim, txt = `🐕 ${sim.name} ${'❤️'.repeat(sim.hearts) || '🤍'}${sim.mood === 'hungry' ? ' 💧배고파요' : ''}`;
    if (txt === this._lt) return;
    this._lt = txt;
    const old = this.label;
    this.label = makeLabel(txt, { color: '#5a3a1a', bg: 'rgba(255,248,230,0.92)', size: 30, scale: 0.0042 });
    this.label.position.y = 1.15;
    this.e.m.remove(old); old.userData.dispose?.();
    this.e.m.add(this.label);
  }

  update(dt, playerPos, hidden = false) {
    if (!this.ok) return null;
    const e = this.e, p = e.m.position;
    e.m.visible = !hidden;
    if (this.chaseT > 0) { this.chaseT -= dt; playerPos = this.chaseTo; } // 쫓기 중엔 목표가 해로운 동물
    const dx = playerPos.x - p.x, dz = playerPos.z - p.z, d = Math.hypot(dx, dz);
    if (d > 22) { // 순간이동(체험관 이동 등) 따라가기
      p.set(playerPos.x - 1.2, 0, playerPos.z + 1.2);
      this.vel = 0;
    }
    // 키우기: 배고픔·애정, 행복하면 가끔 땅을 팜 (돌보기 대화 중에는 자리를 지킴)
    if (this.sim.tick(dt) === 'dig' && !this.digging && !this.trick && !this.caring && !this.game.cinema?.locked) { // 컷신 중엔 자리를 지킴
      const a = Math.random() * Math.PI * 2;
      this.digging = { t: 0, x: playerPos.x + Math.cos(a) * 2.2, z: playerPos.z + Math.sin(a) * 2.2 };
    }
    this._label();
    if (this.trick) return this._doTrick(dt, d);
    if (this.digging) return this._doDig(dt, playerPos);
    let want = 0;
    if (this.petT > 60 && !this.game.cinema?.locked) this.petT = 0; // 컷신용 긴 멈춤은 컷신이 끝나면 (도중에 끊겨도) 풂
    if (this.petT > 0) this.petT -= dt;
    else if (this.chaseT > 0) want = d > 1.2 ? 6 : 0;
    else if (d > 6) want = this.sim.mood === 'hungry' ? 3.4 : 5.2; // 배고프면 기운이 없음
    else if (d > 2.2) want = this.sim.mood === 'hungry' ? 1.7 : 2.4;
    this.vel += (want - this.vel) * (1 - Math.exp(-dt * 5));
    if (this.vel > 0.05 && d > 0.6) {
      // 몸을 돌리면서 바라보는 방향으로 달림 (옆걸음 방지)
      const yaw = Math.atan2(dx, dz);
      const diff = ((yaw - e.m.rotation.y + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
      e.m.rotation.y += diff * (1 - Math.exp(-dt * 7));
      const step = this.vel * dt * Math.max(0.15, Math.cos(diff));
      const next = (this._next ||= new THREE.Vector3()).set(p.x + Math.sin(e.m.rotation.y) * step, 0, p.z + Math.cos(e.m.rotation.y) * step);
      this.game.world.resolveCollision(next, 0.3);
      p.copy(next);
      playClip(e, this.vel > 3.6 ? 'run' : 'walk', 0.25);
      this.idleT = 0;
    } else {
      this.idleT += dt;
      if (this.petT > 0) playClip(e, this.game.cinema?.locked ? 'idle' : 'look'); // 컷신 중엔 두리번거리지 않고 카메라를 봄
      else playClip(e, this.idleT > 6 ? 'idle2' : this.idleT > 3 ? 'look' : 'idle', 0.4);
      if (this.idleT > 12) this.idleT = 0;
    }
    p.y = heightAt(p.x, p.z);
    const rate = e.cur === 'walk' ? this.vel / 1.6 : e.cur === 'run' ? this.vel / 4.5 : 1;
    e.mixer.update(dt * THREE.MathUtils.clamp(rate, 0.5, 1.8));
    // 이름표는 가까울 때만 (화면 정리), 대화창이 떠 있으면 숨김. 쓰다듬기는 다른 할 일보다 우선순위 낮게
    this.label.visible = d < 4.5 && !this.game.dialogue?.active;
    if (this.sim.found && d < 2 && !hidden) return { d: d - 0.5, label: `🐕 ${this.sim.name}${josa(this.sim.name, '이/가')} 찾아 온 것 받기`, key: 'petfind', onInteract: () => this.takeFound() };
    if (d < 1.4 && !hidden) return { d: d + 1.2, label: `🐕 ${this.sim.name} 돌보기`, key: 'pet', onInteract: () => this.care() };
    return null;
  }

  _mix(dt, rate = 1) { this.e.mixer.update(dt * rate); this.e.m.position.y = heightAt(this.e.m.position.x, this.e.m.position.z) + (this._hop || 0); }

  /** 재주: 앉아(앉는 동작) · 빙글빙글(제자리 한 바퀴 달리기) · 점프 · 손!(앉아서 앞발 톡) · 춤추기(통통 뛰며 좌우로 흔들고 한 바퀴) */
  _doTrick(dt, d) {
    const tr = this.trick, e = this.e, g = this.game, p = e.m.position;
    const prev = tr.t;
    tr.t += dt;
    const at = (s) => prev < s && tr.t >= s; // 이번 프레임에 s 초를 지났나
    if (tr.id === 'sit') { playClip(e, 'idle2', 0.2); }
    else if (tr.id === 'spin') { playClip(e, 'run', 0.15); e.m.rotation.y += dt * Math.PI * 2 / 1.1; }
    else if (tr.id === 'jump') { playClip(e, 'jump', 0.1); this._hop = Math.max(0, Math.sin(Math.min(1, tr.t / 0.7) * Math.PI)) * 0.55; }
    else if (tr.id === 'paw') {
      // 주인 쪽을 보고 앉았다가 앞발을 톡 (몸이 살짝 들림), 주인은 손바닥을 내밀며 하트
      const pp = g.player.position; e.m.rotation.y = Math.atan2(pp.x - p.x, pp.z - p.z);
      playClip(e, 'idle2', 0.2);
      this._hop = tr.t > 0.7 && tr.t < 1.3 ? Math.sin((tr.t - 0.7) / 0.6 * Math.PI) * 0.12 : 0;
      if (at(0.75)) { g.fx.pop(p.x, p.z, '🐾'); g.audio.play('pop', 0.6); g.player.unico.playAction('heart', 1.1); }
    } else if (tr.id === 'dance') {
      // 통통 뛰며 좌우로 흔들다가 마지막에 한 바퀴, 박자마다 음표
      playClip(e, tr.t < 1.8 ? 'jump' : 'run', 0.12);
      this._hop = Math.abs(Math.sin(tr.t * Math.PI * 2.5)) * 0.22;
      if (tr.t < 1.8) e.m.rotation.y += Math.cos(tr.t * Math.PI * 2.5) * dt * 3.2;
      else e.m.rotation.y += dt * Math.PI * 2 / 0.8;
      for (let k = 0; k < 5; k++) if (at(0.2 + k * 0.4)) { g.fx.pop(p.x, p.z, k % 2 ? '🎶' : '🎵'); g.audio.play('tune', 1, { k }); }
    }
    this._mix(dt);
    if (tr.t > (TRICK_TIME[tr.id] || 1.2)) {
      this.trick = null; this._hop = 0;
      this.game.fx.pop(e.m.position.x, e.m.position.z, '✨');
    }
    this.label.visible = d < 4.5 && !this.game.dialogue?.active;
    return null;
  }

  /** 땅 파기: 그 자리로 가서 코를 박고 흙을 튀기다가 무언가를 찾아 옴 */
  _doDig(dt, playerPos) {
    const g = this.game, dg = this.digging, e = this.e, p = e.m.position;
    const dx = dg.x - p.x, dz = dg.z - p.z, d = Math.hypot(dx, dz);
    if (d > 0.3 && dg.t === 0) {
      e.m.rotation.y = Math.atan2(dx, dz);
      const step = Math.min(d, 2.4 * dt);
      p.x += Math.sin(e.m.rotation.y) * step; p.z += Math.cos(e.m.rotation.y) * step;
      playClip(e, 'walk', 0.2);
      this._mix(dt, 1.5);
      return null;
    }
    dg.t += dt;
    playClip(e, 'eat', 0.3);
    if (Math.random() < dt * 6) g.fx.dust(p.x + Math.sin(e.m.rotation.y) * 0.4, p.z + Math.cos(e.m.rotation.y) * 0.4);
    this._mix(dt);
    if (dg.t > 2.6) {
      this.digging = null;
      const f = this.sim.dig();
      g.audio.play('bark');
      g.fx.pop(p.x, p.z, f.type === 'coin' ? '🪙' : f.type === 'seed' ? '🌱' : '🎁', { fly: false }); // 아직 받기 전: 떠오르기만
      g.ui.toast(`🐕 ${this.sim.name}${josa(this.sim.name, '이/가')} 땅을 파서 무언가를 찾았어요! 가까이 가서 받아 주세요`);
    }
    void playerPos;
    return null;
  }

  takeFound() {
    const g = this.game, eco = g.economy, f = this.sim.take();
    if (!f) return;
    let text, icon, to = { to: 'bag' };
    if (f.type === 'coin') { eco.earn(f.n); text = `🪙 ${f.n} 코인`; icon = '🪙'; to = { to: 'coin', amount: f.n }; }
    else if (f.type === 'seed') {
      const ks = Object.keys(CROPS).filter((k) => CROPS[k].unlockLevel <= g.quests.level), k = ks[Math.floor(Math.random() * ks.length)];
      eco.addSeeds(k, 2); text = `${CROPS[k].emoji} ${CROPS[k].name} 씨앗 2개`; icon = CROPS[k].emoji;
    } else { eco.addItem('fruit_apple', 1); eco.addItem('pet_treat', 1); text = `${ITEMS.fruit_apple.emoji} 사과와 🦴 간식`; icon = '🦴'; }
    const p = this.e.m.position;
    g.fx.pop(p.x, p.z, icon, to); // 받는 순간 가방(코인은 지갑)으로
    g.audio.play('coin');
    g.player.unico.playAction('heart', 1);
    g.ui.toast(`🐕 ${this.sim.name}${josa(this.sim.name, '이/가')} ${text}${josa(text, '을/를')} 물어 왔어요! 착하다~`);
    this.sim.affection = Math.min(100, this.sim.affection + 2);
  }

  /** 돌보기 구도: 후보(PET_THETA × 지금 쪽·반대쪽) 중 가림이 없는 첫 것, 모두 가리면 가장 덜 가리는 것 (같으면 앞 순서 = 60° 지금 쪽) */
  _careShot(pp, p, here) {
    const cam = this.game.camera;
    let best = null;
    for (const theta of PET_THETA) for (const side of [here, -here]) {
      const s = speakerShot(pp, p, side, { ...PET_SHOT, theta, fov: cam.fov, aspect: cam.aspect });
      s.block = petShotBlock(s, p, pp, this.game.world, cam.fov, cam.aspect);
      if (!s.block) return s;
      if (!best || s.block < best.block) best = s;
    }
    return best;
  }

  /**
   * 돌보기 대화: 쓰다듬기 · 간식/작물 주기 · 재주(따로 고르는 목록) · 이름 짓기
   * 카메라는 콩이를 3/4 앞에서 낮게 (선택지를 줄여 대화창 위에 콩이가 보이게)
   */
  async care() {
    const g = this.game;
    if (g.dialogue.active) return;
    const p = this.e.m.position, pp = g.player.position, cam = g.camera;
    const fx = pp.x - p.x, fz = pp.z - p.z, d = Math.hypot(fx, fz) || 1;
    const side = (cam.position.x - p.x) * (-fz / d) + (cam.position.z - p.z) * (fx / d) >= 0 ? 1 : -1; // 지금 카메라 쪽
    const shot = this._careShot(pp, p, side);
    this.e.m.rotation.y = cheatYaw(p, pp, shot.pos, PET_CHEAT);
    g.player.unico.facing = cheatYaw(pp, p, shot.pos, ME_CHEAT);
    g.cinema.shot(shot.pos, shot.look, 0.8, { lift: true });
    g.cinema.hideLabelsOf(g.player.unico);
    this.label.visible = false;
    this.caring = true;
    let c;
    try { c = await this._careMenu(); } finally { g.cinema.release(); this.caring = false; }
    const sim = this.sim, eco = g.economy;
    const crop = Object.keys(eco.inventory.crops).find((k) => eco.inventory.crops[k] > 0);
    if (c === 'pet') this.pet();
    else if (c === 'treat' && eco.take('pet_treat', 1)) this._fed(sim.feed('treat'), '🦴');
    else if (c === 'crop' && crop && eco.take(crop, 1)) this._fed(sim.feed('crop'), CROPS[crop].emoji);
    else if (c?.startsWith('trick:')) { this.trick = { id: c.slice(6), t: 0 }; g.audio.play('bark'); g.player.unico.playAction('present', 1); }
    else if (c === 'name') {
      // 브라우저 입력 창 대신 대화창 안 이름 카드 (인트로와 같은 것)
      const n = await g.dialogue.say({ speaker: null, portrait: 'dog', name: `🐕 ${sim.name}`, color: '#e39a4a', text: '새 이름을 지어 줄까요? (6글자까지)', input: { value: sim.name, max: 6, icon: '🐕' } });
      this.rename(n);
    }
  }

  /** 잠깐 멈춰 서기 (인트로 이름 카드 구도): 따라오기를 s 초 쉬고 두리번. 0 이면 바로 다시 따라옴 */
  settle(s = 6) { if (!this.ok) return; this.petT = s; this.vel = 0; }

  /** 반기기: 제자리 깡충 + 멍멍 + 분홍 가루 */
  cheer() {
    if (!this.ok) return;
    const p = this.e.m.position, g = this.game;
    this.trick = { id: 'jump', t: 0 };
    g.audio?.play?.('bark');
    g.fx?.burst?.(p.x, 0.75, p.z, 0xff7aa8, 16); // 분홍 하트 가루 (낮은 가까이 구도에서 큰 글자 그림이 화면을 덮지 않게)
  }

  /** 이름 바꾸기 (다듬어서, 비면 그대로) */
  rename(raw, { quiet = false } = {}) {
    const sim = this.sim, n = sanitizeName(raw, sim.name, 6);
    if (n === sim.name) return false;
    sim.name = n; this._lt = ''; this._label();
    if (!quiet) this.game.ui.toast(`🐕 이제 이름은 '${n}'!`);
    this.game.audio?.play?.('pop', 0.6);
    return true;
  }

  /** 돌보기 선택지: 첫 목록은 짧게(콩이가 대화창 위에 보이게), 재주는 따로 고르는 목록 → 고른 값 */
  async _careMenu() {
    const g = this.game, sim = this.sim, eco = g.economy;
    const head = () => ({ speaker: null, portrait: 'dog', name: `🐕 ${sim.name}`, color: '#e39a4a', sub: `애정 ${'❤️'.repeat(sim.hearts)}${'🤍'.repeat(5 - sim.hearts)} · 배부름 ${Math.round(sim.hunger)}%` });
    for (let guard = 0; guard < 8; guard++) {
      const treats = eco.count('pet_treat');
      const crop = Object.keys(eco.inventory.crops).find((k) => eco.inventory.crops[k] > 0);
      const moodText = { hungry: '배가 고파서 기운이 없어 보여요…', happy: '꼬리를 신나게 흔들고 있어요!', calm: '얌전히 기다리고 있어요.' }[sim.mood];
      const learned = TRICKS.filter((t) => sim.unlocked(t.id)).length;
      const choices = [
        { label: '🤲 쓰다듬기', value: 'pet', note: sim.petCool > 0 ? '방금 쓰다듬었어요 (조금 뒤에 애정이 올라요)' : '' },
        { label: `🦴 간식 주기 (보유 ${treats})`, value: 'treat', disabled: !treats || sim.hunger >= 98, note: treats ? '' : '장터에서 강아지 간식을 살 수 있어요' },
      ];
      if (crop) choices.push({ label: `${CROPS[crop].emoji} ${CROPS[crop].name} 나눠 주기`, value: 'crop', disabled: sim.hunger >= 98 });
      choices.push(
        { label: `🎪 재주 시키기 (${learned}/${TRICKS.length})`, value: 'tricks', disabled: !learned, note: learned ? '' : `하트 ${TRICKS[0].hearts}개가 되면 첫 재주를 배워요` },
        { label: '✏️ 이름 짓기', value: 'name' }, { label: '👋 그만', value: 'bye' },
      );
      const c = await g.dialogue.say({ ...head(), text: `${sim.name}${josa(sim.name, '은/는')} ${moodText}`, choices });
      if (c !== 'tricks') return c;
      const tricks = TRICKS.map((t) => ({ label: `${t.emoji} ${t.name}`, value: 'trick:' + t.id, disabled: !sim.unlocked(t.id), note: sim.unlocked(t.id) ? '' : `하트 ${t.hearts}개가 되면 배워요` }));
      const t = await g.dialogue.say({ ...head(), text: `${sim.name}에게 어떤 재주를 시켜 볼까요?`, choices: [...tricks, { label: '↩️ 돌아가기', value: 'back' }] });
      if (t !== 'back') return t;
    }
    return 'bye';
  }

  _fed(r, emoji) {
    const g = this.game, p = this.e.m.position;
    if (!r) return g.ui.toast('🐕 배가 불러서 더 못 먹겠대요');
    this.petT = 2; playClip(this.e, 'eat', 0.2);
    g.audio.play('eat');
    g.fx.pop(p.x, p.z, emoji, { fly: false }); // 먹은 것: 떠오르기만 (가방으로 날아가지 않게)
    g.ui.toast(`🐕 ${this.sim.name}${josa(this.sim.name, '이/가')} 맛있게 먹었어요! 배부름 +${r.hunger}, 애정 +${r.affection}`);
    g.onEvent?.('petfeed');
  }

  /** 해로운 동물을 쫓을 때: 짖으며 그쪽으로 달려들었다가 돌아옴 */
  chase(pos) {
    if (!this.ok) return;
    this.chaseT = 2.2; this.chaseTo = pos.clone();
    this.game.audio.play('bark');
    setTimeout(() => this.game.audio.play('bark', 0.8), 450);
  }

  pet() {
    const g = this.game;
    const gain = this.sim.pet();
    if (gain) g.ui.toast(`💕 ${this.sim.name} 애정 +${gain} (${'❤️'.repeat(this.sim.hearts) || '🤍'})`);
    this.petT = 2;
    this.idleT = 0;
    const p = this.e.m.position;
    this.e.m.rotation.y = Math.atan2(g.player.position.x - p.x, g.player.position.z - p.z);
    g.audio.play('plant');
    g.player.unico.playAction('heart', 1.2);
    g.fx.pop(p.x, p.z, '💕');
    g.onEvent?.('pet');
  }
}
