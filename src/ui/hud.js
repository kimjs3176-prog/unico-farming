// 위쪽 HUD: 돈·시계·계절·레벨·날씨 칩, 오른쪽 버튼, FPS 칩, 이벤트 배너, 날씨 창, 가방으로 날아가기
import { h, esc, LEVEL_PREV } from './dom.js';
import { QUESTS } from '../game/sim/quests.js';
import { PRESET_INFO } from '../game/quality.js';

/** 위쪽 HUD 메서드 (UI.prototype 에 합쳐짐) */
export const HudUI = {
  /** 위쪽 HUD 만들기 (FPS 칩 → 위쪽 막대 → 이벤트 배너 순서로 붙임) */
  buildHud() {
    const root = this.root;
    // 상단 HUD
    this.top = h('div', 'hud-top');
    this.moneyChip = h('div', 'chip', '🪙 <span class="money">0</span>');
    this.clockChip = h('div', 'chip', '🕒 <span>1일차 08:00</span>');
    this.seasonChip = h('div', 'chip season-chip', '🌸 봄 1/7');
    this.seasonChip.title = '계절: 7일마다 바뀌어요. 제철 작물은 빨리 자라고 비싸게 팔려요';
    this.levelChip = h('div', 'chip', 'Lv.<span class="lv">1</span> <div class="xpbar"><i></i></div><small class="xp"></small>');
    this.weatherChip = h('button', 'chip weather-chip', '🌤️ <span>날씨 확인 중…</span>');
    this.weatherChip.onclick = () => this.openWeather();
    this.boostChip = h('div', 'chip', '🌱 성장 부스트 <span></span>');
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

  setWeather(w, svc) {
    this.weatherInfo = { w, svc };
    const place = svc.loc?.name ? ` <small>${esc(svc.loc.name)}</small>` : '';
    this.weatherChip.innerHTML = `${w.emoji} <span>${w.temperature != null ? Math.round(w.temperature) + '°' : ''} ${w.label}</span>${place}`;
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
      `📍 ${esc(svc.loc?.name || '-')}  <small>${svc.usingDefault ? "아래 '📡 내 위치 날씨'를 누르면 지금 있는 동네 날씨로 바뀌어요 (위치는 약 1km 단위로만 써요)" : '(위치 권한을 거부하면 기본 위치를 사용해요)'}</small>`,
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
      money: this.moneyChip.querySelector('.money'), clock: this.clockChip.querySelector('span'), lv: this.levelChip.querySelector('.lv'),
      bar: this.levelChip.querySelector('.xpbar i'), xp: this.levelChip.querySelector('.xp'), boost: this.boostChip.querySelector('span'),
    });
    const put = (key, node, prop, v) => { if (this._hv?.[key] !== v) { (this._hv ||= {})[key] = v; if (prop === 'text') node.textContent = v; else if (prop === 'html') node.innerHTML = v; else node.style[prop] = v; } };
    const mv = Math.round(this.shownMoney);
    if (mv !== this._mv) { this._mv = mv; put('money', el.money, 'text', mv.toLocaleString()); }
    put('clock', el.clock, 'text', g.world.clockText());
    const q = g.quests;
    put('lv', el.lv, 'text', String(q.level));
    const prev = q.level > 1 ? (q.nextXp === q.xp ? q.xp : LEVEL_PREV(q)) : 0;
    const pct = Math.min(100, Math.round(((q.xp - prev) / Math.max(1, q.nextXp - prev)) * 100));
    put('bar', el.bar, 'width', pct + '%');
    put('xp', el.xp, 'text', `${q.xp}/${q.nextXp}`);
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

  setOnline(count, room) { this.online.textContent = count > 0 ? `🟢 접속 ${count}명 · ${room}` : '⚪ 오프라인 모드 (서버 없음)'; },

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
