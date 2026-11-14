// 목표 안내 칩
import { h } from './dom.js';

/** 목표 칩 메서드 (UI.prototype 에 합쳐짐) */
export const ObjectiveUI = {
  /** 목표 안내 칩 */
  setObjective(q, dist, ang) {
    if (!this.objective) {
      this.objective = h('div', 'objective');
      this.objective.onclick = () => this.openQuests();
      this.root.append(this.objective);
    }
    if (!q) { this.objective.style.display = 'none'; return; }
    this.objective.style.display = '';
    this.objective.classList.toggle('done', q.complete);
    // 구조는 퀘스트·진행이 바뀔 때만 다시 그리고, 걸을 때 바뀌는 거리는 글자 하나만 바꿈
    const hasDist = dist !== null && !q.complete;
    const key = `${q.id}|${q.complete}|${q.count}|${hasDist}`;
    if (key !== this.objKey) {
      this.objKey = key;
      this._objDeg = null; // 새로 그린 화살표에 방향 다시 적용
      this._objM = null;
      this.objective.innerHTML = `<span class="ic">${q.complete ? '🎁' : '🎯'}</span><div class="tt">${q.complete ? '보상 받기: ' : ''}${q.title}<small>${q.complete ? '눌러서 퀘스트 창 열기 (Q)' : q.desc}<span class="dist"></span></small><div class="bar"><i style="width:${Math.round((q.count / q.goal) * 100)}%"></i></div></div>${hasDist ? '<span class="dir">▲</span>' : q.complete ? '<span class="dir">✓</span>' : ''}`;
      this._objDist = this.objective.querySelector('.dist');
      this._objDir = this.objective.querySelector('.dir');
    }
    const m = hasDist ? Math.round(dist) : null;
    if (m !== this._objM) { this._objM = m; this._objDist.textContent = m === null ? '' : ` · ${m}m`; }
    const deg = Math.round(ang / 3) * 3; // 3도 단위로만 갱신
    if (this._objDir && !q.complete && deg !== this._objDeg) { this._objDeg = deg; this._objDir.style.transform = `rotate(${deg}deg)`; }
  },
};
