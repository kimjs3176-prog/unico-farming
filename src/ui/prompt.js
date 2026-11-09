// 안내 말풍선·조이스틱·터치 E 버튼
import { h, esc, blurTextInput } from './dom.js';

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

  setPrompt(p) {
    this.currentPrompt = p;
    if (!p) { this.prompt.classList.add('hidden'); return; }
    this.prompt.classList.remove('hidden');
    this.prompt.classList.toggle('clickable', !!p.onInteract);
    const html = (p.onInteract ? '<kbd>E</kbd> ' : '') + esc(p.label) + (p.onInteract ? ' <span class="tapme">👆</span>' : ''); // 동물·반려견 이름 등 사용자가 정한 글자
    if (html !== this.promptHtml) { this.prompt.innerHTML = html; this.promptHtml = html; }
  },
};
