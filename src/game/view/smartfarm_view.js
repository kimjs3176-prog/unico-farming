import { SmartFarmSim, SMART_TIME } from '../sim/smartfarm.js';
import { LAYOUT } from '../world.js';

/** 스마트팜: 센서 폴 근처에서 환경제어 미니게임 */
export class SmartFarmView {
  constructor(game) {
    this.game = game;
    this.sim = new SmartFarmSim();
    this.boostUntil = 0;
    this.t = 0;
    this.active = false;
  }

  update(dt, input, playerPos) {
    this.t += dt;
    const g = this.game;
    g.farm.sim.boost = this.t < this.boostUntil ? this.boostMult : 1;
    if (this.active) {
      const done = this.sim.tick(dt);
      g.ui.updateSmartfarm(this.sim);
      if (done) this.finish();
      return { d: -1, label: '스마트팜 제어 중… 패널의 버튼으로 환경을 맞추세요', key: 'smart' };
    }
    const S = LAYOUT.sensor;
    const ds = Math.hypot(S.x - playerPos.x, S.z - playerPos.z);
    if (ds < 3) {
      return { d: ds, label: '스마트팜 환경 제어 (미니게임)', key: 'smart', onInteract: () => this.start() };
    }
    return null;
  }

  start() {
    const g = this.game;
    this.active = true;
    this.sim.start();
    g.player.frozen = true;
    g.player.unico.playAction('tablet', 0);
    g.ui.showSmartfarm(this.sim, (key) => { this.sim.act(key); g.audio.play('click'); });
    g.ui.toast(`📱 ${SMART_TIME}초 동안 온도·습도·CO₂ 를 녹색 범위에 유지하세요!`);
  }

  finish() {
    const g = this.game;
    this.active = false;
    g.player.frozen = false;
    g.player.unico.clearAction();
    const r = this.sim.result();
    g.economy.earn(r.money);
    g.onEvent('smartfarm');
    if (r.boostSeconds) { this.boostUntil = this.t + r.boostSeconds; this.boostMult = r.boost; }
    g.ui.hideSmartfarm();
    g.audio.play(r.score >= 50 ? 'win' : 'bump');
    g.player.unico.playAction(r.score >= 50 ? 'cheer' : 'think', 2);
    if (this.onFinish) { const cb = this.onFinish; this.onFinish = null; cb(r); return; } // KOAT 체험관에서 시작한 경우
    g.ui.result('📱 스마트팜 점검 결과', [`적정 환경 유지율: ${r.score}%`, `보상: +${r.money} 코인`, r.boostSeconds ? `🌱 작물 성장 ×${r.boost} 부스트 ${r.boostSeconds}초!` : '50% 이상이면 성장 부스트를 받아요']);
  }

  get boostLeft() { return Math.max(0, this.boostUntil - this.t); }
}
