// 알림 (잠깐 떴다 사라지는 글): 종류별 색, 같은 열쇠는 한 장으로 합침(×N), 글 길이만큼 오래, 넘치면 오래된 보통 알림부터
//  ui.toast('글')                                   — 예전처럼 글만 (종류는 맨 앞 그림·코인 글로 짐작, inferType)
//  ui.toast('글', { type, key, ms, sfx, amount, fmt })
//    type: 'info'(청록) | 'reward'(금색) | 'warn'(주황빛 빨강) | 'tip'(초록)
//    key : 같은 열쇠가 떠 있으면 새 장 대신 그 장을 고침 (없으면 종류+글이 같을 때만 합침)
//    amount·fmt: 합칠 때 amount 를 더하고 fmt({ count, amount, text }) 로 글을 다시 씀 (예: 판매 코인 합계)
//    ms  : 보여 줄 시간을 직접 (없으면 글 길이로)
//    sfx : 소리 이름 (지금은 toastSfx 고리만, 소리는 나중에)
import { h } from './dom.js';
import { TipUI, splitIcon } from './tip.js';

export const TOAST_TYPES = ['info', 'reward', 'warn', 'tip'];
export const TOAST_IN_MS = 220;
export const TOAST_OUT_MS = 260;
/** 좁은 화면(세로 폰·가로로 눕힌 폰)에서는 3장까지 */
export const NARROW_Q = '(max-width: 480px), (max-height: 500px) and (pointer: coarse)';

/** 종류를 안 정한 예전 알림: 맨 앞 그림·코인 글로 짐작 (경고 ⚠️🚫❌💥❗, 팁 💡, 보상 🎁🎉🏅⬆️ 또는 +N 코인) */
export function inferType(text) {
  const s = String(text).trimStart();
  if (/^(⚠|🚫|❌|💥|❗)/u.test(s)) return 'warn';
  if (/^💡/u.test(s)) return 'tip';
  if (/^(🎁|🎉|🏅|⬆)/u.test(s) || /\+\s?\d[\d,]*\s?(🪙|코인)/u.test(s)) return 'reward';
  return 'info';
}

/** 보여 줄 시간(ms): 2.2초 + 글자당 0.055초 (2.8~7초). 오토플레이 중 보상 알림은 가장 짧게 */
export function toastMs(text, { type = 'info', ms, autoplay = false } = {}) {
  if (ms > 0) return ms;
  if (type === 'reward' && autoplay) return 2800;
  return Math.min(7000, Math.max(2800, 2200 + 55 * [...String(text)].length));
}

/** 한 번에 떠 있을 수 있는 장 수 (좁은 화면에 팁 카드까지 떠 있으면 2장) */
export const toastCap = (narrow, tipOn = false) => (narrow ? (tipOn ? 2 : 3) : 4);

/** 종류별 기본 그림 (글 맨 앞에 그림이 없을 때 머리 그림 칸) */
export const TOAST_ICONS = { info: '🔔', reward: '🎁', warn: '⚠️', tip: '💡' };

/** 밀려날 차례: 보통 < 보상 < 경고·팁, 같은 단계면 오래된 것부터 (방금 온·방금 합친 장은 가장 새것) */
const RANK = { info: 0, reward: 1, warn: 2, tip: 2 };
function victim(live, fresh) {
  let v = null;
  for (const e of live) {
    const r = RANK[e.type] ?? 0, t = e === fresh ? Infinity : e.t;
    if (!v || r < v.r || (r === v.r && t < v.t)) v = { e, r, t };
  }
  return v.e;
}

/** 화면 없이 도는 알림 목록 (시험용으로 따로): 합치기·밀어내기·시간만 정함 */
export class ToastQueue {
  constructor() { this.live = []; this.seq = 0; }

  /** 글 → { entry, merged, evicted } */
  push(text, opts = {}, { cap = 4, autoplay = false } = {}) {
    text = String(text);
    const type = TOAST_TYPES.includes(opts.type) ? opts.type : inferType(text);
    const key = opts.key != null ? `k:${opts.key}` : `t:${type}:${text}`;
    let e = this.live.find((x) => x.key === key);
    const merged = !!e;
    if (e) {
      e.count++;
      e.same = e.base === text ? e.same + 1 : 1;
      e.base = text;
      e.type = type;
      if (opts.fmt) e.fmt = opts.fmt;
      if (typeof opts.amount === 'number') e.amount = (e.amount || 0) + opts.amount;
    } else {
      e = { key, type, base: text, count: 1, same: 1, amount: typeof opts.amount === 'number' ? opts.amount : undefined, fmt: opts.fmt || null };
      this.live.push(e);
    }
    e.t = ++this.seq; // 합친 장은 방금 온 것으로 (밀려날 차례가 뒤로)
    e.sfx = opts.sfx;
    const { msg, n } = toastText(e);
    e.msg = msg; e.n = n;
    e.text = n > 1 ? `${msg} ×${n}` : msg;
    e.ms = toastMs(e.text, { type, ms: opts.ms, autoplay });
    return { entry: e, merged, evicted: this.trim(cap, e) };
  }

  /** cap 장이 넘치면 밀려날 차례대로 빼냄 → 빠진 장 목록 */
  trim(cap, fresh = null) {
    const evicted = [];
    while (this.live.length > cap) {
      const v = victim(this.live, fresh);
      this.remove(v);
      evicted.push(v);
    }
    return evicted;
  }

  remove(e) { const i = this.live.indexOf(e); if (i >= 0) this.live.splice(i, 1); }
}

/** 합친 장의 글: fmt 가 있으면 그 글, 없으면 같은 글이 거듭 온 수만큼 ×N */
export function toastText(e) {
  if (e.fmt) {
    try { return { msg: String(e.fmt({ count: e.count, amount: e.amount, text: e.base })), n: 1 }; } catch { /* 아래로 */ }
  }
  return { msg: e.base, n: e.same };
}

/** 알림 글 → { icon, body }: 맨 앞 그림을 떼어 그림 칸으로 */
export function toastIcon(msg, type) {
  const { icon, body } = splitIcon(String(msg), '');
  return icon ? { icon, body } : { icon: TOAST_ICONS[type] || TOAST_ICONS.info, body };
}

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** 알림 메서드 (UI.prototype 에 합쳐짐) — 한 번만 뜨는 팁(tip.js)도 여기서 함께 붙임 */
export const ToastUI = {
  /** 알림 자리 + 팁 카드 자리 만들기 */
  buildToasts() {
    const root = this.root;
    this.toasts = h('div', 'toasts');
    root.append(this.toasts);
    this._toastQ = new ToastQueue();
    this.buildTip?.();
  },

  toast(text, opts = {}) {
    const q = (this._toastQ ||= new ToastQueue());
    const { entry: e, merged, evicted } = q.push(text, opts || {}, { cap: this._toastCap(), autoplay: !!this.game?.autoplay?.on });
    for (const v of evicted) this._toastLeave(v);
    if (!q.live.includes(e)) return; // 방금 온 것이 바로 밀려남 (경고·팁만 가득)
    let el = e.el;
    if (!el) {
      el = e.el = h('div', 'toast');
      el.append(h('span', 'ic'), h('span', 'msg'), h('b', 'cnt'));
      this.toasts.append(el);
    }
    el.className = `toast ${e.type}`;
    // 맨 앞 그림은 왼쪽 그림 칸으로 (장마다 같은 줄에 섬), 없으면 종류별 그림
    const { icon, body } = toastIcon(e.msg, e.type);
    el.children[0].textContent = icon;
    el.children[1].textContent = body; // 다른 플레이어 이름·방 이름·지명이 섞여도 HTML 로 해석하지 않음
    el.lastChild.textContent = e.n > 1 ? ` ×${e.n}` : '';
    if (merged && el.animate && !reduced()) el.animate([{ scale: '1' }, { scale: '1.07' }, { scale: '1' }], { duration: 240, easing: 'cubic-bezier(.3,1.6,.5,1)' });
    clearTimeout(e.timer);
    e.timer = setTimeout(() => { q.remove(e); this._toastLeave(e); }, e.ms);
    this.toastSfx?.(e);
  },

  /** 지금 떠 있을 수 있는 장 수 */
  _toastCap() {
    const narrow = typeof matchMedia === 'function' && matchMedia(NARROW_Q).matches;
    return toastCap(narrow, !!this.root?.classList?.contains?.('tip-on'));
  },

  /** 팁 카드가 뜨면 좁은 화면에서 넘치는 알림을 정리 (tip.js 가 부름) */
  _toastFit() {
    const q = this._toastQ;
    if (q) for (const v of q.trim(this._toastCap())) this._toastLeave(v);
  },

  /** 나가는 알림: 살짝 떠오르며 흐려진 뒤 지움 (애니메이션이 안 끝나도 잠시 뒤 지움) */
  _toastLeave(e) {
    clearTimeout(e.timer);
    const el = e.el;
    if (!el || el.classList.contains('out')) return;
    el.classList.add('out');
    const done = () => el.remove();
    el.addEventListener('animationend', (ev) => { if (ev.target === el) done(); });
    setTimeout(done, TOAST_OUT_MS + 240);
  },

  /** 알림 소리 고리 (종류·sfx 별 소리는 나중에 여기서) */
  toastSfx() {},

  ...TipUI,
};
