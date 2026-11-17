import { portraitSVG, preloadPortraits } from './portrait2d.js';
import { isSubmitEnter } from '../game/input.js';

/** 이름 다듬기: 앞뒤 공백·제어 문자 빼고 max 글자까지 (이모지도 한 글자), 비면 fallback */
export function sanitizeName(raw, fallback = '', max = 6) {
  const t = [...String(raw ?? '').replace(/\s+/g, ' ').replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069\ufeff]/g, '').trim()].slice(0, max).join('').trim();
  return t || String(fallback ?? '');
}
/** 이름 카드를 그냥 두면 이만큼(초) 뒤 지금 이름으로 (건너뛰기·오토플레이) */
export const NAME_AUTO_S = 4;

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/**
 * 대화창 (화면 아래): 2D 초상화(SVG, 말할 때 입이 움직임) + 이름표 + 한 글자씩 나오는 대사 + 말소리 + 선택지
 *  - 클릭 / E / Space / Enter: 글자 다 보이기 → 다음 줄
 *  - 선택지는 클릭 또는 숫자 키 1~9
 * say([{ speaker?: Unico, name, color?, sub?, text, choices?: [{ label, value, disabled? }], input?: { value, max } }]) → 마지막 선택 값
 *  - input: 대화창 안 이름 카드 [좋아!] / [✏️ 바꾸기] → 다듬은 이름 (건너뛰면 지금 이름)
 *  - 대화 중에 또 say 하면 앞 대화가 끝난 뒤 이어서 (덮어쓰지 않음)
 */
export class Dialogue {
  constructor(game, root) {
    this.game = game;
    this.el = document.createElement('div');
    this.el.className = 'dlg hidden';
    this.el.innerHTML = `<div class="dlg-portrait"></div>
      <div class="dlg-main"><div class="dlg-name"><b></b><small></small></div><div class="dlg-text"></div><div class="dlg-choices"></div><i class="dlg-next">▼</i></div>`;
    root.append(this.el);
    this.$ = (s) => this.el.querySelector(s);
    this.active = false;
    this.closedAt = 0;
    this.el.addEventListener('pointerdown', (e) => { if (!e.target.closest('.dlg-choices')) { e.preventDefault(); this._advance(); } });
    // 다른 창(미니게임 등)의 같은 키 처리까지 막음: 한 번 누른 E 가 대사도 넘기고 게임도 시작하지 않게
    window.addEventListener('keydown', (e) => {
      if (!this.active || e.isComposing || e.target?.tagName === 'INPUT') return;
      if (['KeyE', 'Space', 'Enter'].includes(e.code)) { e.preventDefault(); e.stopImmediatePropagation(); this._advance(); return; }
      const n = +e.key;
      if (n >= 1 && n <= 9 && this.choosing) { e.stopImmediatePropagation(); this.el.querySelectorAll('.dlg-choices button')[n - 1]?.click(); } // 선택지 번호 1~9
    }, true);
    this.portraits = new Map();
    preloadPortraits();
  }

  /** 방금 닫혔는지 (닫는 키 입력이 다른 상호작용으로 새지 않게) */
  justClosed() { return performance.now() - this.closedAt < 350; }

  skipAll() {
    this._skip = true;
    if (this._naming) return this._naming.done(); // 이름 카드: 지금 이름으로
    this._advance(true);
  }

  /** 다음으로 (글자 다 보이기 → 다음 줄). 키보드 E 와 같음: 화면 E 버튼·3D 화면 탭에서 부름 */
  advance() { this._advance(); }

  /** 초상화: 말하는 유니코의 색·옷차림으로 2D 일러스트. portrait: 'dog' 이면 반려견 */
  _portrait(speaker, color, kind, emote) {
    const box = this.$('.dlg-portrait');
    box.innerHTML = '';
    const show = !!speaker || kind === 'dog';
    box.style.display = show ? '' : 'none';
    if (!show) return;
    try { box.append(portraitSVG(speaker, { accent: color || '#30b6aa', kind: kind || 'unico', emote })); } catch { box.style.display = 'none'; }
  }

  _advance(force) {
    if (!this.active) return;
    if (this.typing && !force) { this.typing = false; return; } // 남은 글자 한 번에
    if (this.choosing && !force) return;
    this._next?.();
  }

  /** 대화 (앞 대화가 진행 중이면 끝난 뒤 이어서) */
  say(lines) {
    const run = (this._queue || Promise.resolve()).then(() => this._say(lines));
    this._queue = run.catch(() => {});
    return run;
  }

  async _say(lines) {
    if (!Array.isArray(lines)) lines = [lines];
    this.active = true; this._skip = false;
    const P = this.game.player;
    P.hold ? P.hold('dlg') : (P.frozen = true);
    this.el.classList.remove('hidden');
    document.body?.classList?.add('talking'); // HUD·행동 막대를 흐리게, 누를 수 없게 (dialogue.css)
    try { return await this._lines(lines); } finally {
      document.body?.classList?.remove('talking');
      this.el.classList.add('hidden');
      this.active = false;
      this.typing = this.choosing = false;
      this._naming = null;
      this.closedAt = performance.now();
      if (P.unhold) P.unhold('dlg'); else if (!this.game.cinema?.locked) P.frozen = false;
    }
  }

  async _lines(lines) {
    let result = null, lastSpeaker;
    for (const ln of lines) {
      if (this._skip && !ln.choices && !ln.input) continue;
      if (this._skip && ln.input) { result = sanitizeName(ln.input.value, ln.input.value, ln.input.max); continue; }
      const who = `${ln.speaker?.palette || ln.portrait || ''}:${ln.emote || ''}:${ln.speaker ? 1 : 0}`;
      if (who !== lastSpeaker) { this._portrait(ln.speaker, ln.color, ln.portrait, ln.emote); lastSpeaker = who; }
      this.el.style.setProperty('--dlg-accent', ln.color || '#30b6aa');
      this.$('.dlg-name b').textContent = ln.name || '';
      this.$('.dlg-name small').innerHTML = ln.sub ? esc(ln.sub) : '';
      this.$('.dlg-choices').innerHTML = '';
      this.el.classList.toggle('has-choices', !!(ln.choices || ln.input));
      ln.speaker?.playAction?.(ln.emote || 'talk', Math.min(2.5, ln.text.length * 0.05));
      ln.speaker?.speak?.(Math.min(6, [...ln.text].length / 38 + 0.2)); // 글자 나오는 동안 입 움직임 (초당 38자)
      result = await this._type(ln);
    }
    return result;
  }

  _type(ln) {
    return new Promise((resolve) => {
      const textEl = this.$('.dlg-text');
      const chars = [...ln.text];
      let i = 0, acc = 0;
      this.typing = true;
      textEl.textContent = '';
      this.el.classList.remove('done');
      const voice = ln.voice ?? 520 + ((ln.name || '').length * 37) % 260; // 인물마다 다른 말소리 높이
      let last = performance.now();
      const step = (now) => {
        if (!this.active) return;
        const dt = (now - last) / 1000; last = now;
        if (!this.typing) i = chars.length;
        else { acc += dt * 38; while (acc >= 1 && i < chars.length) { acc -= 1; i++; if (i % 2 === 0 && chars[i - 1].trim()) this.game.audio.tone(voice + Math.random() * 60, 0.045, 'triangle', 0.035, 0, { rev: 0.05 }); } }
        textEl.textContent = chars.slice(0, i).join('');
        if (i < chars.length) return requestAnimationFrame(step);
        this.typing = false;
        this.el.classList.add('done');
        ln.speaker?.speak?.(0); // 글자가 다 나오면 입 다묾
        if (ln.input) this._showName(ln.input, resolve);
        else if (ln.choices) this._showChoices(ln.choices, resolve);
        else this._next = () => { this._next = null; this.game.audio.play('click', 0.6); resolve(null); };
      };
      requestAnimationFrame(step);
    });
  }

  /**
   * 오토플레이용 자동 넘김: 글자가 다 나오면 읽을 시간만큼 기다렸다 다음 줄로.
   * 선택지는 '안녕/그만'(bye) 이 있을 때만 4초 기다렸다 그것을 고름 (다른 선택은 사람이 직접)
   * 시간은 실제 시간 기준 (화면이 끊겨도 읽는 시간은 같게)
   * @returns 자동으로 넘길 수 있는 대화인가
   */
  autoStep() {
    const now = performance.now();
    if (!this.active || this.typing) { this._autoAt = 0; return this.active; }
    if (!this._autoAt) this._autoAt = now; // 이 줄(선택지)이 다 나온 때
    const waited = (now - this._autoAt) / 1000;
    if (this._naming) { // 이름 카드: 4초 뒤 지금 이름으로
      if (waited > NAME_AUTO_S && !this._naming.editing) { this._autoAt = 0; this._naming.done(); }
      return true;
    }
    if (this.choosing) {
      const bye = this._choices?.find((c) => c.value === 'bye' && !c.disabled);
      if (!bye) return false;
      if (waited > 4) { this._autoAt = 0; this.choosing = false; this.game.audio.play('click'); this._resolveChoice?.(bye.value); }
      return true;
    }
    const n = this.$('.dlg-text').textContent.length;
    if (waited > Math.min(4, 1.2 + n * 0.04)) { this._autoAt = 0; this._advance(); }
    return true;
  }

  /**
   * 이름 카드 (대화창 안): 🐕 지금 이름 + [좋아!] / [✏️ 바꾸기]
   * 바꾸기를 눌러야 글 상자를 열고 포커스 (폰에서 처음부터 자판이 올라오지 않게). Enter 는 한글 조합이 끝난 뒤에만
   */
  _showName(opt, resolve) {
    const max = opt.max || 6, cur = sanitizeName(opt.value, '', max);
    this.choosing = true; this._choices = null; this._autoAt = 0;
    const box = this.$('.dlg-choices');
    box.innerHTML = '';
    const card = document.createElement('div');
    card.className = 'dlg-name-card';
    const chip = document.createElement('span');
    chip.className = 'nm';
    chip.textContent = `${opt.icon || '🐕'} ${cur}`;
    const btns = document.createElement('div');
    btns.className = 'btns';
    const ok = document.createElement('button');
    ok.className = 'gold';
    ok.innerHTML = '<span class="k">1</span>좋아!';
    const edit = document.createElement('button');
    edit.innerHTML = '<span class="k">2</span>✏️ 바꾸기';
    btns.append(ok, edit);
    card.append(chip, btns);
    box.append(card);
    let input = null;
    const n = (this._naming = {
      editing: false,
      done: (v) => {
        if (this._naming !== n) return;
        this._naming = null; this.choosing = false;
        input?.blur?.();
        this.game.audio.play('click');
        resolve(sanitizeName(v ?? cur, cur, max));
      },
    });
    ok.onclick = (e) => { e.stopPropagation(); n.done(input ? input.value : cur); };
    edit.onclick = (e) => {
      e.stopPropagation();
      if (input) return input.focus();
      n.editing = true;
      input = document.createElement('input');
      input.type = 'text';
      input.maxLength = max;
      input.value = cur;
      input.placeholder = `${max}글자까지`;
      input.setAttribute('enterkeyhint', 'done');
      input.setAttribute('aria-label', '새 이름');
      input.addEventListener('keydown', (k) => {
        if (isSubmitEnter(k)) { k.preventDefault(); n.done(input.value); }
        else if (k.key === 'Escape') { k.preventDefault(); n.done(cur); }
        k.stopPropagation(); // 이름을 치는 동안 게임 단축키로 새지 않게
      });
      chip.replaceWith(input);
      edit.remove();
      ok.innerHTML = '<span class="k">↵</span>이 이름으로!';
      input.focus();
      input.select?.();
    };
  }

  _showChoices(choices, resolve) {
    this.choosing = true;
    this._choices = choices; this._resolveChoice = resolve; this._autoAt = 0;
    const box = this.$('.dlg-choices');
    box.innerHTML = '';
    choices.forEach((c, k) => {
      const b = document.createElement('button');
      b.innerHTML = `<span class="k">${k + 1}</span>${esc(c.label)}${c.note ? `<small>${esc(c.note)}</small>` : ''}`;
      b.disabled = !!c.disabled;
      b.onclick = (e) => { e.stopPropagation(); this.choosing = false; this.game.audio.play('click'); resolve(c.value); };
      box.append(b);
    });
  }
}
