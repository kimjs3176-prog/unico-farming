// 퀘스트 창 (+ 미니게임 최고 기록)
import { h } from '../dom.js';
import { recordsHtml } from '../minigame_frame.js';

/** 퀘스트 창 메서드 (UI.prototype 에 합쳐짐) */
export const QuestsPanel = {
  openQuests() {
    const g = this.game;
    const p = this.openPanel('📜 퀘스트');
    const rec = h('div', 'mg-records', `<h3>🎮 미니게임 최고 기록</h3><div class="rows">${recordsHtml()}</div>`);
    const render = () => {
      p.querySelectorAll('.qrows').forEach((e) => e.remove());
      const rows = h('div', 'rows qrows');
      for (const q of g.quests.active()) {
        const r = h('div', `row quest${q.complete ? ' done' : ''}`, `<div style="flex:1"><div class="nm">${q.title}</div><div class="desc">${q.desc}</div><div class="bar"><i style="width:${Math.round((q.count / q.goal) * 100)}%"></i></div></div><span class="qty">${q.count}/${q.goal}</span>`);
        const b = h('button', q.complete ? 'gold' : 'ghost', q.complete ? `보상 +${q.reward.money}🪙` : `+${q.reward.money}🪙 ${q.reward.xp}XP`);
        b.disabled = !q.complete;
        b.onclick = () => { g.claimQuest(q.id); render(); };
        r.append(b);
        rows.append(r);
      }
      if (!rows.children.length) rows.append(h('div', 'row', '🎉 모든 퀘스트를 완료했어요!'));
      p.insertBefore(rows, rec);
    };
    p.append(rec);
    render();
  },
};
