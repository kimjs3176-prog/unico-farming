/**
 * 도트 버전 화면 UI (HTML): 시계·코인·목표, 대화창(한 글자씩 + 선택지), 목록 메뉴, 알림, 모바일 패드
 * 키보드: ↑↓ 고르기, E·Space·Enter 결정, Esc·X 닫기
 */
const $ = (sel, root = document) => root.querySelector(sel);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };

export class UI {
  constructor(root, S, audio) {
    this.root = root; this.S = S; this.audio = audio;
    root.innerHTML = `
      <div class="hud-left">
        <div class="panel clock"><img class="ico" data-k="clock"><div><b class="day"></b><span class="time"></span></div></div>
        <div class="panel money"><img class="ico" src="${S.iconURL('coin')}"><b class="coins">0</b><span class="lv"></span></div>
        <div class="panel quest hidden"><div class="qt"></div><div class="qd"></div></div>
      </div>
      <div class="hud-right">
        <button class="pbtn" data-act="bag" title="가방 (I)"><img src="${S.iconURL('bag')}"><span>가방</span></button>
        <button class="pbtn" data-act="quests" title="퀘스트 (J)"><img src="${S.iconURL('quest')}"><span>퀘스트</span></button>
        <button class="pbtn" data-act="weather" title="날씨 바꾸기 (R)"><img data-k="weather"><span>날씨</span></button>
        <button class="pbtn" data-act="fx" title="HD-2D 효과 (F)"><b>FX</b><span>효과</span></button>
        <button class="pbtn" data-act="sound" title="소리 (M)"><b class="snd">♪</b><span>소리</span></button>
        <a class="pbtn" href="./" title="3D 버전으로"><b>3D</b><span>3D판</span></a>
      </div>
      <div class="seedbar panel" data-act="seed"><img class="ico"><div><b class="sn"></b><span class="sc"></span></div><kbd>Q</kbd></div>
      <div class="hint hidden"></div>
      <div class="toasts"></div>
      <div class="dialog hidden"><div class="nametag"></div><div class="text"></div><div class="choices"></div><i class="more">▼</i></div>
      <div class="menu hidden"><div class="menu-card panel"><div class="menu-head"><b class="mt"></b><div class="tabs"></div><button class="x">✕</button></div><div class="menu-sub"></div><div class="list"></div><div class="menu-foot"></div></div></div>
      <div class="pad"><button data-d="up">▲</button><button data-d="left">◀</button><button data-d="right">▶</button><button data-d="down">▼</button></div>
      <div class="abtns"><button class="a" data-k="a">A</button><button class="b" data-k="b">B</button></div>
      <div class="fade"></div>`;
    this.q = (s) => $(s, root);
    this.dlg = null; this.menu = null;
    root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (b) { this.onAction?.(b.dataset.act); this.audio.play('click'); }
    });
    this.q('.menu .x').onclick = () => this.closeMenu();
    this.q('.menu').addEventListener('click', (e) => { if (e.target.classList.contains('menu')) this.closeMenu(); });
    this.q('.dialog').addEventListener('click', (e) => { const c = e.target.closest('.choice'); if (c) { this.dlgChoose(+c.dataset.i); } else this.dlgAdvance(); });
  }

  get busy() { return !!(this.dlg || this.menu); }

  /* ── HUD ── */
  hud(s) {
    this.q('.day').textContent = `${s.day}일차${s.festival ? ' 🎉' : ''}`;
    this.q('.time').textContent = s.clock;
    this.q('.clock .ico').src = this.S.iconURL(s.night ? 'moon' : 'sun');
    this.q('[data-k="weather"]').src = this.S.iconURL(s.raining ? 'rain' : 'sun');
    const coins = this.q('.coins');
    if (coins.dataset.v !== String(s.money)) { coins.dataset.v = s.money; coins.textContent = s.money.toLocaleString(); coins.classList.remove('bump'); void coins.offsetWidth; coins.classList.add('bump'); }
    this.q('.lv').textContent = `Lv.${s.level}`;
    const qp = this.q('.quest');
    if (s.quest) { qp.classList.remove('hidden'); qp.classList.toggle('done', !!s.quest.complete); this.q('.qt').textContent = (s.quest.complete ? '✔ ' : '') + s.quest.title; this.q('.qd').textContent = s.quest.complete ? '눌러서 보상 받기 (J)' : `${s.quest.desc} (${s.quest.count}/${s.quest.goal})`; qp.dataset.act = 'quests'; }
    else qp.classList.add('hidden');
    const sb = this.q('.seedbar');
    sb.querySelector('.ico').src = this.S.iconURL(s.seed.id);
    sb.querySelector('.sn').textContent = `${s.seed.name} 씨앗`;
    sb.querySelector('.sc').textContent = `× ${s.seed.n}`;
    this.q('.snd').textContent = s.sound;
  }

  hint(text) {
    const h = this.q('.hint');
    if (!text || this.busy) { h.classList.add('hidden'); return; }
    h.classList.remove('hidden');
    if (h.dataset.t !== text) { h.dataset.t = text; h.innerHTML = `<kbd>E</kbd> ${text}`; }
  }

  toast(text, icon) {
    const t = el('div', 'toast panel', `${icon ? `<img class="ico" src="${this.S.iconURL(icon)}">` : ''}<span>${text}</span>`);
    this.q('.toasts').appendChild(t);
    setTimeout(() => t.classList.add('out'), 2600);
    setTimeout(() => t.remove(), 3100);
    while (this.q('.toasts').children.length > 4) this.q('.toasts').firstChild.remove();
  }

  fade(on) { this.q('.fade').classList.toggle('on', on); }

  /* ── 대화창 ── */
  say(name, text, choices = null) {
    return new Promise((resolve) => {
      if (this.dlg) this.dlg.resolve(-1);
      const d = this.q('.dialog');
      d.classList.remove('hidden');
      this.q('.nametag').textContent = name || '';
      this.q('.nametag').classList.toggle('hidden', !name);
      this.q('.choices').innerHTML = '';
      this.dlg = { text, shown: 0, choices, sel: 0, resolve, done: false };
      this.hint(null);
      this.renderDlg();
    });
  }
  renderDlg() {
    const D = this.dlg; if (!D) return;
    this.q('.dialog .text').textContent = D.text.slice(0, Math.floor(D.shown));
    const full = D.shown >= D.text.length;
    this.q('.more').classList.toggle('hidden', !full || !!D.choices);
    const ch = this.q('.choices');
    if (full && D.choices) {
      if (!ch.children.length) D.choices.forEach((c) => ch.appendChild(el('div', 'choice', `<i>▶</i>${c}`)));
      [...ch.children].forEach((c, i) => { c.dataset.i = i; c.classList.toggle('sel', i === D.sel); });
    }
  }
  tickDlg(dt) {
    const D = this.dlg; if (!D || D.shown >= D.text.length) return;
    const before = Math.floor(D.shown);
    D.shown = Math.min(D.text.length, D.shown + dt * 46);
    if (Math.floor(D.shown) > before && before % 2 === 0 && D.text[before] !== ' ') this.audio.tone(620 + (D.text.charCodeAt(before) % 7) * 30, 0.03, 'square', 0.025, 0, { rev: 0.05, lp: 2200 });
    this.renderDlg();
  }
  dlgAdvance() {
    const D = this.dlg; if (!D) return;
    if (D.shown < D.text.length) { D.shown = D.text.length; this.renderDlg(); return; }
    if (D.choices) return this.dlgChoose(D.sel);
    this.closeDlg(0);
  }
  dlgChoose(i) { const D = this.dlg; if (!D || D.shown < D.text.length) return; this.audio.play('click'); this.closeDlg(i); }
  closeDlg(v) { const D = this.dlg; this.dlg = null; this.q('.dialog').classList.add('hidden'); D?.resolve(v); }

  /* ── 목록 메뉴 (장터·가방·퀘스트) ── */
  openMenu(m) {
    // m: { title, tabs:[{id,label}], tab, build(tab) → { sub, items:[{icon,label,right,disabled,onPick}], foot } }
    this.menu = { ...m, sel: 0 };
    this.q('.menu').classList.remove('hidden');
    this.renderMenu();
  }
  renderMenu() {
    const M = this.menu; if (!M) return;
    this.q('.mt').textContent = M.title;
    const tabs = this.q('.tabs'); tabs.innerHTML = '';
    (M.tabs || []).forEach((t) => { const b = el('button', 'tab' + (t.id === M.tab ? ' on' : ''), t.label); b.onclick = () => { M.tab = t.id; M.sel = 0; this.audio.play('click'); this.renderMenu(); }; tabs.appendChild(b); });
    const data = M.build(M.tab);
    M.items = data.items;
    this.q('.menu-sub').innerHTML = data.sub || '';
    const list = this.q('.list'); list.innerHTML = '';
    if (!data.items.length) list.appendChild(el('div', 'empty', data.empty || '비어 있어요'));
    M.sel = Math.min(M.sel, Math.max(0, data.items.length - 1));
    data.items.forEach((it, i) => {
      const row = el('div', 'row' + (it.disabled ? ' off' : '') + (i === M.sel ? ' sel' : ''), `<i class="cur">▶</i>${it.icon ? `<img class="ico" src="${this.S.iconURL(it.icon)}">` : ''}<span class="lb">${it.label}</span><span class="rt">${it.right ?? ''}</span>`);
      row.onclick = () => { M.sel = i; this.pickMenu(); };
      row.onmouseenter = () => { if (M.sel !== i) { M.sel = i; [...list.children].forEach((c, k) => c.classList.toggle('sel', k === i)); } };
      list.appendChild(row);
    });
    this.q('.menu-foot').innerHTML = data.foot || '<kbd>↑↓</kbd> 고르기 · <kbd>E</kbd> 결정 · <kbd>Esc</kbd> 닫기';
    list.children[M.sel]?.scrollIntoView?.({ block: 'nearest' });
  }
  pickMenu() {
    const M = this.menu; const it = M?.items?.[M.sel]; if (!it) return;
    if (it.disabled) { this.audio.play('bump', 0.4); return; }
    const keep = it.onPick();
    if (this.menu) this.renderMenu();
    return keep;
  }
  closeMenu() { if (!this.menu) return; const M = this.menu; this.menu = null; this.q('.menu').classList.add('hidden'); M.onClose?.(); }

  /** 키 입력 (UI 가 열려 있으면 true = 소비) */
  key(k) {
    if (this.dlg) {
      const D = this.dlg;
      if (D.choices && D.shown >= D.text.length) {
        if (k === 'up') { D.sel = (D.sel + D.choices.length - 1) % D.choices.length; this.audio.play('click', 0.5); this.renderDlg(); return true; }
        if (k === 'down') { D.sel = (D.sel + 1) % D.choices.length; this.audio.play('click', 0.5); this.renderDlg(); return true; }
        if (k === 'back') { this.dlgChoose(D.choices.length - 1); return true; }
        if (/^[1-9]$/.test(k) && +k <= D.choices.length) { D.sel = +k - 1; this.dlgChoose(D.sel); return true; }
      }
      if (k === 'ok' || k === 'back') { this.dlgAdvance(); return true; }
      return true;
    }
    if (this.menu) {
      const M = this.menu, n = M.items?.length || 0;
      if (k === 'up' && n) { M.sel = (M.sel + n - 1) % n; this.renderMenu(); this.audio.play('click', 0.4); }
      else if (k === 'down' && n) { M.sel = (M.sel + 1) % n; this.renderMenu(); this.audio.play('click', 0.4); }
      else if ((k === 'left' || k === 'right') && M.tabs) { const i = M.tabs.findIndex((t) => t.id === M.tab); M.tab = M.tabs[(i + (k === 'left' ? -1 : 1) + M.tabs.length) % M.tabs.length].id; M.sel = 0; this.renderMenu(); this.audio.play('click', 0.5); }
      else if (k === 'ok') this.pickMenu();
      else if (k === 'back') this.closeMenu();
      return true;
    }
    return false;
  }
}
