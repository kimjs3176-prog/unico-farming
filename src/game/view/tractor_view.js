import * as THREE from 'three';
import { FieldSim, Vehicle, TRACTOR_TIME } from '../sim/tractor.js';
import { mgIntro, mgCountdown, mgResult, mgTick, starsFor } from '../../ui/minigame_frame.js';
import { LAYOUT } from '../world.js';
import { josa } from '../sim/josa.js';
import { touchUI } from '../input.js';

/**
 * 트랙터에서 내릴 자리: 옆(지금과 같은 쪽) → 반대 옆 → 뒤 → 앞 → 마당 가운데 쪽 순서로,
 * 마당 울타리 안쪽이고 막히지 않은 첫 자리. 다 막혔으면 마당 가운데 쪽 자리를 마당 안으로 당김
 * (트랙터는 울타리에서 1.55m 안쪽까지만 가므로 옆 2.2m 는 울타리 밖일 수 있음)
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

/** 트랙터: 탑승/운전 + 밭갈이 미니게임 */
export class TractorView {
  constructor(game) {
    this.game = game;
    const F = LAYOUT.field;
    this.field = new FieldSim(F.cols, F.rows, F.cell, F.x0, F.z0, [[2, 1], [6, 3], [8, 0], [4, 4]]);
    const T = LAYOUT.tractorHome;
    this.vehicle = new Vehicle(T.x, T.z, T.heading);
    this.model = game.assets.clone('tractor');
    game.world.scene.add(this.model);
    this.wheels = ['WheelFL', 'WheelFR', 'WheelBL', 'WheelBR'].map((n) => this.model.getObjectByName(n)).filter(Boolean);
    this.steers = ['SteerL', 'SteerR'].map((n) => this.model.getObjectByName(n)).filter(Boolean);
    this.plow = this.model.getObjectByName('Plow');
    this.driving = false;
    this.plowDown = false;
    // 트랙터 충돌체 (주차 중)
    this.obstacle = { x: T.x, z: T.z, r: 1.8 };
    game.world.obstacles.push(this.obstacle);
    this.syncModel();
    // 밭 셀 메시 (인스턴스)
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
      this.cells.setColorAt(i, new THREE.Color(0xb08a5a));
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

  syncModel() {
    const v = this.vehicle;
    this.model.position.set(v.x, 0, v.z);
    this.model.rotation.y = v.heading;
    for (const w of this.wheels) w.rotation.x = v.wheelSpin;
    for (const s of this.steers) s.rotation.y = -v.steer * 0.8;
    if (this.plow) this.plow.position.y = this.plowDown ? 0.15 : 0.5;
    this.obstacle.x = v.x; this.obstacle.z = v.z;
  }

  resetCells() {
    for (let i = 0; i < this.cells.count; i++) this.cells.setColorAt(i, new THREE.Color(0xb08a5a));
    this.cells.instanceColor.needsUpdate = true;
  }

  /** 시작 카드 → 올라타기 → 3·2·1 → 출발 */
  begin() {
    mgIntro(this.game, {
      id: 'tractor', icon: '🚜', title: '트랙터 밭갈이', unit: '칸', th: [15, 30, 45], countdown: false,
      rules: [['🟫', `${TRACTOR_TIME}초 안에 쟁기로 밭 칸을 최대한 많이 갈아요`], ['🔥', '쉬지 않고 이어서 갈면 연속 보너스 (끊기지 않게!)'], ['🪨', '바위에 부딪히면 시간 -3초']],
      controls: touchUI() ? ['◀ ▶ 회전', '▲ 전진 · ▼ 후진', '🪓 쟁기 올리기·내리기', '🚪 내리기'] : ['W/S 전진·후진', 'A/D 회전', 'SPACE 쟁기', '화면 버튼'],
      onStart: () => this.mount(),
    });
  }

  mount() {
    const g = this.game;
    this.driving = true;
    this.plowDown = true; // 모바일(스페이스 없음) 배려: 쟁기 내린 채 출발
    g.followCam.yaw = this.vehicle.heading + Math.PI; // 카메라를 트랙터 뒤로
    g._lookHold = 0; // 지난 운전에서 남은 시점 멈춤 시간
    g.player.frozen = true;
    g.player.hidden = true;
    g.player.unico.playAction('safety', 0);
    this.rider = g.player.unico; // 플레이어 유니코를 좌석 위에 표시
    this.riderGroup = new THREE.Group();
    this.riderGroup.add(this.rider.group);
    g.world.scene.add(this.riderGroup);
    g.player.hidden = false;
    this.obstacle.r = 0;
    this.field.start();
    this.field.running = false; // 3·2·1 동안은 멈춤
    this.counting = true;
    this.streak = 0; this.maxStreak = 0; this.lastPlow = -9; this.tickRef = {};
    this.resetCells();
    g.audio.play('engine');
    g.ui.showMinigame('tractor', { time: TRACTOR_TIME, score: 0, max: this.field.cols * this.field.rows - this.field.rocks.size });
    mgCountdown(g).then(() => { if (!this.driving) return; this.counting = false; this.field.start(); this.resetCells(); });
  }

  dismount(finished = false) {
    const g = this.game;
    this.driving = false;
    g.player.frozen = false;
    g.player.unico.clearAction();
    g.world.scene.remove(this.riderGroup);
    g.world.scene.add(this.rider.group);
    // 내릴 자리는 트랙터 충돌원을 다시 켜기 전에 고름 (켠 뒤면 트랙터 자신에 막힘)
    const p = dismountSpot(this.vehicle, LAYOUT.tractorYard, (x, z) => g.world.isBlocked(x, z, 0.45));
    this.rider.group.position.set(p.x, 0, p.z);
    this.obstacle.r = 1.8;
    g.ui.hideMinigame();
    if (finished) {
      const F = this.field, stars = starsFor(F.score, [15, 30, 45]);
      const streakBonus = this.maxStreak * 3, starBonus = [0, 0, 30, 80][stars];
      const reward = F.reward() + streakBonus + starBonus;
      g.economy.earn(reward);
      g.onEvent('tractor');
      g.onEvent('plowbest', F.score);
      g.player.unico.playAction('cheer', 2);
      g.audio.play('win');
      mgResult(g, {
        id: 'tractor', icon: '🚜', title: '밭갈이 결과', score: F.score, unit: '칸', th: [15, 30, 45],
        lines: [`🔥 최대 연속 ${this.maxStreak}칸 · 보너스 +${streakBonus}🪙`, `🪨 바위 충돌 ${F.hits}회`, `${starBonus ? `⭐ 별 보너스 +${starBonus}🪙 · ` : ''}총 보상 <b>+${reward}🪙</b>`],
        onRetry: () => this.begin(),
      });
    } else this.field.running = false;
  }

  update(dt, input, playerPos) {
    const v = this.vehicle;
    if (!this.driving) {
      const d = Math.hypot(v.x - playerPos.x, v.z - playerPos.z);
      if (d < 3.2) return { d, label: '🚜 트랙터 타기 (밭갈이 미니게임)', key: 'tractor', onInteract: () => this.begin() };
      return null;
    }
    const ax = this.counting ? { x: 0, y: 0 } : input.axis();
    const prevX = v.x, prevZ = v.z;
    v.step(dt, -ax.y, ax.x);
    // 경계/장애물 (연못, 건물)
    const next = new THREE.Vector3(v.x, 0, v.z);
    this.game.world.resolveCollision(next, 1.4);
    // 트랙터 마당 밖으로는 못 나감 (사람이 드나드는 문도 트랙터는 막힘)
    const Y = LAYOUT.tractorYard, m = 1.55;
    if (Y) { next.x = THREE.MathUtils.clamp(next.x, Y.x0 + m, Y.x1 - m); next.z = THREE.MathUtils.clamp(next.z, Y.z0 + m, Y.z1 - m); }
    if (next.x !== v.x || next.z !== v.z) {
      // 막힌 만큼만 감속 (담장을 스치면 살짝, 정면으로 박으면 크게)
      const want = Math.hypot(v.x - prevX, v.z - prevZ), got = Math.hypot(next.x - prevX, next.z - prevZ);
      v.speed *= want > 1e-4 ? Math.max(0.3, Math.min(1, got / want)) : 0.3;
      v.x = next.x; v.z = next.z;
    }
    // 주민에게 부딪히면: 트랙터가 튕겨 멈추고 주민이 깜짝 놀람
    for (const e of this.game.npcs?.list || []) {
      const p = e.u.group.position;
      if (Math.hypot(p.x - v.x, p.z - v.z) < 2.2 && this.game.npcs.startle(e, v) && Math.abs(v.speed) > 0.4) {
        v.speed *= -0.25; v.pedal = 0; v.x = prevX; v.z = prevZ;
        this.game.juice?.shake(0.35);
        this.game.ui.toast(`😲 ${e.n.name}${josa(e.n.name, '이/가')} 깜짝 놀랐어요! 천천히 운전해요`);
      }
    }
    // 다른 플레이어(접속자)에게 부딪혀도 마찬가지로 튕기고, 그 유니코가 깜짝 놀람 (내 화면에서)
    for (const r of this.game.net?.remote?.values() || []) {
      const p = r.unico.group.position, now = performance.now() / 1000;
      if (Math.hypot(p.x - v.x, p.z - v.z) < 2.0 && (r.startleUntil || 0) < now) {
        r.startleUntil = now + 4;
        r.unico.playAction('startle', 1.3); r.unico.say('깜짝이야!', 1.6);
        if (Math.abs(v.speed) > 0.4) { v.speed *= -0.25; v.pedal = 0; v.x = prevX; v.z = prevZ; this.game.juice?.shake(0.35); }
      }
    }
    if (input.justPressed('Space')) { this.plowDown = !this.plowDown; this.game.audio.play('click'); }
    // 쟁기 위치 = 트랙터 뒤 2.3m
    const px = v.x - Math.sin(v.heading) * 2.3, pz = v.z - Math.cos(v.heading) * 2.3;
    if (this.plowDown && Math.abs(v.speed) > 0.5) {
      const i = this.field.plowAt(px, pz);
      if (i >= 0) {
        this.cells.setColorAt(i, new THREE.Color(0x6b4430)); this.cells.instanceColor.needsUpdate = true; this.game.audio.play('dig', 0.3);
        // 연속 갈기: 1.2초 안에 다음 칸을 갈면 이어짐
        const now = TRACTOR_TIME - this.field.time;
        this.streak = now - this.lastPlow < 1.2 ? this.streak + 1 : 1;
        this.lastPlow = now;
        if (this.streak > this.maxStreak) this.maxStreak = this.streak;
        if (this.streak % 10 === 0) { this.game.audio.play('pop'); this.game.fx.pop(px, pz, `🔥${this.streak}`); }
        this.game.fx.burst(px, 0.3, pz, 0x8a6a45, 4);
      }
    }
    if (this.field.isRock(v.x + Math.sin(v.heading) * 1.2, v.z + Math.cos(v.heading) * 1.2) && Math.abs(v.speed) > 1) {
      v.speed *= -0.2; v.pedal = 0; v.x = prevX; v.z = prevZ; this.field.hits++; this.field.time = Math.max(0, this.field.time - 3);
      this.game.ui.toast('🪨 바위에 부딪혔어요! -3초');
      this.game.audio.play('bump');
      this.game.juice.shake(0.6);
    }
    this.syncModel();
    // 좌석은 차체 중심보다 뒤쪽(-진행방향 0.72m), 높이 1.42
    this.riderGroup.position.set(v.x - Math.sin(v.heading) * 0.72, 1.42, v.z - Math.cos(v.heading) * 0.72);
    this.rider.group.position.set(0, 0, 0);
    this.rider.facing = v.heading;
    this.rider.update(dt, this.game.followCam.camera, this.game.world.daylight);
    this.riderGroup.scale.setScalar(0.72);
    const done = this.field.tick(dt);
    const TT = TRACTOR_TIME - this.field.time;
    if (TT - this.lastPlow > 1.2 && this.streak) this.streak = 0;
    this.game.ui.updateMinigame({ time: this.field.time, score: this.field.score, streak: this.streak, warn: !this.counting && mgTick(this.game, this.field.time, this.tickRef) });
    if (done) { this.dismount(true); return null; }
    // 터치 E 버튼(interactTap)으로는 내리지 않음: 운전 중엔 E 버튼이 숨고 화면의 🚪 내리기 버튼만 씀 (▼후진 옆이라 잘못 눌러 판을 잃지 않게)
    if (input.justPressed('KeyE')) { this.dismount(false); return null; }
    const how = touchUI() ? '🪓 버튼 전환 · 🚪 버튼 내리기' : 'SPACE 전환 · E 내리기';
    return { label: `쟁기 ${this.plowDown ? '내림 🟢' : '올림 ⚪'} · ${how}`, key: 'driving' };
  }
}
