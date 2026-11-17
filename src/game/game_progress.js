// Game 믹스인: 게임 이벤트 → 퀘스트 진행·보상, 도감 완성 보상
// main.js 에서 Object.assign(Game.prototype, …) 으로 붙임 (축약 메서드라 this 는 Game)
import { CATEGORY_NAMES } from './sim/items.js';
import { AUTO_CLAIM } from './guide.js';
import { touchUI } from './input.js';

export const GameProgress = {
  /** 도감 등록 후: 진행 퀘스트, 카테고리 완성 보상 */
  afterCollect() {
    this.onEvent('book', Object.keys(this.collection.entries).length);
    for (const r of this.collection.claimCompletions()) {
      this.economy.earn(r.money);
      const reward = this.reward; // 보상 등급 연출 (없으면 예전 소리)
      if (reward) reward.call(this, 3, { label: '🏅' }); else this.audio.play('levelup');
      this.ui.result('🏅 도감 완성!', [`${CATEGORY_NAMES[r.cat] || r.cat} 도감을 모두 채웠어요!`, `보상 +${r.money}🪙`]);
    }
  },

  /** 게임 이벤트 → 퀘스트 진행 */
  onEvent(event, amount = 1) {
    const done = this.quests.report(event, amount);
    // 보유 금액 퀘스트도 같이 살핌 (완료 알림이 빠지지 않게)
    if (event !== 'money') done.push(...this.quests.report('money', this.economy.money));
    for (const q of done) {
      if (AUTO_CLAIM.has(q.id)) this.ui.toast(`✅ ${q.title} 완료! +${q.reward.money}🪙`);
      else this.ui.toast(`✅ ${q.title} 완료! ${touchUI() ? '목표 칩을 눌러 보상 받기' : 'Q 또는 목표 칩에서 보상 받기'}`);
    }
    // 완료 소리: 잠깐 뒤 한 번만 (몰아서 끝나도 1.5초에 한 번)
    if (done.length) {
      const now = Date.now();
      if (this._winAt === undefined || now - this._winAt > 1500) { this._winAt = now; setTimeout(() => this.audio.play('win'), 350); }
    }
  },

  /** 보상 받기. quiet: 코인 알림 생략 (자동 받기는 완료 알림에 이미 금액이 있음). 이미 받았으면 null */
  claimQuest(id, { quiet = false } = {}) {
    const r = this.quests.claim(id);
    if (!r) return null;
    this.economy.earn(r.reward.money);
    this.audio.play(r.levelUp ? 'levelup' : 'coin');
    if (!quiet) this.ui.toast(`🎁 +${r.reward.money} 코인, +${r.reward.xp} XP`);
    if (r.levelUp) {
      this.player.unico.playAction('cheer', 2);
      // 레벨업 카드(보상 연출)가 없으면 글로라도 알림
      if (!this.reward) this.ui.toast(`⬆️ 레벨 ${r.level} 달성! 장터에서 새 씨앗을 확인하세요`);
    }
    if (this.flags?.pinQuest === id) delete this.flags.pinQuest;
    this.guide?.onClaimed?.(id);
    this.onEvent('money', this.economy.money);
    this.saveTimer = Math.max(this.saveTimer, 9); // 보상은 1초 안에 저장 (연속으로 받아도 한 번만 직렬화)
    return r;
  },
};
