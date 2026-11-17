// 안내 말풍선·조이스틱·터치 E 버튼
import { h, esc, blurTextInput } from './dom.js';
import { touchUI } from '../game/input.js';
import { CROPS } from '../game/sim/crops.js';
import { touchAction, touchSig, touchLabel, verbInLabel } from './touch_action.js';

/** 안내 대상 열쇠: p.key 가 없으면 글에서 숫자·%·점을 뺀 것 (진행률만 바뀌면 같은 대상) */
export function promptKey(p) {
  if (p.key != null) return `k:${p.key}`;
  return `l:${String(p.label ?? '').replace(/[\d%.]+/g, '').trim()}`;
}

const reduced = () => !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
/** CSS 애니메이션 한 번 더 (같은 클래스를 다시 붙여 처음부터) */
function replay(el, cls) { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }

/** 안내·조이스틱·E 버튼 메서드 (UI.prototype 에 합쳐짐) */
export const PromptUI = {
  /** 안내 말풍선 → 조이스틱 → 터치 E 버튼 만들기 */
  buildPrompt() {
    const game = this.game, root = this.root;
    this.prompt = h('div', 'prompt hidden', '');
    this.prompt.addEventListener('pointerdown', (e) => {
      if (!this.currentPrompt?.onInteract) return;
      e.preventDefault();
      if (this.touchBtn?.dataset.mode === 'idle' && touchUI()) return this.nopeTap(); // E 버튼과 같게: 흐린 상태면 아무 일 없음
      game.input.interactTap = true;
    });
    root.append(this.prompt);
    // 모바일
    this.joy = h('div', 'joystick', '<i></i>');
    root.append(this.joy);
    // 터치 버튼: 아이콘 + 짧은 동사 (무엇을 할지 보여 줌). 할 것이 없으면 흐리게
    this.touchBtn = h('button', 'touch-btn', '<span class="tb-ico">✋</span><span class="tb-verb"></span>');
    this.touchBtn.dataset.mode = 'idle';
    this.touchBtn.setAttribute('aria-label', '상호작용');
    // 대화 중이면 대화를 넘김 (키보드 E 와 같게). 터치는 touchstart 에서 preventDefault 하므로 click 이 또 오지 않음
    const tapE = (e) => {
      e?.preventDefault?.();
      blurTextInput(); // 채팅 키보드가 열려 있으면 닫기
      const mode = this.touchBtn.dataset.mode;
      if (game.dialogue?.active) { if (mode === 'idle') this.nopeTap(); else game.dialogue.advance(); return; }
      // 흐린 버튼은 정말 아무 일도 하지 않음 (낚시 기다리는 중에 눌러 줄을 당겨 버리지 않게)
      if (mode === 'idle') { this.nopeTap(); return; }
      if (mode === 'go' || mode === 'urgent') game.juice?.haptic?.(8);
      if (mode === 'hold' && game.nature) game.nature.holdBtn = true; // 힘겨루기: 누르고 있는 동안 감기
      game.input.interactTap = true;
    };
    const release = () => { if (game.nature) game.nature.holdBtn = false; };
    this.touchBtn.addEventListener('touchstart', tapE, { passive: false });
    this.touchBtn.addEventListener('touchend', release);
    this.touchBtn.addEventListener('touchcancel', release);
    this.touchBtn.addEventListener('click', tapE);
    // 한 번 쓰는 움직임은 끝나면 떼어 둠 (모드가 바뀔 때 다시 돌지 않게)
    this.touchBtn.addEventListener('animationend', (e) => {
      if (e.animationName === 'tbRing') this.touchBtn.classList.remove('pop');
      else if (e.animationName === 'tbNope') this.touchBtn.classList.remove('nope');
    });
    root.append(this.touchBtn);
    game.input.onJoystick = (active, cx, cy, dx, dy) => {
      this.joy.style.display = active ? 'block' : 'none';
      if (active) { this.joy.style.left = cx - 60 + 'px'; this.joy.style.top = cy - 60 + 'px'; this.joy.firstChild.style.transform = `translate(${dx}px, ${dy}px)`; }
    };
  },

  /** 할 것이 없을 때 누름: 살짝 도리도리 + 작은 딸깍 */
  nopeTap() {
    if (!reduced()) replay(this.touchBtn, 'nope');
    this.game.audio?.play?.('click', 0.35);
  },

  /** 터치 버튼에 넘길 덧붙임 정보: 낚시 입질·힘겨루기, 심을 씨앗·거둘 작물 */
  _touchExtra(p) {
    const g = this.game, f = g.nature?.fishing;
    const x = { bite: !!(f && f.phase === 'wait' && g.nature.fsim?.state === 'bite'), reel: f?.phase === 'fight', mash: !!g.rice?.threshing };
    if (p?.key === 'plant') x.seedEmoji = CROPS[g.farm?.seedChoice?.()?.crop]?.emoji;
    else if (p?.key === 'harvest') x.cropEmoji = CROPS[g.farm?.sim?.plots?.[g.farm.near]?.crop]?.emoji;
    return x;
  },

  /** 터치 버튼 갱신 (바뀔 때만 DOM 을 고침). 새 대상이 들어오면 톡 (0.4초에 한 번까지, 소리 없음) */
  updateTouchBtn(a, p) {
    const b = this.touchBtn;
    if (!b) return;
    const look = `${a.mode}|${a.icon}|${a.verb}`;
    if (look !== this._tbLook) {
      this._tbLook = look;
      b.dataset.mode = a.mode;
      b.firstChild.textContent = a.icon;
      b.lastChild.textContent = a.verb;
      b.setAttribute('aria-label', a.verb || (a.mode === 'idle' ? '할 수 있는 일이 없어요' : '상호작용'));
    }
    const sig = touchSig(a, p);
    if (sig === this._tbSig) return;
    const was = this._tbSig ? this._tbSig.split('|')[0] : 'idle';
    this._tbSig = sig;
    const now = performance.now();
    if ((a.mode === 'go' || a.mode === 'next' || a.mode === 'urgent') && (was === 'idle' || was === a.mode) && now - (this._tbPopAt ?? -1e9) > 400 && !reduced()) {
      this._tbPopAt = now;
      replay(b, 'pop');
    }
  },

  /** 매 프레임 불림: 숨길 때는 글을 그대로 둔 채 흐려지고(CSS), 대상 종류(key)가 바뀔 때만 살짝 톡 (진행률·낚시 상태처럼 글만 바뀌면 그대로) */
  setPrompt(p) {
    this.currentPrompt = p;
    const el = this.prompt;
    // 터치 화면: E 버튼이 할 일 (대화 중에는 main.js 가 null 을 넘기므로 대화창은 직접 봄)
    const a = touchUI() ? touchAction(p, this.game.dialogue, this._touchExtra(p)) : null;
    if (a) this.updateTouchBtn(a, p);
    if (!p) {
      if (!this._promptOff) { this._promptOff = true; el.classList.add('hidden'); }
      return;
    }
    const wasOff = this._promptOff !== false;
    if (wasOff) { this._promptOff = false; el.classList.remove('hidden'); }
    el.classList.toggle('clickable', !!p.onInteract);
    // 키보드는 [E], 터치는 버튼과 같은 동사 — 글에 이미 동사가 있으면 생략, 키보드 안내 '(E / 탭)' 은 뺌 (사용자가 정한 이름 등은 esc)
    const label = a ? touchLabel(p.label) : p.label;
    const key = p.onInteract ? (a ? (a.verb && !verbInLabel(a.verb, label) ? `<kbd class="tv">${esc(a.verb)}</kbd> ` : '') : '<kbd>E</kbd> ') : '';
    const html = key + esc(label) + (p.onInteract ? ' <span class="tapme">👆</span>' : '');
    if (html !== this.promptHtml) { el.innerHTML = html; this.promptHtml = html; }
    const pk = promptKey(p);
    if (pk !== this._promptKey) {
      const swap = !wasOff && this._promptKey != null; // 보이던 안내가 다른 대상으로 바뀜 (나타날 때는 CSS 가 올려 줌)
      this._promptKey = pk;
      if (swap && el.animate && !reduced()) {
        el.animate([{ scale: '0.94', opacity: 0.7 }, { scale: '1', opacity: 1 }], { duration: 150, easing: 'cubic-bezier(.3,1.4,.5,1)' });
      }
    }
  },
};
