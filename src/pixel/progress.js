import { SeasonChallenges, daysLeft } from '../game/sim/weekly.js';
import { snapshot, rating, starLine, latchStar, STAR_REWARDS, MAX_STARS } from '../game/sim/town_rating.js';
import { unlocksBetween, nextUnlockLine, LEVEL_GIFTS } from '../game/sim/unlocks.js';
import { DECOR_BY_ID } from '../game/sim/decor.js';
import { CROPS } from '../game/sim/crops.js';

/**
 * 성장 (3D 판 규칙 그대로):
 *  - 이번 계절 도전 3개 (sim/weekly.js): 밭·목장·자연에서 하나씩, 계절(7일)마다 새로. 다 받으면 꾸미기 선물 + 도전 도장
 *  - 우리 마을 별점 ★5 (sim/town_rating.js): 건물·꾸미기·우정·도감·스탬프·솜씨. 새 별마다 축하 + 선물
 *  - 보상 손맛: 코인이 HUD 지갑으로 날아감, 레벨 업 축하 카드(새로 열린 것·레벨 선물)
 */
export function initProgress(game) {
  game.challenges = new SeasonChallenges();
}
export const progressSave = (g) => g.challenges.toJSON();
export function progressLoad(g, d) { g.challenges.load(d); }

export const ProgressMethods = {
  /** 도전 기간 맞추기 (시작·새 날). 지난 계절에 다 하고 안 받은 보상은 자동으로 */
  syncChallenges() {
    const left = this.challenges.sync(this.day, { level: this.level, has: (id) => !!this.quests.claimed[id] });
    if (left) for (const r of left.rewards) this.giveChallenge(r, true);
  },
  /** 이벤트 → 계절 도전 진행 */
  challengeReport(ev, n, opt) {
    const done = this.challenges.report(ev, n, { night: this.night > 0.5, ...opt });
    for (const i of done) { const d = this.challenges.view()[i]; this.ui.toast(`계절 도전 완료! ${d.title} · J 에서 보상`, 'star'); this.audio.play('win', 0.6); }
  },
  giveChallenge(r, auto = false) {
    if (!r) return;
    this.econ.earn(r.money); this.coinBurst(r.money);
    const lv = this.quests.gainXp(r.xp);
    if (r.item?.seed) this.econ.addSeeds(r.item.seed, r.item.n);
    else if (r.item?.id) this.econ.addItem(r.item.id, r.item.n);
    this.ui.toast(`${auto ? '지난 계절 도전 보상: ' : ''}${r.money}코인 · ${r.xp}XP · ${r.item?.name || ''}`, 'coin');
    if (r.bonus) {
      this.decor.store(r.bonus.decor, 1);
      if (r.bonus.rare?.decor) this.decor.store(r.bonus.rare.decor, 1);
      this.ui.toast(`도전 세 개를 다 했어요! 도장 ${r.bonus.stamp}개 · 꾸미기 선물 ${DECOR_BY_ID[r.bonus.decor]?.name || ''}${r.bonus.rare?.decor ? ` + ${DECOR_BY_ID[r.bonus.rare.decor].name}` : ''} (보관함)`, 'gift');
    }
    if (lv.levelUp) this.levelUpCard(lv.from, lv.to);
  },

  /* ── 마을 별점 ── */
  townRating() {
    const g = { villagers: this.villagers, collection: this.book, town: this.town, decor: this.decor, koat: { book: this.stamps }, farm: { sim: this.farm }, rice: this.rice };
    return rating(snapshot(g));
  },
  /** 새 날·이벤트 뒤에 별 다시 셈 (매 프레임 아님) */
  checkTown() {
    const r = this.townRating();
    this.townStars = r.stars;
    const up = latchStar(this.flags, r.stars);
    if (!up) return;
    for (let s = up.from + 1; s <= up.to; s++) {
      const w = STAR_REWARDS[s];
      if (w?.decor) for (const [id, n] of Object.entries(w.decor)) this.decor.store(id, n);
      this.audio.play('levelup');
      this.celebrate(`우리 마을 별 ${s}개!`, starLine(s), [`${w?.text || ''}${w?.decor ? ' (꾸미기 보관함)' : w?.costume ? ' (의상은 3D 판에서)' : ''}`]);
    }
  },
  townMenu() {
    const r = this.townRating();
    this.ui.openMenu({
      title: `우리 마을 ${starLine(r.stars)}`,
      build: () => ({
        sub: r.stars >= MAX_STARS ? '별 다섯 개 마을이 됐어요! 유니코 마을 이장님 축하해요' : `다음 별까지 ${Math.round(r.frac * 100)}% · 이렇게 하면 빨라요`,
        items: r.next.slice(0, 5).map((n) => ({ icon: 'star', label: n.label, right: `${n.have} → ${n.need}`, onPick: () => {} })),
        foot: Object.entries(STAR_REWARDS).map(([k, w]) => `${'★'.repeat(+k)} ${w.text}`).join('<br>'),
      }),
    });
  },

  /* ── 손맛 ── */
  /** 코인 몇 개가 화면 가운데(주인공 머리 위)에서 HUD 지갑으로 날아감 */
  coinBurst(amount) {
    if (!(amount > 0)) return;
    this.ui.coinFly?.(Math.min(8, 2 + Math.floor(Math.log2(amount))));
  },
  /** 레벨 업 축하 카드: 새로 열린 것·레벨 선물 */
  levelUpCard(from, to) {
    const groups = unlocksBetween(from, to).filter((g) => ['seed', 'building', 'decor', 'rod', 'gift'].includes(g.kind)); // 도트판에 있는 것만 (의상·집 넓히기는 3D 판)
    for (let l = from + 1; l <= to; l++) for (const [id, n] of Object.entries(LEVEL_GIFTS[l]?.decor || {})) this.decor.store(id, n);
    const lines = groups.map((g) => `${g.label}: ${g.items.map((u) => u.name).join(', ')}`);
    if (!lines.length) lines.push(nextUnlockLine(to));
    this.audio.play('levelup');
    this.celebrate(`레벨 업! Lv.${to}`, '★', lines);
    this.challenges.level = Math.max(this.challenges.level, 1);
  },
  celebrate(title, big, lines) { this.ui.celebrate?.(title, big, lines); },

  challengeMenuItems() {
    const v = this.challenges.view();
    return v.map((d, i) => ({
      icon: d.claimed ? 'heart' : d.complete ? 'star' : d.cat === 'farm' ? 'seed' : d.cat === 'ranch' ? 'feed' : 'bug',
      label: `${d.title}`, right: d.claimed ? '받음' : d.complete ? '받기!' : `${d.count}/${d.goal}`, disabled: !d.complete || d.claimed,
      onPick: () => { const r = this.challenges.claim(i); if (r) { this.audio.play('coin'); this.giveChallenge(r); } },
    }));
  },
  challengeSub() {
    const s = this.season;
    return `${s.name} 도전 · 축제 날(7일째)까지 ${daysLeft(this.day)}일 · 도장 ${this.challenges.stamps}개 · 셋 다 하면 꾸미기 선물${s.crops.length ? ` · 제철 ${s.crops.map((c) => CROPS[c].name).join('·')}` : ''}`;
  },
};
