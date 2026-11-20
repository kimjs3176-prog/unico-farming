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

/** 이 목표 보상을 줄까: 기여했고, 아직 받지 않은 열쇠 */
export function shouldReward(flags, m) {
  return !!m && typeof m.key === 'string' && m.mine > 0 && !(Array.isArray(flags?.coopGot) && flags.coopGot.includes(m.key));
}

export class CoopGoal {
  constructor(game) {
    this.game = game;
    this.goal = null;
    this.el = null;
  }

  /** 접속 표시 바로 아래에 끼움 (처음 목표를 받을 때) */
  mount() {
    if (this.el || typeof document === 'undefined') return this.el;
    const ui = this.game.ui, host = ui?.online?.parentNode;
    if (!host) return null;
    const el = document.createElement('div');
    el.className = 'coop-goal';
    el.setAttribute('role', 'status');
    el.innerHTML = '<span class="cg-t"></span><span class="cg-bar" aria-hidden="true"><i></i></span>';
    el.style.display = 'none';
    ui.online.after(el);
    this.el = el;
    return el;
  }

  /** 서버가 알려 준 목표 (null: 오프라인 → 숨김) */
  set(g) {
    this.goal = g && Number.isFinite(g.target) && g.target > 0 ? g : null;
    const el = this.mount();
    if (!el) return;
    const show = !!this.goal && !!this.game.net?.connected;
    el.style.display = show ? '' : 'none';
    if (!show) return;
    const p = Math.max(0, Math.min(1, this.goal.progress / this.goal.target));
    const mine = this.game.net?.myShare?.(this.goal.key) || 0;
    el.querySelector('.cg-t').textContent = goalLine(this.goal);
    el.querySelector('.cg-bar i').style.width = `${Math.round(p * 100)}%`;
    el.classList.toggle('all-done', !!this.goal.done);
    el.title = `방 사람들과 함께 작물을 수확하거나 주문을 납품하면 채워져요 (오늘 ${this.goal.seq}/${this.goal.of || 3}번째 목표)`
      + `\n내가 보탠 몫 ${mine}/${this.goal.share || '?'} · 한 사람은 목표의 1/4 까지 채울 수 있어요`;
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
    if (!shouldReward(g.flags, m)) { g.ui?.toast?.(`🎆 방 사람들이 함께 수확 목표(${m?.target ?? ''})를 채웠어요!`, { type: 'info', key: 'coop' }); return false; }
    const f = (g.flags ||= {});
    f.coopGot = [...(Array.isArray(f.coopGot) ? f.coopGot : []), m.key].slice(-KEEP_KEYS);
    g.economy?.earn?.(COOP_REWARD.coins);
    g.addXp?.(COOP_REWARD.xp);
    let titleNew = false;
    const own = (f.titles = Array.isArray(f.titles) ? f.titles : []);
    if (!own.includes(COOP_REWARD.title)) { own.push(COOP_REWARD.title); titleNew = true; } // 칭호는 받기만 (지금 단 칭호는 그대로)
    g.ui?.toast?.(`🎆 함께 수확 목표 달성! 보탠 ${m.mine}개 덕분이에요 +${COOP_REWARD.coins}🪙${titleNew ? ` · 칭호 '${COOP_REWARD.title}'` : ''}`, { type: 'reward', key: 'coop' });
    g.saveTimer = Math.max(g.saveTimer || 0, 9); // 곧 저장 (다시 받지 않게)
    return true;
  }

  /** 내 유니코 둘레 불꽃놀이 (품질에 맞춰: 낮음은 작은 한 번) */
  burst() {
    const g = this.game, p = g.player?.position;
    if (!p || !g.fx?.fireworks) return;
    g.fx.fireworks(p.x, p.z, g.quality?.level);
  }
}
