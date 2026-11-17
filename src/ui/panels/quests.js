// 퀘스트 창: 받을 보상 → 지금 장 → 다음 장(잠김) → 업적·장기 목표(접힘) (+ 미니게임 최고 기록)
import { h } from '../dom.js';
import { recordsHtml } from '../minigame_frame.js';
import { touchUI } from '../../game/input.js';
import { QUESTS } from '../../game/sim/quests.js';
import { CHAPTERS, QMETA, currentChapter, chapterProgress } from '../../game/sim/chapters.js';

const BY_ID = Object.fromEntries(QUESTS.map((q) => [q.id, q]));

/** 퀘스트 창 메서드 (UI.prototype 에 합쳐짐) */
export const QuestsPanel = {
  openQuests() {
    const g = this.game;
    const p = this.openPanel('📜 퀘스트');
    const rec = h('div', 'mg-records', `<h3>🎮 미니게임 최고 기록</h3><div class="rows">${recordsHtml()}</div>`);
    let openAch = false, openDone = false; // 업적·완료 칸 펼침 (다시 그려도 유지)
    const fold = (cls, title, n, rows, get, set) => {
      const d = h('details', cls);
      d.open = get();
      d.ontoggle = () => set(d.open);
      d.append(h('summary', '', `${title} <span class="qprog">${n}</span>`));
      d.append(rows);
      return d;
    };
    const row = (base, { claimed = false, peers = false } = {}) => {
      const Q = g.quests, q = { ...base, count: Math.min(base.goal, Q.progress[base.id] || 0), complete: Q.isComplete(base) };
      const desc = (touchUI() && q.descTouch) || q.desc;
      const pinned = g.flags.pinQuest === q.id;
      const r = h('div', `row quest${claimed ? ' claimed' : q.complete ? ' done' : ''}${pinned ? ' pinned' : ''}`,
        `<div class="qmain"><div class="nm">${claimed ? '✅ ' : ''}${q.title}${peers ? ' <span class="qtag">친구와 함께</span>' : ''}</div>${claimed ? '' : `<div class="desc">${desc}</div><div class="bar"><i style="width:${Math.round((q.count / q.goal) * 100)}%"></i></div>`}</div>${claimed ? '' : `<span class="qty">${q.count}/${q.goal}</span>`}`);
      if (claimed) return r;
      if (!q.complete) {
        const pin = h('button', `ghost qpin${pinned ? ' on' : ''}`, pinned ? '📌 추적 중' : '추적');
        pin.title = pinned ? '추적 그만하기' : '이 퀘스트를 목표 칩에 띄우기';
        pin.setAttribute('aria-label', pin.title);
        pin.onclick = () => { if (pinned) delete g.flags.pinQuest; else g.flags.pinQuest = q.id; g.saveTimer = Math.max(g.saveTimer || 0, 9); render(); };
        r.append(pin);
      }
      const b = h('button', q.complete ? 'gold' : 'ghost', q.complete ? `받기 +${q.reward.money}🪙` : `+${q.reward.money}🪙 ${q.reward.xp}XP`);
      b.disabled = !q.complete;
      b.onclick = () => { g.claimQuest(q.id); render(); };
      r.append(b);
      return r;
    };
    const render = () => {
      p.querySelectorAll('.qrows').forEach((e) => e.remove());
      const Q = g.quests, wrap = h('div', 'qrows');
      // 받을 보상 (HUD 의 빨간 수와 같은 목록)
      const ready = QUESTS.filter((x) => !Q.claimed[x.id] && Q.isComplete(x));
      if (ready.length) {
        wrap.append(h('h3', 'qhead gift', `🎁 받을 보상 ${ready.length}`));
        const rows = h('div', 'rows');
        for (const x of ready) rows.append(row(x));
        wrap.append(rows);
      }
      const cur = currentChapter(Q);
      if (cur) {
        const pr = chapterProgress(Q, cur);
        wrap.append(h('h3', 'qhead', `📖 ${cur.n}장 ${cur.title} <span class="qprog">${pr.done}/${pr.total}</span>`));
        const rows = h('div', 'rows'), done = h('div', 'rows');
        for (const id of cur.ids) {
          const x = BY_ID[id], m = QMETA[id];
          if (!x || m.wait || m.peers) continue;
          if (!Q.claimed[id] && Q.isComplete(x)) continue; // 위 받을 보상 칸에
          if (Q.claimed[id]) done.append(row(x, { claimed: true }));
          else rows.append(row(x));
        }
        wrap.append(rows);
        // 받은 퀘스트는 한 줄로 접음
        if (done.children.length) wrap.append(fold('qdone', '✅ 완료', done.children.length, done, () => openDone, (v) => { openDone = v; }));
        const next = CHAPTERS.find((c) => c.n === cur.n + 1);
        if (next) wrap.append(h('div', 'row quest qlock', `<span class="nm">🔒 다음 장: ${next.n}장 ${next.title}</span><small>${cur.n}장을 마치면 열려요 (${pr.done}/${pr.total})</small>`));
      } else wrap.append(h('h3', 'qhead', '📖 모든 장을 마쳤어요! 🎉'));
      // 업적·장기 목표: 기다리는 목표·친구 목표·끝낸 장의 남은 것·뒷장인데 이미 시작한 것 (예전 저장도 고정할 수 있게)
      const ach = QUESTS.filter((x) => {
        if (Q.claimed[x.id] || Q.isComplete(x)) return false;
        const m = QMETA[x.id];
        return m.wait || m.peers || !cur || m.ch < cur.n || (m.ch > cur.n && (Q.progress[x.id] || 0) > 0);
      });
      if (ach.length) {
        const rows = h('div', 'rows');
        for (const x of ach) rows.append(row(x, { peers: !!QMETA[x.id].peers }));
        wrap.append(fold('qach', '🏅 업적·장기 목표', ach.length, rows, () => openAch, (v) => { openAch = v; }));
      }
      p.insertBefore(wrap, rec);
    };
    p.append(rec);
    render();
  },
};
