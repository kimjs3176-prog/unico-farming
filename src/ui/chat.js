// 채팅: 접속 표시·기록·입력칸 (휴대폰 키보드가 열려도 HUD 가 밀리지 않게)
import { h, esc } from './dom.js';
import { touchUI } from '../game/input.js';

/** 채팅 메서드 (UI.prototype 에 합쳐짐) */
export const ChatUI = {
  /** 채팅 만들기 */
  buildChat() {
    const game = this.game, root = this.root;
    // 채팅
    this.chat = h('div', 'chat');
    this.online = h('div', 'online', '🟢 오프라인 모드');
    this.chatLog = h('div', 'log');
    this.chatInput = h('input');
    this.chatInput.placeholder = '채팅 (Enter)';
    this.chatInput.maxLength = 80;
    this.chatInput.enterKeyHint = 'send'; // 휴대폰 키보드의 Enter 키가 '보내기'로
    this.chatInput.autocomplete = 'off';
    this.chatInput.addEventListener('keydown', (e) => {
      e.stopPropagation(); // 게임 키 입력으로 새지 않게
      // 한글 조합 중 Enter 는 글자 확정용 → 건너뜀. 확정된 뒤 다시 오는 Enter 에서 보냄 (keyCode 229 로 막으면 일부 키보드에서 전송이 안 됨)
      if (e.isComposing) return;
      if (e.key === 'Enter') { const t = this.chatInput.value.trim(); if (t) game.net.sendChat(t); this.chatInput.value = ''; this.chatInput.blur(); }
      if (e.key === 'Escape') this.chatInput.blur();
    });
    // iOS: 키보드가 닫힌 뒤 화면이 위로 밀린 채 남지 않게
    this.chatInput.addEventListener('focusout', () => setTimeout(() => { if (document.activeElement !== this.chatInput && (scrollX || scrollY)) scrollTo(0, 0); }, 60));
    // 터치 기기: 키보드가 열려도 위쪽 HUD(돈·레벨·목표)가 화면 밖으로 밀리지 않게
    //  - 키보드가 올라오기 전에 채팅을 위쪽 HUD·목표 칩 바로 아래로 옮김 → 입력칸이 가려지지 않아 브라우저가 화면을 밀 일이 없음
    //  - 그래도 밀리면(보이는 영역이 아래로 내려감) UI 층을 그만큼 내려 보이는 영역 위에 붙임
    this.chatInput.addEventListener('focus', () => {
      if (!touchUI()) return;
      const ob = !this.objective || this.objective.style.display === 'none' ? 0 : this.objective.getBoundingClientRect().bottom;
      const z = +getComputedStyle(this.chat).zoom || 1; // 채팅도 --ui-zoom 으로 커지므로 CSS px 로 되돌림
      this.chat.style.top = `${Math.round(Math.max(this.top.getBoundingClientRect().bottom, ob) / z) + 6}px`;
      this.chat.style.bottom = 'auto';
    });
    this.chatInput.addEventListener('blur', () => {
      this.chat.style.top = this.chat.style.bottom = '';
      this.root.style.translate = '';
    });
    const vv = typeof visualViewport !== 'undefined' ? visualViewport : null;
    const followVV = () => {
      if (document.activeElement !== this.chatInput || !touchUI()) return;
      const y = Math.max(0, Math.round(vv.offsetTop));
      this.root.style.translate = y ? `0 ${y}px` : '';
    };
    vv?.addEventListener('resize', followVV);
    vv?.addEventListener('scroll', followVV);
    this.chat.append(this.online, this.chatLog, this.chatInput);
    root.append(this.chat);
  },

  chatLine(name, text, mine = false) {
    const d = h('div', '', `<b>${esc(name)}</b> ${esc(text)}`);
    if (mine) d.style.background = '#e4f7f4';
    this.chatLog.append(d);
    while (this.chatLog.children.length > 30) this.chatLog.firstChild.remove();
    this.chatLog.scrollTop = this.chatLog.scrollHeight;
  },
};
