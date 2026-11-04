import { portraitSVG } from './portrait2d.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/**
 * 대화창 (화면 아래): 2D 초상화(SVG, 말할 때 입이 움직임) + 이름표 + 한 글자씩 나오는 대사 + 말소리 + 선택지
 *  - 클릭 / E / Space / Enter: 글자 다 보이기 → 다음 줄
 *  - 선택지는 클릭 또는 숫자 키 1~4
 * say([{ speaker?: Unico, name, color?, sub?, text, choices?: [{ label, value, disabled? }] }]) → 마지막 선택 값
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
    window.addEventListener('keydown', (e) => {
      if (!this.active || e.target?.tagName === 'INPUT') return;
      if (['KeyE', 'Space', 'Enter'].includes(e.code)) { e.preventDefault(); e.stopPropagation(); this._advance(); }
      const n = +e.key;
      if (n >= 1 && n <= 4) this.el.querySelectorAll('.dlg-choices button')[n - 1]?.click();
    }, true);
    this.portraits = new Map();
  }

  /** 방금 닫혔는지 (닫는 키 입력이 다른 상호작용으로 새지 않게) */
  justClosed() { return performance.now() - this.closedAt < 350; }

  skipAll() { this._skip = true; this._advance(true); }

  /** 초상화: 말하는 유니코의 색·옷차림으로 2D 일러스트. portrait: 'dog' 이면 반려견 */
  _portrait(speaker, color, kind) {
    const box = this.$('.dlg-portrait');
    box.innerHTML = '';
    const show = !!speaker || kind === 'dog';
    box.style.display = show ? '' : 'none';
    if (!show) return;
    try { box.append(portraitSVG(speaker, { accent: color || '#30b6aa', kind: kind || 'unico' })); } catch { box.style.display = 'none'; }
  }

  _advance(force) {
    if (!this.active) return;
    if (this.typing && !force) { this.typing = false; return; } // 남은 글자 한 번에
    if (this.choosing && !force) return;
    this._next?.();
  }

  async say(lines) {
    if (!Array.isArray(lines)) lines = [lines];
    this.active = true; this._skip = false;
    this.game.player.frozen = true;
    this.el.classList.remove('hidden');
    let result = null, lastSpeaker;
    for (const ln of lines) {
      if (this._skip && !ln.choices) continue;
      const who = ln.speaker || ln.portrait || null;
      if (who !== lastSpeaker) { this._portrait(ln.speaker, ln.color, ln.portrait); lastSpeaker = who; }
      this.el.style.setProperty('--dlg-accent', ln.color || '#30b6aa');
      this.$('.dlg-name b').textContent = ln.name || '';
      this.$('.dlg-name small').innerHTML = ln.sub ? esc(ln.sub) : '';
      this.$('.dlg-choices').innerHTML = '';
      this.el.classList.toggle('has-choices', !!ln.choices);
      ln.speaker?.playAction?.(ln.emote || 'talk', Math.min(2.5, ln.text.length * 0.05));
      result = await this._type(ln);
    }
    this.el.classList.add('hidden');
    this.active = false;
    this.closedAt = performance.now();
    if (!this.game.cinema?.locked) this.game.player.frozen = false;
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
        if (ln.choices) this._showChoices(ln.choices, resolve);
        else this._next = () => { this._next = null; this.game.audio.play('click', 0.6); resolve(null); };
      };
      requestAnimationFrame(step);
    });
  }

  _showChoices(choices, resolve) {
    this.choosing = true;
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
