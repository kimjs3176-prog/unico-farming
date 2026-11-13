/** 트랙터 밭갈이 미니게임: 격자 밭을 제한시간 안에 최대한 많이 갈기 (도트 버전 src/pixel 이 씀) */
export const TRACTOR_TIME = 60;

export class FieldSim {
  constructor(cols, rows, cell, x0, z0, rocks = []) {
    Object.assign(this, { cols, rows, cell, x0, z0 });
    this.plowed = new Uint8Array(cols * rows);
    this.rocks = new Set(rocks.map(([c, r]) => c + r * cols));
    this.score = 0;
    this.time = TRACTOR_TIME;
    this.running = false;
    this.hits = 0;
  }

  start() { this.plowed.fill(0); this.score = 0; this.time = TRACTOR_TIME; this.running = true; this.hits = 0; }

  cellAt(x, z) {
    const c = Math.floor((x - this.x0) / this.cell), r = Math.floor((z - this.z0) / this.cell);
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return -1;
    return c + r * this.cols;
  }

  isRock(x, z) { const i = this.cellAt(x, z); return i >= 0 && this.rocks.has(i); }

  /** 쟁기 위치가 지나간 셀을 갈기. 새로 갈린 셀 인덱스 또는 -1 */
  plowAt(x, z) {
    if (!this.running) return -1;
    const i = this.cellAt(x, z);
    if (i < 0 || this.rocks.has(i) || this.plowed[i]) return -1;
    this.plowed[i] = 1;
    this.score++;
    return i;
  }

  tick(dt) {
    if (!this.running) return false;
    this.time -= dt;
    if (this.time <= 0 || this.score >= this.cols * this.rows - this.rocks.size) { this.time = Math.max(0, this.time); this.running = false; return true; }
    return false;
  }

  reward() { return Math.round(this.score * 6 + (this.score >= 30 ? 100 : 0)); }
}

/**
 * 트랙터 밭 (마을 탈것이 된 트랙터로 자유롭게 가는 밭): 시간 제한 없이 쟁기가 지나간 칸이 갈리고,
 * 갈린 칸은 REGROW 초 뒤 다시 풀밭으로 돌아와 언제든 또 갈 수 있음
 */
export const REGROW = 240;

export class FreeField {
  constructor(cols, rows, cell, x0, z0, rocks = []) {
    Object.assign(this, { cols, rows, cell, x0, z0 });
    this.plowedAt = new Float64Array(cols * rows).fill(-1); // 갈린 시각(초), -1 = 안 갈림
    this.rocks = new Set(rocks.map(([c, r]) => c + r * cols));
    this.total = 0; // 지금까지 간 칸 수
  }

  get open() { return this.cols * this.rows - this.rocks.size; }
  get plowedCount() { let n = 0; for (const t of this.plowedAt) if (t >= 0) n++; return n; }

  cellAt(x, z) {
    const c = Math.floor((x - this.x0) / this.cell), r = Math.floor((z - this.z0) / this.cell);
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return -1;
    return c + r * this.cols;
  }

  isRock(x, z) { const i = this.cellAt(x, z); return i >= 0 && this.rocks.has(i); }

  /** 쟁기 위치가 지나간 칸을 갈기 (now = 지금 시각 초). 새로 갈린 칸 번호 또는 -1 */
  plowAt(x, z, now = 0) {
    const i = this.cellAt(x, z);
    if (i < 0 || this.rocks.has(i) || this.plowedAt[i] >= 0) return -1;
    this.plowedAt[i] = now;
    this.total++;
    return i;
  }

  /** 오래 전에 간 칸을 다시 풀밭으로. 되돌린 칸 번호 목록 */
  regrow(now, ttl = REGROW) {
    const out = [];
    this.plowedAt.forEach((t, i) => { if (t >= 0 && now - t >= ttl) { this.plowedAt[i] = -1; out.push(i); } });
    return out;
  }
}

/**
 * 부드러운 트랙터 모델
 * - 페달 입력 완충: 키를 눌러도 약 0.5초에 걸쳐 서서히 밟힘 (급발진 방지)
 * - 가속은 속도가 오를수록 줄어듦 (최고 속도 근처에서 완만)
 * - 브레이크·후진 분리, 손을 떼면 관성으로 천천히 멈춤
 * - 조향도 서서히 꺾이고, 빠를수록 덜 꺾임
 */
export const TRACTOR = { MAX: 5.5, REV_MAX: 2.2, ACC: 4.2, REV_ACC: 2.0, BRAKE: 6.5, DRAG: 0.9, ROLL: 0.6, PEDAL_RATE: 2.4, STEER_RATE: 4, STEER_MAX: 0.6, TURN: 0.45, WHEEL: 0.6 };

/** 마을 탈것별 주행 성격: 자전거는 가볍고 날렵하게, 농장 카트는 트랙터보다 빠르고 잘 돔. R = 충돌 반지름(m) */
export const RIDE_SPECS = {
  tractor: { ...TRACTOR, R: 1.4 },
  bike: { MAX: 7.5, REV_MAX: 1.2, ACC: 5.5, REV_ACC: 1.6, BRAKE: 9, DRAG: 0.6, ROLL: 0.5, PEDAL_RATE: 3.2, STEER_RATE: 6, STEER_MAX: 0.75, TURN: 0.75, WHEEL: 0.36, R: 0.6 },
  cart: { MAX: 6.5, REV_MAX: 2.5, ACC: 5, REV_ACC: 2.4, BRAKE: 7.5, DRAG: 0.8, ROLL: 0.6, PEDAL_RATE: 2.8, STEER_RATE: 5, STEER_MAX: 0.65, TURN: 0.55, WHEEL: 0.33, R: 1.1 },
};

export class Vehicle {
  constructor(x, z, heading, spec = TRACTOR) {
    Object.assign(this, { x, z, heading, speed: 0, steer: 0, wheelSpin: 0, pedal: 0, spec });
  }
  step(dt, throttle, steerInput) {
    const T = this.spec;
    // 페달: 목표 입력으로 서서히 이동 (놓을 때는 조금 더 빨리)
    const rate = Math.abs(throttle) > Math.abs(this.pedal) ? T.PEDAL_RATE : T.PEDAL_RATE * 1.6;
    this.pedal += (throttle - this.pedal) * Math.min(1, dt * rate);
    const p = this.pedal;
    if (p > 0.02) {
      if (this.speed >= 0) this.speed += p * T.ACC * Math.max(0, 1 - this.speed / T.MAX) * dt;
      else this.speed = Math.min(0, this.speed + T.BRAKE * p * dt); // 후진 중 전진 페달 = 브레이크
    } else if (p < -0.02) {
      if (this.speed > 0) this.speed = Math.max(0, this.speed + T.BRAKE * p * dt);
      else this.speed -= -p * T.REV_ACC * Math.max(0, 1 + this.speed / T.REV_MAX) * dt;
    }
    // 관성 감속 (구름 저항 + 공기 저항)
    const coast = Math.abs(p) < 0.1 ? 1 : 0.25;
    const dec = (T.ROLL + Math.abs(this.speed) * T.DRAG * 0.3) * coast * dt;
    this.speed = Math.sign(this.speed) * Math.max(0, Math.abs(this.speed) - dec);
    this.speed = Math.max(-T.REV_MAX, Math.min(T.MAX, this.speed));
    // 조향: 서서히, 고속일수록 덜 꺾임
    const target = steerInput * T.STEER_MAX / (1 + Math.abs(this.speed) * 0.12);
    this.steer += (target - this.steer) * Math.min(1, dt * T.STEER_RATE);
    this.heading -= this.steer * this.speed * dt * T.TURN;
    this.x += Math.sin(this.heading) * this.speed * dt;
    this.z += Math.cos(this.heading) * this.speed * dt;
    this.wheelSpin += this.speed * dt / T.WHEEL;
  }
}
