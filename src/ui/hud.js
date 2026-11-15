// 위쪽 HUD: 돈·시계·계절·레벨·날씨 칩, 오른쪽 버튼, FPS 칩, 이벤트 배너, 날씨 창, 가방으로 날아가기
import { h, esc, LEVEL_PREV } from './dom.js';
import { QUESTS } from '../game/sim/quests.js';
import { PRESET_INFO } from '../game/quality.js';

/** 끊긴 뒤 이만큼 다시 붙지 못하면 알림 */
export const NET_LOST_MS = 2500;

/** 위쪽 HUD 메서드 (UI.prototype 에 합쳐짐) */
export const HudUI = {
  /** 위쪽 HUD 만들기 (FPS 칩 → 위쪽 막대 → 이벤트 배너 순서로 붙임) */
  buildHud() {
    const root = this.root;
    // 상단 HUD
    this.top = h('div', 'hud-top');
    this.moneyChip = h('div', 'chip', '🪙 <span class="money">0</span>');
    this.clockChip = h('div', 'chip clock-chip', '<span class="ico">🕒</span><span class="day">1일차</span><span class="t">08:00</span>');
    this.seasonChip = h('div', 'chip season-chip', '🌸 봄 1/7');
    this.seasonChip.title = '계절: 7일마다 바뀌어요. 제철 작물은 빨리 자라고 비싸게 팔려요';
    // 레벨: 넓은 화면은 막대 + 숫자, 휴대폰은 숫자를 두른 작은 고리 (--xp)
    this.levelChip = h('div', 'chip lv-chip', '<span class="lv-t">Lv.</span><span class="lv-ring"><span class="lv">1</span></span><div class="xpbar"><i></i></div><small class="xp"></small>');
    this.weatherChip = h('button', 'chip weather-chip', '🌤️ <span>날씨 확인 중…</span>');
    this.weatherChip.title = '날씨 자세히 보기';
    this.weatherChip.onclick = () => this.openWeather();
    this.boostChip = h('div', 'chip boost-chip', '🌱<span class="lbl"> 성장 부스트</span> <span class="v"></span>');
    this.boostChip.style.display = 'none';
    const right = h('div', 'hud-right');
    this.btnBag = h('button', 'ghost', '🎒<span class="lbl"> 가방</span> <span class="hint-kbd">(I)</span>');
    this.btnQuest = h('button', 'ghost', '📜<span class="lbl"> 퀘스트</span> <span class="hint-kbd">(Q)</span>');
    this.btnHelp = h('button', 'ghost', '❔');
    this.btnSettings = h('button', 'ghost', '⚙️');
    this.btnSettings.title = '환경설정 (그래픽 품질)';
    this.btnSettings.onclick = () => this.openSettings();
    this.btnBag.onclick = () => this.openInventory();
    this.btnQuest.onclick = () => this.openQuests();
    this.btnHelp.onclick = () => this.openHelp();
    right.append(this.btnBag, this.btnQuest, this.btnSettings, this.btnHelp);
    this.fpsChip = h('div', 'fps-chip', '');
    root.append(this.fpsChip);
    this.top.append(this.moneyChip, this.clockChip, this.seasonChip, this.weatherChip, this.levelChip, this.boostChip, right);
    root.append(this.top);
    this.banner = h('div', 'event-banner', '');
    this.banner.style.display = 'none';
    root.append(this.banner);
  },

  // 칩에는 날씨만 (지명·기본 위치 여부는 날씨 창에서). 기온(.w-t)·날씨 이름(.w-l)을 따로 → 휴대폰은 그림 + 기온
  setWeather(w, svc) {
    this.weatherInfo = { w, svc };
    const t = w.temperature != null ? `<span class="w-t">${Math.round(w.temperature)}°</span>` : '';
    this.weatherChip.innerHTML = `${w.emoji}${t}<span class="w-l">${esc(w.label)}</span>`;
    if (this.panel?.dataset.kind === 'weather') this.openWeather();
  },

  openWeather() {
    const info = this.weatherInfo;
    const p = this.openPanel('🌦️ 우리 동네 날씨');
    p.dataset.kind = 'weather';
    if (!info) { p.append(h('div', 'row', '날씨를 불러오는 중이에요…')); return; }
    const { w, svc } = info;
    const src = { live: '실시간 (Open-Meteo)', manual: '수동 설정', offline: '연결 실패 · 맑음으로 표시', default: '기본값' }[svc.source] || svc.source;
    const rows = [
      `${w.emoji} <b>${w.label}</b>${w.temperature != null ? ` · ${Math.round(w.temperature)}°C` : ''}`,
      `📍 ${esc(svc.loc?.name || '-')}${svc.usingDefault ? ' (기본 위치)' : ''}  <small>${svc.usingDefault ? "아래 '📡 내 위치 날씨'를 누르면 지금 있는 동네 날씨로 바뀌어요 (위치는 약 1km 단위로만 써요)" : '(위치 권한을 거부하면 기본 위치를 사용해요)'}</small>`,
      `💨 바람 ${Math.round(w.windKmh || 0)} km/h · ☁️ 구름 ${Math.round(w.cloud * 100)}%`,
      `🔄 출처: ${src} · 15분마다 갱신`,
      `🌱 게임 효과: ${w.autoWater ? '비가 와서 밭에 자동으로 물이 뿌려져요' : w.kind === 'snow' ? '눈 때문에 작물 성장이 40% 느려져요 (스마트팜은 영향 없음)' : w.kind === 'fog' ? '안개로 시야가 짧아져요' : '맑은 날엔 직접 물을 줘야 해요'}`,
    ];
    p.append(h('div', 'rows', rows.map((t) => `<div class="row">${t}</div>`).join('')));
    p.append(h('h3', '', '날씨 바꿔 보기 (체험용)'));
    const grid = h('div', 'room-list');
    const live = h('button', svc.source === 'live' && !svc.usingDefault ? 'cur' : '', svc.usingDefault ? '📡 내 위치 날씨<small>위치 권한을 물어요</small>' : '📡 실시간 날씨<small>현재 위치 기준</small>');
    live.onclick = async () => {
      this.toast('📡 현재 위치 날씨를 불러와요');
      if (!(await svc.useLive())) this.toast('📍 위치를 못 받아 기본 위치 날씨를 보여 줘요');
    };
    grid.append(live);
    for (const [k, label] of [['clear', '☀️ 맑음'], ['cloudy', '☁️ 흐림'], ['rain', '🌧️ 비'], ['storm', '⛈️ 뇌우'], ['snow', '❄️ 눈'], ['fog', '🌫️ 안개']]) {
      const b = h('button', svc.source === 'manual' && w.kind === k ? 'cur' : '', label);
      b.onclick = () => svc.setPreset(k);
      grid.append(b);
    }
    p.append(grid);
  },

  /** 월드 위치에서 가방 버튼으로 아이콘이 날아감 */
  flyToBag(text, worldPos) {
    const g = this.game;
    const v = worldPos.clone().project(g.camera);
    if (v.z > 1) return;
    const x = (v.x + 1) / 2 * innerWidth, y = (1 - v.y) / 2 * innerHeight;
    const bag = this.btnBag.getBoundingClientRect();
    const el = h('div', 'fly', text);
    el.style.left = `${x - 15}px`; el.style.top = `${y - 15}px`;
    document.body.append(el);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      el.style.transform = `translate(${bag.left + bag.width / 2 - x}px, ${bag.top + bag.height / 2 - y}px) scale(0.5)`;
      el.style.opacity = '0.2';
    }));
    setTimeout(() => { el.remove(); this.btnBag.classList.add('bump'); setTimeout(() => this.btnBag.classList.remove('bump'), 400); g.audio.play('pop'); }, 760);
  },

  /** 위쪽 막대(HUD)가 끝나는 높이를 CSS 변수로: 글자 크기를 키워 버튼이 두 줄이 돼도 미니맵·목표·알림이 그 아래로 */
  syncHudBottom() {
    const r = this.top.getBoundingClientRect();
    const z = +getComputedStyle(this.top).zoom || 1;
    const b = Math.round(r.bottom / z);
    if (b !== this._hudB && b > 0) { this._hudB = b; this.root.style.setProperty('--hud-b', `${b}px`); }
  },

  updateHud() {
    const now = performance.now();
    if (!(now - (this._hudSync || 0) < 500)) { this._hudSync = now; this.syncHudBottom(); }
    const g = this.game;
    // 한 번만 뜨는 팁: 0.25초마다 (탭이 숨었다 돌아온 긴 틈은 한 프레임 0.1초로 셈)
    const fdt = Math.min(100, now - (this._hudLast || now));
    this._hudLast = now;
    if ((this._tipAcc = (this._tipAcc || 0) + fdt) >= 250) { this.updateTip?.(this._tipAcc); this._tipAcc = 0; }
    // 접속 표시: 채팅이 처음 넣어 둔 접속 글을 한 번 지움 (서버가 없으면 setOnline 이 불리지 않음)
    if (!this._onlineInit && this.online) { this._onlineInit = true; if (!this._onlineSet) this.setOnline(0, ''); }
    // 코인: 숫자가 굴러가며 바뀜
    const target = g.economy.money;
    if (this.shownMoney === undefined) this.shownMoney = target;
    if (this.shownMoney !== target) {
      const diff = target - this.shownMoney;
      this.shownMoney += Math.sign(diff) * Math.max(1, Math.ceil(Math.abs(diff) * 0.18));
      if (Math.abs(target - this.shownMoney) < 1) this.shownMoney = target;
      const el = this.moneyChip.querySelector('.money');
      if (diff > 0 && !el.classList.contains('bump')) { el.classList.add('bump'); setTimeout(() => el.classList.remove('bump'), 400); }
    }
    // 값이 바뀔 때만 DOM 에 씀 (매 프레임 쓰면 스타일 재계산·레이아웃이 계속 일어남)
    const el = (this._el ||= {
      money: this.moneyChip.querySelector('.money'), day: this.clockChip.querySelector('.day'), time: this.clockChip.querySelector('.t'), lv: this.levelChip.querySelector('.lv'),
      bar: this.levelChip.querySelector('.xpbar i'), xp: this.levelChip.querySelector('.xp'), boost: this.boostChip.querySelector('.v'),
    });
    const put = (key, node, prop, v) => {
      if (this._hv?.[key] === v) return;
      (this._hv ||= {})[key] = v;
      if (prop === 'text') node.textContent = v; else if (prop === 'html') node.innerHTML = v; else if (prop === 'title') node.title = v;
      else if (prop.startsWith('--')) node.style.setProperty(prop, v); else node.style[prop] = v;
    };
    const mv = Math.round(this.shownMoney);
    if (mv !== this._mv) { this._mv = mv; put('money', el.money, 'text', mv.toLocaleString()); }
    // 시계: 'N일차' 와 시각을 따로 (휴대폰은 시각만)
    const ct = g.world.clockText(), sp = ct.lastIndexOf(' ');
    put('day', el.day, 'text', sp > 0 ? ct.slice(0, sp) : '');
    put('time', el.time, 'text', ct.slice(sp + 1));
    const q = g.quests;
    put('lv', el.lv, 'text', String(q.level));
    const prev = q.level > 1 ? (q.nextXp === q.xp ? q.xp : LEVEL_PREV(q)) : 0;
    const pct = Math.min(100, Math.round(((q.xp - prev) / Math.max(1, q.nextXp - prev)) * 100));
    put('bar', el.bar, 'width', pct + '%');
    const hadXp = this._hv?.xpv;
    put('xpv', this.levelChip, '--xp', String(pct));
    if (hadXp !== undefined && hadXp !== String(pct)) this.pulseXp();
    put('xp', el.xp, 'text', `${q.xp}/${q.nextXp}`);
    put('lvTitle', this.levelChip, 'title', `레벨 ${q.level} · 경험치 ${q.xp}/${q.nextXp}`);
    const bl = g.smartfarm.boostLeft;
    put('boostShow', this.boostChip, 'display', bl > 0 ? '' : 'none');
    if (bl > 0) put('boost', el.boost, 'text', `×${g.farm.sim.boost} ${Math.ceil(bl)}초`);
    const ev = g.economy.event, fest = g.economy.festival;
    put('banShow', this.banner, 'display', ev || fest ? '' : 'none');
    if (ev || fest) put('ban', this.banner, 'text', [fest?.name, ev && '📈 ' + ev.name].filter(Boolean).join('  ·  '));
    if (this._fest !== !!fest) { this._fest = !!fest; this.banner.classList.toggle('fest', !!fest); }
    // 받지 않은 완료 퀘스트 수: 매 프레임이라 목록을 복사·정렬하지 않고 세기만, 글자는 수가 바뀔 때만
    let n = 0;
    for (const x of QUESTS) if (!q.claimed[x.id] && q.isComplete(x)) n++;
    if (n !== this._qn) { this._qn = n; this.btnQuest.innerHTML = `📜<span class="lbl"> 퀘스트</span>${n ? ` <b style="color:#d9534f">(${n})</b>` : ''} <span class="hint-kbd">(Q)</span>`; }
  },

  /** 경험치가 바뀌면 휴대폰 레벨 고리를 살짝 톡 */
  pulseXp() {
    const ring = this.levelChip.querySelector('.lv-ring');
    if (!ring) return;
    ring.classList.remove('pulse');
    void ring.offsetWidth; // 처음부터 다시
    ring.classList.add('pulse');
    clearTimeout(this._xpPulse);
    this._xpPulse = setTimeout(() => ring.classList.remove('pulse'), 500);
  },

  /** 함께 있는 사람 수: 나 말고 누가 있을 때만 작은 '👥 N' (혼자·서버 없음이면 숨김)
   *  붙어 있다가 끊겨 2.5초 안에 다시 붙지 못하면 알림 한 번, 그 뒤 다시 붙으면 알림 한 번 (방 이동처럼 바로 다시 붙으면 조용히) */
  setOnline(count, room) {
    const prev = this._onlineN;
    this._onlineN = count;
    if (prev > 0 && count === 0 && !this._netDrop) {
      this._netDrop = setTimeout(() => { this._netDrop = 0; this._netLost = true; this.toast?.('📴 연결이 끊겼어요. 다시 연결해 볼게요', { type: 'warn', key: 'net' }); }, NET_LOST_MS);
    } else if (count > 0) {
      clearTimeout(this._netDrop); this._netDrop = 0;
      if (this._netLost) { this._netLost = false; this.toast?.('📶 다시 연결됐어요', { type: 'info', key: 'net' }); }
    }
    const el = this.online;
    if (!el) return;
    this._onlineSet = true;
    const show = count > 1;
    el.classList.add('online-pill');
    el.style.display = show ? '' : 'none';
    el.textContent = show ? `👥 ${count}` : '';
    el.title = show ? `지금 ${count}명이 함께 있어요${room ? ` · ${room}` : ''}` : '';
  },

  /** 화면 초당 프레임 표시 (환경설정에서 켜기) */
  updateFps(fps) {
    if (fps !== undefined) this.lastFps = fps;
    const on = !!this.game.gfx?.showFps;
    this.fpsChip.style.display = on ? 'block' : 'none';
    const f = Math.round(this.lastFps || 0);
    if (on) this.fpsChip.textContent = `${f} FPS · ${PRESET_INFO[this.game.quality.level]?.name || ''}`;
    const live = this.panel?.querySelector('.gfx-fps');
    if (live) live.textContent = f ? `지금 ${f} FPS` : '측정 중…';
  },
};
