// 목표 안내 칩
import { h } from './dom.js';
import { touchUI } from '../game/input.js';
import { fmtEta } from '../game/guide.js';
import { josa } from '../game/sim/josa.js';
import { CROPS } from '../game/sim/crops.js';

const PEEK_MS = 7000;
/** 휴대폰 한 줄 칩인가 (objective.css 의 모바일 조건과 같음) */
let compactMq = null;
const compact = () => typeof matchMedia !== 'undefined' && (compactMq ||= matchMedia('(max-width: 600px), (max-height: 500px) and (pointer: coarse)')).matches;

/** 목표 칩 메서드 (UI.prototype 에 합쳐짐) */
export const ObjectiveUI = {
  /** 목표 안내 칩. extra: { eta, dry, ready, pet } (밭 작물 남은 시간) 또는 { more, seeds } (더 심을 칸) */
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
      this.objective.innerHTML = `<span class="ic">${q.complete ? '🎁' : '🎯'}</span><div class="tt"><span class="nm">${q.complete ? '보상 받기: ' : ''}${q.title}</span>${!q.complete && q.goal > 1 ? `<span class="cnt">${q.count}/${q.goal}</span>` : ''}<span class="eta"></span><small>${sub}<span class="dist"></span><span class="wait"></span></small><div class="bar"><i style="width:${Math.round((q.count / q.goal) * 100)}%"></i></div></div>${side}`;
      this._objDist = this.objective.querySelector('.dist');
      this._objDir = this.objective.querySelector('.dir');
      this._objEtaEl = this.objective.querySelector('.eta');
      this._objWait = this.objective.querySelector('.wait');
    }
    // 남은 시간: 반올림한 값이 바뀔 때만 (20초 위는 5초, 아래는 1초 단위)
    let et = '', cls = '', wait = '';
    if (extra && !q.complete) {
      if (extra.ready) { et = '🥕 수확!'; cls = 'ready'; }
      else if (extra.more) { et = extra.seeds ? `🌱 ${extra.more}칸 더 심기` : `🛒 씨앗 사서 ${extra.more}칸 더`; cls = 'more'; }
      else if (extra.dry) { et = '💧 물 주기!'; cls = 'dry'; }
      else if (extra.eta !== null && extra.eta !== undefined) {
        et = `⏳ 약 ${fmtEta(extra.eta)}`;
        if (extra.eta > 15 && extra.pet) wait = ` · ${extra.pet}${josa(extra.pet, '와/과')} 놀며 기다려요`;
      }
    }
    // 기다리는 동안은 거리를 숨김 (남은 시간이 더 중요)
    const m = hasDist && !(et && !cls) ? Math.round(dist) : null;
    if (m !== this._objM) { this._objM = m; this._objDist.textContent = m === null ? '' : ` · ${m}m`; }
    const deg = Math.round(ang / 3) * 3; // 3도 단위로만 갱신
    if (this._objDir && !q.complete && deg !== this._objDeg) { this._objDeg = deg; this._objDir.style.transform = `rotate(${deg}deg)`; }
    const ek = `${cls}|${et}`;
    if (ek !== this._objEta) { this._objEta = ek; this._objEtaEl.textContent = et; this._objEtaEl.className = `eta ${cls}`; }
    if (wait !== this._objSub) { this._objSub = wait; this._objWait.textContent = wait; }
  },

  /**
   * 장 완료 카드: 장 도장 + 별 터짐 + 선물 칸 + '다음 장 시작하기'. 연 창을 돌려줌 (닫히면 길잡이가 다음 목표를 펼침)
   * c: 끝낸 장, next: 다음 장 (없으면 마지막)
   */
  chapterCard(c, next) {
    const p = this.openPanel(`📖 ${c.n}장 완료!`);
    p.classList.add('chcard');
    p.dataset.kind = 'result'; // 오토플레이 중에는 잠시 보여 준 뒤 자동으로 닫음
    const tile = (ic, v, t) => `<div class="ch-tile"><span class="ic">${ic}</span><b>${v}</b><small>${t}</small></div>`;
    const tiles = [tile('🪙', `+${c.reward.money}`, '코인')]
      .concat(Object.entries(c.reward.seeds || {}).map(([k, n]) => tile(CROPS[k].emoji, `×${n}`, `${CROPS[k].name} 씨앗`)));
    const stars = Array.from({ length: 10 }, (_, k) => `<i style="--a:${k * 36}deg;--d:${(k % 3) * 0.06}s"></i>`).join('');
    p.append(h('div', 'ch-body', `<div class="ch-badge"><div class="ch-burst">${stars}</div><span class="ch-n">${c.n}장</span><b>완료</b></div>`
      + `<div class="ch-title">「${c.title}」${josa(c.title, "을/를")} 마쳤어요!</div>`
      + `<div class="ch-tiles">${tiles.join('')}</div>`
      + (next ? `<div class="ch-next">다음 이야기: ${next.n}장 「${next.title}」</div>` : '<div class="ch-next">모든 장을 마쳤어요! 이제 사계절 농부예요 🎉</div>')));
    const b = h('button', 'gold ch-go', next ? `${next.n}장 시작하기` : '확인');
    b.onclick = () => this.closePanel();
    p.append(b);
    return p;
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
