// Game 믹스인: 게임 이벤트 → 퀘스트 진행·보상, 도감 완성 보상
// main.js 에서 Object.assign(Game.prototype, …) 으로 붙임 (축약 메서드라 this 는 Game)

export const GameProgress = {
  /** 도감 등록 후: 진행 퀘스트, 카테고리 완성 보상 */
  afterCollect() {
    this.onEvent('book', Object.keys(this.collection.entries).length);
    for (const r of this.collection.claimCompletions()) {
      this.economy.earn(r.money);
      this.audio.play('levelup');
      this.ui.result('🏅 도감 완성!', [`${{ fish: '물고기', bug: '곤충', fruit: '과일' }[r.cat]} 도감을 모두 채웠어요!`, `보상 +${r.money}🪙`]);
    }
  },

  /** 게임 이벤트 → 퀘스트 진행 */
  onEvent(event, amount = 1) {
    const done = this.quests.report(event, amount);
    for (const q of done) this.ui.toast(`✅ 퀘스트 완료: ${q.title} (Q 에서 보상 받기)`);
    if (event !== 'money') this.quests.report('money', this.economy.money);
  },

  claimQuest(id) {
    const r = this.quests.claim(id);
    if (!r) return;
    this.economy.earn(r.reward.money);
    this.audio.play(r.levelUp ? 'levelup' : 'coin');
    this.ui.toast(`🎁 +${r.reward.money} 코인, +${r.reward.xp} XP`);
    if (r.levelUp) { this.ui.toast(`⬆️ 레벨 ${r.level} 달성! 새 씨앗이 해금됐는지 장터를 확인하세요`); this.player.unico.playAction('cheer', 2); }
    this.onEvent('money', this.economy.money);
    this.saveTimer = Math.max(this.saveTimer, 9); // 보상은 1초 안에 저장 (연속으로 받아도 한 번만 직렬화)
  },
};
