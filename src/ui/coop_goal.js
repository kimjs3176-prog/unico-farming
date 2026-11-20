// 방 공동 목표 '함께 수확': 접속 표시(👥) 아래 한 줄 + 얇은 막대, 다 채우면 불꽃놀이와 보상 (기여한 사람만, 목표마다 한 번)
// 서버 규칙은 server/goal.js, 보내기·받기는 net.js (오프라인이면 숨김)

/** 보상: 코인 + 경험치 + 처음 한 번 칭호 */
export const COOP_REWARD = { coins: 200, xp: 60, title: '함께 짓는 이웃' };
/** 받은 목표 열쇠를 이만큼만 기억 (하루 3개 × 며칠) */
const KEEP_KEYS = 12;

/** 목표 한 줄 글 (순수 → 시험 가능) */
export function goalLine(g) {
  if (!g) return '';
  if (g.done && g.seq >= (g.of || 3)) return `🌾 오늘 함께 수확 ${g.of || 3}개 모두 달성!`;
  return `🌾 함께 수확 ${g.progress.toLocaleString()}/${g.target.toLocaleString()}`;
}

/** 다 채운 순간 보여 주는 시간 (ms): 막대를 가득 채운 채 '달성!' → 그 뒤 다음 목표로 */
export const CELEBRATE_MS = 3200;

/** 달성 알림 글 (괄호·조사가 줄바꿈에 갈라지지 않게 숫자 뒤 '개') */
export function doneToast(m, mine = 0, reward = COOP_REWARD, titleNew = false) {
  const n = Number(m?.target) > 0 ? ` ${Number(m.target).toLocaleString()}개` : '';
  if (!(mine > 0)) return `🎆 방 사람들이 함께 수확 목표${n}를 채웠어요!`;
  return `🎆 함께 수확 달성! 내가 보탠 ${mine}개 덕분이에요 · +${reward.coins}🪙 +${reward.xp} XP${titleNew ? ` · 새 칭호 '${reward.title}'` : ''}`;
}

/** 이 목표 보상을 줄까: 기여했고, 아직 받지 않은 열쇠 */
export function shouldReward(flags, m) {
  return !!m && typeof m.key === 'string' && m.mine > 0 && !(Array.isArray(flags?.coopGot) && flags.coopGot.includes(m.key));
}

export class CoopGoal {
  constructor(game) {
    this.game = game;
    this.goal = null;
    this.el = null;
    this.party = null; // 달성 화면 { until, line }
  }

  /** 접속 표시 바로 아래에 끼움 (처음 목표를 받을 때) — 접속 수(👥)도 이 알약 안에 함께 */
  mount() {
    if (this.el || typeof document === 'undefined') return this.el;
    const ui = this.game.ui, host = ui?.online?.parentNode;
    if (!host) return null;
    const el = document.createElement('div');
    el.className = 'coop-goal';
    el.setAttribute('role', 'status');
    el.innerHTML = '<span class="cg-ic" aria-hidden="true">🌾</span><span class="cg-main"><span class="cg-top"><span class="cg-t"></span><b class="cg-n"></b></span>'
      + '<span class="cg-bar" aria-hidden="true"><i></i></span></span><span class="cg-who"></span>';
    el.style.display = 'none';
    ui.online.after(el);
    this.el = el;
    return el;
  }

  /** 서버가 알려 준 목표 (null: 오프라인 → 숨김). 달성 화면 중이면 끝난 뒤에 그림 */
  set(g) {
    this.goal = g && Number.isFinite(g.target) && g.target > 0 ? g : null;
    const el = this.mount();
    if (!el) return;
    const show = !!this.goal && !!this.game.net?.connected;
    el.style.display = show ? '' : 'none';
    if (!show) { this.party = null; el.classList.remove('party'); return; }
    if (this.party && Date.now() < this.party.until) return; // 달성 화면을 잠시 유지 (다음 목표는 뒤에)
    this.party = null;
    el.classList.remove('party');
    const G = this.goal, p = Math.max(0, Math.min(1, G.progress / G.target));
    const mine = this.game.net?.myShare?.(G.key) || 0;
    const allDone = G.done && G.seq >= (G.of || 3);
    el.querySelector('.cg-t').textContent = allDone ? `오늘 ${G.of || 3}개 모두 달성!` : '함께 수확';
    el.querySelector('.cg-n').textContent = allDone ? '' : `${G.progress.toLocaleString()}/${G.target.toLocaleString()}`;
    el.querySelector('.cg-bar i').style.width = `${Math.round(p * 100)}%`;
    el.classList.toggle('all-done', !!G.done);
    el.setAttribute('aria-label', goalLine(G).replace('🌾 ', ''));
    el.title = `방 사람들과 함께 작물을 수확하거나 주문을 납품하면 채워져요 (오늘 ${G.seq}/${G.of || 3}번째 목표)`
      + `\n내가 보탠 몫 ${mine}/${G.share || '?'} · 혼자서는 다 채울 수 없어요`;
    this.room();
  }

  /** 접속 수 (👥 N): 알약 오른쪽 끝 (net 이 사람 수가 바뀔 때 부름) */
  room(n = this.game.net?.count) {
    const w = this.el?.querySelector('.cg-who');
    if (!w) return;
    const txt = n > 1 ? `👥 ${n}` : '';
    if (w.textContent !== txt) w.textContent = txt;
    this.el.classList.toggle('with-room', !!txt);
  }

  /** 달성 화면: 막대 가득 + 금빛 반짝임 + '달성!' (CELEBRATE_MS 뒤 다음 목표) */
  celebrate(text) {
    const el = this.el;
    if (!el || el.style.display === 'none') return;
    this.party = { until: Date.now() + CELEBRATE_MS };
    el.classList.add('party', 'all-done');
    el.querySelector('.cg-t').textContent = '함께 수확 달성!';
    el.querySelector('.cg-n').textContent = text;
    el.querySelector('.cg-bar i').style.width = '100%';
    el.setAttribute('aria-label', `함께 수확 달성! ${text}`);
    clearTimeout(this._partyT);
    this._partyT = setTimeout(() => { this.party = null; this.set(this.goal); }, CELEBRATE_MS + 30);
  }

  /** 다 채움: 모두 불꽃놀이, 기여한 사람만 보상 (목표마다 한 번, 저장) */
  done(m) {
    const g = this.game;
    if (!m || typeof m.key !== 'string') return false;
    const seen = (this._seen ||= new Set());
    if (seen.has(m.key) || (Array.isArray(g.flags?.coopGot) && g.flags.coopGot.includes(m.key))) return false; // 같은 목표 알림이 또 와도 조용히
    seen.add(m.key);
    this.burst();
    g.audio?.play?.('fest');
    if (!shouldReward(g.flags, m)) {
      this.celebrate(m.target ? `${Number(m.target).toLocaleString()}개` : '');
      g.ui?.toast?.(doneToast(m, 0), { type: 'reward', key: 'coop' });
      return false;
    }
    const f = (g.flags ||= {});
    f.coopGot = [...(Array.isArray(f.coopGot) ? f.coopGot : []), m.key].slice(-KEEP_KEYS);
    // 코인은 알약에서 지갑으로 날아가며 숫자가 굴러감 (없으면 바로)
    g.economy?.earn?.(COOP_REWARD.coins);
    const from = this.el?.getBoundingClientRect?.();
    if (g.ui?.flyToCoin && from?.width) g.ui.flyToCoin(COOP_REWARD.coins, from);
    g.addXp?.(COOP_REWARD.xp, { float: false }); // 경험치는 알림·알약에 (배지 옆 작은 글은 코인과 겹침)
    let titleNew = false;
    const own = (f.titles = Array.isArray(f.titles) ? f.titles : []);
    // 칭호는 받기만 (지금 단 칭호는 그대로): 맨 앞에 넣어 '마지막 칭호'로 저절로 달리지 않게
    if (!own.includes(COOP_REWARD.title)) { own.unshift(COOP_REWARD.title); titleNew = true; }
    this.celebrate(`+${COOP_REWARD.coins}🪙 +${COOP_REWARD.xp} XP`);
    g.reward?.(3, { sound: null }); // 만세 (소리는 위의 축제 소리)
    g.ui?.toast?.(doneToast(m, m.mine, COOP_REWARD, titleNew), { type: 'reward', key: 'coop' });
    g.saveTimer = Math.max(g.saveTimer || 0, 9); // 곧 저장 (다시 받지 않게)
    return true;
  }

  /** 내 유니코 둘레 불꽃놀이 (품질에 맞춰: 낮음은 작은 한 발) */
  burst() {
    const g = this.game, p = g.player?.position;
    if (!p || !g.fx?.fireworks) return;
    g.fx.fireworks(p.x, p.z, g.quality?.level);
  }
}
