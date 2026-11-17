// 위쪽 HUD: 플레이어 배지(얼굴·경험치 고리·레벨)·코인 지갑, 미니맵 위 달력(계절·시각·날씨), 오른쪽 버튼, FPS 칩, 이벤트 배너, 날씨 창
// 보상 날리기(가방·지갑), 레벨업 축하(리본 → 해금 카드)
import { h, esc, LEVEL_PREV } from './dom.js';
import { QUESTS } from '../game/sim/quests.js';
import { PRESET_INFO } from '../game/quality.js';
import { portraitSVG } from './portrait2d.js';
import { showRibbon, showUnlockCard } from './levelup.js';
import { reward } from '../game/reward.js';

/** 끊긴 뒤 이만큼 다시 붙지 못하면 알림 */
export const NET_LOST_MS = 2500;
/** 코인 날리기: 한 번에 날리는 개수(높음/낮음 품질), 동시에 떠 있는 코인 상한, 하나씩 떠나는 간격(ms), 날아가는 시간(ms), 안전하게 다 풀어 주는 시간(ms) */
export const COIN_MAX = 8, COIN_MAX_LOW = 4, COIN_LIVE_CAP = 16, COIN_STAGGER = 45, COIN_FLIGHT = 600, COIN_SAFETY = 1300;
/** 날릴 코인 개수: 15코인마다 하나, 1개 ~ 상한 */
export const coinCount = (amount, low) => Math.max(1, Math.min(low ? COIN_MAX_LOW : COIN_MAX, Math.ceil(amount / 15)));
/** amount 를 n 개로 나눔 (합이 정확히 amount, 앞쪽이 1 많음) */
export function splitCoins(amount, n) {
  const base = Math.floor(amount / n), extra = amount - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < extra ? 1 : 0));
}
/** 경험치 고리 % (이번 레벨 시작점부터) */
export function xpPct(q) {
  const prev = q.level > 1 ? (q.nextXp === q.xp ? q.xp : LEVEL_PREV(q)) : 0;
  return Math.max(0, Math.min(100, Math.round(((q.xp - prev) / Math.max(1, q.nextXp - prev)) * 100)));
}
/** 받지 않은 완료 퀘스트 수 */
export function claimableCount(q) {
  let n = 0;
  for (const x of QUESTS) if (!q.claimed[x.id] && q.isComplete(x)) n++;
  return n;
}
/** 달력 첫 줄: '🌸 봄 1일' (주 안 날짜 '1/7' 은 넓은 화면만, 따로) */
export const seasonLine = (icon, name, dayIn) => `${icon} ${name} ${dayIn}일`;

/** 위쪽 HUD 메서드 (UI.prototype 에 합쳐짐) */
export const HudUI = {
  /** 위쪽 HUD 만들기 (FPS 칩 → 위쪽 막대 → 오른쪽 버튼 → 부스트·이벤트 배너 순서로 붙임) */
  buildHud() {
    const root = this.root;
    this.top = h('div', 'hud-top');
    // 플레이어 배지: 얼굴 + 경험치 고리(--xp) + 'Lv N' 이름표. 누르면 경험치 숫자
    this.badge = h('button', 'p-badge', '<span class="pb-ring"><span class="pb-face"></span></span><span class="pb-lv">Lv <b class="lv">1</b></span><span class="pb-xp"></span>');
    this.badge.setAttribute('aria-label', '레벨');
    this.badge.onclick = () => this.peekXp();
    this.levelChip = this.badge;
    // 코인 지갑: 날아온 코인이 닿는 곳 (this.coinTarget)
    this.purse = h('div', 'purse', '<i class="coin-ico">🪙</i><b class="money">0</b>');
    this.purse.title = '코인';
    this.moneyChip = this.purse;
    this.coinTarget = this.purse;
    // 달력: 미니맵 위에 붙은 나무 판 (계절·날짜 / 시각·날씨·기온). 누르면 날씨 창
    this.calendar = h('button', 'calendar', '<span class="cal-l1"><span class="cal-s">🌸 봄 1일</span><small class="cal-w">1/7</small></span><span class="cal-l2"><b class="cal-t">08:00</b><span class="cal-wx">🌤️</span><span class="cal-temp"></span></span>');
    this.calendar.title = '날씨 자세히 보기 · 계절은 7일마다 바뀌어요 (제철 작물은 빨리 자라고 비싸게 팔려요)';
    this.calendar.onclick = () => this.openWeather();
    this.weatherChip = this.calendar;
    // 오른쪽 버튼: 가방 · 퀘스트(받을 보상 수) · 설정. 단축키는 올리거나 키보드로 고를 때만
    const right = (this.hudRight = h('div', 'hud-right'));
    this.btnBag = h('button', 'ghost hud-btn bag-btn', '🎒<kbd class="kc">I</kbd>');
    this.btnBag.setAttribute('aria-label', '가방 (I)');
    this.btnQuest = h('button', 'ghost hud-btn quest-btn', '📜<b class="qbadge"></b><kbd class="kc">Q</kbd>');
    this.btnQuest.setAttribute('aria-label', '퀘스트 (Q)');
    this.btnSettings = h('button', 'ghost hud-btn set-btn', '⚙️');
    this.btnSettings.setAttribute('aria-label', '환경설정');
    this.btnSettings.title = '환경설정 (그래픽 품질·도움말)';
    this.btnHelp = h('button', 'ghost hud-btn', '❔'); // 화면에는 붙이지 않음: 도움말은 설정 창 안에서
    this.btnSettings.onclick = () => this.openSettings();
    this.btnBag.onclick = () => this.openInventory();
    this.btnQuest.onclick = () => this.openQuests();
    this.btnHelp.onclick = () => this.openHelp();
    right.append(this.btnBag, this.btnQuest, this.btnSettings);
    this.fpsChip = h('div', 'fps-chip', '');
    root.append(this.fpsChip);
    this.top.append(this.badge, this.purse, this.calendar);
    root.append(this.top, right);
    // 성장 부스트: 미니맵 아래 가장자리에 걸친 작은 알약
    this.boostChip = h('div', 'boost-chip', '🌱 <span class="v"></span>');
    this.boostChip.title = '성장 부스트';
    this.boostChip.style.display = 'none';
    root.append(this.boostChip);
    this.banner = h('div', 'event-banner', '');
    this.banner.style.display = 'none';
    root.append(this.banner);
  },

  /** 계절 줄 (season_view 가 날이 바뀔 때 부름) */
  setSeason(icon, name, dayIn) {
    const s = this.calendar?.querySelector('.cal-s'), w = this.calendar?.querySelector('.cal-w');
    if (s) s.textContent = seasonLine(icon, name, dayIn);
    if (w) w.textContent = `${dayIn}/7`;
  },

  // 달력에는 날씨 그림·기온만 (지명·기본 위치 여부는 날씨 창에서)
  setWeather(w, svc) {
    this.weatherInfo = { w, svc };
    const c = this.calendar;
    c.querySelector('.cal-wx').textContent = w.emoji;
    c.querySelector('.cal-temp').textContent = w.temperature != null ? `${Math.round(w.temperature)}°` : '';
    c.setAttribute('aria-label', `날씨 ${w.label}${w.temperature != null ? ` ${Math.round(w.temperature)}도` : ''}`);
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

  /** 월드 위치를 화면 좌표로 (카메라 뒤면 null) */
  _screenOf(worldPos) {
    const v = worldPos.clone().project(this.game.camera);
    if (v.z > 1) return null;
    return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight };
  },

  /** 월드 위치에서 가방 버튼으로 아이콘이 날아감 (가방에 실제로 들어온 물건만) */
  flyToBag(text, worldPos) {
    const g = this.game;
    const s = this._screenOf(worldPos);
    if (!s) return;
    const bag = this.btnBag.getBoundingClientRect();
    const el = h('div', 'fly', text);
    el.style.left = `${s.x - 15}px`; el.style.top = `${s.y - 15}px`;
    document.body.append(el);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      el.style.transform = `translate(${bag.left + bag.width / 2 - s.x}px, ${bag.top + bag.height / 2 - s.y}px) scale(0.5)`;
      el.style.opacity = '0.2';
    }));
    setTimeout(() => { el.remove(); this.btnBag.classList.add('bump'); setTimeout(() => this.btnBag.classList.remove('bump'), 400); g.audio.play('pop'); }, 760);
  },

  /** 코인이 닿을 곳: 장터가 열려 있으면 장터 위쪽 코인, 아니면 HUD 지갑 */
  _coinEl() {
    const mk = this.panel?.classList.contains('market') ? this.panel.querySelector('.mk-coin .money') : null;
    return mk || this.coinTarget?.querySelector('.money') || this.coinTarget;
  },

  /**
   * 코인 날리기: from(월드 Vector3 또는 화면 사각형)에서 지갑으로 🪙 여러 개가 45ms 간격으로 날아감.
   * 닿을 때마다 숫자가 그만큼 올라가고 소리가 반음씩 높아짐 (그동안 HUD 는 아직 안 닿은 몫을 빼고 보여 줌)
   * 화면 밖·숨은 탭·닫힌 창이어도 1.3초 뒤에는 남은 몫을 다 풀어 줌
   */
  flyToCoin(amount, from) {
    const g = this.game;
    amount = Math.round(amount);
    if (!(amount > 0)) return;
    const low = g.quality?.level === 'low';
    const n = coinCount(amount, low), parts = splitCoins(amount, n);
    let sx = innerWidth / 2, sy = innerHeight / 2;
    if (from?.isVector3) { const s = this._screenOf(from); if (s) { sx = s.x; sy = s.y; } } else if (from && 'left' in from) { sx = from.left + from.width / 2; sy = from.top + from.height / 2; }
    this.coinHold = (this.coinHold || 0) + amount;
    const batch = { left: amount, done: false };
    const finish = () => {
      if (batch.done) return;
      batch.done = true;
      if (batch.left > 0) { this.coinHold = Math.max(0, this.coinHold - batch.left); batch.left = 0; this._paintCoin(); }
      this._coinPlus(amount);
    };
    const tgt = this._coinEl()?.getBoundingClientRect();
    parts.forEach((part, k) => {
      setTimeout(() => {
        if (batch.done) return;
        let el = null;
        if (tgt && (this._liveCoins || 0) < COIN_LIVE_CAP && !document.hidden) {
          this._liveCoins = (this._liveCoins || 0) + 1;
          el = h('div', 'fly coin', '🪙');
          if (low) el.style.filter = 'none';
          const jx = (Math.random() - 0.5) * 26, jy = (Math.random() - 0.5) * 18; // 한 점에서 나오지 않게 살짝 흩뿌림
          el.style.left = `${sx + jx - 11}px`; el.style.top = `${sy + jy - 11}px`;
          document.body.append(el);
          requestAnimationFrame(() => requestAnimationFrame(() => {
            el.style.transform = `translate(${tgt.left + tgt.width / 2 - sx - jx}px, ${tgt.top + tgt.height / 2 - sy - jy}px) scale(0.7)`;
          }));
        }
        setTimeout(() => {
          if (el) { el.remove(); this._liveCoins--; }
          if (batch.done) return;
          batch.left -= part;
          this.coinHold = Math.max(0, this.coinHold - part);
          this._paintCoin(true);
          g.audio.play('coin', 0.6, { freq: 1976 * 2 ** (k / 12) });
          if (k === n - 1) finish();
        }, COIN_FLIGHT);
      }, k * COIN_STAGGER);
    });
    setTimeout(finish, COIN_SAFETY);
  },

  /** 코인이 닿음: 장터 위쪽 숫자는 바로, HUD 지갑은 굴러가는 숫자가 따라옴 */
  _paintCoin(bump = false) {
    const el = this._coinEl();
    if (!el) return;
    if (el.closest?.('.mk-coin')) el.textContent = Math.max(0, this.game.economy.money - (this.coinHold || 0)).toLocaleString();
    if (bump) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
  },

  /** '+N' 이 지갑 옆에 잠깐 떠오름 */
  _coinPlus(amount) {
    const el = this._coinEl();
    if (!el?.getBoundingClientRect) return;
    const r = el.getBoundingClientRect();
    if (!r.width) return;
    const f = h('div', 'coin-plus', `+${amount.toLocaleString()}`);
    f.style.left = `${r.right + 4}px`; f.style.top = `${r.top + r.height / 2 - 11}px`;
    document.body.append(f);
    setTimeout(() => f.remove(), 900);
  },

  /** 배지를 누르면 경험치 숫자를 잠깐 */
  peekXp() {
    this.badge.classList.add('show-xp');
    clearTimeout(this._xpPeek);
    this._xpPeek = setTimeout(() => this.badge.classList.remove('show-xp'), 2400);
  },

  /** 받을 수 있는 퀘스트 보상이 있나 (☰ 메뉴의 빨간 점에 씀) */
  hasClaimable() { return claimableCount(this.game.quests) > 0; },

  /**
   * 플레이어 레벨업 축하 (updateHud 가 레벨이 오른 것을 보고 부름 → 퀘스트·체험관 투어·그 밖의 모든 경험치)
   * 바로: 'Lv.N!' 리본(창 위에서도) + 소리 + 배지 금빛. 창·대화·컷신이 없어지면: 만세 + 금빛 반짝임 + 해금 카드
   */
  celebrateLevel(before, after) {
    const g = this.game;
    showRibbon(this.root, { title: `Lv.${after}!`, sub: '레벨이 올랐어요' });
    g.audio?.play('levelup');
    g.audio?.duck?.(0.6, 1.5);
    this.badge.classList.remove('glow'); void this.badge.offsetWidth; this.badge.classList.add('glow');
    clearTimeout(this._glowT);
    this._glowT = setTimeout(() => this.badge.classList.remove('glow'), 700);
    const p = this._lvPending;
    this._lvPending = { before: p ? Math.min(p.before, before) : before, after, at: performance.now() + 1300 }; // 카드는 리본이 거의 지나간 뒤
  },

  /** 미뤄 둔 레벨업 카드: 창·대화·컷신·미니게임이 없을 때 */
  _flushLevel() {
    const p = this._lvPending, g = this.game;
    if (!p || performance.now() < p.at || this.panel || g.dialogue?.active || g.cinema?.locked || this.root.querySelector('.mg-wrap')) return;
    this._lvPending = null;
    reward(g, 3, { sound: null });
    showUnlockCard(this, p.before, p.after, { auto: !!g.autoplay?.on });
  },

  /** 밭·목장·논 숙련도 레벨업: 작은 청록 리본에 새 가공품을 함께 (카드 없음) */
  skillLevelUp(title, recipes = []) {
    const g = this.game;
    showRibbon(this.root, { title, sub: recipes.length ? `새 가공: ${recipes.join(' · ')}` : '솜씨가 늘었어요', skill: true });
    g.audio?.play('win');
  },

  /** 위쪽 막대(HUD)·달력·미니맵이 끝나는 높이를 CSS 변수로: 글자 크기를 키워도 미니맵·목표·알림이 그 아래로 */
  syncHudBottom() {
    const z = +getComputedStyle(this.top).zoom || 1;
    const set = (key, name, v) => { if (v !== this[key] && v > 0) { this[key] = v; this.root.style.setProperty(name, `${v}px`); } };
    set('_hudB', '--hud-b', Math.round(this.top.getBoundingClientRect().bottom / z));
    set('_calB', '--cal-b', Math.round(this.calendar.getBoundingClientRect().bottom / z));
    const map = (this._mapEl ||= this.root.querySelector('.minimap'));
    if (map) set('_mapB', '--map-b', Math.round(map.getBoundingClientRect().bottom / z));
  },

  updateHud() {
    const now = performance.now();
    if (!(now - (this._hudSync || 0) < 500)) { this._hudSync = now; this.syncHudBottom(); }
    const g = this.game;
    // 처음 한 번: 효과 연결 (가방·지갑으로 날리기, 보상 등급) · 배지 얼굴
    if (!this._wired && g.fx) {
      this._wired = true;
      g.fx.onPop = (t, p) => this.flyToBag(t, p);
      g.fx.onCoin = (n, p) => this.flyToCoin(n, p);
      g.reward ||= (tier, o) => reward(g, tier, o);
    }
    if (!this._face && g.player?.unico) {
      this._face = true;
      try { this.badge.querySelector('.pb-face').append(portraitSVG(g.player.unico, { accent: '#30b6aa' })); } catch { /* 얼굴 없이 고리만 */ }
    }
    // 한 번만 뜨는 팁: 0.25초마다 (탭이 숨었다 돌아온 긴 틈은 한 프레임 0.1초로 셈)
    const fdt = Math.min(100, now - (this._hudLast || now));
    this._hudLast = now;
    if ((this._tipAcc = (this._tipAcc || 0) + fdt) >= 250) { this.updateTip?.(this._tipAcc); this._tipAcc = 0; }
    // 접속 표시: 채팅이 처음 넣어 둔 접속 글을 한 번 지움 (서버가 없으면 setOnline 이 불리지 않음)
    if (!this._onlineInit && this.online) { this._onlineInit = true; if (!this._onlineSet) this.setOnline(0, ''); }
    // 코인: 숫자가 굴러가며 바뀜 (날아오는 중인 몫은 닿을 때까지 빼고)
    const target = g.economy.money - (this.coinHold || 0), el0 = this.purse.querySelector('.money');
    if (this.shownMoney === undefined) this.shownMoney = target;
    if (this.shownMoney !== target) {
      const diff = target - this.shownMoney;
      this.shownMoney += Math.sign(diff) * Math.max(1, Math.ceil(Math.abs(diff) * 0.18));
      if (Math.abs(target - this.shownMoney) < 1) this.shownMoney = target;
      // 날아오지 않고 바로 들어온 코인(퀘스트 보상 등)은 예전처럼 숫자가 톡
      if (diff > 0 && !this.coinHold && !el0.classList.contains('bump')) { el0.classList.add('bump'); setTimeout(() => el0.classList.remove('bump'), 400); }
    }
    // 값이 바뀔 때만 DOM 에 씀 (매 프레임 쓰면 스타일 재계산·레이아웃이 계속 일어남)
    const el = (this._el ||= {
      money: this.purse.querySelector('.money'), time: this.calendar.querySelector('.cal-t'), lv: this.badge.querySelector('.lv'),
      xp: this.badge.querySelector('.pb-xp'), boost: this.boostChip.querySelector('.v'), qb: this.btnQuest.querySelector('.qbadge'),
    });
    const put = (key, node, prop, v) => {
      if (this._hv?.[key] === v) return;
      (this._hv ||= {})[key] = v;
      if (prop === 'text') node.textContent = v; else if (prop === 'html') node.innerHTML = v; else if (prop === 'title') node.title = v;
      else if (prop.startsWith('--')) node.style.setProperty(prop, v); else node.style[prop] = v;
    };
    const mv = Math.round(this.shownMoney);
    if (mv !== this._mv) { this._mv = mv; put('money', el.money, 'text', mv.toLocaleString()); }
    // 시계: 시각만 (며칠째인지는 달력 풍선 도움말)
    const ct = g.world.clockText(), sp = ct.lastIndexOf(' ');
    put('time', el.time, 'text', ct.slice(sp + 1));
    put('day', this.calendar, 'title', `${sp > 0 ? ct.slice(0, sp) + ' · ' : ''}날씨 자세히 보기 · 계절은 7일마다 바뀌어요`);
    const q = g.quests;
    put('lv', el.lv, 'text', String(q.level));
    const pct = xpPct(q);
    const hadXp = this._hv?.xpv;
    put('xpv', this.badge, '--xp', String(pct));
    if (hadXp !== undefined && hadXp !== String(pct)) this.pulseXp();
    put('xp', el.xp, 'text', `${q.xp}/${q.nextXp} XP`);
    put('lvTitle', this.badge, 'title', `레벨 ${q.level} · 경험치 ${q.xp}/${q.nextXp}`);
    // 레벨이 오르면 축하 (불러온 기록·되돌리기처럼 한꺼번에 크게 바뀌면 조용히 맞춤)
    const lv = q.level;
    if (this._lvSeen === undefined || lv < this._lvSeen || lv - this._lvSeen > 3) this._lvSeen = lv;
    else if (lv > this._lvSeen) { const b = this._lvSeen; this._lvSeen = lv; this.celebrateLevel(b, lv); }
    if (this._lvPending) this._flushLevel();
    const bl = g.smartfarm.boostLeft;
    put('boostShow', this.boostChip, 'display', bl > 0 ? '' : 'none');
    if (bl > 0) put('boost', el.boost, 'text', `×${g.farm.sim.boost} ${Math.ceil(bl)}초`);
    const ev = g.economy.event, fest = g.economy.festival;
    put('banShow', this.banner, 'display', ev || fest ? '' : 'none');
    if (ev || fest) put('ban', this.banner, 'text', [fest?.name, ev && '📈 ' + ev.name].filter(Boolean).join('  ·  '));
    if (this._fest !== !!fest) { this._fest = !!fest; this.banner.classList.toggle('fest', !!fest); }
    // 받지 않은 완료 퀘스트 수: 매 프레임이라 목록을 복사·정렬하지 않고 세기만, 글자는 수가 바뀔 때만
    const n = claimableCount(q);
    if (n !== this._qn) {
      this._qn = n;
      el.qb.textContent = n ? String(n) : '';
      this.btnQuest.classList.toggle('has', n > 0);
      this.btnQuest.setAttribute('aria-label', `퀘스트 (Q)${n ? ` · 받을 보상 ${n}개` : ''}`);
    }
  },

  /** 경험치가 바뀌면 배지 고리를 살짝 톡 */
  pulseXp() {
    const ring = this.badge.querySelector('.pb-ring');
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
