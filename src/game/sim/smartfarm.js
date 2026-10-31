/** 스마트팜 환경제어 미니게임: 온도/습도/CO2 를 목표 범위 안에 유지 */
export const SMART_TIME = 30;

export class SmartFarmSim {
  constructor(rng = Math.random) {
    this.rng = rng;
    this.vars = {
      temp:     { name: '온도',  unit: '℃',  value: 24, min: 22, max: 27, lo: 10, hi: 40 },
      humidity: { name: '습도',  unit: '%',  value: 60, min: 55, max: 70, lo: 20, hi: 100 },
      co2:      { name: 'CO₂',  unit: 'ppm', value: 800, min: 700, max: 1000, lo: 300, hi: 1600 },
    };
    this.actions = {
      heater: { name: '난방', apply: (v) => (v.temp.value += 1.6) },
      vent:   { name: '환기', apply: (v) => { v.temp.value -= 1.2; v.humidity.value -= 4; v.co2.value -= 90; } },
      mist:   { name: '분무', apply: (v) => { v.humidity.value += 6; v.temp.value -= 0.4; } },
      co2:    { name: 'CO₂ 공급', apply: (v) => (v.co2.value += 110) },
    };
    this.time = SMART_TIME;
    this.good = 0;
    this.running = false;
    this.drift = { temp: 0, humidity: 0, co2: 0 };
  }

  start() {
    this.time = SMART_TIME; this.good = 0; this.running = true;
    for (const k of Object.keys(this.drift)) this.drift[k] = (this.rng() - 0.5) * 2;
    this.vars.temp.value = 24; this.vars.humidity.value = 60; this.vars.co2.value = 800;
  }

  act(key) {
    if (!this.running) return;
    this.actions[key]?.apply(this.vars);
    for (const v of Object.values(this.vars)) v.value = Math.min(v.hi, Math.max(v.lo, v.value));
  }

  inRange(v) { return v.value >= v.min && v.value <= v.max; }
  allGood() { return Object.values(this.vars).every((v) => this.inRange(v)); }

  tick(dt) {
    if (!this.running) return false;
    // 무작위 드리프트 (방향이 천천히 바뀜)
    for (const k of Object.keys(this.drift)) {
      this.drift[k] += (this.rng() - 0.5) * dt * 1.5;
      this.drift[k] = Math.max(-1, Math.min(1, this.drift[k]));
    }
    this.vars.temp.value += this.drift.temp * dt * 1.4;
    this.vars.humidity.value += this.drift.humidity * dt * 4;
    this.vars.co2.value += this.drift.co2 * dt * 60 - dt * 12; // 작물이 CO2 를 소비
    for (const v of Object.values(this.vars)) v.value = Math.min(v.hi, Math.max(v.lo, v.value));
    if (this.allGood()) this.good += dt;
    this.time -= dt;
    if (this.time <= 0) { this.time = 0; this.running = false; return true; }
    return false;
  }

  /** 점수(0..100) 와 보상 */
  result() {
    const score = Math.round((this.good / SMART_TIME) * 100);
    return { score, money: Math.round(score * 1.5), boostSeconds: score >= 50 ? 120 : 0, boost: score >= 80 ? 2 : 1.5 };
  }
}
