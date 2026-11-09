// 알림 (잠깐 떴다 사라지는 글)
import { h } from './dom.js';

/** 알림 메서드 (UI.prototype 에 합쳐짐) */
export const ToastUI = {
  /** 알림 자리 만들기 */
  buildToasts() {
    const root = this.root;
    this.toasts = h('div', 'toasts');
    root.append(this.toasts);
  },

  toast(text) {
    const t = h('div', 'toast');
    t.textContent = text; // 다른 플레이어 이름·방 이름·지명이 섞여도 HTML 로 해석하지 않음
    this.toasts.append(t);
    setTimeout(() => t.remove(), 3200);
    while (this.toasts.children.length > 4) this.toasts.firstChild.remove();
  },
};
