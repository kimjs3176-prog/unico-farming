import * as THREE from 'three';
import { FreeField, Vehicle, RIDE_SPECS } from '../sim/tractor.js';
import { LAYOUT } from '../world.js';
import { josa } from '../sim/josa.js';
import { touchUI } from '../input.js';
import { heightAt, normalAt } from '../terrain.js';
import { makeBike, makeCart } from './ride_models.js';

const GRASS = new THREE.Color(0xb08a5a), PLOWED = new THREE.Color(0x6b4430);
/** 쟁기로 한 칸 갈 때 코인, 밭 전체를 다 갈면 보너스 */
export const PLOW_COIN = 2, PLOW_ALL_BONUS = 60;

/**
 * 탈것에서 내릴 자리: 옆(지금과 같은 쪽) → 반대 옆 → 뒤 → 앞 순서로 막히지 않은 첫 자리.
 * yard 를 주면 그 울타리 안쪽만 (다 막혔으면 마당 가운데 쪽 자리를 마당 안으로 당김)
 */
export function dismountSpot(v, yard, isBlocked = () => false, D = 2.4, pad = 0.8) {
  const sx = Math.cos(v.heading), sz = -Math.sin(v.heading), fx = Math.sin(v.heading), fz = Math.cos(v.heading);
  const cands = [[-sx, -sz], [sx, sz], [-fx, -fz], [fx, fz]].map(([dx, dz]) => ({ x: v.x + dx * D, z: v.z + dz * D }));
  if (yard) {
    const cx = (yard.x0 + yard.x1) / 2 - v.x, cz = (yard.z0 + yard.z1) / 2 - v.z, l = Math.hypot(cx, cz) || 1;
    cands.push({ x: v.x + (cx / l) * D, z: v.z + (cz / l) * D });
  }
  const inYard = (p) => !yard || (p.x > yard.x0 + pad && p.x < yard.x1 - pad && p.z > yard.z0 + pad && p.z < yard.z1 - pad);
  const ok = cands.find((p) => inYard(p) && !isBlocked(p.x, p.z));
  if (ok) return ok;
  const p = { ...cands[cands.length - 1] };
  if (yard) { p.x = THREE.MathUtils.clamp(p.x, yard.x0 + pad, yard.x1 - pad); p.z = THREE.MathUtils.clamp(p.z, yard.z0 + pad, yard.z1 - pad); }
  return p;
}

/**
 * 마을 탈것 종류. seat = 좌석 위치(진행 방향 뒤로 back, 오른쪽 side, 높이 h)와 탄 유니코 크기, reach = 탈 수 있는 거리
 * 내릴 때 D = 차체 옆으로 비켜서는 거리
 */
export const RIDES = [
  { id: 'tractor', name: '트랙터', icon: '🚜', seat: { back: 0.72, side: 0, h: 1.42, scale: 0.72 }, reach: 3.2, D: 2.4, plow: true, sound: 'ignite', engine: 'tractor' },
  { id: 'bike', name: '자전거', icon: '🚲', seat: { back: 0.22, side: 0, h: 0.62, scale: 0.72 }, reach: 2.2, D: 1.3, pedal: true, sound: 'click', engine: 'bike' },
  { id: 'cart', name: '농장 카트', icon: '🛻', seat: { back: -0.02, side: -0.28, h: 0.66, scale: 0.72 }, reach: 2.8, D: 2.0, sound: 'ignite', engine: 'cart' },
];

/** 트랙터·자전거·농장 카트: 마을 어디서나 타고(E) 내리는(E) 탈것. 트랙터는 쟁기를 내리면 밭을 갈아 코인을 조금 받음 */
export class RideView {
  constructor(game) {
    this.game = game;
    const F = LAYOUT.field;
    this.field = new FreeField(F.cols, F.rows, F.cell, F.x0, F.z0, [[2, 1], [6, 3], [8, 0], [4, 4]]);
    this.t = 0;
    this.current = null;
    this.plowDown = false;
    this.riderGroup = new THREE.Group();
    this.rides = RIDES.map((def) => this._make(def)).filter(Boolean);
    this.byId = Object.fromEntries(this.rides.map((r) => [r.id, r]));
    this.tractor = this.byId.tractor;
    // 밭 칸 (인스턴스)
    const geo = new THREE.PlaneGeometry(F.cell - 0.15, F.cell - 0.15);
    this.cellMat = new THREE.MeshStandardMaterial({ color: 0x8a5a3c, roughness: 1 });
    this.cells = new THREE.InstancedMesh(geo, this.cellMat, F.cols * F.rows);
    this.cells.receiveShadow = true;
    const m = new THREE.Matrix4();
    for (let i = 0; i < F.cols * F.rows; i++) {
      const c = i % F.cols, r = Math.floor(i / F.cols);
      m.makeRotationX(-Math.PI / 2);
      m.setPosition(F.x0 + (c + 0.5) * F.cell, 0.02, F.z0 + (r + 0.5) * F.cell);
      this.cells.setMatrixAt(i, m);
      this.cells.setColorAt(i, GRASS);
    }
    game.world.scene.add(this.cells);
    for (const i of this.field.rocks) {
      const c = i % F.cols, r = Math.floor(i / F.cols);
      const rock = game.assets.clone('rock');
      rock.position.set(F.x0 + (c + 0.5) * F.cell, 0, F.z0 + (r + 0.5) * F.cell);
      rock.scale.setScalar(0.9);
      game.world.scene.add(rock);
    }
  }

  /** 탈것 하나: 모델 + 주행 모델 + 세워 둔 동안의 충돌원 */
  _make(def) {
    const g = this.game, spec = RIDE_SPECS[def.id];
    const home = def.id === 'tractor' ? LAYOUT.tractorHome : this._homeFor(def.id, spec.R);
    if (!home) return null;
    const model = def.id === 'tractor' ? g.assets.clone('tractor') : def.id === 'bike' ? makeBike() : makeCart();
    g.world.scene.add(model);
    const ride = {
      ...def, spec, home, model,
      vehicle: new Vehicle(home.x, home.z, home.heading, spec),
      wheels: [], steers: [],
      plow: def.plow ? model.getObjectByName('Plow') : null,
      obstacle: { x: home.x, z: home.z, r: spec.R + 0.4 },
    };
    model.traverse((o) => { if (/^Wheel/.test(o.name)) ride.wheels.push(o); else if (/^Steer/.test(o.name)) ride.steers.push(o); });
    ride.bell = model.getObjectByName('Bell') || null;
    g.world.obstacles.push(ride.obstacle);
    this._sync(ride);
    return ride;
  }

  /** 자전거·카트 세워 둘 자리: 후보 중 막히지 않은 첫 자리 */
  _homeFor(id, r) {
    const list = LAYOUT.rides?.[id] || [];
    return list.find((p) => !this.game.world.isBlocked(p.x, p.z, r + 0.3)) || list[0] || null;
  }

  get driving() { return !!this.current; }
  /** 지금 타고 있는 탈것 (안 타면 트랙터 — 길 안내·주민 반응 등이 쓰는 기본값) */
  get vehicle() { return (this.current || this.tractor).vehicle; }
  get model() { return (this.current || this.tractor).model; }

  _sync(ride) {
    const v = ride.vehicle, M = ride.model;
    const y = heightAt(v.x, v.z);
    M.position.set(v.x, y, v.z);
    M.rotation.set(0, v.heading, 0);
    if (y > 0.01) { // 언덕에서는 비탈을 따라 기울임
      const n = normalAt(v.x, v.z, 0.8), fx = Math.sin(v.heading), fz = Math.cos(v.heading);
      M.rotation.x = -Math.atan2(n[0] * fx + n[2] * fz, n[1]);
      M.rotation.z = Math.atan2(n[0] * fz - n[2] * fx, n[1]);
      M.rotation.order = 'YXZ';
    }
    for (const w of ride.wheels) w.rotation.x = v.wheelSpin;
    for (const s of ride.steers) s.rotation.y = (s.name === 'SteerWheel' ? 1.6 : -0.8) * v.steer;
    if (ride.plow) ride.plow.position.y = this.plowDown && this.current === ride ? 0.15 : 0.5;
    ride.obstacle.x = v.x; ride.obstacle.z = v.z;
  }

  /** 올라타기 */
  mount(ride) {
    const g = this.game;
    if (this.current) return;
    this.current = ride;
    this.runPlowed = 0;
    this.plowDown = !!ride.plow; // 트랙터는 쟁기 내린 채 출발 (모바일은 스페이스가 없어 버튼으로 올림)
    g.followCam.yaw = ride.vehicle.heading + Math.PI; // 카메라를 탈것 뒤로
    g._lookHold = 0; // 지난 운전에서 남은 시점 멈춤 시간
    g.player.frozen = true;
    g.player.cancelMove?.();
    this.rider = g.player.unico;
    this.rider.playAction('safety', 0);
    this.rider.pedalPhase = ride.pedal ? 0 : null;
    this.riderGroup.add(this.rider.group);
    g.world.scene.add(this.riderGroup);
    if (g.player.ring) g.player.ring.visible = false; // 발밑 고리는 안장 높이에 떠 보이니 숨김 (내리면 player.update 가 다시 켬)
    ride.obstacle.r = 0;
    ride.vehicle.speed = 0; ride.vehicle.pedal = 0;
    g.audio.play(ride.sound);
    g.audio.engineStart?.(ride.engine); // 시동 소리 뒤로 공회전 (자전거는 바퀴 구르는 소리)
    g.ui.showDrivePad({ plow: !!ride.plow, bike: !!ride.pedal });
    g.onEvent('ride');
    this._seen ||= new Set();
    if (!this._seen.has(ride.id)) {
      this._seen.add(ride.id);
      const how = ride.pedal
        ? (touchUI() ? '▲ 페달 · ▼ 브레이크 · ◀▶ 몸 기울이기 · 🔔 따르릉, 🚪 로 내려요' : 'W 페달 · S 브레이크 · A/D 몸 기울이기 · Space 따르릉, E 로 내려요')
        : (touchUI() ? '화면 버튼으로 운전, 🚪 로 내려요' : 'WASD·화살표로 운전, E 로 내려요');
      g.ui.toast(`${ride.icon} ${ride.name}${josa(ride.name, '을/를')} 탔어요! ${how}${ride.plow ? ' · 밭에서 쟁기를 내리면 밭을 갈아요' : ''}`);
    }
  }

  /** 자전거 따르릉: 종이 떨고, 앞쪽 가까운 주민은 놀라지 않고 손을 흔듦 */
  ringBell() {
    const g = this.game, ride = this.current;
    if (!ride?.pedal || this._bellT > 0.2) return;
    this._bellT = 0.5;
    g.audio.play('bell');
    const v = ride.vehicle, fx = Math.sin(v.heading), fz = Math.cos(v.heading), now = performance.now() / 1000;
    for (const e of g.npcs?.list || []) {
      const p = e.u.group.position, dx = p.x - v.x, dz = p.z - v.z, d = Math.hypot(dx, dz);
      if (d > 9 || (dx * fx + dz * fz) / (d || 1) < 0.3) continue; // 앞쪽 9m 안만
      e.bellUntil = now + 4; // 종을 들었으니 지나가도 놀라지 않음
      e.u.facing = Math.atan2(-dx, -dz);
      e.u.playAction?.('wave', 1.2);
      // 돌아다니던 주민은 길 옆으로 비켜 줌
      if (e.n.wander) { const side = dx * fz - dz * fx >= 0 ? 1 : -1; e.target = { x: p.x + fz * side * 2, z: p.z - fx * side * 2 }; e.wait = 0; e.spd = 2.5; }
    }
  }

  /** 내리기: 탈것은 그 자리에 세워 둠 */
  dismount() {
    const g = this.game, ride = this.current;
    if (!ride) return;
    this.current = null;
    g.audio.engineStop?.();
    g.player.frozen = false;
    this.rider.pedalPhase = null; this.rider.pedalRest = false;
    this.rider.facing = this.rider.yaw = ride.vehicle.heading; // 무리 안에서 0 이던 방향을 세상 방향으로
    this.rider.clearAction();
    g.world.scene.remove(this.riderGroup);
    g.world.scene.add(this.rider.group);
    // 내릴 자리는 탈것 충돌원을 다시 켜기 전에 고름 (켠 뒤면 탈것 자신에 막힘)
    const p = dismountSpot(ride.vehicle, null, (x, z) => g.world.isBlocked(x, z, 0.45), ride.D);
    this.rider.group.position.set(p.x, heightAt(p.x, p.z), p.z);
    ride.vehicle.speed = 0; ride.vehicle.pedal = 0; ride.vehicle.steer = 0;
    ride.obstacle.r = ride.spec.R + 0.4;
    this._sync(ride);
    g.ui.hideDrivePad();
  }

  /** 안 탔을 때: 가장 가까운 탈것 타기 안내. 탔을 때: 운전 */
  update(dt, input, playerPos) {
    this.t += dt;
    this._regrowT = (this._regrowT || 0) + dt;
    if (this._regrowT > 2) { // 오래 전에 간 칸은 다시 풀밭으로
      this._regrowT = 0;
      const back = this.field.regrow(this.t);
      if (back.length) { for (const i of back) this.cells.setColorAt(i, GRASS); this.cells.instanceColor.needsUpdate = true; }
    }
    if (!this.current) {
      let best = null;
      for (const r of this.rides) {
        const d = Math.hypot(r.vehicle.x - playerPos.x, r.vehicle.z - playerPos.z);
        if (d < r.reach && (!best || d < best.d)) best = { d, r };
      }
      if (!best) return null;
      const r = best.r;
      return { d: best.d, label: `${r.icon} ${r.name} 타기`, key: 'ride', onInteract: () => this.mount(r) };
    }
    return this._drive(dt, input);
  }

  _drive(dt, input) {
    const g = this.game, ride = this.current, v = ride.vehicle, R = ride.spec.R;
    const ax = input.axis();
    const prevX = v.x, prevZ = v.z;
    v.step(dt, -ax.y, ax.x);
    // 언덕 오르막은 조금 느리게
    const slope = heightAt(v.x, v.z) - heightAt(prevX, prevZ);
    if (ride.pedal) { // 자전거: 오르막은 힘들고 내리막은 저절로 빨라짐 (경사 × 중력 절반)
      const ds = Math.hypot(v.x - prevX, v.z - prevZ);
      if (ds > 1e-4) v.speed -= Math.sign(v.speed) * 4.9 * (slope / ds) * dt;
    } else if (slope > 0 && Math.abs(v.speed) > 0.5) v.speed *= Math.max(0.85, 1 - slope * 2);
    // 건물·연못·울타리
    const next = new THREE.Vector3(v.x, 0, v.z);
    g.world.resolveCollision(next, R);
    for (const o of this.rides) { // 세워 둔 다른 탈것
      if (o === ride) continue;
      const dx = next.x - o.vehicle.x, dz = next.z - o.vehicle.z, d = Math.hypot(dx, dz), min = R + o.spec.R;
      if (d < min && d > 1e-4) { next.x = o.vehicle.x + (dx / d) * min; next.z = o.vehicle.z + (dz / d) * min; }
    }
    if (next.x !== v.x || next.z !== v.z) {
      // 막힌 만큼만 감속 (담장을 스치면 살짝, 정면으로 박으면 크게)
      const want = Math.hypot(v.x - prevX, v.z - prevZ), got = Math.hypot(next.x - prevX, next.z - prevZ);
      v.speed *= want > 1e-4 ? Math.max(0.3, Math.min(1, got / want)) : 0.3;
      v.x = next.x; v.z = next.z;
    }
    const bump = () => { v.speed *= ride.pedal ? 0.1 : -0.25; v.pedal = 0; v.x = prevX; v.z = prevZ; g.juice?.shake(ride.pedal ? 0.15 : 0.35); }; // 자전거는 튕기지 않고 멈춤
    // 주민에게 부딪히면: 탈것이 튕겨 멈추고 주민이 깜짝 놀람
    for (const e of g.npcs?.list || []) {
      const p = e.u.group.position;
      if (Math.hypot(p.x - v.x, p.z - v.z) < R + 0.8 && g.npcs.startle(e, v) && Math.abs(v.speed) > 0.4) {
        bump();
        g.ui.toast(`😲 ${e.name ?? e.n.name}${josa(e.name ?? e.n.name, '이/가')} 깜짝 놀랐어요! 천천히 운전해요`);
      }
    }
    // 다른 플레이어(접속자)에게 부딪혀도 튕기고, 그 유니코가 깜짝 놀람 (내 화면에서)
    for (const r of g.net?.remote?.values() || []) {
      const p = r.unico.group.position, now = performance.now() / 1000;
      if (Math.hypot(p.x - v.x, p.z - v.z) < R + 0.6 && (r.startleUntil || 0) < now) {
        r.startleUntil = now + 4;
        r.unico.playAction('startle', 1.3); r.unico.say('깜짝이야!', 1.6);
        if (Math.abs(v.speed) > 0.4) bump();
      }
    }
    if (ride.plow && this._plow(input, v)) { v.x = prevX; v.z = prevZ; }
    this._sync(ride);
    // 좌석 위 유니코
    const S = ride.seat, fx = Math.sin(v.heading), fz = Math.cos(v.heading);
    this.riderGroup.position.set(v.x - fx * S.back + fz * S.side, ride.model.position.y + S.h, v.z - fz * S.back - fx * S.side);
    // 방향은 무리 쪽에서 돌리고(YXZ: 방향 → 앞뒤 기울기 → 좌우 기울기가 몸 기준), 유니코는 무리 안에서 앞(0)을 봄
    this.riderGroup.rotation.order = 'YXZ';
    this.riderGroup.rotation.set(ride.model.rotation.x * 0.6, v.heading, ride.model.rotation.z * 0.6);
    this.riderGroup.scale.setScalar(S.scale);
    this.rider.group.position.set(0, 0, 0);
    this.rider.facing = this.rider.yaw = 0;
    if (ride.pedal) {
      // 페달: 밟을 때만 크랭크를 따라 돌고, 프리휠(손 뗌)이면 발을 페달 위에 얹고 쉼
      this.rider.pedalPhase = v.crank ?? 0;
      this.rider.pedalRest = !v.pushing;
      // 기울여 돌기: 차체와 몸이 같이 기울고(몸은 조금 더), 밟을 때는 박자에 맞춰 좌우로 살짝 흔들림
      const lean = -(v.lean || 0);
      const sway = v.pushing ? Math.sin(v.crank) * 0.035 * Math.min(1, v.pedal * 1.5) : 0;
      ride.model.rotation.z += lean + sway * 0.5;
      this.riderGroup.rotation.z += lean * 1.15 + sway;
      // 기울면 안장도 그 방향으로 옮겨 감 (몸이 바퀴 접지점을 축으로 돎)
      const sh = Math.sin(lean) * (S.h + 0.25);
      this.riderGroup.position.x -= Math.cos(v.heading) * sh;
      this.riderGroup.position.z += Math.sin(v.heading) * sh;
      // 따르릉: Space (터치는 🔔 버튼)
      if (input.justPressed('Space')) this.ringBell();
      if (this._bellT > 0) { this._bellT -= dt; const b = ride.bell; if (b) b.rotation.z = Math.sin(this._bellT * 60) * 0.5 * this._bellT; }
    }
    this.rider.update(dt, g.followCam.camera, g.world.daylight);
    // 엔진·바퀴 소리: 빠르기를 따라감 (트랙터는 쟁기질 소리, 자전거는 페달을 안 밟을 때 따르르)
    g.audio.engineStart?.(ride.engine); // 화면을 벗어났다 돌아오면 다시 켬 (켜져 있으면 그대로)
    g.audio.engineSet?.(Math.abs(v.speed) / (ride.spec.MAX || 1), ride.plow ? this.plowDown : !v.pushing);
    // 내리기: E (터치는 화면의 🚪 내리기 버튼 — 운전 중엔 E 버튼이 숨음)
    if (input.justPressed('KeyE')) { this.dismount(); return null; }
    const how = touchUI() ? '🚪 버튼으로 내리기' : 'E 내리기';
    if (ride.pedal) return { label: `${ride.icon} ${v.pushing ? '페달 밟는 중' : Math.abs(v.speed) > 0.3 ? '쌩~ 굴러가는 중' : '자전거 위'} · ${touchUI() ? '🔔 따르릉' : 'Space 따르릉'} · ${how}`, key: 'driving' };
    if (!ride.plow) return { label: `${ride.icon} ${ride.name} 운전 중 · ${how}`, key: 'driving' };
    const F = this.field;
    return { label: `🚜 쟁기 ${this.plowDown ? '내림 🟢' : '올림 ⚪'} · 갈린 밭 ${F.plowedCount}/${F.open} · ${touchUI() ? '🪓 버튼 전환' : 'SPACE 전환'} · ${how}`, key: 'driving' };
  }

  /** 트랙터 쟁기: 내린 채 밭을 지나면 한 칸씩 갈림 (칸마다 코인 조금, 한 바퀴 다 갈면 보너스) */
  _plow(input, v) {
    const g = this.game, F = this.field;
    if (input.justPressed('Space')) { this.plowDown = !this.plowDown; g.audio.play('click'); }
    const px = v.x - Math.sin(v.heading) * 2.3, pz = v.z - Math.cos(v.heading) * 2.3; // 쟁기 = 트랙터 뒤 2.3m
    if (this.plowDown && Math.abs(v.speed) > 0.5) {
      const i = F.plowAt(px, pz, this.t);
      if (i >= 0) {
        this.cells.setColorAt(i, PLOWED); this.cells.instanceColor.needsUpdate = true;
        g.audio.play('dig', 0.3);
        g.fx.burst(px, 0.3, pz, 0x8a6a45, 4);
        g.economy.earn(PLOW_COIN);
        // 한 번 타서 간 칸 수: 5칸이면 '운전 면허', 많이 갈수록 '밭갈이 달인' (도트 버전 미니게임과 같은 퀘스트)
        this.runPlowed = (this.runPlowed || 0) + 1;
        if (this.runPlowed === 5) g.onEvent('tractor');
        g.onEvent('plowbest', this.runPlowed);
        if (F.plowedCount === F.open) {
          g.economy.earn(PLOW_ALL_BONUS);
          g.audio.play('win');
          g.fx.pop(px, pz, '🎉');
          g.ui.toast(`🚜 밭 전체를 다 갈았어요! 보너스 +${PLOW_ALL_BONUS}🪙 (갈린 칸은 몇 분 뒤 다시 풀밭이 돼요)`);
        } else if (F.total % 10 === 0) g.fx.pop(px, pz, `+${PLOW_COIN}🪙`);
      }
    }
    if (F.isRock(v.x + Math.sin(v.heading) * 1.2, v.z + Math.cos(v.heading) * 1.2) && Math.abs(v.speed) > 1) {
      v.speed *= -0.2; v.pedal = 0;
      g.ui.toast('🪨 바위에 부딪혔어요! 돌아서 가요');
      g.audio.play('bump');
      g.juice?.shake(0.6);
      return true; // 바위에 막힘 → 제자리로
    }
    return false;
  }
}
