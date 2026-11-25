import { FreeField, Vehicle, RIDE_SPECS } from '../game/sim/tractor.js';
import { MW, MH, G, FIELD, TRACTOR_HOME, SPAWN, OUT } from './map.js';

/**
 * 마을 탈것 (3D 판 ride_view 와 같은 규칙): 트랙터 · 자전거 · 농장 카트
 *  - 어디서나 앞에서 E 로 타고, E·Esc 로 내림 → 내린 자리에 그대로 세워 둠
 *  - 방향키는 화면 기준: 누른 쪽으로 핸들을 알아서 꺾음 (자전거는 기울여 돌고, 카트는 트랙터보다 빠르고 잘 돎)
 *  - 트랙터 쟁기(Space): 시간 제한 없이 밭 칸을 지나가면 갈리고 칸마다 코인, 다 갈면 보너스, 갈린 칸은 몇 분 뒤 풀밭으로(FreeField)
 *  - 자전거 Space = 따르릉
 */
const T = 32, M = 16; // 1m = 16px (2m = 1칸)
export const PLOW_COIN = 2, PLOW_ALL_BONUS = 60;
const RIDE_INFO = {
  tractor: { name: '트랙터', plow: true },
  bike: { name: '자전거', bell: true },
  cart: { name: '농장 카트' },
};

/** 원하는 칸 근처의 빈 칸 */
function freeNear(game, x, y) {
  for (let r = 0; r < 6; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const tx = x + dx, ty = y + dy;
    if (tx < 1 || ty < 1 || tx >= MW - 1 || ty >= OUT) continue;
    const gnd = game.map.ground[ty * MW + tx];
    if (game.solid(tx, ty) || gnd === G.water || gnd === G.soil || gnd === G.paddy) continue;
    return [tx, ty];
  }
  return [x, y];
}

export function initRides(game) {
  game.field = new FreeField(FIELD.cols, FIELD.rows, 2, FIELD.x * 2, FIELD.y * 2, FIELD.rocks);
  const at = (x, y, h, kind) => { const [tx, ty] = freeNear(game, x, y); return { kind, ...RIDE_INFO[kind], v: new Vehicle((tx + 0.5) * 2, (ty + 0.6) * 2, h, RIDE_SPECS[kind]) }; };
  game.rides = [
    at(TRACTOR_HOME.x, TRACTOR_HOME.y, Math.PI, 'tractor'),
    at(SPAWN.x + 3, SPAWN.y - 4, Math.PI / 2, 'bike'),
    at(15, 21, Math.PI / 2, 'cart'),
  ];
  game.tr = { ride: null, plowDown: true, runPlowed: 0, engineT: 0, backT: 0, clock: 0, regrowT: 0 };
}
export const rideSave = (game) => ({ rides: game.rides.map((r) => ({ kind: r.kind, x: +r.v.x.toFixed(2), z: +r.v.z.toFixed(2), h: +r.v.heading.toFixed(3) })), clock: Math.round(game.tr.clock), plowed: Array.from(game.field.plowedAt), total: game.field.total });
export function rideLoad(game, d) {
  if (!d) return;
  for (const s of d.rides || []) {
    const r = game.rides.find((q) => q.kind === s.kind);
    const tx = Math.floor(s.x / 2), ty = Math.floor(s.z / 2);
    if (r && Number.isFinite(s.x) && Number.isFinite(s.z) && tx > 0 && ty > 0 && tx < MW && ty < OUT && !game.solid(tx, ty)) Object.assign(r.v, { x: s.x, z: s.z, heading: s.h || 0 });
  }
  game.tr.clock = d.clock || 0;
  if (Array.isArray(d.plowed) && d.plowed.length === game.field.plowedAt.length) game.field.plowedAt.set(d.plowed.map((t) => (Number.isFinite(t) ? t : -1)));
  game.field.total = d.total || 0;
}

export const RideMethods = {
  /** 칸 (x,y) 에 세워 둔 탈것 */
  rideAt(x, y) { return this.rides.find((r) => r !== this.tr.ride && Math.floor(r.v.x * M / T) === x && Math.floor(r.v.z * M / T) === y) || null; },
  rideTarget(x, y) {
    const r = this.rideAt(x, y);
    return r && { label: `${r.name} 타기${r.plow ? ' (쟁기로 밭갈이)' : ''}`, run: () => this.mount(r) };
  },
  mount(r) {
    if (this.indoors || this.swimming) return;
    Object.assign(this.tr, { ride: r, backT: 0, runPlowed: 0, plowDown: true });
    this.tr.driving = true;
    this.held = []; this.path = null; this.pathAct = null;
    r.v.speed = 0; r.v.pedal = 0;
    this.audio.play(r.kind === 'bike' ? 'pop' : 'engine');
    this.report('ride');
    this.ui.toast(`${r.name}에 탔어요! 방향키로 가고, E 로 내려요${r.plow ? ' · Space 쟁기' : r.bell ? ' · Space 따르릉' : ''}`, 'star');
  },
  togglePlow() {
    const r = this.tr.ride; if (!r) return;
    if (r.plow) { this.tr.plowDown = !this.tr.plowDown; this.audio.play('click'); }
    else if (r.bell) { this.audio.play('coin', 0.5); this.bellT = 0.5; }
  },
  rideHint() {
    const r = this.tr.ride, F = this.field;
    if (r.plow) return `내리기 · Space 쟁기 ${this.tr.plowDown ? '내림' : '올림'} · 갈린 밭 ${F.plowedCount}/${F.open}`;
    if (r.bell) return `내리기 · Space 따르릉 · ${Math.abs(r.v.speed) > 0.3 ? (r.v.pushing ? '페달 밟는 중' : '쌩~ 굴러가는 중') : '방향키로 출발'}`;
    return `내리기 · ${r.name} 운전 중`;
  },
  /** 탈것이 아닐 때도: 갈린 칸 재생 (시계는 노는 시간만) */
  rideTick(dt, busy) {
    if (busy) return;
    const tr = this.tr; tr.clock += dt; tr.regrowT -= dt;
    if (tr.regrowT <= 0) { tr.regrowT = 2; this.field.regrow(tr.clock); }
    if (this.bellT > 0) this.bellT -= dt;
  },
  drive(dt, busy) {
    const tr = this.tr, r = tr.ride, v = r.v, F = this.field;
    let ax = 0, ay = 0;
    if (!busy) for (const k of this.held) { ax += DIRS4[k][0]; ay += DIRS4[k][1]; }
    const px = v.x, pz = v.z;
    // 화면 기준 조작: 누른 방향으로 알아서 핸들을 꺾어 향함
    let throttle = 0, steer = 0;
    const len = Math.hypot(ax, ay);
    if (len > 0) {
      let diff = Math.atan2(ax, ay) - v.heading;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      if (tr.backT > 0) { throttle = -0.7; steer = Math.max(-1, Math.min(1, diff * 2)); }
      else { throttle = Math.abs(diff) > 1.7 ? 0.35 : Math.abs(diff) > 0.8 ? 0.6 : 1; steer = Math.max(-1, Math.min(1, -diff * 2.2)); }
    }
    if (tr.backT > 0) tr.backT -= dt;
    v.step(dt, throttle, steer);
    if (len > 0 && Math.abs(v.speed) > 0.2 && !v.spec.BIKE) {
      let diff = Math.atan2(ax, ay) - v.heading; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      v.heading += Math.sign(diff) * Math.min(Math.abs(diff), 1.9 * Math.min(1, Math.abs(v.speed) / 2) * dt);
    }
    // 충돌: 막힌 칸·물·집 안·다른 탈것
    const reach = (v.spec.R || 1) * 0.9;
    const hit = (x, z) => { const tx = Math.floor(x * M / T), ty = Math.floor(z * M / T); return ty >= OUT || this.solid(tx, ty) || !!this.entityAt(tx, ty) || this.isWater(tx, ty) || !!this.rideAt(tx, ty); };
    const fx = v.x + Math.sin(v.heading) * reach, fz = v.z + Math.cos(v.heading) * reach, bx = v.x - Math.sin(v.heading) * reach, bz = v.z - Math.cos(v.heading) * reach;
    if (hit(v.x, v.z) || hit(v.speed >= 0 ? fx : bx, v.speed >= 0 ? fz : bz)) {
      const rock = F.isRock(fx, fz) && Math.abs(v.speed) > 1;
      v.x = px; v.z = pz; v.speed *= rock ? -0.2 : -0.1; v.pedal = 0;
      if (len > 0 && !(tr.backT > 0)) { tr.backT = 0.9; v.pedal = -0.6; }
      if (rock) { this.ui.toast('바위에 부딪혔어요! 돌아서 가요', 'star'); this.audio.play('bump'); }
      else if (!this.bumpT || this.bumpT < performance.now()) { this.audio.play('bump', 0.4); this.bumpT = performance.now() + 500; }
    }
    // 주민이 빠르게 스치면 펄쩍 놀람
    if (Math.abs(v.speed) > 1.2) {
      const now = performance.now();
      for (const n of this.npcs) if (Math.hypot(n.a.wx - v.x * M, n.a.wy - v.z * M) < 46 && !(n.startleUntil > now - 4000)) this.startleNpc(n);
    }
    // 트랙터 쟁기 = 뒤 2.3m: 지나간 칸마다 코인, 다 갈면 보너스
    if (r.plow) {
      const plx = v.x - Math.sin(v.heading) * 2.3, plz = v.z - Math.cos(v.heading) * 2.3;
      if (tr.plowDown && Math.abs(v.speed) > 0.5) {
        const i = F.plowAt(plx, plz, tr.clock);
        if (i >= 0) {
          this.audio.play('dig', 0.3); this.puff(plx * M, plz * M, 4);
          this.econ.earn(PLOW_COIN);
          tr.runPlowed++;
          if (tr.runPlowed === 5) this.report('tractor');
          this.report('plowbest', tr.runPlowed);
          if (F.plowedCount === F.open) { this.econ.earn(PLOW_ALL_BONUS); this.audio.play('win'); this.ui.toast(`밭 전체를 다 갈았어요! 보너스 +${PLOW_ALL_BONUS}코인 (갈린 칸은 몇 분 뒤 다시 풀밭이 돼요)`, 'coin'); }
          else if (F.total % 10 === 0) this.popIcon('coin', plx * M, plz * M - 20);
        }
        if (Math.abs(v.speed) > 0.5 && Math.random() < dt * 20) this.puff(plx * M, plz * M, 1);
      }
    }
    tr.engineT -= dt;
    if (tr.engineT <= 0 && !v.spec.BIKE) { tr.engineT = 0.9 - Math.min(0.5, Math.abs(v.speed) * 0.08); this.audio.play('engine', (r.kind === 'cart' ? 0.22 : 0.35) + Math.abs(v.speed) * 0.05); }
    // 주인공은 운전석에 (카메라도 따라감)
    const p = this.player, seat = r.kind === 'bike' ? 1.5 : r.kind === 'cart' ? -1 : 7;
    p.px = v.x * M - Math.sin(v.heading) * seat; p.py = v.z * M - Math.cos(v.heading) * seat + 6;
    p.vx = Math.sin(v.heading) * v.speed * M; p.vy = Math.cos(v.heading) * v.speed * M;
    p.dir = Math.abs(Math.sin(v.heading)) > Math.abs(Math.cos(v.heading)) ? (Math.sin(v.heading) > 0 ? 'right' : 'left') : (Math.cos(v.heading) > 0 ? 'down' : 'up');
    const last = this.trail[this.trail.length - 1];
    if (!last || Math.hypot(last.x - p.px, last.y - p.py) >= 2) { this.trail.push({ x: p.px, y: p.py + 10 }); if (this.trail.length > 120) this.trail.shift(); }
  },
  startleNpc(n) {
    n.startleUntil = performance.now() + 900;
    const line = this.villagerStartle?.(n.id) || '깜짝이야!';
    this.audio.play('bump', 0.3);
    this.ui.toast(`${this.villagerName?.(n.id) || '주민'}: "${line}"`, 'star');
  },
  dismount() {
    const tr = this.tr, r = tr.ride; if (!r) return;
    const v = r.v;
    tr.ride = null; tr.driving = false; this.held = [];
    v.speed = 0; v.pedal = 0;
    const tx = Math.floor(v.x * M / T), ty = Math.floor(v.z * M / T);
    const spot = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1], [2, 0], [-2, 0], [0, 2], [0, -2]].map(([dx, dy]) => [tx + dx, ty + dy]).find(([x, y]) => !this.blocked(x, y) && !this.isWater(x, y) && y < OUT);
    if (spot) this.player.place(spot[0], spot[1]);
    this.player.vx = this.player.vy = 0; this.trail = []; this.dog.place(this.player.x, this.player.y);
    if (r.plow && tr.runPlowed) this.ui.toast(`이번에 ${tr.runPlowed}칸 갈았어요 (+${tr.runPlowed * PLOW_COIN}코인)`, 'coin');
  },

  /* ── 그리기 ── */
  pushRideDrawables(out) {
    const S = this.S, now = performance.now();
    for (const r of this.rides) {
      const v = r.v, vx = v.x * M, vy = v.z * M;
      const ai = ((Math.round((v.heading / (Math.PI * 2)) * 32) % 32) + 32) % 32;
      const riding = r === this.tr.ride;
      const shake = riding && Math.abs(v.speed) > 0.3 && !v.spec.BIKE ? Math.round(Math.sin(now / 45)) * 0.5 : 0;
      const img = r.kind === 'tractor' ? S.tractor(this.tr.plowDown || !riding, ai) : S.ride(r.kind, ai);
      const an = r.kind === 'tractor' ? S.tractorAnchor : S.rideAnchor[r.kind];
      // 자전거는 돌 때 기울기만큼 옆으로 살짝
      const lean = v.spec.BIKE ? Math.round((v.lean || 0) * 6) : 0;
      if (r.kind === 'cart' && riding) {
        // 탄 카트: 몸통 → 유니코 → 차양 순서
        out.push({ img: S.ride('cartBody', ai), x: vx - an.x, y: vy - an.y + shake, sy: vy + 12, shadow: 'xl', sx: vx, shy: vy + 8, st: true });
        out.push({ img: S.ride('cartRoof', ai), x: vx - an.x, y: vy - an.y + shake, sy: vy + 14, tall: true, st: true });
      } else out.push({ img, x: vx - an.x + lean, y: vy - an.y + shake, sy: vy + (r.kind === 'bike' ? 4 : 14), shadow: r.kind === 'bike' ? 'm' : 'xl', sx: vx, shy: vy + (r.kind === 'bike' ? 2 : 8), tall: r.kind !== 'bike', st: true });
      if (riding) {
        const p = this.player;
        const back = r.kind === 'tractor' ? 12 : r.kind === 'cart' ? 2 : 2;
        const up = r.kind === 'tractor' ? 17 : r.kind === 'cart' ? 12 : 14;
        const hx = vx - Math.sin(v.heading) * back + lean, hy = vy - Math.cos(v.heading) * back - up;
        // 자전거: 페달 밟는 걸음 프레임
        const f = v.spec.BIKE && v.pushing ? (Math.sin(v.crank || 0) > 0 ? 1 : 3) : 0;
        out.push({ img: S.char('player', { scarf: 'scarf' }, p.dir, f), x: hx - 20, y: hy - 26 + shake, sh: v.spec.BIKE ? 44 : 34, sy: vy + (r.kind === 'bike' ? 5 : r.kind === 'cart' ? 13 : 15), player: true, bubble: this.bellT > 0 ? 'note' : null });
      }
    }
  },
};
const DIRS4 = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
