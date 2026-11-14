// 아래 행동 막대·☰ 버튼·행동 메뉴·자동 진행 칩·전체 화면·사진 찍기
import { h } from './dom.js';
import { isMobileDevice } from '../game/quality.js';

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
    this.bar = h('div', 'actionbar');
    const mk = (icon, label, fn) => { const b = h('button', '', `<span>${icon}</span>${label}`); b.onclick = fn; this.bar.append(b); return b; };
    mk('🦄', '행동', () => this.toggleEmotes());
    mk('💬', '말하기', () => this.chatInput.focus());
    mk('🛒', '장터', () => this.openMarket());
    mk('📖', '도감', () => this.openBook());
    mk('🏢', '체험관', () => game.goKoat());
    mk('🪑', '꾸미기', () => (game.decor?.mode ? game.decor.stop() : game.decor?.open()));
    this.bar.append(h('div', 'sep'));
    mk('🏡', '농장 방', () => this.openRooms());
    this.soundBtn = mk('🔊', '소리', () => {
      const st = game.audio.cycle();
      if (st !== 'off') game.music.start();
      this.soundBtn.firstChild.textContent = { all: '🔊', sfx: '🎵', off: '🔇' }[st];
      this.toast({ all: '🔊 음악·효과음 켜짐', sfx: '🎵 음악 끔 (효과음만)', off: '🔇 소리 끔' }[st]);
    });
    mk('📸', '찰칵', () => this.snapshot());
    this.autoBtn = mk('🤖', '자동', () => game.autoplay.toggle());
    this.autoBtn.title = '오토플레이 (P)';
    // 휴대폰: 전체 화면 (가로 화면에서 주소창이 차지하는 높이를 게임에 씀). 크기는 resize 가 맞춤
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
    this.barToggle.setAttribute('aria-label', '메뉴 열기');
    this.barToggle.onclick = () => this.setBarOpen(!this.root.classList.contains('bar-open'));
    root.append(this.barToggle);
    this.bar.addEventListener('click', (e) => { if (e.target.closest('button')) this.setBarOpen(false); });
    // 터치 기기: 카메라 버튼 (＋ 가까이 · － 멀리 · 🎥 기본 거리로 캐릭터 뒤에서). 시점 돌리기는 오른쪽 화면 밀기
    this.camPad = h('div', 'cam-pad');
    const cb = (txt, label, fn) => { const b = h('button', '', txt); b.setAttribute('aria-label', label); b.title = label; b.onclick = (e) => { e.stopPropagation(); fn(); game.audio.play('click', 0.4); }; this.camPad.append(b); return b; };
    cb('＋', '카메라 가까이', () => game.followCam.zoom(-1));
    cb('－', '카메라 멀리', () => game.followCam.zoom(+1));
    cb('🎥', '카메라 처음 거리로 (캐릭터 뒤에서)', () => game.followCam.resetView(game.player.unico.facing));
    root.append(this.camPad);
    this.emoteMenu = null;
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
    this.barToggle.setAttribute('aria-label', open ? '메뉴 닫기' : '메뉴 열기');
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
