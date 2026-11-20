// Game 믹스인: 게임 이벤트 → 퀘스트 진행·보상·경험치, 계절 도전, 마을 별점·편지, 도감 완성 보상
// main.js 에서 Object.assign(Game.prototype, …) 으로 붙임 (축약 메서드라 this 는 Game)
import { CATEGORY_NAMES } from './sim/items.js';
import { actionXp, MG_DAILY } from './sim/quests.js';
import { LEVEL_GIFTS, giftCostume } from './sim/unlocks.js';
import { rating, snapshot, latchStar, starLine, STAR_REWARDS } from './sim/town_rating.js';
import { SeasonChallenges, daysLeft } from './sim/weekly.js';
import { COSTUME } from './sim/costume.js';
import { DECOR_BY_ID } from './sim/decor.js';
import { AUTO_CLAIM } from './guide.js';
import { touchUI } from './input.js';
import { reward } from './reward.js';
import { sendLetter } from '../ui/letters.js';

/** 마을 별점을 다시 셀 이벤트 (매 프레임 아님) */
const RATING_EVENTS = new Set(['built', 'decor', 'hearts', 'book', 'koatstamp', 'homeup', 'farmlv', 'thresh']);
/** 밤 (계절 도전 '밤에 낚기'): world.nightK 가 이보다 크면 */
const NIGHT_K = 0.5;

/** 꾸미기 보관함에 넣기 (sim 메서드가 있으면 그것으로) */
function giveDecor(g, id, n = 1) {
  const sim = g.decor?.sim;
  if (!sim || !DECOR_BY_ID[id] || n <= 0) return false;
  if (typeof sim.give === 'function') return sim.give(id, n) !== false;
  sim.stored[id] = Math.min(99, sim.storedOf(id) + n);
  return true;
}
/** 옷장에 넣기 (이미 있으면 false) */
function giveCostume(g, id) {
  const c = g.costume;
  if (!c || !COSTUME[id] || c.has(id)) return false;
  if (typeof c.grant === 'function') return c.grant(id) !== false;
  c.owned.add(id);
  return true;
}

export const GameProgress = {
  /** 도감 등록 후: 진행 퀘스트, 카테고리 완성 보상 */
  afterCollect() {
    this.onEvent('book', Object.keys(this.collection.entries).length);
    for (const r of this.collection.claimCompletions()) {
      this.economy.earn(r.money);
      reward(this, 3, { label: '🏅' }); // 3단계 보상 연출 (만세·팡파르)
      this.ui.result('🏅 도감 완성!', [`${CATEGORY_NAMES[r.cat] || r.cat} 도감을 모두 채웠어요!`, `보상 +${r.money}🪙`]);
    }
  },

  /** 계절 도전 (저장 칸 'weekly'): 없으면 만듦 */
  seasonChallenges() { return (this.weekly ||= new SeasonChallenges()); },

  /** 계절 도전 뽑기에 쓰는 해금 상태 */
  _challengeCtx() {
    const q = this.quests;
    return { level: q.level, has: (id) => !!q.claimed[id] || (q.progress[id] || 0) > 0 };
  },

  /**
   * 게임 이벤트 → 퀘스트 진행 + 계절 도전 + 행동 경험치 + 마을 별점
   * key: 수확 작물 id · 잡은 아이템 id · 미니게임 id (mgstars) 처럼 이벤트를 자세히
   */
  onEvent(event, amount = 1, key = null) {
    const done = this.quests.report(event, amount);
    // 보유 금액 퀘스트도 같이 살핌 (완료 알림이 빠지지 않게)
    if (event !== 'money') done.push(...this.quests.report('money', this.economy.money));
    for (const q of done) {
      if (AUTO_CLAIM.has(q.id)) this.ui.toast(`✅ ${q.title} 완료! +${q.reward.money}🪙`);
      else this.ui.toast(`✅ ${q.title} 완료! ${touchUI() ? '목표 칩을 눌러 보상 받기' : 'Q 또는 목표 칩에서 보상 받기'}`);
    }
    // 계절 도전
    const W = this.seasonChallenges();
    if (!W.key && this.world) W.sync(this.world.day, this._challengeCtx());
    const wdone = W.report(event, amount, { night: (this.world?.nightK || 0) > NIGHT_K, key: typeof key === 'string' ? key : null });
    for (const i of wdone) {
      const c = W.view()[i];
      if (c) this.ui.toast(`🗓️ 계절 도전 완료! ${c.title} — ${touchUI() ? '목표 칩이나 ☰ → 퀘스트에서' : 'Q 퀘스트 창에서'} 보상 받기`, { type: 'reward', key: 'wk' });
    }
    // 완료 소리: 잠깐 뒤 한 번만 (몰아서 끝나도 1.5초에 한 번)
    if (done.length || wdone.length) {
      const now = Date.now();
      if (this._winAt === undefined || now - this._winAt > 1500) { this._winAt = now; setTimeout(() => this.audio.play('win'), 350); }
    }
    this._actionXp(event, amount, key);
    // 첫걸음 편지
    if (event === 'harvest' && this.quests.progress.harvest5 > 0) this._letter('harvest1');
    if (event === 'built') this._letter('build1');
    if (event === 'koatall' && amount >= 6) this._letter('koat6');
    if (RATING_EVENTS.has(event)) this.checkTown();
  },

  /** 행동 경험치: 미니게임은 게임마다 하루 3판까지, 자동 진행 중엔 반 */
  _actionXp(event, amount, key) {
    let xp = actionXp(event, amount, key);
    if (event === 'harvest') this._lastHarvestXp = xp;
    if (event === 'giant') xp = this._lastHarvestXp || 0; // 대왕 작물: 그 수확 경험치를 한 번 더 (×2)
    if (event === 'mgstars' && xp > 0) {
      const f = this.flags, day = this.world?.day || 0, id = String(key || 'mg');
      const m = (f.mgXp && f.mgXp.day === day) ? f.mgXp : (f.mgXp = { day, n: {} });
      if ((m.n[id] || 0) >= MG_DAILY) xp = 0; else m.n[id] = (m.n[id] || 0) + 1;
    }
    if (xp > 0 && this.autoplay?.on) xp = Math.max(1, Math.floor(xp / 2));
    if (xp > 0) this.addXp(xp);
  },

  /**
   * 플레이어 경험치 더하기 (퀘스트 밖의 모든 경험치): 레벨 선물 지급, '+N XP' 작은 표시
   * 레벨업 축하(리본·만세·해금 카드)는 HUD 가 레벨 변화를 보고 함
   */
  addXp(n, { float = true } = {}) {
    const r = this.quests.gainXp(n);
    if (float && n > 0) this.ui.xpFloat?.(Math.round(n));
    if (r.levelUp) { this.levelGifts(r.from, r.to); this.saveTimer = Math.max(this.saveTimer || 0, 9); }
    return r;
  },

  /** (from, to] 레벨의 선물을 한 번씩 (flags.lvGift 에 준 레벨까지 기록). quiet: 알림 없이 */
  levelGifts(from, to, { quiet = false } = {}) {
    const f = this.flags;
    const start = Math.max(from, typeof f.lvGift === 'number' ? f.lvGift : 0);
    const got = [];
    for (let lv = start + 1; lv <= to; lv++) {
      const G = LEVEL_GIFTS[lv];
      if (!G) continue;
      for (const [id, n] of Object.entries(G.decor || {})) if (giveDecor(this, id, n)) got.push(`${DECOR_BY_ID[id].icon} ${DECOR_BY_ID[id].name}`);
      const cid = giftCostume(lv);
      if (cid && giveCostume(this, cid)) got.push(`${COSTUME[cid].icon} ${COSTUME[cid].name}`);
      if (G.title && this.npcs?.grantTitle) this.npcs.grantTitle(G.title);
    }
    if (to > (f.lvGift || 0)) f.lvGift = to;
    if (got.length && !quiet) this.ui.toast(`🎁 레벨 선물이 꾸미기 보관함·옷장에 들어왔어요`, { type: 'reward', key: 'lvgift' });
    return got;
  },

  /** 보상 받기. quiet: 코인 알림 생략 (자동 받기는 완료 알림에 이미 금액이 있음). 이미 받았으면 null */
  claimQuest(id, { quiet = false } = {}) {
    const r = this.quests.claim(id);
    if (!r) return null;
    this.economy.earn(r.reward.money);
    // 레벨업 축하(리본·팡파르·만세·해금 카드)는 HUD 가 레벨 변화를 보고 한 번만 함 → 여기서는 코인 소리만
    const hudCheers = typeof this.ui?.celebrateLevel === 'function';
    this.audio.play(r.levelUp && !hudCheers ? 'levelup' : 'coin');
    if (!quiet) this.ui.toast(`🎁 +${r.reward.money} 코인, +${r.reward.xp} XP`);
    if (r.levelUp) this.levelGifts(r.from, r.level);
    if (r.levelUp && !hudCheers) {
      this.player.unico.playAction('cheer', 2);
      this.ui.toast(`⬆️ 레벨 ${r.level} 달성! 장터에서 새 씨앗을 확인하세요`); // 축하 카드가 없을 때만 글로 알림
    }
    if (this.flags?.pinQuest === id) delete this.flags.pinQuest;
    this.guide?.onClaimed?.(id);
    this.onEvent('money', this.economy.money);
    this.saveTimer = Math.max(this.saveTimer, 9); // 보상은 1초 안에 저장 (연속으로 받아도 한 번만 직렬화)
    return r;
  },

  /** 계절 도전 보상 받기 (i: 0~2) → 보상 또는 null */
  claimChallenge(i, { quiet = false } = {}) {
    const r = this.seasonChallenges().claim(i);
    if (!r) return null;
    this._grantChallenge(r, { quiet });
    this.audio.play('coin');
    this.saveTimer = Math.max(this.saveTimer || 0, 9);
    return r;
  },

  /** 계절 도전 보상 넣기: 코인·경험치·소모품, 셋 다 하면 꾸미기 + 도전 도장 (4개마다 귀한 선물) */
  _grantChallenge(r, { quiet = false } = {}) {
    this.economy.earn(r.money);
    this.addXp(r.xp, { float: false });
    const it = r.item;
    if (it?.seed) this.economy.addSeeds(it.seed, it.n); else if (it?.id) this.economy.addItem(it.id, it.n);
    const lines = [`+${r.money}🪙 · +${r.xp} XP${it ? ` · ${it.icon} ${it.name}` : ''}`];
    if (r.bonus) {
      if (giveDecor(this, r.bonus.decor, 1)) lines.push(`🗓️ 세 도전 모두 완료! ${DECOR_BY_ID[r.bonus.decor].icon} ${DECOR_BY_ID[r.bonus.decor].name} (꾸미기 보관함) · 도전 도장 ${r.bonus.stamp}개`);
      const rare = r.bonus.rare;
      if (rare?.costume && giveCostume(this, rare.costume)) lines.push(`✨ 도장 ${r.bonus.stamp}개 기념: ${COSTUME[rare.costume].icon} ${COSTUME[rare.costume].name}`);
      else if (rare) { const d = rare.decor && DECOR_BY_ID[rare.decor] ? rare.decor : 'well'; if (giveDecor(this, d, 1)) lines.push(`✨ 도장 ${r.bonus.stamp}개 기념: ${DECOR_BY_ID[d].icon} ${DECOR_BY_ID[d].name}`); }
      if (!quiet) reward(this, 3, { label: '🗓️' });
    } else if (!quiet) reward(this, 2, { sound: null });
    if (!quiet) this.ui.toast(`🗓️ ${r.title} 보상 ${lines.join(' · ')}`, { type: 'reward' });
    return lines;
  },

  /** 새 날 (길잡이가 날이 바뀐 것을 보고 부름): 계절 도전 기간 확인 + 마을 별점 */
  progressNewDay(day) {
    this._syncChallenges(day);
    this.checkTown();
  },

  /** 계절 도전 기간 맞추기: 바뀌면 지난 기간의 안 받은 보상을 자동으로 */
  _syncChallenges(day, { quiet = false } = {}) {
    const W = this.seasonChallenges();
    const left = W.sync(day, this._challengeCtx());
    if (!left) return;
    let n = 0;
    for (const r of left.rewards) { this._grantChallenge(r, { quiet: true }); n++; }
    if (n) this.ui.toast(`🗓️ 지난 계절 도전 보상 ${n}개를 대신 받아 두었어요`, { type: 'reward', key: 'wk' });
    if (!quiet) this.saveTimer = Math.max(this.saveTimer || 0, 9);
  },

  /** 마을 별점 셈 → 새 별이면 보상·편지·카드 (불러온 직후 처음엔 조용히 맞춤) */
  checkTown({ silent = false } = {}) {
    if (!this.flags) return null;
    const R = rating(snapshot(this));
    this.townRating = R;
    const up = latchStar(this.flags, R.stars);
    if (up && !silent) {
      for (let s = up.from + 1; s <= up.to; s++) this._starReward(s);
      (this.flags.starCard ||= []).push(up.to);
      this.saveTimer = Math.max(this.saveTimer || 0, 9);
    }
    this._paintTown();
    return R;
  },

  /** 별 하나의 보상 (한 번만) */
  _starReward(s) {
    const rw = STAR_REWARDS[s];
    sendLetter(this, `star${s}`);
    if (rw?.decor) for (const [id, n] of Object.entries(rw.decor)) giveDecor(this, id, n);
    if (rw?.costume) {
      const id = rw.costume.find((c) => COSTUME[c] && !this.costume?.has(c));
      if (id) { giveCostume(this, id); this.flags.starGift3 = `${COSTUME[id].icon} ${COSTUME[id].name}`; }
      else this.economy.earn(1000); // 모두 가졌으면 코인으로
    }
    if (rw?.title && this.npcs?.grantTitle) this.npcs.grantTitle(rw.title);
    if (s >= 4) this.world?.addStatue?.();
  },

  /** 표지판 별·깃발·동상 (별 수에 맞춤, 값이 바뀔 때만 다시 칠함) */
  _paintTown() {
    const s = this.flags?.townStar || 0, W = this.world;
    if (!W || this._paintedStar === s) return;
    this._paintedStar = s;
    if (s >= 1) W.townSign?.repaint?.(`🦄 유니코 마을 ${starLine(s)}`, '← 스마트팜 · 목장 →');
    W.setBunting?.(s >= 1);
    if (s >= 4) W.addStatue?.();
  },

  /** 별 다섯: 마을 사람들이 차례로 축하 (컷신) */
  townFinale() {
    const list = this.npcs?.list || [];
    const lines = { guide: '별 다섯 개 마을이야! 다 네 덕분이야 🎉', merchant: '장터 손님이 두 배로 늘었어요. 고마워요!', granny: '이 늙은 곰도 마을이 이렇게 북적이니 기쁘구나', researcher: '데이터로 봐도 최고의 마을이에요!', kid: '이장님! 이장님! 나랑 놀아 줘!', fisher: '오늘은 축하 기념으로 큰 놈을 낚아야겠다냥' };
    const steps = [{ cam: [[6, 14, 18], [0, 0, -2], 2.2] }];
    for (const e of list) {
      const t = lines[e.id];
      if (!t || !e.u) continue;
      steps.push({ face: e.u, with: this.player.unico, emote: 'cheer' }, { say: [{ speaker: e.u, name: e.name, color: '#6dbb4f', emote: 'cheer', text: t }] });
    }
    steps.push({ run: () => { this.player.unico?.playAction?.('cheer', 2); } });
    return this.cinema?.play ? this.cinema.play(steps) : Promise.resolve();
  },

  /** 첫걸음 편지 보내기 + 알림 (한 번만) */
  _letter(id) {
    if (sendLetter(this, id)) this.ui.toast(`📬 편지가 왔어요! ${touchUI() ? '☰ → 📜 퀘스트' : '📜 퀘스트(Q)'}에서 읽어 보세요`, { type: 'info', key: 'mail' });
  },

  /**
   * 불러온 뒤 (game_save loadSections 끝): 별은 조용히 맞추고, 지난 레벨 선물은 보관함으로, 계절 도전 기간 맞춤
   * 처음 시작한 농장은 인트로가 끝난 뒤 '유니코 마을 살리기' 편지
   */
  progressAfterLoad() {
    const q = this.quests;
    if (typeof this.flags.lvGift !== 'number') this.levelGifts(5, q.level, { quiet: true }); // 예전 저장: Lv.6 위 선물을 조용히
    this.checkTown({ silent: true });
    this._syncChallenges(this.world.day, { quiet: true });
  },

  /** 따라갈 목표가 없을 때 목표 칩: 계절 도전 → 다음 별 (없으면 null) */
  fallbackGoal() {
    const W = this.seasonChallenges();
    if (!W.key && this.world) W.sync(this.world.day, this._challengeCtx());
    const t = W.tracked();
    const d = this.world ? daysLeft(this.world.day) : 0;
    if (t) {
      return { id: `wk:${t.i}`, kind: 'weekly', tid: t.id, i: t.i, title: t.title, desc: `🗓️ 이번 계절 도전 · ${d ? `D-${d}` : '오늘 마감'}`, goal: t.goal, count: t.count, complete: t.complete, reward: null };
    }
    const R = this.townRating || this.checkTown();
    const n = R?.next?.[0];
    if (!n) return null;
    return { id: `star:${n.key}`, kind: 'star', part: n.key, title: `⭐ 다음 별: ${n.short}`, desc: `${n.label} · 마을 ${starLine(R.stars)}`, goal: n.need, count: n.have, complete: false, reward: null };
  },
};

