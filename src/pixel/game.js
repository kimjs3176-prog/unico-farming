import { FarmSim } from '../game/sim/farm.js';
import { Economy } from '../game/sim/economy.js';
import { RanchSim } from '../game/sim/ranch.js';
import { Villagers, VILLAGERS } from '../game/sim/villagers.js';
import { Quests, QUESTS } from '../game/sim/quests.js';
import { PetSim, TRICKS } from '../game/sim/pet.js';
import { FishingSim } from '../game/sim/fishing.js';
import { Collection } from '../game/sim/collection.js';
import { RiceSim, RICE_STAGES, thresh } from '../game/sim/rice.js';
import { FieldSim, Vehicle, TRACTOR_TIME } from '../game/sim/tractor.js';
import { CROPS, PRODUCTS, FEED_PRICE, ANIMALS } from '../game/sim/crops.js';
import { ITEMS } from '../game/sim/items.js';
import { MW, MH, G, PLOTS, RANCH, SPAWN, NPCS, ANIMAL_START, PADDIES, FIELD, TRACTOR_HOME, paddyAt, buildMap } from './map.js';
import { nightness } from './render.js';
import { initRegions, regionSave, regionLoad, RegionMethods } from './regions.js';

const T = 32;
export const DAY_LENGTH = 360; // 3D 버전과 같은 하루 6분
const SAVE_KEY = 'unico-pixel-save-v1';
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const dirOf = (dx, dy) => (dx > 0 ? 'right' : dx < 0 ? 'left' : dy < 0 ? 'up' : 'down');
const nameOf = (k) => (CROPS[k] || PRODUCTS[k] || ITEMS[k])?.name || k;
const iconOf = (k) => (k === 'rice_seed' || k === 'paddy' || k.startsWith('rice_') ? 'rice' : CROPS[k] ? k : PRODUCTS[k] ? k : k === 'feed' ? 'feed' : k === 'pet_treat' ? 'treat' : k.startsWith('fish_') ? 'fish' : k === 'compost' ? 'compost' : k.startsWith('fruit_') ? 'tomato' : k.endsWith('_gold') ? 'star' : 'gift');
// 도트 버전에서 할 수 있는 퀘스트만 보여 줌
const SUPPORTED = new Set(['till', 'plant', 'water', 'harvest', 'sell', 'feed', 'collect', 'fish', 'shake', 'hearts', 'petfeed', 'weed', 'riceplant', 'thresh', 'tractor', 'plowbest', 'smartfarm', 'koatstamp', 'koatall', 'lookout', 'chest', 'lakefish', 'lakereq', 'fightwin', 'built', 'swim', 'dive', 'honey']);
const THRESH_TIME = 6, THRESH_BAND = [0.55, 0.9]; // 3D 판과 같은 탈곡 규칙
const M = 16; // 트랙터 시뮬레이션 1m = 16px (밭 한 칸 2m = 32px)

/** 칸 단위로 움직이는 캐릭터 (주민·가축) */
class Actor {
  constructor(x, y, dir = 'down') { this.x = x; this.y = y; this.fx = x; this.fy = y; this.t = 1; this.dir = dir; this.dur = 0.24; this.step = 0; }
  get moving() { return this.t < 1; }
  go(dx, dy, dur) { this.fx = this.x; this.fy = this.y; this.x += dx; this.y += dy; this.t = 0; this.dur = dur; this.step ^= 1; this.dir = dirOf(dx, dy); }
  update(dt) { if (this.t < 1) this.t = Math.min(1, this.t + dt / this.dur); }
  get wx() { return (this.fx + (this.x - this.fx) * this.t) * T + T / 2; }
  get wy() { return (this.fy + (this.y - this.fy) * this.t) * T + T - 4; }
  get frame() { return !this.moving ? 0 : this.t < 0.5 ? (this.step ? 1 : 3) : 0; }
}

/**
 * 자유 이동 캐릭터 (주인공·반려견): 픽셀 좌표(발 위치) + 속도. 칸 좌표(x, y)는 상호작용·충돌 판정용으로 계산
 */
export const MOVE = { WALK: 112, RUN: 184, ACCEL: 15, DECEL: 22, STRIDE: 15 };
class Walker {
  constructor(tx, ty, dir = 'down') { this.place(tx, ty); this.dir = dir; this.dist = 0; }
  place(tx, ty) { this.px = tx * T + T / 2; this.py = ty * T + T - 4; this.vx = 0; this.vy = 0; }
  get x() { return Math.floor(this.px / T); }
  get y() { return Math.floor((this.py - 6) / T); }
  get wx() { return this.px; }
  get wy() { return this.py; }
  get speed() { return Math.hypot(this.vx, this.vy); }
  get moving() { return this.speed > 12; }
  /** 걸음 수 = 실제로 간 거리 (빨리 걸으면 다리도 빨리) */
  get frame() { return this.moving ? [1, 0, 3, 0][Math.floor(this.dist / MOVE.STRIDE) % 4] : 0; }
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
    this.rice = new RiceSim(PADDIES.length);
    this.riceBatches = []; // 수확한 벼 묶음 { n, q } → 탈곡할 때 등급 결정
    this.threshing = null;
    this.field = new FieldSim(FIELD.cols, FIELD.rows, 2, FIELD.x * 2, FIELD.y * 2, FIELD.rocks);
    this.vehicle = new Vehicle((TRACTOR_HOME.x + 0.5) * 2, (TRACTOR_HOME.y + 0.6) * 2, Math.PI);
    this.tr = { driving: false, plowDown: true, counting: 0, streak: 0, maxStreak: 0, lastPlow: -9, engineT: 0, best: 0 };
    this.day = 1; this.time = 0.27; this.raining = false;
    this.seed = 'carrot';
    this.player = new Walker(SPAWN.x, SPAWN.y, 'down');
    this.dog = new Walker(SPAWN.x - 1, SPAWN.y, 'right');
    this.trail = []; // 주인공이 지나온 길 (반려견이 그대로 따라옴)
    this.cam = null;
    this.npcs = NPCS.map((n) => ({ ...n, a: new Actor(n.x, n.y, n.dir), home: [n.x, n.y], next: 2 + Math.random() * 4, bubble: null }));
    this.animals = this.ranch.animals.map((a, i) => ({ sim: a, a: new Actor(ANIMAL_START[i].x, ANIMAL_START[i].y, 'right'), face: Math.random() < 0.5 ? 0 : 1, next: Math.random() * 4, eat: 0 }));
    this.fruitTrees = this.map.objs.filter((o) => o.type === 'tree' && o.item);
    this.held = []; this.run = false; this.stuckT = 0; this.puffT = 0;
    this.path = null; this.pathAct = null;
    this.fish = null; // 낚시 상태
    this.parts = [];
    this.bubbleT = 0;
    this.dogBubble = null;
    this.saveT = 10;
    initRegions(this);
    this.load();
    this.refreshDayWeather(false);
    this.econ.newDay(this.day);
  }

  /* ─────────── 저장 ─────────── */
  save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        v: 1, day: this.day, time: this.time, seed: this.seed, raining: this.raining,
        farm: this.farm.toJSON(), econ: this.econ.toJSON(), ranch: this.ranch.toJSON(), villagers: this.villagers.toJSON(), quests: this.quests.toJSON(), rice: { ...this.rice.toJSON(), batches: this.riceBatches }, plowBest: this.tr.best, pet: this.pet.toJSON(), book: { entries: this.book.entries, rewarded: this.book.rewarded },
        region: regionSave(this), player: { x: this.player.x, y: this.player.y, dir: this.player.dir }, trees: this.fruitTrees.map((t) => t.lastShake || 0),
      }));
    } catch { /* 저장 불가 (사생활 보호 모드 등) */ }
  }
  load() {
    let d = null;
    try { d = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch { d = null; }
    if (!d) return;
    this.day = d.day || 1; this.time = d.time ?? 0.27; this.seed = d.seed || 'carrot'; this.raining = !!d.raining;
    this.farm.load(d.farm); this.econ.load(d.econ); this.ranch.load(d.ranch); this.villagers.load(d.villagers); this.quests.load(d.quests); this.pet.load(d.pet); regionLoad(this, d.region); this.rice.load(d.rice); this.riceBatches = d.rice?.batches || []; this.tr.best = d.plowBest || 0;
    if (d.book) { this.book.entries = d.book.entries || {}; this.book.rewarded = d.book.rewarded || {}; }
    if (d.player && !this.blocked(d.player.x, d.player.y)) { this.player.place(d.player.x, d.player.y); this.player.dir = d.player.dir || 'down'; this.dog.place(d.player.x, d.player.y); }
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
  blocked(x, y) { return this.solid(x, y) || !!this.entityAt(x, y) || (!this.tr?.driving && this.tractorTile(x, y)); }
  tractorTile(x, y) { const v = this.vehicle; return x === Math.floor(v.x * M / T) && y === Math.floor(v.z * M / T); }
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
    if (this.smartRun) { if (/^[1-4]$/.test(k)) this.smartAct(['heater', 'vent', 'mist', 'co2'][+k - 1]); return; }
    if (this.fight) { if (k === 'ok') this.reeling = true; return; }
    if (this.pano) return;
    if (this.threshing) { if (k === 'ok') this.mash(); return; }
    if (this.tr.driving) { if (k === 'ok' || k === 'back') this.dismount(false); else if (DIRS[k] && !this.held.includes(k)) this.held.push(k); return; }
    if (k === 'ok') return this.fish ? this.reel() : this.interact();
    if (k === 'back' && this.fish) return this.cancelFish();
    if (DIRS[k]) { if (!this.held.includes(k)) this.held.push(k); this.path = null; this.pathAct = null; }
  }
  release(k) { this.held = this.held.filter((h) => h !== k); if (k === 'ok') this.reeling = false; }
  tapTile(tx, ty) {
    if (this.threshing) return this.mash();
    if (this.fight) { this.reeling = true; return; }
    if (this.smartRun || this.pano) return;
    if (this.ui.busy || this.fish || this.tr.driving) return;
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
    this.regionTick(dt, busy);
    const frozen = busy || !!this.smartRun || !!this.fight || !!this.pano;
    if (this.tr.driving) this.drive(dt, busy); else this.movePlayer(dt, frozen);
    if (this.threshing && !busy) this.threshTick(dt);
    this.moveDog(dt);
    this.updateNpcs(dt, busy);
    this.updateAnimals(dt);
    for (const t of this.fruitTrees) if (t.shakeT > 0) t.shakeT -= dt;
    if (this.fish) this.fishTick(dt);
    this.saveT -= dt; if (this.saveT <= 0) { this.saveT = 10; this.save(); }
    this.ui.hint(this.smartRun || this.pano ? null : this.fight ? '꾹 눌러 감기 · 빨간 구간·몸부림이면 손 떼기' : this.threshing ? '연타! (Space 도 되고, 화면을 눌러도 돼요)' : this.tr.driving ? `내리기 · 방향키 = 가고 싶은 쪽 · Space 쟁기 ${this.tr.plowDown ? '내림' : '올림'}` : this.fish ? (this.fish.state === 'bite' ? '지금 당기기!' : '찌가 쑥 들어가면 당기기 (Esc: 그만)') : this.hintText());
    this.ui.hud(this.hudState());
    this.music?.setScene({ daylight: 1 - this.night, kind: this.raining ? 'rain' : 'clear', precip: this.raining ? 0.7 : 0, wind: 0.2 });
  }

  simTick(dt) {
    this.farm.tick(dt);
    this.rice.tick(dt, { raining: this.raining });
    if (this.raining) { this.rainT = (this.rainT || 0) - dt; if (this.rainT <= 0) { this.rainT = 8; this.farm.rain(); } }
    const ready = this.ranch.tick(dt, this.day);
    for (const a of ready) { const v = this.animals.find((x) => x.sim === a); if (v) v.eat = 0; }
    if (this.pet.tick(dt) === 'dig') { this.pet.dig(); this.dogBubble = '!'; this.audio.play('bark'); this.ui.toast(`${this.pet.name}가 땅을 파서 뭔가 찾았어요!`); }
  }

  /** 주인공 몸 상자 (발 주변 14×9px) 가 막힌 칸이나 주민·가축과 겹치는지 */
  boxBlocked(px, py) {
    const x0 = Math.floor((px - 7) / T), x1 = Math.floor((px + 6) / T), y0 = Math.floor((py - 8) / T), y1 = Math.floor((py + 1) / T);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (this.blocked(x, y) && !this.swimOK(x, y)) return true;
    return false;
  }
  /** 칸 (x,y) 위에 주인공 몸이 걸쳐 있나 (주민·가축이 그 칸으로 못 들어오게) */
  playerOn(x, y) {
    const p = this.player;
    return p.px + 6 >= x * T && p.px - 7 < (x + 1) * T && p.py + 1 >= y * T && p.py - 8 < (y + 1) * T;
  }

  movePlayer(dt, busy) {
    const p = this.player;
    // 입력 방향: 누른 키를 모두 합침 (대각선 가능)
    let ax = 0, ay = 0;
    if (!busy && !this.fish) {
      for (const k of this.held) { ax += DIRS[k][0]; ay += DIRS[k][1]; }
      if (!ax && !ay && this.path) {
        // 누른 곳으로 걸어가기: 칸 중심을 차례로 따라감
        if (this.path.length) {
          const [nx, ny] = this.path[0];
          const tx = nx * T + T / 2, ty = ny * T + T - 6;
          const dx = tx - p.px, dy = ty - p.py, d = Math.hypot(dx, dy);
          if (d < 5 && this.path.length > 1) this.path.shift();
          else if (d < 2) this.path.shift();
          else { ax = dx / d; ay = dy / d; if (d < 14 && this.path.length === 1) { ax *= d / 14; ay *= d / 14; } }
        } else {
          const act = this.pathAct; this.path = null; this.pathAct = null;
          if (act) { p.dir = dirOf(act[0] - p.x, act[1] - p.y); this.interact(); }
        }
      }
    }
    const len = Math.hypot(ax, ay);
    if (len > 1) { ax /= len; ay /= len; }
    // 바라보는 쪽: 크게 누른 축. 대각선이면 지금 보는 쪽을 유지 (방향이 파르르 떨지 않게)
    if (len > 0.05) {
      const cur = DIRS[p.dir];
      const keep = (cur[0] && Math.sign(cur[0]) === Math.sign(ax) && Math.abs(ax) > 0.3) || (cur[1] && Math.sign(cur[1]) === Math.sign(ay) && Math.abs(ay) > 0.3);
      if (!keep || Math.abs(Math.abs(ax) - Math.abs(ay)) > 0.35) p.dir = Math.abs(ax) >= Math.abs(ay) ? (ax > 0 ? 'right' : 'left') : (ay > 0 ? 'down' : 'up');
    }
    // 가속·감속: 목표 속도로 지수적으로 다가감 (급출발·급정지 없이, 그래도 손에 바로 붙게)
    let top = this.run ? MOVE.RUN : MOVE.WALK;
    const pi = paddyAt(p.x, p.y);
    const wading = pi >= 0 && this.rice.paddies[pi].water > 0.5;
    if (this.swimming) { top = MOVE.WALK * 0.55; if (p.speed > 20) { this.splashT = (this.splashT || 0) - dt; if (this.splashT <= 0) { this.splashT = 0.35; this.audio.play('splash', 0.12); } } }
    if (wading) { top *= 0.62; if (p.speed > 20) { this.splashT = (this.splashT || 0) - dt; if (this.splashT <= 0) { this.splashT = 0.2; for (let k = 0; k < 3; k++) this.parts.push({ kind: 'drop', x: p.wx + (Math.random() - 0.5) * 12, y: p.wy - 4, vx: (Math.random() - 0.5) * 30, vy: -40 - Math.random() * 20, grav: 260, life: 0.4, decay: 2.4 }); } } }
    const k = len > 0.05 ? MOVE.ACCEL : MOVE.DECEL;
    const a = 1 - Math.exp(-k * dt);
    p.vx += (ax * top - p.vx) * a; p.vy += (ay * top - p.vy) * a;
    if (Math.abs(p.vx) < 0.5 && !ax) p.vx = 0;
    if (Math.abs(p.vy) < 0.5 && !ay) p.vy = 0;
    // 이동: 축마다 나눠서 막히면 그 축만 멈춤 (벽을 따라 미끄러짐). 한 번에 3px 이하로 쪼개 터널링 방지
    const ox = p.px, oy = p.py;
    let mx = p.vx * dt, my = p.vy * dt;
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(mx), Math.abs(my)) / 3));
    mx /= n; my /= n;
    for (let i = 0; i < n; i++) {
      if (mx) { if (!this.boxBlocked(p.px + mx, p.py)) p.px += mx; else if (!this.nudge(p, 'y', mx, dt / n) ) { p.vx *= 0.2; mx = 0; } }
      if (my) { if (!this.boxBlocked(p.px, p.py + my)) p.py += my; else if (!this.nudge(p, 'x', my, dt / n)) { p.vy *= 0.2; my = 0; } }
    }
    const moved = Math.hypot(p.px - ox, p.py - oy);
    p.dist += moved;
    // 벽에 대고 밀면 톡 소리 (가끔)
    if (len > 0.5 && moved < 0.2 * top * dt) { this.stuckT += dt; if (this.stuckT > 0.18 && (!this.bumpT || this.bumpT < performance.now())) { this.audio.play('bump', 0.2); this.bumpT = performance.now() + 600; } }
    else this.stuckT = 0;
    if (this.stuckT > 0.6 && this.path) { this.path = null; this.pathAct = null; }
    // 달릴 때 흙먼지
    if (this.run && p.speed > MOVE.WALK) { this.puffT -= dt; if (this.puffT <= 0) { this.puffT = 0.12; this.puff(p.wx, p.wy, 1); } }
    // 지나온 길 기록 (2px 마다)
    const last = this.trail[this.trail.length - 1];
    if (!last || Math.hypot(last.x - p.px, last.y - p.py) >= 2) { this.trail.push({ x: p.px, y: p.py }); if (this.trail.length > 120) this.trail.shift(); }
  }

  /**
   * 모서리 비켜 가기: 앞이 막혔는데 옆으로 몇 px 만 비키면 지나갈 수 있으면 그쪽으로 살짝 밀어 줌
   * (칸 사이 좁은 틈·문 앞에서 걸리지 않게)
   */
  nudge(p, axis, push, dt) {
    const step = Math.min(10, MOVE.WALK * 0.9 * dt);
    for (let off = 2; off <= 12; off += 2) for (const sgn of [1, -1]) {
      const ox = axis === 'x' ? sgn * off : 0, oy = axis === 'y' ? sgn * off : 0;
      const fx = axis === 'y' ? push : 0, fy = axis === 'x' ? push : 0;
      if (!this.boxBlocked(p.px + ox, p.py + oy) && !this.boxBlocked(p.px + ox + fx, p.py + oy + fy)) {
        if (axis === 'x') p.px += sgn * Math.min(step, off); else p.py += sgn * Math.min(step, off);
        return true;
      }
    }
    return false;
  }

  /** 반려견: 주인공이 지나온 길을 약 30px 뒤에서 그대로 따라감 */
  moveDog(dt) {
    const d = this.dog, p = this.player;
    let target = null, acc = 0;
    for (let i = this.trail.length - 1; i > 0; i--) {
      acc += Math.hypot(this.trail[i].x - this.trail[i - 1].x, this.trail[i].y - this.trail[i - 1].y);
      if (acc >= 30) { target = this.trail[i - 1]; break; }
    }
    if (!target) target = this.trail[0] || { x: p.px - 24, y: p.py };
    // 콩이는 호수에 들어가지 않고 물가에서 기다림
    if (this.isWater(Math.floor(target.x / T), Math.floor((target.y - 6) / T))) {
      const land = [...this.trail].reverse().find((q) => !this.isWater(Math.floor(q.x / T), Math.floor((q.y - 6) / T)));
      target = land && Math.hypot(land.x - d.px, land.y - d.py) < 160 ? land : { x: d.px, y: d.py };
    }
    const dx = target.x - d.px, dy = target.y - d.py, dist = Math.hypot(dx, dy);
    if (dist > 160) { d.px = target.x; d.py = target.y; d.vx = d.vy = 0; return; }
    const slow = this.pet.hunger < 25 ? 0.8 : 1;
    const want = dist < 1 ? 0 : Math.min(MOVE.RUN * 1.15 * slow, dist * 7);
    const tvx = dist ? (dx / dist) * want : 0, tvy = dist ? (dy / dist) * want : 0;
    const a = 1 - Math.exp(-14 * dt);
    d.vx += (tvx - d.vx) * a; d.vy += (tvy - d.vy) * a;
    d.px += d.vx * dt; d.py += d.vy * dt;
    d.dist += d.speed * dt;
    if (d.speed > 14) d.dir = Math.abs(d.vx) > Math.abs(d.vy) ? (d.vx > 0 ? 'right' : 'left') : (d.vy > 0 ? 'down' : 'up');
    else if (Math.hypot(p.px - d.px, p.py - d.py) < 60 && !this.dogTrick) d.dir = Math.abs(p.px - d.px) > Math.abs(p.py - d.py) ? (p.px > d.px ? 'right' : 'left') : (p.py > d.py ? 'down' : 'up');
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
      if (Math.abs(nx - n.home[0]) > n.wander || Math.abs(ny - n.home[1]) > n.wander || this.blocked(nx, ny) || this.playerOn(nx, ny) || this.plotAt(nx, ny) >= 0) { n.a.dir = dirOf(dx, dy); continue; }
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
      if (nx <= RANCH.x0 || nx >= RANCH.x1 || ny <= RANCH.y0 || ny >= RANCH.y1 || this.blocked(nx, ny) || this.playerOn(nx, ny) || (nx === this.dog.x && ny === this.dog.y)) continue;
      v.a.go(dx, dy, v.sim.type === 'chicken' ? 0.3 : 0.6);
      if (dx) v.face = dx > 0 ? 0 : 1;
    }
  }

  newDay() {
    this.day++;
    const ev = this.econ.newDay(this.day);
    this.ranch.newDay(this.day);
    this.regionNewDay();
    for (const t of this.fruitTrees) t.shaken = false;
    this.refreshDayWeather(true);
    this.ui.toast(`${this.day}일차 아침이 밝았어요`, 'sun');
    if (this.econ.festival) this.ui.toast(this.econ.festival.name, 'star');
    else if (ev) this.ui.toast(ev.name, 'coin');
    this.save();
  }
  refreshDayWeather(roll) { if (roll) this.raining = Math.random() < 0.22; }

  /* ─────────── 상호작용 ─────────── */
  facing() { const p = this.player; const [dx, dy] = DIRS[p.dir]; return [Math.floor((p.px + dx * 20) / T), Math.floor((p.py - 10 + dy * 20) / T)]; }

  /** 칸에 무엇이 있는지 → { label, run } */
  targetInfo(x, y) {
    const p = this.player;
    const ent = this.entityAt(x, y);
    if (ent?.kind === 'npc' && ent.n.koat !== undefined) { const n = ent.n; return { label: n.koat === 'desk' ? '안내데스크 직원과 이야기' : `${n.koat >= 0 ? ['기술사업', '벤처창업', '종자사업', '스마트농업', '농기계검정', '농업환경분석'][n.koat] + '본부' : ''} 담당자와 이야기`, run: () => { n.a.dir = dirOf(this.player.x - n.a.x, this.player.y - n.a.y); this.koatTalk(n); } }; }
    if (ent?.kind === 'npc') { const n = ent.n; return { label: `${VILLAGERS[n.id].name}와 이야기`, run: () => this.talk(n) }; }
    if (ent?.kind === 'animal') { const v = ent.a, a = v.sim; const act = this.ranch.actionFor(a, this.day); return { label: `${a.name}(${ANIMALS[a.type].name}) ${'♥'.repeat(this.ranch.hearts(a))} · ${act.type === 'feed' ? `사료 주기 (사료 ${this.econ.inventory.feed})` : act.label}`, run: () => this.animalAct(v) }; }
    if (this.dog.x === x && this.dog.y === y) return { label: `${this.pet.name} 돌보기 ${'♥'.repeat(this.pet.hearts)}`, run: () => this.dogMenu() };
    if (this.tractorTile(x, y)) return { label: '트랙터 타기 (밭갈이 미니게임)', run: () => this.beginTractor() };
    const pd = paddyAt(x, y);
    if (pd >= 0) return this.paddyInfo(pd);
    const i = this.plotAt(x, y);
    if (i >= 0) { const a = this.farm.actionFor(i, (this.econ.inventory.seeds[this.seed] || 0) > 0, (this.econ.inventory.items.compost || 0) > 0); if (a?.type === 'plant') a.label = `${CROPS[this.seed].name} 씨앗 심기`; return a && { label: a.label, run: () => this.plotAct(i, a) }; }
    const o = this.objAt(x, y);
    if (o) {
      const rt = this.regionTarget(o);
      if (rt !== undefined) return rt;
      if (o.type === 'house') return { label: x === 25 && y === 13 ? '집에 들어가 쉬기' : '우리 집', run: () => this.house() };
      if (o.type === 'mailbox') return { label: '우편함 보기', run: () => this.mailbox() };
      if (o.type === 'sign') return { label: '팻말 읽기', run: () => this.ui.say('', o.text === '유니코 밭' ? '유니코 밭 — 갈고, 심고, 물 주고, 거두기! (Q 로 씨앗 바꾸기)' : '유니코 목장 — 사료를 주면 생산물이 나와요. 여물통에 사료를 채워 두면 알아서 먹어요.') };
      if (o.type === 'trough') return { label: `여물통 (${this.ranch.trough}/20) 사료 채우기`, run: () => this.fillTrough() };
      if (o.type === 'barn') return { label: '축사 살펴보기', run: () => this.barnInfo() };
      if (o.type === 'well') return { label: '우물', run: () => this.ui.say('', '시원한 우물물이 찰랑거려요. 물뿌리개는 언제나 가득!') };
      if (o.type === 'stall') { const m = this.npcs.find((n) => n.id === 'merchant'); return { label: '장터 열기', run: () => this.shop(m) }; }
      if (o.type === 'tree' && o.item) return { label: o.shaken ? '오늘은 열매를 다 땄어요' : `${nameOf(o.item)} 나무 흔들기`, run: () => this.shake(o) };
      if (o.type === 'thresher') { const n = this.econ.count('paddy'); return { label: n ? `탈곡하기 (벼 ${n}단)` : '탈곡기 (벼를 베어 오세요)', run: () => (n ? this.beginThresh() : this.ui.say('', '논에서 벼를 베어 오면 여기서 쌀로 만들 수 있어요. 탈곡할 때 드럼 속도를 초록 구간에 맞추세요!')) }; }
      if (o.type === 'crate') return { label: '나무 상자', run: () => this.ui.say('', '장터에서 쓰는 빈 상자예요.') };
    }
    if (this.isWater(x, y)) return { label: '낚싯대 던지기', run: () => this.cast(x, y) };
    void p;
    return null;
  }
  /** 앞 칸에 할 게 없으면 서 있는 논 (논 안에 들어가 일하기) */
  target() { if (this.swimming) return this.diving ? null : this.swimTarget(); const [x, y] = this.facing(); const t = this.targetInfo(x, y); if (t) return t; const pd = paddyAt(this.player.x, this.player.y); return pd >= 0 ? this.paddyInfo(pd) : null; }
  hintText() { if (this.player.speed > 70) return null; return this.target()?.label || null; }
  interact() { const t = this.target(); if (t) t.run(); }

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
    this.player.place(25, 14); this.player.dir = 'down';
    this.dog.place(26, 14); this.trail = [];
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
    const opts = n.shop === 'fish' ? ['낚시 가게', '오늘의 부탁', '선물하기', '안녕!'] : n.shop ? ['장터 열기', '오늘의 부탁', '선물하기', '안녕!'] : ['이야기하기', '오늘의 부탁', '선물하기', '안녕!'];
    let c = await this.ui.say(`${V.name} ${'♥'.repeat(hearts)}`, greet, opts);
    while (c >= 0 && c < 3) {
      if (c === 0) { if (n.shop === 'fish') { n.talking = false; return this.fishShop(); } if (n.shop) { n.talking = false; return this.shop(n); } await this.ui.say(V.name, TIPS[(this.day * 3 + hearts + Math.floor(Math.random() * 3)) % TIPS.length]); }
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

  /* ── 논농사 ── */
  paddyInfo(i) {
    const acts = this.rice.actionsFor(i, this.econ.count('rice_seed') > 0);
    const a = acts[0];
    if (!a) return null;
    const p = this.rice.paddies[i];
    const lab = a.type === 'plant' ? `모내기 (볍씨 ${this.econ.count('rice_seed')})` : a.label;
    const st = p.state === 'growing' ? ` · ${RICE_STAGES[p.stage].name} ${Math.floor(p.progress * 100)}%` : '';
    return { label: lab + (a.type === 'check' ? '' : st), run: () => this.riceAct(i, a) };
  }
  riceAct(i, a) {
    const P = PADDIES[i], cx = P.x * T + 32, cy = P.y * T + 32;
    const R = this.rice;
    switch (a.type) {
      case 'till': R.till(i); this.audio.play('dig'); this.puff(cx, cy, 8); break;
      case 'flood': R.flood(i); this.audio.play('splash'); this.ui.toast('논에 물을 댔어요. 이제 모를 심어요', 'rice'); break;
      case 'need_seed': this.ui.toast('볍씨가 없어요. 장터에서 사 오세요', 'rice'); this.audio.play('bump', 0.3); break;
      case 'plant': if (!this.econ.useItem('rice_seed')) return; R.plant(i); this.audio.play('plant'); this.report('riceplant'); this.ui.toast('모내기 완료! 단계마다 알맞은 물 높이를 맞춰 주세요', 'rice'); break;
      case 'water': R.water(i); this.audio.play('water'); this.splash(cx, cy); break;
      case 'drain': R.drain(i); this.audio.play('splash', 0.5); this.ui.toast(`물을 뺐어요 (${R.paddies[i].water.toFixed(1)}cm)`, 'rain'); break;
      case 'weed': R.weed(i); this.econ.addItem('weed'); this.audio.play('dig'); this.report('weed'); break;
      case 'harvest': {
        const r = R.harvest(i); if (!r) return;
        this.riceBatches.push({ n: r.amount, q: r.quality });
        this.econ.addItem('paddy', r.amount);
        this.popIcon('rice', cx, cy - 10, Math.min(4, r.amount)); this.audio.play('harvest');
        this.ui.toast(`벼 ${r.amount}단! 예상 등급 ${'★'.repeat(RiceSim.grade(r.quality))} · 탈곡기에서 쌀로`, 'rice');
        break;
      }
      default: this.ui.toast(a.label, 'rice');
    }
  }
  splash(x, y) { for (let k = 0; k < 10; k++) this.parts.push({ kind: 'drop', x: x + (Math.random() - 0.5) * 50, y: y - 8, vx: 0, vy: 50 + Math.random() * 30, life: 0.45, decay: 1.8 }); }

  /* ── 탈곡: 연타로 드럼 속도를 초록 구간에 유지 (너무 빠르면 과열로 잠깐 멈춤) ── */
  async beginThresh() {
    const c = await this.ui.say('탈곡', `${THRESH_TIME}초 동안 E·Space 를 연타해서 드럼을 돌려요. 게이지를 초록 구간에 오래 둘수록 낟알이 잘 떨어져요. 끝까지 차면 과열!`, ['시작!', '다음에']);
    if (c !== 0) return;
    this.player.vx = this.player.vy = 0;
    this.threshing = { t: -1.2, gauge: 0, inBand: 0, jam: 0, grain: 0 }; // 앞 1.2초는 준비
    this.audio.play('click');
  }
  mash() {
    const th = this.threshing; if (!th || th.t < 0 || th.jam > 0) return;
    th.gauge = Math.min(1, th.gauge + 0.1); this.audio.play('click', 0.3);
    if (th.gauge >= 0.98) { th.jam = 0.8; th.gauge = 0.3; this.audio.play('bump', 0.7); }
  }
  threshTick(dt) {
    const th = this.threshing;
    th.t += dt;
    const ok = th.gauge >= THRESH_BAND[0] && th.gauge <= THRESH_BAND[1] && th.jam <= 0;
    if (th.t > 0) {
      if (th.jam > 0) th.jam -= dt;
      th.gauge = Math.max(0, th.gauge - dt * 0.45);
      if (ok) { th.inBand += dt; th.grain -= dt; if (th.grain <= 0) { th.grain = 0.1; for (let k = 0; k < 3; k++) this.parts.push({ kind: 'grain', x: 18 * T + 30 + Math.random() * 30, y: 5 * T + 10, vx: (Math.random() - 0.5) * 60, vy: -60 - Math.random() * 40, grav: 300, life: 0.6, decay: 1.6 }); } }
    }
    this.ui.meter({ title: '탈곡', time: th.t < 0 ? THRESH_TIME : THRESH_TIME - th.t, gauge: th.gauge, band: THRESH_BAND, ok, hot: th.jam > 0, text: th.t < 0 ? '준비…' : th.jam > 0 ? '과열! 잠깐 멈췄어요' : ok ? '좋아요! 그 속도 유지!' : th.gauge > THRESH_BAND[1] ? '너무 빨라요! 살살' : '더 빨리 연타!' });
    if (th.t >= THRESH_TIME) this.finishThresh();
  }
  finishThresh() {
    const th = this.threshing; this.threshing = null; this.ui.meter(null);
    const eff = th.inBand / THRESH_TIME / 0.75;
    const made = {};
    const batches = this.riceBatches.length ? this.riceBatches : [{ n: this.econ.count('paddy'), q: 50 }];
    for (const b of batches) { const gr = RiceSim.grade(b.q), n = thresh(b.n, eff); made[gr] = (made[gr] || 0) + n; this.econ.addItem(`rice_${gr}`, n); }
    this.econ.take('paddy', this.econ.count('paddy'));
    this.riceBatches = [];
    this.report('thresh'); this.audio.play('win');
    const score = Math.round(Math.min(1, eff) * 100), stars = score >= 90 ? 3 : score >= 70 ? 2 : score >= 40 ? 1 : 0;
    this.ui.say('탈곡 완료', `${'★'.repeat(stars)}${'☆'.repeat(3 - stars)} 효율 ${score}% · ${Object.entries(made).map(([g, n]) => `${ITEMS['rice_' + g].name} × ${n}`).join(', ')} · 논농사 숙련도 Lv.${this.rice.skillLevel}`);
  }

  /* ── 트랙터 밭갈이: 3D 판과 같은 차량 모델(Vehicle)과 밭 규칙(FieldSim) ── */
  async beginTractor() {
    const c = await this.ui.say('트랙터 밭갈이', `${TRACTOR_TIME}초 안에 쟁기로 밭 칸을 최대한 많이 갈아요. 방향키(WASD)를 누른 쪽으로 트랙터가 알아서 돌아가요. Space 쟁기. 쉬지 않고 이어 갈면 연속 보너스, 바위에 부딪히면 -3초! (최고 ${this.tr.best}칸)`, ['출발!', '다음에']);
    if (c !== 0) return;
    const tr = this.tr;
    Object.assign(tr, { backT: 0, driving: true, plowDown: true, counting: 3, streak: 0, maxStreak: 0, lastPlow: -9 });
    this.held = []; this.path = null;
    this.field.start(); this.field.running = false;
    this.audio.play('engine');
  }
  togglePlow() { if (!this.tr.driving) return; this.tr.plowDown = !this.tr.plowDown; this.audio.play('click'); }
  drive(dt, busy) {
    const v = this.vehicle, tr = this.tr, F = this.field;
    let ax = 0, ay = 0;
    if (!busy && tr.counting <= 0) for (const k of this.held) { ax += DIRS[k][0]; ay += DIRS[k][1]; }
    if (tr.counting > 0) { const before = Math.ceil(tr.counting); tr.counting -= dt; if (Math.ceil(tr.counting) !== before) this.audio.play(tr.counting <= 0 ? 'win' : 'pop'); if (tr.counting <= 0) F.running = true; }
    const px = v.x, pz = v.z;
    // 화면 기준 조작: 누른 방향(↑ 화면 위, ← 화면 왼쪽…)으로 트랙터가 알아서 핸들을 꺾어 향함
    let throttle = 0, steer = 0;
    const len = Math.hypot(ax, ay);
    if (len > 0) {
      const want = Math.atan2(ax, ay); // 앞 방향 (sin h, cos h) 이 (ax, ay) 가 되는 각
      let diff = want - v.heading;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff)); // -π..π
      if (tr.backT > 0) {
        // 벽에 막혔으면 잠깐 후진하면서 가려는 쪽으로 돎
        throttle = -0.7; steer = Math.max(-1, Math.min(1, diff * 2));
      } else {
        // 많이 돌아야 하면 천천히 (작은 반경으로 돌기)
        throttle = Math.abs(diff) > 1.7 ? 0.35 : Math.abs(diff) > 0.8 ? 0.6 : 1;
        steer = Math.max(-1, Math.min(1, -diff * 2.2));
      }
    }
    if (tr.backT > 0) tr.backT -= dt;
    v.step(dt, throttle, steer);
    // 회전 보조: 움직이는 동안 가려는 쪽으로 더 빨리 돎 (화면 기준 조작이 답답하지 않게)
    if (len > 0 && Math.abs(v.speed) > 0.2) {
      let diff = Math.atan2(ax, ay) - v.heading; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      const rate = 1.9 * Math.min(1, Math.abs(v.speed) / 2) * dt;
      v.heading += Math.sign(diff) * Math.min(Math.abs(diff), rate);
    }
    // 충돌: 차체 중심과 앞 끝이 막힌 칸이면 되돌리고 감속
    const hit = (x, z) => { const tx = Math.floor(x * M / T), ty = Math.floor(z * M / T); return this.solid(tx, ty) || !!this.entityAt(tx, ty) || this.isWater(tx, ty); };
    const fx = v.x + Math.sin(v.heading) * 1.4, fz = v.z + Math.cos(v.heading) * 1.4, bx = v.x - Math.sin(v.heading) * 1.4, bz = v.z - Math.cos(v.heading) * 1.4;
    if (hit(v.x, v.z) || hit(v.speed >= 0 ? fx : bx, v.speed >= 0 ? fz : bz)) {
      const rock = F.isRock(fx, fz) && Math.abs(v.speed) > 1;
      v.x = px; v.z = pz; v.speed *= rock ? -0.2 : -0.1; v.pedal = 0;
      if (len > 0 && !(tr.backT > 0)) { tr.backT = 0.9; v.pedal = -0.6; } // 막히면 바로 후진
      if (rock) { F.hits++; F.time = Math.max(0, F.time - 3); this.ui.toast('바위에 부딪혔어요! -3초', 'star'); this.audio.play('bump'); }
      else if (!this.bumpT || this.bumpT < performance.now()) { this.audio.play('bump', 0.4); this.bumpT = performance.now() + 500; }
    }
    // 쟁기 = 트랙터 뒤 2.3m
    const plx = v.x - Math.sin(v.heading) * 2.3, plz = v.z - Math.cos(v.heading) * 2.3;
    if (tr.plowDown && Math.abs(v.speed) > 0.5 && F.running) {
      const i = F.plowAt(plx, plz);
      if (i >= 0) {
        this.audio.play('dig', 0.3); this.puff(plx * M, plz * M, 4);
        const now = TRACTOR_TIME - F.time;
        tr.streak = now - tr.lastPlow < 1.2 ? tr.streak + 1 : 1; tr.lastPlow = now;
        tr.maxStreak = Math.max(tr.maxStreak, tr.streak);
        if (tr.streak % 10 === 0) { this.audio.play('pop'); this.ui.toast(`연속 ${tr.streak}칸!`, 'star'); }
      }
    }
    if (tr.plowDown && Math.abs(v.speed) > 0.5 && Math.random() < dt * 20) this.puff(plx * M, plz * M, 1);
    tr.engineT -= dt; if (tr.engineT <= 0) { tr.engineT = 0.9 - Math.min(0.5, Math.abs(v.speed) * 0.08); this.audio.play('engine', 0.35 + Math.abs(v.speed) * 0.06); }
    // 주인공은 운전석에 (카메라도 따라감)
    const p = this.player;
    p.px = v.x * M - Math.sin(v.heading) * 7; p.py = v.z * M - Math.cos(v.heading) * 7 + 6; p.vx = Math.sin(v.heading) * v.speed * M; p.vy = Math.cos(v.heading) * v.speed * M;
    p.dir = Math.abs(Math.sin(v.heading)) > Math.abs(Math.cos(v.heading)) ? (Math.sin(v.heading) > 0 ? 'right' : 'left') : (Math.cos(v.heading) > 0 ? 'down' : 'up');
    const last = this.trail[this.trail.length - 1];
    if (!last || Math.hypot(last.x - p.px, last.y - p.py) >= 2) { this.trail.push({ x: p.px, y: p.py + 10 }); if (this.trail.length > 120) this.trail.shift(); }
    if (F.running && TRACTOR_TIME - F.time - tr.lastPlow > 1.2) tr.streak = 0;
    this.ui.meter({ title: '트랙터 밭갈이', time: tr.counting > 0 ? TRACTOR_TIME : F.time, text: tr.counting > 0 ? `${Math.ceil(tr.counting)}…` : `간 칸 ${F.score} / ${F.cols * F.rows - F.rocks.size}${tr.streak > 1 ? ` · 연속 ${tr.streak}` : ''} · 쟁기 ${tr.plowDown ? '내림' : '올림'}` });
    if (F.tick(dt)) this.dismount(true);
  }
  dismount(finished) {
    const tr = this.tr, F = this.field, v = this.vehicle;
    tr.driving = false; F.running = false; this.ui.meter(null); this.held = [];
    v.speed = 0; v.pedal = 0;
    // 옆 빈 칸에 내림
    const tx = Math.floor(v.x * M / T), ty = Math.floor(v.z * M / T);
    const spot = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1], [2, 0], [-2, 0]].map(([dx, dy]) => [tx + dx, ty + dy]).find(([x, y]) => !this.blocked(x, y) && !this.isWater(x, y));
    if (spot) this.player.place(spot[0], spot[1]);
    this.player.vx = this.player.vy = 0; this.trail = []; this.dog.place(this.player.x, this.player.y);
    if (!finished) return;
    const stars = F.score >= 45 ? 3 : F.score >= 30 ? 2 : F.score >= 15 ? 1 : 0;
    const streakBonus = tr.maxStreak * 3, starBonus = [0, 0, 30, 80][stars];
    const reward = F.reward() + streakBonus + starBonus;
    this.econ.earn(reward); this.report('tractor'); this.report('plowbest', F.score);
    const rec = F.score > tr.best; if (rec) tr.best = F.score;
    this.audio.play('win');
    this.ui.say('밭갈이 결과', `${'★'.repeat(stars)}${'☆'.repeat(3 - stars)} ${F.score}칸${rec ? ' (신기록!)' : ''} · 최대 연속 ${tr.maxStreak}칸 · 바위 ${F.hits}회 · 보상 ${reward}코인`);
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
          items.push({ icon: 'rice', label: '볍씨 (논에 모내기)', right: `${ITEMS.rice_seed.price} · 보유 ${e.inventory.items.rice_seed || 0}`, disabled: e.money < ITEMS.rice_seed.price, onPick: () => e.buyItem('rice_seed') && this.audio.play('coin') });
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
    const lake = this.isLakeTile(bx, by);
    this.fishing.cast(this.castOpts(lake));
    p.vx = p.vy = 0; this.path = null;
    this.fish = { lake, state: 'waiting', bx: bx * T + 16, by: by * T + 18, dip: 0, t: 0 };
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
      if (this.landFish(r, f.lake)) { this.fishFight = f; return; }
      this.catchFish(r.fish, r.size, f.lake);
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
          for (const k of ['rice_seed', 'pet_treat', 'compost', 'weed']) if (inv.items[k]) items.push({ icon: iconOf(k), label: nameOf(k), right: `× ${inv.items[k]}`, onPick: () => {} });
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
  cameraFocus(dt = 1 / 60) {
    const p = this.player;
    let tx = p.wx + p.vx * 0.28, ty = p.wy - 16 + p.vy * 0.22;
    if (this.pano) { const f = this.panoFocus(); tx = f.x; ty = f.y; }
    if (!this.cam || Math.hypot(tx - this.cam.x, ty - this.cam.y) > 400) this.cam = { x: tx, y: ty };
    const a = 1 - Math.exp(-6 * dt);
    this.cam.x += (tx - this.cam.x) * a; this.cam.y += (ty - this.cam.y) * a;
    return this.cam;
  }
  takeParticles() { const p = this.parts; this.parts = []; return p; }
  extraLights() {
    const L = [{ x: this.player.wx, y: this.player.wy - 16, r: 56, c: [150, 160, 210], k: 0.55 }];
    return L;
  }
  drawEntities() {
    const S = this.S, out = [];
    const p = this.player;
    const v = this.vehicle, vx = v.x * M, vy = v.z * M;
    const ai = ((Math.round((v.heading / (Math.PI * 2)) * 32) % 32) + 32) % 32;
    const timg = S.tractor(this.tr.plowDown || !this.tr.driving, ai);
    const shake = this.tr.driving && Math.abs(v.speed) > 0.3 ? Math.round(Math.sin(performance.now() / 45)) * 0.5 : 0;
    out.push({ img: timg, x: vx - S.tractorAnchor.x, y: vy - S.tractorAnchor.y + shake, sy: vy + 14, shadow: 'xl', sx: vx, shy: vy + 8, tall: true });
    if (this.tr.driving) {
      const hx = vx - Math.sin(v.heading) * 12, hy = vy - Math.cos(v.heading) * 12 - 17;
      out.push({ img: S.char('player', { scarf: 'scarf' }, p.dir, 0), x: hx - 20, y: hy - 26 + shake, sh: 34, sy: vy + 15, player: true });
      return out.concat(this.drawOthers());
    }
    if (this.swimming) {
      // 헤엄: 상반신만 물 위로, 개헤엄 하듯 좌우로 까딱 · 잠수 중에는 안 보임
      if (!this.diving) {
        const bob = Math.round(Math.sin(this.swimT * 5) * 1), sway = p.speed > 10 ? (Math.floor(this.swimT * 6) % 2 ? 1 : 3) : 0;
        out.push({ img: S.char('player', { scarf: 'scarf' }, p.dir, sway), x: p.wx - 20, y: p.wy - 50 + 16 + bob, sh: 34, sy: p.wy, player: true });
      }
      return out.concat(this.drawOthers());
    }
    const pImg = S.char('player', { scarf: 'scarf' }, p.dir, this.fish ? 0 : p.frame);
    out.push({ img: pImg, x: p.wx - 20, y: p.wy - 50 + (this.fish ? 0 : 0), sy: p.wy, shadow: 'm', sx: p.wx, shy: p.wy - 1, player: true, bubble: this.fish?.state === 'bite' ? '!' : null });
    return out.concat(this.drawOthers());
  }
  drawOthers() {
    const S = this.S, out = [];
    // 스마트팜 드론 (비닐하우스 위를 천천히 돎)
    { const t = performance.now() / 1000, cx = (59 + 4) * T, cy = (17 - 2) * T; const dx = cx + Math.cos(t * 0.4) * 150, dy = cy + Math.sin(t * 0.4) * 60; out.push({ img: S.drone[Math.floor(t * 20) % 2], x: dx - 15, y: dy - 60 + Math.sin(t * 2) * 3, sy: dy + 200, shadow: 's', sx: dx, shy: dy + 10 }); }
    // 반려견
    const d = this.dog;
    let dimg = S.shiba[d.dir][d.moving ? Math.floor(d.dist / 11) % 2 : 0];
    let jump = 0;
    if (this.dogTrick) { this.dogTrick.t -= 1 / 60; const tt = this.dogTrick.t; if (this.dogTrick.id === 'spin') dimg = S.shiba[['down', 'right', 'up', 'left'][Math.floor(tt * 12) % 4]][0]; if (this.dogTrick.id === 'jump' || this.dogTrick.id === 'dance') jump = Math.abs(Math.sin(tt * 9)) * 8; if (tt <= 0) this.dogTrick = null; }
    out.push({ img: dimg, x: d.wx - 16, y: d.wy - 25 - Math.round(jump), sy: d.wy - 1, shadow: 's', sx: d.wx, shy: d.wy, bubble: this.dogBubble });
    // 주민
    for (const n of this.npcs) {
      const img = S.char(n.id, n.look, n.a.dir, n.a.frame);
      out.push({ img, x: n.a.wx - 20, y: n.a.wy - 50, sy: n.a.wy, shadow: 'm', sx: n.a.wx, shy: n.a.wy - 1, bubble: n.talking ? 'dots' : !this.villagers.state[n.id] ? null : this.villagers.state[n.id].request && !this.villagers.state[n.id].request.done && this.villagers.state[n.id].request.day === this.day ? null : (this.villagers.state[n.id].lastTalk !== this.day && Math.floor(performance.now() / 1600) % 3 === 0 ? '?' : null) });
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
    this.drawWater(g, camX, camY, t);
    const f = this.fish || (this.fight && this.fishFight), p = this.player;
    if (!f) return;
    // 힘겨루기 중에는 찌가 물속으로 끌려 들어갔다 나왔다 함
    const dip = this.fight ? (this.fight.sim.surging ? 4 : 2) + Math.round(Math.sin(t * 20)) : f.dip > 0 ? (f.state === 'bite' ? 3 : 1) : Math.round(Math.sin(t * 3) * 0.6);
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

Object.assign(Game.prototype, RegionMethods);
