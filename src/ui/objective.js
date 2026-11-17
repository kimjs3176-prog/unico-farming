// 목표 안내 칩
import { h } from './dom.js';
import { touchUI } from '../game/input.js';
import { fmtEta } from '../game/guide.js';
import { josa } from '../game/sim/josa.js';

const PEEK_MS = 7000;
/** 휴대폰 한 줄 칩인가 (objective.css 의 모바일 조건과 같음) */
let compactMq = null;
const compact = () => typeof matchMedia !== 'undefined' && (compactMq ||= matchMedia('(max-width: 600px), (max-height: 500px) and (pointer: coarse)')).matches;

/** 목표 칩 메서드 (UI.prototype 에 합쳐짐) */
export const ObjectiveUI = {
  /** 목표 안내 칩. extra: { eta, dry, ready, pet } (밭 작물 남은 시간) */
  setObjective(q, dist, ang, extra = null) {
    if (!this.objective) {
      this.objective = h('div', 'objective');
      this.objective.onclick = () => this._objTap();
      this.root.append(this.objective);
    }
    this._objQ = q;
    if (!q) { this.objective.style.display = 'none'; this._objPeek(false); return; }
    this.objective.style.display = '';
    this.objective.classList.toggle('done', q.complete);
    // 휴대폰: 새 퀘스트·완료가 되면 설명 줄을 잠깐 펼쳐 보여 줌
    const pk = `${q.id}|${q.complete}`;
    if (pk !== this._objPk) { this._objPk = pk; if (compact()) this._objPeek(true); }
    // 구조는 퀘스트·진행이 바뀔 때만 다시 그리고, 걸을 때 바뀌는 거리·남은 시간은 글자만 바꿈
    const hasDist = dist !== null && !q.complete;
    const key = `${q.id}|${q.complete}|${q.count}|${hasDist}`;
    if (key !== this.objKey) {
      this.objKey = key;
      this._objDeg = null; // 새로 그린 화살표에 방향 다시 적용
      this._objM = null;
      this._objEta = null;
      this._objSub = null;
      const desc = (touchUI() && q.descTouch) || q.desc;
      const sub = q.complete ? `눌러서 보상 받기${touchUI() ? '' : ' <span class="hint-kbd">(Q: 퀘스트 창)</span>'}` : desc;
      const side = q.complete ? '<span class="claim">🎁 받기</span>' : hasDist ? '<span class="dir">▲</span>' : '';
      this.objective.innerHTML = `<span class="ic">${q.complete ? '🎁' : '🎯'}</span><div class="tt"><span class="nm">${q.complete ? '보상 받기: ' : ''}${q.title}</span><span class="eta"></span><small>${sub}<span class="dist"></span><span class="wait"></span></small><div class="bar"><i style="width:${Math.round((q.count / q.goal) * 100)}%"></i></div></div>${side}`;
      this._objDist = this.objective.querySelector('.dist');
      this._objDir = this.objective.querySelector('.dir');
      this._objEtaEl = this.objective.querySelector('.eta');
      this._objWait = this.objective.querySelector('.wait');
    }
    const m = hasDist ? Math.round(dist) : null;
    if (m !== this._objM) { this._objM = m; this._objDist.textContent = m === null ? '' : ` · ${m}m`; }
    const deg = Math.round(ang / 3) * 3; // 3도 단위로만 갱신
    if (this._objDir && !q.complete && deg !== this._objDeg) { this._objDeg = deg; this._objDir.style.transform = `rotate(${deg}deg)`; }
    // 남은 시간: 반올림한 값이 바뀔 때만 (20초 위는 5초, 아래는 1초 단위)
    let et = '', cls = '', wait = '';
    if (extra && !q.complete) {
      if (extra.ready) { et = '🥕 수확!'; cls = 'ready'; }
      else if (extra.dry) { et = '💧 물 주기!'; cls = 'dry'; }
      else if (extra.eta !== null && extra.eta !== undefined) {
        et = `⏳ 약 ${fmtEta(extra.eta)}`;
        if (extra.eta > 15 && extra.pet) wait = ` · 그동안 ${extra.pet}${josa(extra.pet, '와/과')} 놀아 주세요`;
      }
    }
    const ek = `${cls}|${et}`;
    if (ek !== this._objEta) { this._objEta = ek; this._objEtaEl.textContent = et; this._objEtaEl.className = `eta ${cls}`; }
    if (wait !== this._objSub) { this._objSub = wait; this._objWait.textContent = wait; }
  },

  /** 보상 도장: 칩이 톡 커졌다 돌아옴 (다시 시작하려면 reflow) */
  stampObjective() {
    const el = this.objective;
    if (!el) return;
    el.classList.remove('stamp');
    void el.offsetWidth;
    el.classList.add('stamp');
  },

  /** 칩 누르기: 완료면 보상 받기, 휴대폰에서 접혀 있으면 먼저 펼치기, 아니면 퀘스트 창 */
  _objTap() {
    const q = this._objQ, g = this.game;
    if (q?.complete) { g.claimQuest(q.id.split(':')[0]); return; }
    if (compact() && !this._peeking) { this._objPeek(true); return; }
    this._objPeek(false);
    this.openQuests();
  },

  /** 휴대폰 펼쳐 보기 (7초 뒤 접힘). 펼친 동안 알림을 아래로 비켜 줌 (body.obj-peek) */
  _objPeek(on) {
    clearTimeout(this._peekT);
    this._peeking = !!on;
    this.objective?.classList.toggle('peek', !!on);
    if (typeof document !== 'undefined') document.body.classList.toggle('obj-peek', !!on);
    if (on) this._peekT = setTimeout(() => this._objPeek(false), PEEK_MS);
  },
};
