// 안내 말풍선·조이스틱·터치 E 버튼
import { h, esc, blurTextInput } from './dom.js';

/** 안내 대상 열쇠: p.key 가 없으면 글에서 숫자·%·점을 뺀 것 (진행률만 바뀌면 같은 대상) */
export function promptKey(p) {
  if (p.key != null) return `k:${p.key}`;
  return `l:${String(p.label ?? '').replace(/[\d%.]+/g, '').trim()}`;
}

/** 안내·조이스틱·E 버튼 메서드 (UI.prototype 에 합쳐짐) */
export const PromptUI = {
  /** 안내 말풍선 → 조이스틱 → 터치 E 버튼 만들기 */
  buildPrompt() {
    const game = this.game, root = this.root;
    this.prompt = h('div', 'prompt hidden', '');
    this.prompt.addEventListener('pointerdown', (e) => { if (this.currentPrompt?.onInteract) { e.preventDefault(); game.input.interactTap = true; } });
    root.append(this.prompt);
    // 모바일
    this.joy = h('div', 'joystick', '<i></i>');
    root.append(this.joy);
    this.touchBtn = h('button', 'touch-btn', 'E');
    // 대화 중이면 대화를 넘김 (키보드 E 와 같게). 터치는 touchstart 에서 preventDefault 하므로 click 이 또 오지 않음
    const tapE = (e) => {
      e?.preventDefault?.();
      blurTextInput(); // 채팅 키보드가 열려 있으면 닫기
      if (game.dialogue?.active) { game.dialogue.advance(); return; }
      game.input.interactTap = true;
    };
    this.touchBtn.addEventListener('touchstart', tapE, { passive: false });
    this.touchBtn.addEventListener('click', tapE);
    root.append(this.touchBtn);
    game.input.onJoystick = (active, cx, cy, dx, dy) => {
      this.joy.style.display = active ? 'block' : 'none';
      if (active) { this.joy.style.left = cx - 60 + 'px'; this.joy.style.top = cy - 60 + 'px'; this.joy.firstChild.style.transform = `translate(${dx}px, ${dy}px)`; }
    };
  },

  /** 매 프레임 불림: 숨길 때는 글을 그대로 둔 채 흐려지고(CSS), 대상 종류(key)가 바뀔 때만 살짝 톡 (진행률·낚시 상태처럼 글만 바뀌면 그대로) */
  setPrompt(p) {
    this.currentPrompt = p;
    const el = this.prompt;
    if (!p) {
      if (!this._promptOff) { this._promptOff = true; el.classList.add('hidden'); }
      return;
    }
    const wasOff = this._promptOff !== false;
    if (wasOff) { this._promptOff = false; el.classList.remove('hidden'); }
    el.classList.toggle('clickable', !!p.onInteract);
    const html = (p.onInteract ? '<kbd>E</kbd> ' : '') + esc(p.label) + (p.onInteract ? ' <span class="tapme">👆</span>' : ''); // 동물·반려견 이름 등 사용자가 정한 글자
    if (html !== this.promptHtml) { el.innerHTML = html; this.promptHtml = html; }
    const key = promptKey(p);
    if (key !== this._promptKey) {
      const swap = !wasOff && this._promptKey != null; // 보이던 안내가 다른 대상으로 바뀜 (나타날 때는 CSS 가 올려 줌)
      this._promptKey = key;
      if (swap && el.animate && !globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
        el.animate([{ scale: '0.94', opacity: 0.7 }, { scale: '1', opacity: 1 }], { duration: 150, easing: 'cubic-bezier(.3,1.4,.5,1)' });
      }
    }
  },
};
