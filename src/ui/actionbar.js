// 아래 행동 막대·☰ 버튼·행동 메뉴·자동 진행 칩·전체 화면·사진 찍기
import { h } from './dom.js';
import { isMobileDevice } from '../game/quality.js';
import { COACH, hudParams, initHud, newReveals, isVisible } from '../game/sim/hud_reveal.js';

/** iPhone·iPad 인가 (iPadOS 사파리는 'Macintosh' 로 알려서 터치 점 수로 가림) */
export function isIOS(nav = typeof navigator !== 'undefined' ? navigator : null) {
  const ua = nav?.userAgent || '';
  return /iP(hone|ad|od)/.test(ua) || (/Macintosh/.test(ua) && (nav.maxTouchPoints || 0) > 1);
}

/** 전체 화면을 쓸 수 있는 휴대폰인가 (iPhone 사파리는 API 가 없어 false, 홈 화면 앱으로 연 경우도 false — 이미 전체 화면) */
export function canFullscreen(doc = typeof document !== 'undefined' ? document : null) {
  if (!doc || !(doc.fullscreenEnabled || doc.webkitFullscreenEnabled) || !isMobileDevice()) return false;
  return !(typeof matchMedia !== 'undefined' && matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches);
}
/** 전체 화면 켜고 끄기 (누른 그 순간에 불러야 함. 거부되면 조용히 무시) */
export function toggleFullscreen(doc = document) {
  const p = doc.fullscreenElement || doc.webkitFullscreenElement
    ? (doc.exitFullscreen ? doc.exitFullscreen() : doc.webkitExitFullscreen?.())
    : (doc.documentElement.requestFullscreen ? doc.documentElement.requestFullscreen({ navigationUI: 'hide' }) : doc.documentElement.webkitRequestFullscreen?.());
  p?.catch?.(() => {});
}

/** 행동 막대 메서드 (UI.prototype 에 합쳐짐) */
export const ActionbarUI = {
  /** 행동 막대 → ☰ 버튼 만들기 */
  buildActionbar() {
    const game = this.game, root = this.root;
    // 하단 액션바 (참고: 감정표현 / 말하기 / 찰칵 / 소리 / 방)
    // k 가 있는 버튼은 단계적 공개 (hud_reveal.js): 차례가 오거나 접속해야 보임
    this.bar = h('div', 'actionbar');
    this.hudBtns = {};
    const mk = (icon, label, fn, k) => {
      const b = h('button', '', `<span>${icon}</span>${label}`);
      b.onclick = fn;
      if (k) { b.dataset.k = k; this.hudBtns[k] = b; b.hidden = !isVisible(k, game.flags?.hud, game.net?.connected); }
      this.bar.append(b);
      return b;
    };
    mk('🦄', '행동', () => this.toggleEmotes(), 'emote');
    mk('💬', '말하기', () => this.chatInput.focus(), 'talk');
    mk('🛒', '장터', () => this.openMarket(), 'market');
    mk('📖', '도감', () => this.openBook(), 'book');
    mk('🏢', '체험관', () => game.goKoat(), 'koat');
    mk('🪑', '꾸미기', () => (game.decor?.mode ? game.decor.stop() : game.decor?.open()), 'decor');
    this.bar.append(h('div', 'sep'));
    mk('🏡', '농장 방', () => this.openRooms(), 'rooms');
    this.soundBtn = mk('🔊', '소리', () => {
      const st = game.audio.cycle();
      if (st !== 'off') game.music.start();
      this.soundBtn.firstChild.textContent = { all: '🔊', sfx: '🎵', off: '🔇' }[st];
      this.toast({ all: '🔊 음악·효과음 켜짐', sfx: '🎵 음악 끔 (효과음만)', off: '🔇 소리 끔' }[st]);
    });
    mk('📸', '찰칵', () => this.snapshot());
    this.autoBtn = mk('🤖', '자동', () => game.autoplay.toggle(), 'auto');
    this.autoBtn.title = '오토플레이 (P)';
    // ☰ 메뉴(휴대폰)에만: 환경설정·도움말 (넓은 화면은 오른쪽 위 버튼)
    for (const [icon, label, fn] of [['⚙️', '설정', () => this.openSettings()], ['❓', '도움말', () => this.openHelp()]]) mk(icon, label, fn).classList.add('mob-only');
    if (canFullscreen()) {
      this.fsBtn = mk('⛶', '전체 화면', () => toggleFullscreen());
      this.fsBtn.classList.add('fs-btn');
      this.bar.classList.add('has-fs');
      // 'on' 은 붙이지 않음 (오토플레이의 '켜짐' 강조·통통 튀기가 따라옴) — 이름만 바꿈
      const sync = () => {
        const on = !!(document.fullscreenElement || document.webkitFullscreenElement);
        this.fsBtn.innerHTML = on ? '<span>🗗</span>창 모드' : '<span>⛶</span>전체 화면';
      };
      document.addEventListener('fullscreenchange', sync);
      document.addEventListener('webkitfullscreenchange', sync);
    }
    root.append(this.bar);
    // 모바일: 행동 막대는 ☰ 버튼 하나로 접어 두고, 누르면 펼침 (버튼을 고르면 다시 접힘)
    this.barToggle = h('button', 'bar-toggle', '☰');
    this.barToggle.title = '메뉴';
    this.barToggle.onclick = () => this.setBarOpen(!this.root.classList.contains('bar-open'));
    root.append(this.barToggle);
    this.bar.addEventListener('click', (e) => { if (e.target.closest('button')) this.setBarOpen(false); });
    this.emoteMenu = null;
    this.startHudReveal();
  },

  toggleEmotes() {
    if (this.emoteMenu) { this.emoteMenu.remove(); this.emoteMenu = null; return; }
    const EMOTES = [['cheer', '🙌', '깡총'], ['wave', '👋', '인사'], ['heart', '❤️', '하트'], ['think', '🤔', '생각'], ['present', '📊', '발표'], ['megaphone', '📣', '외치기']];
    const m = h('div', 'emote-menu');
    for (const [pose, icon, name] of EMOTES) {
      const b = h('button', '', `${icon}<small>${name}</small>`);
      b.onclick = () => { this.game.player.unico.playAction(pose, 2.5); this.game.audio.play('click'); m.remove(); this.emoteMenu = null; };
      m.append(b);
    }
    const hat = h('button', '', `👒<small>모자</small>`);
    hat.onclick = () => { const u = this.game.player.unico; u.setOutfit({ hat: u.outfit.hat === 'straw' ? null : 'straw' }); m.remove(); this.emoteMenu = null; };
    m.append(hat);
    this.root.append(m);
    this.emoteMenu = m;
  },

  snapshot() {
    const g = this.game, cv = g.renderer.domElement;
    g.postfx.render(); // 그린 직후 같은 태스크 안에서 읽어야 함 (preserveDrawingBuffer 없음)
    g.audio.play('click');
    const name = `unico-farm-${Date.now()}.png`;
    // iPhone·iPad: 공유 시트로 (내려받기로는 사진 앱에 저장되지 않음). 누른 그 순간에 불러야 막히지 않으므로 동기로 파일을 만듦
    // (휴대폰 화면 캔버스는 작아서 동기 인코딩이 짧음)
    if (isIOS()) {
      const url = cv.toDataURL('image/png');
      if (navigator.canShare) {
        let file = null;
        try {
          const bin = atob(url.split(',')[1]), u8 = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
          file = new File([u8], name, { type: 'image/png' });
        } catch { file = null; }
        if (file && navigator.canShare({ files: [file] })) {
          navigator.share({ files: [file], title: '유니코 팜' })
            .then(() => this.toast('📸 찰칵! 사진을 저장·공유했어요'))
            .catch((e) => { if (e?.name !== 'AbortError') this._download(url, name); });
          return;
        }
      }
      return this._download(url, name);
    }
    // PC·안드로이드: 내려받기가 다운로드·갤러리에 바로 저장됨. 인코딩은 비동기로 (큰 화면에서도 멈추지 않게, 그림은 부른 순간의 것)
    if (!cv.toBlob) return this._download(cv.toDataURL('image/png'), name);
    cv.toBlob((blob) => {
      if (!blob) return this.toast('📸 스크린샷을 만들지 못했어요');
      const url = URL.createObjectURL(blob);
      this._download(url, name);
      setTimeout(() => URL.revokeObjectURL(url), 10000); // 내려받기가 시작될 시간을 두고 해제
    }, 'image/png');
  },

  _download(url, name) {
    const a = document.createElement('a');
    a.href = url; a.download = name; a.click();
    // iOS 사파리는 사진 앱이 아니라 파일 앱에 내려받음 → 결과에 맞게 안내
    this.toast(isIOS() ? '📸 찰칵! 파일 앱 > 다운로드에 저장돼요' : '📸 찰칵! 스크린샷을 저장했어요');
  },

  setBarOpen(open) {
    this.root.classList.toggle('bar-open', open);
    this.barToggle.textContent = open ? '✕' : '☰';
    if (open) {
      // 접혀 있는 동안 새로 열린 버튼은 펼칠 때 한 번 통 튀김
      this.barToggle.classList.remove('dot');
      for (const b of this._pendingBounce || []) { b.classList.remove('bounce'); void b.offsetWidth; b.classList.add('bounce'); }
      this._pendingBounce = [];
    }
    this._syncDot();
  },

  /** ☰ 빨간 점: 접힌 채 새 버튼이 열렸거나 받을 보상이 있을 때 */
  _syncDot() {
    const open = this.root.classList.contains('bar-open');
    const on = !open && (this._pendingBounce?.length > 0 || !!this.hasClaimable?.());
    this.barToggle?.classList.toggle('dot', on);
  },

  /** 단계적 공개: 처음 한 번은 생성 직후(저장을 읽은 뒤), 그 다음은 1초마다 (main.js 를 건드리지 않음) */
  startHudReveal() {
    this._hudParams = hudParams(globalThis.location?.search || '');
    this._pendingBounce = [];
    if (typeof setTimeout !== 'function') return;
    setTimeout(() => {
      this.hudTick(true);
      if (typeof setInterval === 'function') this._hudTimer = setInterval(() => this.hudTick(false), 1000);
    }, 0);
  },

  /** 1초마다: 새로 열 버튼·접속 중 버튼 보이기 */
  hudTick(first = false) {
    const g = this.game;
    if (!g?.flags) return;
    try {
      if (!Array.isArray(g.flags.hud)) g.flags.hud = initHud(g.flags, !!g._introPending || !g.flags.intro);
      const hud = g.flags.hud;
      const q = g.quests || {};
      const fresh = newReveals(hud, { progress: q.progress, claimed: q.claimed, level: q.level, book: Object.keys(g.collection?.entries || {}).length, params: this._hudParams });
      for (const k of fresh) {
        hud.push(k);
        if (!first) this.announceReveal(k);
      }
      const net = !!g.net?.connected;
      for (const [k, b] of Object.entries(this.hudBtns || {})) {
        const vis = isVisible(k, hud, net);
        if (b.hidden === vis) b.hidden = !vis;
      }
      // 휴대폰 ☰ 칸 수: 보이는 버튼 수에 맞춰 두 줄 이하 (5칸 이상)
      const cols = String(Math.max(5, Math.ceil(this.bar.querySelectorAll('button:not([hidden])').length / 2)));
      if (cols !== this._abCols) { this._abCols = cols; this.bar.style.setProperty('--ab-cols', cols); }
      this.root.classList.toggle('net-off', !net); // 오프라인: 채팅·접속 줄 숨김
      this._syncDot();
    } catch { /* 공개 상태를 못 읽어도 게임은 계속 */ }
  },

  /** 새 버튼 등장: NEW 표시 + 통 튀김 + 한 줄 안내 (접혀 있으면 ☰ 에 빨간 점) */
  announceReveal(k) {
    const b = this.hudBtns?.[k];
    if (!b) return;
    b.hidden = false;
    b.classList.add('is-new');
    b.addEventListener('click', () => b.classList.remove('is-new'), { once: true });
    const collapsed = this.barToggle && getComputedStyle(this.barToggle).display !== 'none' && !this.root.classList.contains('bar-open');
    if (collapsed) this._pendingBounce.push(b);
    else { b.classList.remove('bounce'); void b.offsetWidth; b.classList.add('bounce'); }
    if (COACH[k]) this.toast(COACH[k]);
    this.game.audio?.play?.('pop', 0.6);
  },

  /** 오토플레이 상태 표시: text=null 이면 숨김 */
  setAuto(text, on) {
    this.autoBtn?.classList.toggle('on', !!on);
    if (!this.autoChip) {
      this.autoChip = h('div', 'auto-chip hidden');
      this.autoChip.onclick = () => this.game.autoplay.toggle(false);
      this.autoChip.title = '눌러서 오토플레이 끄기';
      document.getElementById('ui').append(this.autoChip);
    }
    this.autoChip.classList.toggle('hidden', !text);
    const html = text ? `<b>🤖 자동</b> ${text} <i>✕</i>` : '';
    if (html !== this.autoHtml) { this.autoChip.innerHTML = html; this.autoHtml = html; }
  },
};
