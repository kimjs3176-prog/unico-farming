// 한 번만 뜨는 팁 카드: ui.tip(id, text)
//  - 처음 한 번만 (본 기록은 game.flags.tips[id], 저장에 함께 들어감). 이미 봤으면 false
//  - 컷신·대화·창·미니게임·오토플레이·낚시·스마트팜·꾸미기 중에는 기다렸다가 (기다리는 팁은 하나, 새 팁이 오면 바꿈)
//  - 띄우는 순간 본 것으로 적고, 15초 보이면 저절로 닫힘 ('알겠어요' 로 바로 닫기). 바쁜 동안엔 잠깐 숨고 시간도 멈춤
//  - 카드만 누를 수 있음 (화면 나머지는 그대로 조작)
import { h } from './dom.js';

export const TIP_MS = 15000; // 보이는 시간
export const TIP_DELAY_MS = 700; // 부탁받고 조금 뒤에 (같은 순간의 알림·효과가 먼저 보이게)
export const TIP_WAIT_MS = 120000; // 이만큼 못 띄우면 버림 (본 것으로 적지 않으니 다음에 다시)
/** 예전에 따로 두던 '봤음' 표시 → tips 의 이름 */
export const LEGACY_TIPS = { quality: 'qualityTip', swim: 'swimTip' };

/** 본 팁 기록 (예전 표시도 본 것으로 옮겨 적음) */
export function tipStore(flags) {
  const t = (flags.tips ||= {});
  for (const [id, old] of Object.entries(LEGACY_TIPS)) if (flags[old]) t[id] = true;
  return t;
}

/** 지금 팁을 띄우면 안 되나 (게임 쪽 g.busy() 가 생기면 그것을 먼저) */
export function tipBusy(g) {
  if (!g) return true;
  const ui = g.ui;
  return !!((typeof g.busy === 'function' && g.busy()) || g.cinema?.locked || g.dialogue?.active || ui?.panel || g.autoplay?.on || g.nature?.fishing || g.smartfarm?.active
    || g.herding?.active || g.decor?.mode || ui?.root?.querySelector?.('.mg-wrap, .mg-count'));
}

/** 화면 없이 도는 팁 차례 (시험용으로 따로) */
export class TipQueue {
  /** @param {() => object} flags 지금 저장 표시 (불러오기로 바뀌어도 늘 새 것) */
  constructor(flags) { this.flags = flags; this.cur = null; this.pending = null; }

  seen(id) { return !!tipStore(this.flags())[id]; }

  /** 띄워 달라는 부탁: 받아들이면 true */
  request(id, text) {
    if (!id || this.seen(id) || this.cur?.id === id) return false;
    this.pending = { id, text: String(text), wait: 0 };
    return true;
  }

  /** dt(ms) 흐름 → 'show' | 'hide' | 'away'(바빠서 잠깐 숨김) | 'back' | null */
  tick(dt, busy) {
    const c = this.cur;
    if (c) {
      if (busy) { if (c.away) return null; c.away = true; return 'away'; }
      if (c.away) { c.away = false; return 'back'; }
      c.left -= dt;
      if (c.left > 0) return null;
      this.cur = null;
      return 'hide';
    }
    const p = this.pending;
    if (!p) return null;
    p.wait += dt;
    if (p.wait > TIP_WAIT_MS) { this.pending = null; return null; }
    if (busy || p.wait < TIP_DELAY_MS) return null;
    this.pending = null;
    this.cur = { id: p.id, text: p.text, left: TIP_MS, away: false };
    const flags = this.flags();
    tipStore(flags)[p.id] = true;
    if (LEGACY_TIPS[p.id]) flags[LEGACY_TIPS[p.id]] = true; // 아직 예전 표시를 보는 곳도 같은 답
    return 'show';
  }

  /** '알겠어요' */
  dismiss() { const had = !!this.cur; this.cur = null; return had; }
}

/** 글 맨 앞의 그림 글자를 카드 머리 그림으로 (없으면 💡) */
export function splitIcon(text) {
  const m = /^(\p{Extended_Pictographic}️?(?:‍\p{Extended_Pictographic}️?)*)\s*/u.exec(text);
  return m ? { icon: m[1], body: text.slice(m[0].length) } : { icon: '💡', body: text };
}

/** 팁 카드 메서드 (toast.js 를 거쳐 UI.prototype 에 합쳐짐) */
export const TipUI = {
  /** 카드 자리 (알림 바로 뒤에 붙음 → 겹침 순서도 알림과 같음) */
  buildTip() {
    this._tipQ = new TipQueue(() => this.game?.flags || (this._tipFlags ||= {}));
    const el = (this.tipEl = h('div', 'tip-card hidden', '<span class="tip-ic"></span><p class="tip-tx"></p><button class="gold tip-ok">알겠어요</button><i class="tip-life"></i>'));
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.querySelector('.tip-ok').addEventListener('click', (e) => { e.stopPropagation(); this.closeTip(); });
    this.root.append(el);
  },

  /** 한 번만 뜨는 팁. 받아들이면 true (이미 봤으면 false → 부르는 쪽은 아무것도 안 해도 됨) */
  tip(id, text) {
    if (!this._tipQ) this.buildTip();
    const ok = this._tipQ.request(id, text);
    if (ok) this._tipAcc = Math.max(this._tipAcc || 0, 250); // 다음 HUD 갱신에서 바로 살핌
    return ok;
  },

  /** HUD 갱신에서 불림: dt(ms)만큼 흐름 */
  updateTip(dt) {
    const q = this._tipQ;
    if (!q || (!q.cur && !q.pending)) return;
    const act = q.tick(dt, tipBusy(this.game));
    if (!act) return;
    const el = this.tipEl;
    if (act === 'show') {
      const { icon, body } = splitIcon(q.cur.text);
      el.querySelector('.tip-ic').textContent = icon;
      el.querySelector('.tip-tx').textContent = body;
      const life = el.querySelector('.tip-life');
      life.style.animation = 'none';
      void life.offsetWidth; // 줄어드는 막대를 처음부터
      life.style.animation = '';
      el.classList.remove('hidden', 'away');
      this.game?.audio?.play?.('pop');
    } else if (act === 'away') el.classList.add('away');
    else if (act === 'back') el.classList.remove('away');
    else el.classList.add('hidden');
    this._tipSpace();
  },

  closeTip() {
    if (!this._tipQ?.dismiss()) return;
    this.tipEl.classList.add('hidden');
    this._tipSpace();
  },

  /** 카드가 보이는 동안 알림을 그 아래로 (--tip-h) */
  _tipSpace() {
    const el = this.tipEl, on = !el.classList.contains('hidden') && !el.classList.contains('away');
    let v = '0px';
    if (on) {
      const z = +getComputedStyle(el).zoom || 1;
      v = `${Math.round(el.getBoundingClientRect().height / z) + 8}px`;
    }
    this.root.style.setProperty('--tip-h', v);
    this.root.classList.toggle('tip-on', on);
  },
};
