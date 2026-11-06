import { FarmSim } from '../game/sim/farm.js';
import { Economy } from '../game/sim/economy.js';
import { RanchSim } from '../game/sim/ranch.js';
import { Villagers, VILLAGERS } from '../game/sim/villagers.js';
import { Quests, QUESTS } from '../game/sim/quests.js';
import { PetSim, TRICKS } from '../game/sim/pet.js';
import { FishingSim } from '../game/sim/fishing.js';
import { Collection } from '../game/sim/collection.js';
import { CROPS, PRODUCTS, FEED_PRICE, ANIMALS } from '../game/sim/crops.js';
import { ITEMS } from '../game/sim/items.js';
import { MW, MH, G, PLOTS, RANCH, SPAWN, NPCS, ANIMAL_START, buildMap } from './map.js';
import { nightness } from './render.js';

const T = 32;
export const DAY_LENGTH = 360; // 3D 버전과 같은 하루 6분
const SAVE_KEY = 'unico-pixel-save-v1';
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const dirOf = (dx, dy) => (dx > 0 ? 'right' : dx < 0 ? 'left' : dy < 0 ? 'up' : 'down');
const nameOf = (k) => (CROPS[k] || PRODUCTS[k] || ITEMS[k])?.name || k;
const iconOf = (k) => (CROPS[k] ? k : PRODUCTS[k] ? k : k === 'feed' ? 'feed' : k === 'pet_treat' ? 'treat' : k.startsWith('fish_') ? 'fish' : k === 'compost' ? 'compost' : k.startsWith('fruit_') ? 'tomato' : k.endsWith('_gold') ? 'star' : 'gift');
// 도트 버전에서 할 수 있는 퀘스트만 보여 줌
const SUPPORTED = new Set(['till', 'plant', 'water', 'harvest', 'sell', 'feed', 'collect', 'fish', 'shake', 'hearts', 'petfeed', 'weed']);

/** 칸 단위로 움직이는 캐릭터 (포켓몬식 한 칸 걷기) */
class Actor {
  constructor(x, y, dir = 'down') { this.x = x; this.y = y; this.fx = x; this.fy = y; this.t = 1; this.dir = dir; this.dur = 0.24; this.step = 0; }
  get moving() { return this.t < 1; }
  go(dx, dy, dur) { this.fx = this.x; this.fy = this.y; this.x += dx; this.y += dy; this.t = 0; this.dur = dur; this.step ^= 1; this.dir = dirOf(dx, dy); }
  update(dt) { if (this.t < 1) this.t = Math.min(1, this.t + dt / this.dur); }
  get wx() { return (this.fx + (this.x - this.fx) * this.t) * T + T / 2; }
  get wy() { return (this.fy + (this.y - this.fy) * this.t) * T + T - 4; }
  get frame() { return !this.moving ? 0 : this.t < 0.5 ? (this.step ? 1 : 3) : 0; }
}

export class Game {
  constructor(S, ui, audio, music) {
    this.S = S; this.ui = ui; this.audio = audio; this.music = music;
    this.map = buildMap();
    this.farm = new FarmSim(PLOTS.cols * PLOTS.rows, PLOTS.cols);
    this.farm.weedChance = 0.004;
    this.econ = new Economy();
    this.ranch = new RanchSim(ANIMAL_START.map((a) => ({ type: a.type })));
    this.villagers = new Villagers();
    this.quests = new Quests();
    this.pet = new PetSim();
    this.fishing = new FishingSim();
    this.book = new Collection();
    this.day = 1; this.time = 0.27; this.raining = false;
    this.seed = 'carrot';
    this.player = new Actor(SPAWN.x, SPAWN.y, 'down');
    this.dog = new Actor(SPAWN.x - 1, SPAWN.y, 'right'); this.dog.dur = 0.24;
    this.npcs = NPCS.map((n) => ({ ...n, a: new Actor(n.x, n.y, n.dir), home: [n.x, n.y], next: 2 + Math.random() * 4, bubble: null }));
    this.animals = this.ranch.animals.map((a, i) => ({ sim: a, a: new Actor(ANIMAL_START[i].x, ANIMAL_START[i].y, 'right'), face: Math.random() < 0.5 ? 0 : 1, next: Math.random() * 4, eat: 0 }));
    this.fruitTrees = this.map.objs.filter((o) => o.type === 'tree' && o.item);
    this.held = []; this.holdT = 0; this.run = false;
    this.path = null; this.pathAct = null;
    this.fish = null; // 낚시 상태
    this.parts = [];
    this.bubbleT = 0;
    this.dogBubble = null;
    this.saveT = 10;
    this.load();
    this.refreshDayWeather(false);
    this.econ.newDay(this.day);
  }

  /* ─────────── 저장 ─────────── */
  save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        v: 1, day: this.day, time: this.time, seed: this.seed, raining: this.raining,
        farm: this.farm.toJSON(), econ: this.econ.toJSON(), ranch: this.ranch.toJSON(), villagers: this.villagers.toJSON(), quests: this.quests.toJSON(), pet: this.pet.toJSON(), book: { entries: this.book.entries, rewarded: this.book.rewarded },
        player: { x: this.player.x, y: this.player.y, dir: this.player.dir }, trees: this.fruitTrees.map((t) => t.lastShake || 0),
      }));
    } catch { /* 저장 불가 (사생활 보호 모드 등) */ }
  }
  load() {
    let d = null;
    try { d = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch { d = null; }
    if (!d) return;
    this.day = d.day || 1; this.time = d.time ?? 0.27; this.seed = d.seed || 'carrot'; this.raining = !!d.raining;
    this.farm.load(d.farm); this.econ.load(d.econ); this.ranch.load(d.ranch); this.villagers.load(d.villagers); this.quests.load(d.quests); this.pet.load(d.pet);
    if (d.book) { this.book.entries = d.book.entries || {}; this.book.rewarded = d.book.rewarded || {}; }
    if (d.player && !this.blocked(d.player.x, d.player.y)) { this.player = new Actor(d.player.x, d.player.y, d.player.dir); this.dog = new Actor(d.player.x, d.player.y + 1 < MH && !this.blocked(d.player.x, d.player.y + 1) ? d.player.y + 1 : d.player.y, 'down'); }
    (d.trees || []).forEach((v, i) => { if (this.fruitTrees[i]) { this.fruitTrees[i].lastShake = v; this.fruitTrees[i].shaken = v === this.day; } });
    // 새로 들인 동물이 저장에 있으면 배치
    while (this.animals.length < this.ranch.animals.length) { const a = this.ranch.animals[this.animals.length]; this.animals.push({ sim: a, a: new Actor(40, 30, 'right'), face: 0, next: 1, eat: 0 }); }
  }

  /* ─────────── 지도·충돌 ─────────── */
  solid(x, y) { return x < 0 || y < 0 || x >= MW || y >= MH || this.map.solid[y * MW + x] === 1; }
  entityAt(x, y) {
    for (const n of this.npcs) if ((n.a.x === x && n.a.y === y) || (n.a.moving && n.a.fx === x && n.a.fy === y)) return { kind: 'npc', n };
    for (const a of this.animals) if (a.a.x === x && a.a.y === y) return { kind: 'animal', a };
    return null;
  }
  blocked(x, y) { return this.solid(x, y) || !!this.entityAt(x, y); }
  plotAt(x, y) { const c = x - PLOTS.x, r = y - PLOTS.y; return c >= 0 && r >= 0 && c < PLOTS.cols && r < PLOTS.rows ? r * PLOTS.cols + c : -1; }
  objAt(x, y) { return this.map.objs.find((o) => !o.walk && o.px === undefined && (o.w ? x >= o.x && x < o.x + o.w && y <= o.y && y > o.y - (o.h ?? 3) : o.x === x && o.y === y)); }
  isWater(x, y) { return x >= 0 && y >= 0 && x < MW && y < MH && this.map.ground[y * MW + x] === G.water; }

  get night() { return nightness(this.time); }
  get level() { return this.quests.level; }
  unlockedCrops() { return Object.keys(CROPS).filter((k) => CROPS[k].unlockLevel <= this.level); }

  /* ─────────── 입력 ─────────── */
  press(k) {
    this.audio._ctx();
    if (this.ui.key(k)) return;
    if (k === 'ok') return this.fish ? this.reel() : this.interact();
    if (k === 'back' && this.fish) return this.cancelFish();
    if (DIRS[k]) { if (!this.held.includes(k)) this.held.push(k); this.holdT = 0; this.path = null; }
  }
  release(k) { this.held = this.held.filter((h) => h !== k); }
  tapTile(tx, ty) {
    if (this.ui.busy || this.fish) return;
    const p = this.player;
    // 바로 옆 칸이면 돌아서 상호작용
    if (Math.abs(tx - p.x) + Math.abs(ty - p.y) === 1 && this.targetInfo(tx, ty)) { p.dir = dirOf(tx - p.x, ty - p.y); this.interact(); return; }
    const goal = this.findPath(tx, ty);
    if (goal) { this.path = goal.path; this.pathAct = goal.act; }
  }
  /** 너비 우선 탐색: 목표가 막혀 있으면 옆 칸까지 가서 그쪽을 봄 */
  findPath(tx, ty) {
    const p = this.player;
    const goalFree = !this.blocked(tx, ty) && !(this.isWater(tx, ty));
    const want = (x, y) => (goalFree ? x === tx && y === ty : Math.abs(x - tx) + Math.abs(y - ty) === 1);
    const key = (x, y) => y * MW + x;
    const prev = new Map([[key(p.x, p.y), null]]);
    const qx = [p.x], qy = [p.y];
    for (let i = 0; i < qx.length && i < 4000; i++) {
      const x = qx[i], y = qy[i];
      if (want(x, y)) {
        const path = []; let k = key(x, y);
        while (prev.get(k) !== null) { path.unshift([k % MW, Math.floor(k / MW)]); k = prev.get(k); }
        return { path, act: goalFree ? null : [tx, ty] };
      }
      for (const [dx, dy] of Object.values(DIRS)) {
        const nx = x + dx, ny = y + dy, nk = key(nx, ny);
        if (prev.has(nk) || this.blocked(nx, ny)) continue;
        prev.set(nk, key(x, y)); qx.push(nx); qy.push(ny);
      }
    }
    return null;
  }

  /* ─────────── 매 프레임 ─────────── */
  update(dt) {
    const busy = this.ui.busy;
    this.ui.tickDlg(dt);
    if (!busy) {
      this.time += dt / DAY_LENGTH;
      if (this.time >= 1) { this.time -= 1; this.newDay(); }
      this.simTick(dt);
    }
    this.movePlayer(dt, busy);
    this.player.update(dt);
    this.dog.update(dt);
    this.updateNpcs(dt, busy);
    this.updateAnimals(dt);
    for (const t of this.fruitTrees) if (t.shakeT > 0) t.shakeT -= dt;
    if (this.fish) this.fishTick(dt);
    this.saveT -= dt; if (this.saveT <= 0) { this.saveT = 10; this.save(); }
    this.ui.hint(this.fish ? (this.fish.state === 'bite' ? '지금 당기기!' : '찌가 쑥 들어가면 당기기 (Esc: 그만)') : this.hintText());
    this.ui.hud(this.hudState());
    this.music?.setScene({ daylight: 1 - this.night, kind: this.raining ? 'rain' : 'clear', precip: this.raining ? 0.7 : 0, wind: 0.2 });
  }

  simTick(dt) {
    this.farm.tick(dt);
    if (this.raining) { this.rainT = (this.rainT || 0) - dt; if (this.rainT <= 0) { this.rainT = 8; this.farm.rain(); } }
    const ready = this.ranch.tick(dt, this.day);
    for (const a of ready) { const v = this.animals.find((x) => x.sim === a); if (v) v.eat = 0; }
    if (this.pet.tick(dt) === 'dig') { this.pet.dig(); this.dogBubble = '!'; this.audio.play('bark'); this.ui.toast(`${this.pet.name}가 땅을 파서 뭔가 찾았어요!`); }
  }

  movePlayer(dt, busy) {
    const p = this.player;
    if (p.moving || busy || this.fish) return;
    let dir = this.held[this.held.length - 1];
    if (dir) {
      this.holdT += dt;
      this.path = null;
    } else if (this.path?.length) {
      const [nx, ny] = this.path[0];
      if (this.blocked(nx, ny)) { this.path = null; return; }
      this.path.shift();
      this.step(nx - p.x, ny - p.y);
      return;
    } else if (this.path && this.pathAct) {
      const [ax, ay] = this.pathAct; this.path = null; this.pathAct = null;
      p.dir = dirOf(ax - p.x, ay - p.y);
      this.interact();
      return;
    } else return;
    const [dx, dy] = DIRS[dir];
    // 톡 누르면 제자리에서 돌기만 (포켓몬식)
    if (p.dir !== dir && this.holdT < 0.09) { p.dir = dir; return; }
    if (this.blocked(p.x + dx, p.y + dy)) { if (p.dir !== dir) p.dir = dir; if (!this.bumpT || this.bumpT < performance.now()) { this.audio.play('bump', 0.25); this.bumpT = performance.now() + 380; } return; }
    this.step(dx, dy);
  }

  step(dx, dy) {
    const p = this.player;
    const run = this.run;
    const ox = p.x, oy = p.y;
    p.go(dx, dy, run ? 0.14 : 0.24);
    if (run) this.puff(p.wx, p.wy, 2);
    // 반려견은 내가 있던 칸으로 따라옴
    const d = this.dog;
    if (!(d.x === ox && d.y === oy)) {
      const ddx = ox - d.x, ddy = oy - d.y;
      if (Math.abs(ddx) + Math.abs(ddy) === 1) d.go(ddx, ddy, p.dur);
      else { d.fx = d.x = ox; d.fy = d.y = oy; d.t = 1; }
      if (d.x === p.x && d.y === p.y) { d.fx = d.x = ox; d.fy = d.y = oy; }
    }
    d.dur = p.dur;
    const slow = this.pet.hunger < 25;
    if (slow) d.dur *= 1.15;
  }

  updateNpcs(dt, busy) {
    for (const n of this.npcs) {
      n.a.update(dt);
      if (busy || n.talking || !n.wander) continue;
      n.next -= dt;
      if (n.next > 0 || n.a.moving) continue;
      n.next = 2.5 + Math.random() * 4;
      const [dx, dy] = Object.values(DIRS)[Math.floor(Math.random() * 4)];
      const nx = n.a.x + dx, ny = n.a.y + dy;
      if (Math.abs(nx - n.home[0]) > n.wander || Math.abs(ny - n.home[1]) > n.wander || this.blocked(nx, ny) || (nx === this.player.x && ny === this.player.y) || this.plotAt(nx, ny) >= 0) { n.a.dir = dirOf(dx, dy); continue; }
      n.a.go(dx, dy, 0.36);
    }
  }

  updateAnimals(dt) {
    const sleeping = this.night > 0.7;
    for (const v of this.animals) {
      v.a.update(dt);
      if (v.eat > 0) v.eat -= dt;
      v.next -= dt;
      if (sleeping || v.next > 0 || v.a.moving) continue;
      v.next = 1.5 + Math.random() * 4;
      if (Math.random() < 0.3) { v.eat = 1.6; continue; } // 풀 뜯기
      const [dx, dy] = Object.values(DIRS)[Math.floor(Math.random() * 4)];
      const nx = v.a.x + dx, ny = v.a.y + dy;
      if (nx <= RANCH.x0 || nx >= RANCH.x1 || ny <= RANCH.y0 || ny >= RANCH.y1 || this.blocked(nx, ny) || (nx === this.player.x && ny === this.player.y) || (nx === this.dog.x && ny === this.dog.y)) continue;
      v.a.go(dx, dy, v.sim.type === 'chicken' ? 0.3 : 0.6);
      if (dx) v.face = dx > 0 ? 0 : 1;
    }
  }

  newDay() {
    this.day++;
    const ev = this.econ.newDay(this.day);
    this.ranch.newDay(this.day);
    for (const t of this.fruitTrees) t.shaken = false;
    this.refreshDayWeather(true);
    this.ui.toast(`${this.day}일차 아침이 밝았어요`, 'sun');
    if (this.econ.festival) this.ui.toast(this.econ.festival.name, 'star');
    else if (ev) this.ui.toast(ev.name, 'coin');
    this.save();
  }
  refreshDayWeather(roll) { if (roll) this.raining = Math.random() < 0.22; }

  /* ─────────── 상호작용 ─────────── */
  facing() { const p = this.player; const [dx, dy] = DIRS[p.dir]; return [p.x + dx, p.y + dy]; }

  /** 칸에 무엇이 있는지 → { label, run } */
  targetInfo(x, y) {
    const p = this.player;
    const ent = this.entityAt(x, y);
    if (ent?.kind === 'npc') { const n = ent.n; return { label: `${VILLAGERS[n.id].name}와 이야기`, run: () => this.talk(n) }; }
    if (ent?.kind === 'animal') { const v = ent.a, a = v.sim; const act = this.ranch.actionFor(a, this.day); return { label: `${a.name}(${ANIMALS[a.type].name}) ${'♥'.repeat(this.ranch.hearts(a))} · ${act.type === 'feed' ? `사료 주기 (사료 ${this.econ.inventory.feed})` : act.label}`, run: () => this.animalAct(v) }; }
    if (this.dog.x === x && this.dog.y === y) return { label: `${this.pet.name} 돌보기 ${'♥'.repeat(this.pet.hearts)}`, run: () => this.dogMenu() };
    const i = this.plotAt(x, y);
    if (i >= 0) { const a = this.farm.actionFor(i, (this.econ.inventory.seeds[this.seed] || 0) > 0, (this.econ.inventory.items.compost || 0) > 0); if (a?.type === 'plant') a.label = `${CROPS[this.seed].name} 씨앗 심기`; return a && { label: a.label, run: () => this.plotAct(i, a) }; }
    const o = this.objAt(x, y);
    if (o) {
      if (o.type === 'house') return { label: x === 25 && y === 13 ? '집에 들어가 쉬기' : '우리 집', run: () => this.house() };
      if (o.type === 'mailbox') return { label: '우편함 보기', run: () => this.mailbox() };
      if (o.type === 'sign') return { label: '팻말 읽기', run: () => this.ui.say('', o.text === '유니코 밭' ? '유니코 밭 — 갈고, 심고, 물 주고, 거두기! (Q 로 씨앗 바꾸기)' : '유니코 목장 — 사료를 주면 생산물이 나와요. 여물통에 사료를 채워 두면 알아서 먹어요.') };
      if (o.type === 'trough') return { label: `여물통 (${this.ranch.trough}/20) 사료 채우기`, run: () => this.fillTrough() };
      if (o.type === 'barn') return { label: '축사 살펴보기', run: () => this.barnInfo() };
      if (o.type === 'well') return { label: '우물', run: () => this.ui.say('', '시원한 우물물이 찰랑거려요. 물뿌리개는 언제나 가득!') };
      if (o.type === 'stall') { const m = this.npcs.find((n) => n.id === 'merchant'); return { label: '장터 열기', run: () => this.shop(m) }; }
      if (o.type === 'tree' && o.item) return { label: o.shaken ? '오늘은 열매를 다 땄어요' : `${nameOf(o.item)} 나무 흔들기`, run: () => this.shake(o) };
      if (o.type === 'crate') return { label: '나무 상자', run: () => this.ui.say('', '장터에서 쓰는 빈 상자예요.') };
    }
    if (this.isWater(x, y)) return { label: '낚싯대 던지기', run: () => this.cast(x, y) };
    void p;
    return null;
  }
  hintText() { if (this.player.moving) return null; const [x, y] = this.facing(); return this.targetInfo(x, y)?.label || null; }
  interact() { if (this.player.moving) return; const [x, y] = this.facing(); const t = this.targetInfo(x, y); if (t) t.run(); }

  report(ev, n = 1) {
    for (const q of this.quests.report(ev, n)) { this.ui.toast(`퀘스트 완료: ${q.title} (J 에서 보상)`, 'quest'); this.audio.play('win'); }
  }
  popIcon(icon, wx, wy, n = 1) { for (let k = 0; k < n; k++) this.parts.push({ kind: 'icon', img: this.S.icon(icon), x: wx + (k - (n - 1) / 2) * 10, y: wy, vx: (k - (n - 1) / 2) * 6, vy: -50, grav: 90, life: 1.1, decay: 1 }); }
  puff(wx, wy, n = 4) { for (let k = 0; k < n; k++) this.parts.push({ kind: 'puff', x: wx + (Math.random() - 0.5) * 10, y: wy - 2, vx: (Math.random() - 0.5) * 20, vy: -8 - Math.random() * 10, life: 1, decay: 2.2 }); }

  plotAct(i, a) {
    const cx = (PLOTS.x + (i % PLOTS.cols)) * T + 16, cy = (PLOTS.y + Math.floor(i / PLOTS.cols)) * T + 16;
    switch (a.type) {
      case 'till': this.farm.till(i); this.audio.play('dig'); this.puff(cx, cy + 10, 6); this.report('till'); break;
      case 'plant': {
        if (!this.econ.useSeed(this.seed)) return;
        this.farm.plant(i, this.seed);
        if (this.econ.useItem('compost')) this.farm.fertilize(i);
        this.audio.play('plant'); this.report('plant'); break;
      }
      case 'need_seed': this.ui.toast(`${CROPS[this.seed].name} 씨앗이 없어요. Q 로 바꾸거나 장터에서 사요`, 'seed'); this.audio.play('bump', 0.3); break;
      case 'water': this.farm.water(i); this.audio.play('water'); for (let k = 0; k < 10; k++) this.parts.push({ kind: 'drop', x: cx + (Math.random() - 0.5) * 22, y: cy - 10, vx: 0, vy: 40 + Math.random() * 30, life: 0.5, decay: 1.6 }); this.report('water'); break;
      case 'weed': this.farm.weed(i); this.econ.addItem('weed'); this.audio.play('dig'); this.report('weed'); break;
      case 'fert': this.econ.useItem('compost'); this.farm.fertilize(i); this.audio.play('plant'); break;
      case 'harvest': {
        const out = this.farm.harvest(i);
        if (!out) return;
        this.econ.addCrop(out.crop, out.amount);
        this.popIcon(out.crop, cx, cy - 8, Math.min(4, out.amount));
        this.audio.play('harvest'); this.report('harvest', out.amount);
        this.ui.toast(`${out.giant ? '대왕 ' : ''}${CROPS[out.crop].name} ${out.amount}개 ${'★'.repeat(out.stars)}`, out.crop);
        if (out.levelUp) this.ui.toast(`밭농사 숙련도 Lv.${out.levelUp}!`, 'star');
        break;
      }
      default: this.ui.toast(a.label, 'seed');
    }
  }

  animalAct(v) {
    const a = v.sim, act = this.ranch.actionFor(a, this.day);
    const wx = v.a.wx, wy = v.a.wy - 20;
    if (this.night > 0.7 && act.type !== 'collect') { this.ui.toast(`${a.name}는 자고 있어요. 쉿!`, 'moon'); return; }
    if (act.type === 'feed') {
      if (!this.econ.useFeed()) { this.ui.toast('사료가 없어요. 장터에서 사 오세요', 'feed'); return; }
      this.ranch.feed(a, this.day); v.eat = 2.5; this.audio.play('plant'); this.report('feed');
      this.ui.toast(`${a.name}에게 사료를 줬어요`, 'feed');
    } else if (act.type === 'collect') {
      const r = this.ranch.harvest(a); if (!r) return;
      this.econ.addProduct(r.product, r.amount);
      if (r.gold) this.econ.addItem(r.gold);
      this.popIcon(r.product, wx, wy, r.amount); this.audio.play('harvest'); this.report('collect', r.amount);
      this.ui.toast(`${PRODUCTS[r.product].name} ${r.amount}개${r.gold ? ` + ${nameOf(r.gold)}!` : ''}`, r.product);
    } else if (act.type === 'brush' || act.type === 'pet') {
      const r = act.type === 'brush' ? this.ranch.brush(a, this.day) : this.ranch.pet(a, this.day);
      if (!r) return;
      this.audio.play('stroke'); this.popIcon('heart', wx, wy);
      this.ui.toast(`${a.name} ${act.type === 'brush' ? '빗질' : '쓰다듬기'} ${'♥'.repeat(r.hearts)}${r.heartUp ? ' (하트 UP!)' : ''}`, 'heart');
    } else this.ui.toast(`${a.name}: ${act.label}`, PRODUCTS[this.ranch.productOf(a.type)] ? this.ranch.productOf(a.type) : 'heart');
  }

  fillTrough() {
    const n = Math.min(this.econ.inventory.feed, 20 - this.ranch.trough);
    if (n <= 0) { this.ui.toast(this.ranch.trough >= 20 ? '여물통이 가득 찼어요' : '사료가 없어요', 'feed'); return; }
    this.econ.inventory.feed -= n; this.ranch.fillTrough(n); this.audio.play('plant');
    this.ui.toast(`여물통에 사료 ${n}개를 채웠어요`, 'feed');
  }
  barnInfo() {
    const lines = this.ranch.animals.map((a) => `${a.name}(${ANIMALS[a.type].name}) ${'♥'.repeat(this.ranch.hearts(a))}${'♡'.repeat(5 - this.ranch.hearts(a))} — ${this.ranch.actionFor(a, this.day).label}`);
    this.ui.openMenu({ title: '축사', build: () => ({ sub: `목장 숙련도 Lv.${this.ranch.level} · 여물통 ${this.ranch.trough}/20`, items: lines.map((l, i) => ({ icon: this.ranch.productOf(this.ranch.animals[i].type), label: l, onPick: () => {} })) }) });
  }

  shake(o) {
    if (o.shaken) { this.ui.toast('내일 다시 열려요', 'tomato'); return; }
    o.shaken = true; o.lastShake = this.day; o.shakeT = 0.45;
    const n = 3;
    this.econ.addItem(o.item, n); this.book.add(o.item, { day: this.day });
    this.audio.play('stroke'); setTimeout(() => this.audio.play('pop'), 200);
    for (let k = 0; k < n; k++) this.parts.push({ kind: 'icon', img: this.S.icon(o.fruit === 'tomato' ? 'tomato' : o.fruit === 'apron' ? 'carrot' : 'strawberry'), x: o.x * T + 6 + k * 10, y: o.y * T - 50, vx: (k - 1) * 10, vy: -20, grav: 220, life: 0.9, decay: 1 });
    this.report('shake');
    this.ui.toast(`${nameOf(o.item)} ${n}개를 땄어요`, 'tomato');
  }

  async house() {
    const c = await this.ui.say('', this.time > 0.7 || this.time < 0.22 ? '피곤해요. 집에서 푹 잘까요? (다음 날 아침이 돼요)' : '집에서 쉬면 다음 날 아침이 돼요. 쉴까요?', ['푹 자기', '아직 아니에요']);
    if (c !== 0) return;
    this.ui.fade(true);
    await new Promise((r) => setTimeout(r, 700));
    // 자는 동안 시간을 흘려 작물·가축이 자람 (최대 반나절 분량)
    const skip = ((1 - this.time) + 0.26) * DAY_LENGTH;
    for (let s = 0; s < Math.min(skip, 200); s += 1) this.simTick(1);
    this.time = 0.26;
    this.newDay();
    const p = this.player; p.fx = p.x = 25; p.fy = p.y = 14; p.t = 1; p.dir = 'down';
    this.dog.fx = this.dog.x = 26; this.dog.fy = this.dog.y = 14; this.dog.t = 1;
    this.ui.fade(false);
  }
  mailbox() {
    const e = this.econ;
    const top = Object.keys(CROPS).filter((k) => CROPS[k].unlockLevel <= this.level).map((k) => [k, e.sellPrice(k)]).sort((a, b) => b[1] - a[1])[0];
    this.ui.say('우편함', `${e.festival ? e.festival.name + ' ' : ''}${e.event ? `[소식] ${e.event.name}. ` : '[소식] 오늘 시세는 평범해요. '}지금 제일 비싼 작물: ${nameOf(top[0])} ${top[1]}코인. ${this.raining ? '비가 와서 밭에 물이 저절로 차요.' : ''}`);
  }

  /* ── 주민 ── */
  async talk(n) {
    const p = this.player, V = VILLAGERS[n.id];
    n.talking = true;
    n.a.dir = dirOf(p.x - n.a.x, p.y - n.a.y);
    const r = this.villagers.talk(n.id, this.day);
    this.applyHeart(n.id, r);
    const hearts = this.villagers.hearts(n.id);
    const greet = LINES[n.id][(this.day + hearts) % LINES[n.id].length];
    const opts = n.shop ? ['장터 열기', '오늘의 부탁', '선물하기', '안녕!'] : ['이야기하기', '오늘의 부탁', '선물하기', '안녕!'];
    let c = await this.ui.say(`${V.name} ${'♥'.repeat(hearts)}`, greet, opts);
    while (c >= 0 && c < 3) {
      if (c === 0) { if (n.shop) { n.talking = false; return this.shop(n); } await this.ui.say(V.name, TIPS[(this.day * 3 + hearts + Math.floor(Math.random() * 3)) % TIPS.length]); }
      if (c === 1) await this.request(n);
      if (c === 2) { await this.giftMenu(n); break; }
      c = await this.ui.say(`${V.name} ${'♥'.repeat(this.villagers.hearts(n.id))}`, '또 할 얘기 있어?', opts);
    }
    n.talking = false;
  }
  async request(n) {
    const V = VILLAGERS[n.id];
    const pool = ['carrot', 'cabbage', 'egg', 'milk', 'fruit_apple', 'fish_crucian', ...(this.level >= 2 ? ['tomato', 'wool'] : [])];
    const req = this.villagers.requestFor(n.id, this.day, pool);
    if (req.done) return this.ui.say(V.name, '오늘 부탁은 벌써 들어줬잖아. 고마워!');
    const have = this.econ.count(req.item);
    if (have >= req.n) {
      const c = await this.ui.say(V.name, `${this.villagers.describeRequest(req)} 어? 가지고 있구나!`, [`${nameOf(req.item)} ${req.n}개 건네주기`, '다음에']);
      if (c !== 0) return;
      this.econ.take(req.item, req.n);
      const r = this.villagers.fulfill(n.id);
      this.econ.earn(r.reward); this.audio.play('coin');
      this.applyHeart(n.id, r);
      return this.ui.say(V.name, `정말 고마워! 약속한 ${r.reward}코인이야.`);
    }
    return this.ui.say(V.name, `${this.villagers.describeRequest(req)} (지금 ${have}/${req.n}개)`);
  }
  giftMenu(n) {
    const V = VILLAGERS[n.id];
    return new Promise((done) => {
      this.ui.openMenu({
        title: `${V.name}에게 선물`, onClose: done,
        build: () => {
          const inv = this.econ.inventory;
          const items = [...Object.entries(inv.crops), ...Object.entries(inv.products), ...Object.entries(inv.items).filter(([k]) => ITEMS[k]?.cat !== 'seed' && k !== 'paddy')].filter(([, v]) => v > 0);
          return { sub: `좋아하는 것: ${V.likes.map(nameOf).join(' · ')}`, empty: '선물할 게 없어요', items: items.map(([k, v]) => ({ icon: iconOf(k), label: nameOf(k), right: `× ${v}`, onPick: () => {
            const r = this.villagers.gift(n.id, k, this.day);
            this.ui.closeMenu();
            if (!r.ok) { this.ui.say(V.name, '선물은 하루에 하나면 충분해. 마음만 받을게!'); return; }
            this.econ.take(k, 1); this.audio.play(r.liked ? 'win' : 'pop');
            this.applyHeart(n.id, r);
            this.ui.say(V.name, r.liked ? `와! ${nameOf(k)}! 내가 제일 좋아하는 거야! ♥` : `${nameOf(k)}구나. 고마워!`);
          } })) };
        },
      });
    });
  }
  applyHeart(id, r) {
    if (!r?.rewards) return;
    for (const w of r.rewards) {
      if (w.money) this.econ.earn(w.money);
      if (w.seeds) for (const [k, v] of Object.entries(w.seeds)) this.econ.inventory.seeds[k] = (this.econ.inventory.seeds[k] || 0) + v;
      if (w.item) for (const [k, v] of Object.entries(w.item)) this.econ.addItem(k, v);
      this.ui.toast(`${VILLAGERS[id].name} 하트 ${w.hearts}! "${w.text}"`, 'heart');
    }
    if (r.heartUp) this.audio.play('levelup');
    this.report('hearts', Math.max(...Object.keys(VILLAGERS).map((k) => this.villagers.hearts(k))));
  }

  /* ── 장터 ── */
  shop(n) {
    if (n) { n.talking = true; n.a.dir = dirOf(this.player.x - n.a.x, this.player.y - n.a.y); }
    const e = this.econ;
    this.ui.openMenu({
      title: '유니코 장터', tabs: [{ id: 'buy', label: '사기' }, { id: 'sell', label: '팔기' }], tab: 'buy',
      onClose: () => { if (n) n.talking = false; },
      build: (tab) => {
        const sub = `${e.festival ? '🎉 ' + e.festival.name + ' · ' : ''}${e.event ? '📢 ' + e.event.name + ' · ' : ''}가진 돈 ${e.money.toLocaleString()}코인`;
        if (tab === 'buy') {
          const items = Object.keys(CROPS).map((k) => {
            const C = CROPS[k], lock = C.unlockLevel > this.level;
            return { icon: k, label: `${C.name} 씨앗${lock ? ` (Lv.${C.unlockLevel})` : ''}`, right: `${C.seedPrice} · 보유 ${e.inventory.seeds[k] || 0}`, disabled: lock || e.money < C.seedPrice, onPick: () => { if (e.buySeed(k)) { this.audio.play('coin'); } } };
          });
          items.push({ icon: 'feed', label: '가축 사료', right: `${FEED_PRICE} · 보유 ${e.inventory.feed}`, disabled: e.money < FEED_PRICE, onPick: () => e.buyFeed() && this.audio.play('coin') });
          items.push({ icon: 'treat', label: '강아지 간식', right: `${ITEMS.pet_treat.price} · 보유 ${e.inventory.items.pet_treat || 0}`, disabled: e.money < ITEMS.pet_treat.price, onPick: () => e.buyItem('pet_treat') && this.audio.play('coin') });
          items.push({ icon: 'compost', label: '퇴비 (심을 때 자동)', right: `${ITEMS.compost.price} · 보유 ${e.inventory.items.compost || 0}`, disabled: e.money < ITEMS.compost.price, onPick: () => e.buyItem('compost') && this.audio.play('coin') });
          return { sub, items };
        }
        const inv = e.inventory;
        const list = [...Object.entries(inv.crops), ...Object.entries(inv.products), ...Object.entries(inv.items).filter(([k]) => ITEMS[k]?.cat !== 'seed' && k !== 'paddy')].filter(([, v]) => v > 0);
        const items = list.map(([k, v]) => {
          const pr = e.sellPrice(k), tr = e.prices[k]?.trend;
          return { icon: iconOf(k), label: `${nameOf(k)} × ${v}`, right: `${pr}${tr > 0 ? ' ▲' : tr < 0 ? ' ▼' : ''}`, onPick: () => { const got = e.sell(k, 1); if (got) { this.audio.play('coin'); this.report('sell'); } } };
        });
        if (items.length) items.unshift({ icon: 'coin', label: '전부 팔기', right: `+${list.reduce((s, [k, v]) => s + e.sellPrice(k) * v, 0)}`, onPick: () => { const cnt = list.reduce((s, [, v]) => s + v, 0); const got = e.sellAll(); if (got) { this.audio.play('coin'); this.report('sell', cnt); this.ui.toast(`${got.toLocaleString()}코인을 벌었어요`, 'coin'); } } });
        return { sub, items, empty: '팔 물건이 없어요. 밭과 목장에서 거둬 오세요' };
      },
    });
  }

  /* ── 반려견 ── */
  async dogMenu() {
    const P = this.pet;
    if (P.found) {
      const f = P.take(); this.dogBubble = null;
      if (f.type === 'coin') { this.econ.earn(f.n); this.ui.toast(`${P.name}가 ${f.n}코인을 물어 왔어요!`, 'coin'); }
      else if (f.type === 'seed') { const k = this.unlockedCrops()[Math.floor(Math.random() * this.unlockedCrops().length)]; this.econ.inventory.seeds[k] = (this.econ.inventory.seeds[k] || 0) + 2; this.ui.toast(`${CROPS[k].name} 씨앗 2개를 찾았어요!`, k); }
      else { this.econ.addItem('fruit_apple'); this.ui.toast('사과를 하나 물어 왔어요!', 'tomato'); }
      this.audio.play('coin');
      return;
    }
    const treats = this.econ.inventory.items.pet_treat || 0;
    const tricks = TRICKS.filter((t) => P.unlocked(t.id));
    const opts = ['쓰다듬기', `간식 주기 (${treats})`, ...(tricks.length ? ['재주 부려 봐!'] : []), '그만'];
    const c = await this.ui.say(`${P.name} ${'♥'.repeat(P.hearts)}`, `배부름 ${Math.round(P.hunger)} · ${P.mood === 'hungry' ? '배고파 보여요…' : P.mood === 'happy' ? '꼬리를 신나게 흔들어요!' : '얌전히 앉아 있어요.'}`, opts);
    this.dog.dir = dirOf(this.player.x - this.dog.x, this.player.y - this.dog.y);
    if (c === 0) { const g = P.pet(); this.dogBubble = 'heart'; setTimeout(() => (this.dogBubble = null), 1500); this.audio.play('bark'); if (!g) this.ui.toast('방금 쓰다듬었어요. 조금 있다가 또!', 'heart'); }
    else if (c === 1) {
      if (!treats) { this.ui.toast('간식이 없어요 (장터)', 'treat'); return; }
      if (!P.feed('treat')) { this.ui.toast('배불러서 안 먹는대요', 'treat'); return; }
      this.econ.useItem('pet_treat'); this.audio.play('pop'); this.dogBubble = 'note'; setTimeout(() => (this.dogBubble = null), 1500); this.report('petfeed');
    } else if (c === 2 && tricks.length) {
      const t = tricks[Math.floor(Math.random() * tricks.length)];
      this.dogTrick = { id: t.id, t: 1.4 }; this.dogBubble = 'note'; setTimeout(() => (this.dogBubble = null), 1400);
      this.ui.toast(`${P.name}: ${t.name}!`, 'star'); this.audio.play('bark');
    }
  }

  /* ── 낚시 ── */
  cast(x, y) {
    const p = this.player;
    // 찌는 바라보는 쪽으로 물 안쪽 2칸까지
    const [dx, dy] = DIRS[p.dir];
    let bx = x, by = y;
    if (this.isWater(x + dx, y + dy)) { bx += dx; by += dy; }
    this.fishing.cast({ night: this.night > 0.6, raining: this.raining });
    this.fish = { state: 'waiting', bx: bx * T + 16, by: by * T + 18, dip: 0, t: 0 };
    this.audio.play('splash', 0.6);
  }
  fishTick(dt) {
    const f = this.fish; f.t += dt;
    if (f.dip > 0) f.dip -= dt;
    const ev = this.fishing.tick(dt);
    if (ev === 'nibble') { f.dip = 0.18; this.audio.play('pop', 0.5); }
    if (ev === 'bite') { f.state = 'bite'; f.dip = 0.75; this.audio.play('splash', 0.8); }
    if (ev === 'escaped') { this.fish = null; this.ui.toast('앗, 놓쳤어요…', 'fish'); }
  }
  reel() {
    const r = this.fishing.reel();
    const f = this.fish; this.fish = null;
    if (r.ok) {
      this.econ.addItem(r.fish); const b = this.book.add(r.fish, { size: r.size, day: this.day });
      this.audio.play('win'); this.report('fish');
      this.popIcon('fish', this.player.wx, this.player.wy - 50);
      this.ui.say('', `${nameOf(r.fish)}을(를) 낚았다! ${r.size}cm${b.isNew ? ' (새 기록: 도감 등록!)' : b.isRecord ? ' (최대 크기 갱신!)' : ''}`);
    } else this.ui.toast(r.early ? '너무 빨리 당겼어요. 찌가 쑥 들어갈 때!' : '놓쳤어요…', 'fish');
    void f;
  }
  cancelFish() { this.fish = null; this.fishing.reset(); }

  /* ── 메뉴 ── */
  bag() {
    this.ui.openMenu({
      title: '가방', tabs: [{ id: 'all', label: '수확물' }, { id: 'seed', label: '씨앗·도구' }], tab: 'all',
      build: (tab) => {
        const inv = this.econ.inventory;
        if (tab === 'seed') {
          const items = Object.keys(CROPS).filter((k) => CROPS[k].unlockLevel <= this.level).map((k) => ({ icon: k, label: `${CROPS[k].name} 씨앗${k === this.seed ? ' (선택됨)' : ''}`, right: `× ${inv.seeds[k] || 0}`, onPick: () => { this.seed = k; } }));
          items.push({ icon: 'feed', label: '가축 사료', right: `× ${inv.feed}`, onPick: () => {} });
          for (const k of ['pet_treat', 'compost', 'weed']) if (inv.items[k]) items.push({ icon: iconOf(k), label: nameOf(k), right: `× ${inv.items[k]}`, onPick: () => {} });
          return { sub: '씨앗을 고르면 밭에 심을 씨앗이 바뀌어요', items };
        }
        const list = [...Object.entries(inv.crops), ...Object.entries(inv.products), ...Object.entries(inv.items).filter(([k]) => ITEMS[k]?.cat !== 'seed')].filter(([, v]) => v > 0);
        return { sub: `도감 ${Object.keys(this.book.entries).length}종 · 밭 Lv.${this.farm.level} · 목장 Lv.${this.ranch.level}`, empty: '아직 거둔 게 없어요', items: list.map(([k, v]) => ({ icon: iconOf(k), label: nameOf(k), right: `× ${v}`, onPick: () => {} })) };
      },
    });
  }
  questMenu() {
    this.ui.openMenu({
      title: `퀘스트 · Lv.${this.level}`,
      build: () => {
        const qs = this.quests.active().filter((q) => SUPPORTED.has(q.event));
        return { sub: `경험치 ${this.quests.xp} / ${this.quests.nextXp}`, empty: '모든 퀘스트를 끝냈어요!', items: qs.map((q) => ({ icon: q.complete ? 'star' : 'quest', label: `${q.title} — ${q.desc}`, right: q.complete ? '받기!' : `${q.count}/${q.goal}`, disabled: !q.complete, onPick: () => {
          const r = this.quests.claim(q.id); if (!r) return;
          this.econ.earn(r.reward.money); this.audio.play(r.levelUp ? 'levelup' : 'coin');
          this.ui.toast(`보상 ${r.reward.money}코인 · ${r.reward.xp}XP${r.levelUp ? ` · 레벨 ${r.level}!` : ''}`, 'coin');
          if (r.levelUp) { const nw = Object.keys(CROPS).filter((k) => CROPS[k].unlockLevel === r.level); if (nw.length) this.ui.toast(`새 작물 해금: ${nw.map(nameOf).join(', ')}`, nw[0]); }
        } })) };
      },
    });
  }
  cycleSeed() { const list = this.unlockedCrops(); this.seed = list[(list.indexOf(this.seed) + 1) % list.length]; this.audio.play('click'); }

  hudState() {
    const h = Math.floor(this.time * 24), m = Math.floor((this.time * 24 - h) * 6) * 10;
    const qs = this.quests.active().filter((q) => SUPPORTED.has(q.event));
    return {
      day: this.day, clock: `${h < 12 ? '오전' : '오후'} ${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')}`, night: this.night > 0.5, raining: this.raining, festival: !!this.econ.festival,
      money: this.econ.money, level: this.level, quest: qs[0], seed: { id: this.seed, name: CROPS[this.seed].name, n: this.econ.inventory.seeds[this.seed] || 0 },
      sound: !this.audio.enabled ? '✕' : this.audio.musicOn ? '♪' : '♩',
    };
  }

  /* ─────────── 렌더러에 넘기는 것 ─────────── */
  cameraFocus() { return { x: this.player.wx, y: this.player.wy - 16 }; }
  takeParticles() { const p = this.parts; this.parts = []; return p; }
  extraLights() {
    const L = [{ x: this.player.wx, y: this.player.wy - 16, r: 56, c: [150, 160, 210], k: 0.55 }];
    return L;
  }
  drawEntities() {
    const S = this.S, out = [];
    const p = this.player;
    const pImg = S.char('player', { scarf: 'scarf' }, p.dir, this.fish ? 0 : p.frame);
    out.push({ img: pImg, x: p.wx - 20, y: p.wy - 50 + (this.fish ? 0 : 0), sy: p.wy, shadow: 'm', sx: p.wx, shy: p.wy - 1, player: true, bubble: this.fish?.state === 'bite' ? '!' : null });
    // 반려견
    const d = this.dog;
    let dimg = S.shiba[d.dir][d.moving && d.t < 0.5 ? 1 : 0];
    let jump = 0;
    if (this.dogTrick) { this.dogTrick.t -= 1 / 60; const tt = this.dogTrick.t; if (this.dogTrick.id === 'spin') dimg = S.shiba[['down', 'right', 'up', 'left'][Math.floor(tt * 12) % 4]][0]; if (this.dogTrick.id === 'jump' || this.dogTrick.id === 'dance') jump = Math.abs(Math.sin(tt * 9)) * 8; if (tt <= 0) this.dogTrick = null; }
    out.push({ img: dimg, x: d.wx - 16, y: d.wy - 25 - Math.round(jump), sy: d.wy - 1, shadow: 's', sx: d.wx, shy: d.wy, bubble: this.dogBubble });
    // 주민
    for (const n of this.npcs) {
      const img = S.char(n.id, n.look, n.a.dir, n.a.frame);
      out.push({ img, x: n.a.wx - 20, y: n.a.wy - 50, sy: n.a.wy, shadow: 'm', sx: n.a.wx, shy: n.a.wy - 1, bubble: n.talking ? 'dots' : this.villagers.state[n.id].request && !this.villagers.state[n.id].request.done && this.villagers.state[n.id].request.day === this.day ? null : (this.villagers.state[n.id].lastTalk !== this.day && Math.floor(performance.now() / 1600) % 3 === 0 ? '?' : null) });
    }
    // 가축
    const sleeping = this.night > 0.7;
    for (const v of this.animals) {
      const a = v.sim, set = S.animal[a.type];
      const baby = this.ranch.isBaby(a);
      const pose = baby ? (v.a.moving && v.a.t < 0.5 ? 'baby1' : 'baby0') : v.eat > 0 || sleeping ? 'eat' : v.a.moving && v.a.t < 0.5 ? 'f1' : 'f0';
      const img = set[pose][v.face];
      const off = a.type === 'cow' ? [24, 35] : a.type === 'sheep' ? [20, 31] : [11, 20];
      const act = this.ranch.actionFor(a, this.day);
      const bub = sleeping ? 'zz' : a.product ? 'heart' : act.type === 'feed' ? 'dots' : null;
      out.push({ img, x: v.a.wx - off[0], y: v.a.wy - off[1], sy: v.a.wy, shadow: a.type === 'chicken' ? 's' : 'l', sx: v.a.wx, shy: v.a.wy - 1, bubble: bub });
    }
    return out;
  }
  /** 낚싯줄·찌 */
  drawOverlay(g, camX, camY, t) {
    if (!this.fish) return;
    const f = this.fish, p = this.player;
    const dip = f.dip > 0 ? (this.fish.state === 'bite' ? 3 : 1) : Math.round(Math.sin(t * 3) * 0.6);
    const bx = Math.round(f.bx - camX), by = Math.round(f.by - camY) + dip;
    const hx = Math.round(p.wx - camX + (p.dir === 'left' ? -14 : p.dir === 'right' ? 14 : 8)), hy = Math.round(p.wy - camY - 30);
    // 낚싯대 끝 → 찌 (처진 줄)
    g.fillStyle = 'rgba(240,240,255,0.7)';
    for (let k = 0; k <= 24; k++) { const u = k / 24; const x = hx + (bx - hx) * u, y = hy + (by - hy) * u + Math.sin(u * Math.PI) * 10; g.fillRect(Math.round(x), Math.round(y), 1, 1); }
    g.fillStyle = '#5a3a20'; g.fillRect(hx - 1, hy - 1, 2, 2);
    g.drawImage(this.S.bobber, bx - 4, by - 8);
    if (f.dip > 0 || Math.floor(t * 2) % 2) { g.fillStyle = 'rgba(220,245,255,0.8)'; g.fillRect(bx - 5, by + 1, 3, 1); g.fillRect(bx + 3, by + 1, 3, 1); }
  }
  drawGlow(g, gg, camX, camY, t, night) {
    // 밤: 반딧불이
    if (night < 0.5) return;
    for (let k = 0; k < 14; k++) {
      const x = ((k * 397) % (MW * T)) + Math.sin(t * 0.7 + k) * 30, y = ((k * 211) % (MH * T)) + Math.cos(t * 0.5 + k * 2) * 20;
      const sx = Math.round(x - camX), sy = Math.round(y - camY);
      if (sx < 0 || sy < 0 || sx > 4000 || sy > 4000) continue;
      if (Math.sin(t * 2 + k * 1.3) < 0) continue;
      g.fillStyle = '#e8ff90'; g.fillRect(sx, sy, 1, 1); gg.fillStyle = '#c8f050'; gg.fillRect(sx - 1, sy - 1, 3, 3);
    }
  }
}

/** 주민 인사말 (성격별) */
const LINES = {
  guide: ['안녕! 유니코 마을에 온 걸 환영해. 동쪽은 밭, 서쪽은 장터, 남쪽엔 목장과 연못이 있어.', '오늘도 좋은 하루! 밭에 다가가서 E 를 누르면 갈고, 심고, 물 주고, 거둘 수 있어.', '퀘스트를 끝내면 J 를 눌러 보상을 꼭 받아. 레벨이 오르면 새 씨앗이 열려!'],
  merchant: ['어서 와! 신선한 씨앗 있어요~ 오늘 시세도 확인해 봐!', '수확한 건 여기서 팔면 돼. 시세는 매일 바뀌니까 ▲ 표시를 잘 봐!', '7일마다 수확 축제야! 그날은 다 1.3배로 사 줄게.'],
  granny: ['아이고, 우리 강아지 왔구나. 밭은 물만 잘 줘도 별 셋이란다.', '잡초가 나면 바로 매 줘야 해. 그래야 작물이 잘 커.', '연못에서 낚시 해 봤니? 찌가 쑥 들어갈 때 당기는 거야.'],
  kid: ['헤헤, 나랑 놀자! 연못에 황금 잉어가 산대!', '밤에는 반딧불이가 반짝반짝해. 진짜 예뻐!', '나무를 흔들면 열매가 떨어져! 하루에 한 번만!'],
  researcher: ['연구에 따르면, 물 준 밭은 3배 빨리 자라요. 퇴비를 주면 더 빠르죠.', '토마토와 딸기는 다시 열리는 작물이에요. 한 번 심으면 여러 번!', '가끔 대왕 작물이 자라요. 퇴비를 주면 확률이 두 배!'],
  fisher: ['물고기는 기다림이야.'],
};
const TIPS = [
  'Q 키로 심을 씨앗을 바꿀 수 있어. 가진 씨앗 수는 왼쪽 아래에 보여.',
  '목장 동물은 사료를 먹으면 생산물을 만들어. 하트가 3개면 2개씩 줘!',
  '여물통에 사료를 채워 두면 배고픈 동물이 알아서 먹어.',
  '집에 들어가 쉬면 다음 날 아침이 돼. 밤에는 동물들이 자니까 깨우지 마.',
  '비 오는 날엔 밭에 물이 저절로 차. 낚시도 희귀한 물고기가 잘 와.',
  '콩이에게 간식을 주면 하트가 올라. 하트 3개부터는 땅을 파서 보물을 찾아 와!',
  '화면을 누르면 그곳까지 걸어가. 사람이나 밭을 누르면 가서 바로 상호작용해.',
  'Shift 를 누르고 있으면 달릴 수 있어.',
];
