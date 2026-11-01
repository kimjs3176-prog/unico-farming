/** 트랙터 밭갈이 미니게임: 격자 밭을 제한시간 안에 최대한 많이 갈기 */
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
 * 부드러운 트랙터 모델
 * - 페달 입력 완충: 키를 눌러도 약 0.5초에 걸쳐 서서히 밟힘 (급발진 방지)
 * - 가속은 속도가 오를수록 줄어듦 (최고 속도 근처에서 완만)
 * - 브레이크·후진 분리, 손을 떼면 관성으로 천천히 멈춤
 * - 조향도 서서히 꺾이고, 빠를수록 덜 꺾임
 */
export const TRACTOR = { MAX: 5.5, REV_MAX: 2.2, ACC: 4.2, REV_ACC: 2.0, BRAKE: 6.5, DRAG: 0.9, ROLL: 0.6, PEDAL_RATE: 2.4, STEER_RATE: 4, STEER_MAX: 0.6 };

export class Vehicle {
  constructor(x, z, heading) {
    Object.assign(this, { x, z, heading, speed: 0, steer: 0, wheelSpin: 0, pedal: 0 });
  }
  step(dt, throttle, steerInput) {
    const T = TRACTOR;
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
    this.heading -= this.steer * this.speed * dt * 0.45;
    this.x += Math.sin(this.heading) * this.speed * dt;
    this.z += Math.cos(this.heading) * this.speed * dt;
    this.wheelSpin += this.speed * dt / 0.6;
  }
}
