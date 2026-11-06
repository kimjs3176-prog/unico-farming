/**
 * 도트 버전 화면 UI (HTML): 시계·코인·목표, 대화창(한 글자씩 + 선택지), 목록 메뉴, 알림, 모바일 패드
 * 키보드: ↑↓ 고르기, E·Space·Enter 결정, Esc·X 닫기
 */
const $ = (sel, root = document) => root.querySelector(sel);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };

export class UI {
  constructor(root, S, audio) {
    this.root = root; this.S = S; this.audio = audio;
    // HUD 배치 (game-ui-design 스킬: 꼭 필요한 것만 늘 보이고, 나머지는 '메뉴' 안으로)
    //  왼쪽 위: 시간·날씨·코인·레벨 한 장 + 지금 목표 / 오른쪽 위: 가방·퀘스트·메뉴 / 왼쪽 아래: 씨앗 칸 / 가운데 아래: 행동 안내
    root.innerHTML = `
      <div class="hud-left">
        <div class="panel status">
          <div class="srow"><img class="ico tod"><b class="day"></b><span class="time"></span><img class="ico wx"></div>
          <div class="srow"><img class="ico" src="${S.iconURL('coin')}"><b class="coins">0</b><span class="lv chip"></span></div>
        </div>
        <div class="panel quest hidden" data-act="quests"><img class="ico" src="${S.iconURL('quest')}"><div class="qbody"><div class="qt"></div><div class="qbar"><i></i></div><div class="qd"></div></div></div>
      </div>
      <div class="hud-right">
        <button class="pbtn" data-act="bag" aria-label="가방 (I)"><img src="${S.iconURL('bag')}" alt=""><span>가방</span><kbd class="k">I</kbd></button>
        <button class="pbtn" data-act="quests" aria-label="퀘스트 (J)"><img src="${S.iconURL('quest')}" alt=""><span>퀘스트</span><kbd class="k">J</kbd></button>
        <button class="pbtn" data-act="menu" aria-label="메뉴 (Esc)"><b class="burger">☰</b><span>메뉴</span><kbd class="k">Esc</kbd></button>
      </div>
      <div class="seedbar" data-act="seed" aria-label="씨앗 바꾸기 (Q)"><div class="slot"><img class="ico"><i class="cnt"></i></div><div class="slabel"><b class="sn"></b><span><kbd class="k">Q</kbd> 바꾸기</span></div></div>
      <div class="hint hidden"></div>
      <div class="meter panel hidden"></div>
      <div class="smartp panel hidden"></div>
      <div class="toasts"></div>
      <div class="dialog panel hidden"><div class="portrait hidden"><img alt=""></div><div class="dbody"><div class="nametag"></div><div class="text"></div><div class="choices"></div></div><i class="more">▼</i></div>
      <div class="menu hidden"><div class="menu-card panel"><div class="menu-head"><b class="mt"></b><div class="tabs"></div><button class="x" aria-label="닫기">✕</button></div><div class="menu-sub"></div><div class="list"></div><div class="menu-foot"></div></div></div>
      <div class="pad"><button data-d="up" aria-label="위">▲</button><button data-d="left" aria-label="왼쪽">◀</button><button data-d="right" aria-label="오른쪽">▶</button><button data-d="down" aria-label="아래">▼</button></div>
      <div class="abtns"><button class="a" data-k="a" aria-label="결정">A</button><button class="b" data-k="b" aria-label="달리기·뒤로">B</button></div>
      <div class="fade"></div>`;
    this.inputMode = matchMedia('(pointer: coarse)').matches ? 'touch' : 'key';
    this.makeFrame();
    addEventListener('resize', () => this.makeFrame());
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
    this.q('.day').textContent = `${s.day}일차${s.festival ? ' · 축제' : ''}`;
    this.q('.time').textContent = s.clock;
    const tod = this.S.iconURL(s.night ? 'moon' : 'sun'), wx = this.S.iconURL(s.raining ? 'rain' : 'sun');
    if (this.q('.tod').src !== tod) this.q('.tod').src = tod;
    if (this.q('.wx').src !== wx) this.q('.wx').src = wx;
    this.q('.wx').classList.toggle('hidden', !s.raining);
    const coins = this.q('.coins');
    if (coins.dataset.v !== String(s.money)) { coins.dataset.v = s.money; coins.textContent = s.money.toLocaleString(); coins.classList.remove('bump'); void coins.offsetWidth; coins.classList.add('bump'); }
    this.q('.lv').textContent = `Lv.${s.level}`;
    const qp = this.q('.quest');
    // 목표: 대화·메뉴 중에는 숨김 (화면을 가리지 않게)
    if (s.quest && !this.busy) {
      qp.classList.remove('hidden'); qp.classList.toggle('done', !!s.quest.complete);
      this.q('.qt').textContent = (s.quest.complete ? '완료! ' : '') + s.quest.title;
      this.q('.qd').textContent = s.quest.complete ? `${this.keyName('quest')} 보상 받기` : s.quest.desc;
      this.q('.qbar i').style.width = `${Math.min(100, (s.quest.count / s.quest.goal) * 100)}%`;
    } else qp.classList.add('hidden');
    const sb = this.q('.seedbar');
    const si = this.S.iconURL(s.seed.id); if (sb.querySelector('.ico').src !== si) sb.querySelector('.ico').src = si;
    sb.querySelector('.sn').textContent = `${s.seed.name} 씨앗`;
    sb.querySelector('.cnt').textContent = s.seed.n;
    sb.classList.toggle('empty', !s.seed.n);
    this.sound = s.sound;
    // 입력 방식에 맞춘 키 표시 (터치면 숨김)
    if (this.shownMode !== this.inputMode) { this.shownMode = this.inputMode; this.root.classList.toggle('touchmode', this.inputMode === 'touch'); }
  }

  /** 미니게임 계기판 (탈곡 게이지·트랙터 시간/점수). null 이면 숨김 */
  meter(m) {
    const el = this.q('.meter');
    if (!m) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    const bar = m.gauge !== undefined ? `<div class="gauge"><i class="band" style="left:${m.band[0] * 100}%;width:${(m.band[1] - m.band[0]) * 100}%"></i><b style="width:${m.gauge * 100}%" class="${m.ok ? 'ok' : m.hot ? 'hot' : ''}"></b></div>` : '';
    el.innerHTML = `<div class="mh"><span class="mt">${m.title}</span>${m.time === undefined ? '' : `<span class="mtime${m.time <= 5 ? ' warn' : ''}">${Math.ceil(m.time)}초</span>`}</div>${bar}<div class="ms">${m.text}</div>`;
  }

  /** 스마트팜 조작반: 온도·습도·CO₂ 막대(초록 = 적정 범위) + 버튼 4개. sim null 이면 숨김 */
  smart(sim, onAct, text) {
    const el = this.q('.smartp');
    if (!sim) { el.classList.add('hidden'); this.smartAct = null; return; }
    if (onAct) {
      this.smartAct = onAct;
      el.innerHTML = `<div class="mh"><span class="mt">스마트팜 환경 제어</span><span class="mtime"></span></div><div class="bars"></div><div class="ms"></div>
        <div class="acts">${[['heater', '1 난방'], ['vent', '2 환기'], ['mist', '3 분무'], ['co2', '4 CO₂']].map(([k, l]) => `<button data-sa="${k}">${l}</button>`).join('')}</div>`;
      el.querySelectorAll('[data-sa]').forEach((b) => b.addEventListener('pointerdown', (e) => { e.preventDefault(); this.smartAct?.(b.dataset.sa); }));
    }
    el.classList.remove('hidden');
    el.querySelector('.mtime').textContent = `${Math.ceil(sim.time)}초`;
    el.querySelector('.mtime').classList.toggle('warn', sim.time <= 5);
    el.querySelector('.bars').innerHTML = Object.values(sim.vars).map((v) => {
      const k = (x) => ((x - v.lo) / (v.hi - v.lo)) * 100;
      const ok = v.value >= v.min && v.value <= v.max;
      return `<div class="bar"><span class="bn">${v.name}</span><div class="gauge"><i class="band" style="left:${k(v.min)}%;width:${k(v.max) - k(v.min)}%"></i><b class="pin ${ok ? 'ok' : 'hot'}" style="left:${k(v.value)}%"></b></div><span class="bv ${ok ? 'ok' : ''}">${Math.round(v.value)}${v.unit}</span></div>`;
    }).join('');
    if (text !== undefined) el.querySelector('.ms').textContent = text;
  }

  hint(text) {
    this._hintText = text;
    const h = this.q('.hint');
    if (!text || this.busy) { h.classList.add('hidden'); return; }
    h.classList.remove('hidden');
    const key = this.keyName('ok');
    if (h.dataset.t !== text + key) { h.dataset.t = text + key; h.innerHTML = `<kbd class="act">${key}</kbd><span>${text}</span>`; }
  }

  toast(text, icon) {
    const box = this.q('.toasts');
    const same = [...box.children].find((c) => c.dataset.t === text && !c.classList.contains('out'));
    if (same) {
      // 같은 알림은 합쳐서 ×n (game-ui-design: 알림 묶기)
      same.dataset.n = (+same.dataset.n || 1) + 1;
      same.querySelector('.n').textContent = `×${same.dataset.n}`;
      clearTimeout(same._t1); clearTimeout(same._t2);
      same.classList.remove('pop'); void same.offsetWidth; same.classList.add('pop');
      same._t1 = setTimeout(() => same.classList.add('out'), 2600); same._t2 = setTimeout(() => same.remove(), 3000);
      return;
    }
    const t = el('div', 'toast panel', `${icon ? `<img class="ico" src="${this.S.iconURL(icon)}" alt="">` : ''}<span>${text}</span><b class="n"></b>`);
    t.dataset.t = text;
    box.appendChild(t);
    t._t1 = setTimeout(() => t.classList.add('out'), 2600);
    t._t2 = setTimeout(() => t.remove(), 3000);
    while (box.children.length > 3) box.firstChild.remove();
  }

  /** 지금 입력 방식에 맞는 버튼 이름 */
  keyName(what) {
    const touch = this.inputMode === 'touch';
    if (what === 'ok') return touch ? 'A' : this.inputMode === 'mouse' ? '클릭' : 'E';
    if (what === 'quest') return touch ? '눌러서' : 'J';
    return '';
  }

  /** 도트 금테 틀 (9칸 나누기 이미지): 화면 배율(--u)에 맞춰 한 점 = u 픽셀로 다시 그림 */
  makeFrame() {
    const u = Math.max(1, Math.round(parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--u')) || 2));
    if (this.frameU === u) return;
    this.frameU = u;
    const N = 18, C = 6; // 18×18 원본, 모서리 6칸
    const c = document.createElement('canvas'); c.width = c.height = N * u;
    const g = c.getContext('2d');
    const px = (x, y, col) => { g.fillStyle = col; g.fillRect(x * u, y * u, u, u); };
    const ink = '#140f22', d = '#a6621a', m = '#e0a23a', l = '#ffe08a', teal = '#36b9a4', tl = '#9ff2dc';
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const e = Math.min(i, j, N - 1 - i, N - 1 - j);
      if (e === 0) px(i, j, ink);
      else if (e === 1) px(i, j, (i <= 1 || j <= 1) && i < N - 2 && j < N - 2 ? l : d); // 위·왼쪽 빛, 아래·오른쪽 그늘
      else if (e === 2) px(i, j, m);
      else if (e === 3) px(i, j, ink);
    }
    // 모서리 보석 (청록 마름모 + 반짝임)
    for (const [cx, cy] of [[2, 2], [N - 3, 2], [2, N - 3], [N - 3, N - 3]]) {
      for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) px(cx + dx, cy + dy, ink);
      px(cx, cy, teal); px(cx - 1 + (cx > N / 2 ? 2 : 0), cy - 1 + (cy > N / 2 ? 2 : 0), ink);
      px(cx, cy, cx < N / 2 && cy < N / 2 ? tl : teal);
    }
    const st = document.documentElement.style;
    st.setProperty('--frame', `url(${c.toDataURL()})`);
    st.setProperty('--fslice', String(C * u));
    st.setProperty('--fw', `${C * u}px`);
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
      // 말하는 캐릭터 얼굴 (이름으로 찾음)
      const face = name && this.portraitFor?.(name);
      const pt = this.q('.portrait');
      pt.classList.toggle('hidden', !face);
      if (face && pt.firstChild.src !== face) pt.firstChild.src = face;
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
        // 선택지가 가로로 놓여 있어 ←/→ 로 고름 (↑/↓ 도 됨)
        if (k === 'up' || k === 'left') { D.sel = (D.sel + D.choices.length - 1) % D.choices.length; this.audio.play('click', 0.5); this.renderDlg(); return true; }
        if (k === 'down' || k === 'right') { D.sel = (D.sel + 1) % D.choices.length; this.audio.play('click', 0.5); this.renderDlg(); return true; }
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
