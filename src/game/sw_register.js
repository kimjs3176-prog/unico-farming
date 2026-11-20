// 설치형 앱: 서비스 워커 등록(오프라인으로도 열림)·새 버전 알림·'앱으로 설치' 단추 (index.html 이 따로 불러옴)
//  - 배포 빌드에서만, 게임이 뜬 뒤 한가할 때 등록. 자동 시험 브라우저(navigator.webdriver)·?nosw 에서는 등록하지 않음
//  - ?sw=off: 등록을 지우고 'unico-*' 캐시를 비움 (문제가 생겼을 때 끄는 스위치)
//  - 새 버전이 기다리면 알림 한 번 → 설정의 '지금 새로 고침'(저장 → 새 워커 켜기 → 한 번만 새로 고침). 놀이 중에는 저절로 새로 고치지 않음
//  - 설정 창은 game.pwa.renderSettings(el) 를 부름 (설치 단추·아이폰 안내·새로 고침 단추).
//    설정 창 코드가 아직 부르지 않으면 열릴 때 제목 아래에 '.pwa-row' 칸을 끼워 넣음 (mountSettingsRow)

/** 이 간격(ms)마다 새 버전 확인 (오래 켜 둔 전시용 화면도 알도록) */
export const SW_CHECK_MS = 45 * 60 * 1000;
export const UPDATE_TOAST = '새 버전이 준비됐어요 · 설정에서 적용할 수 있어요';
/** 새로 고침을 눌렀는데 이 시간(ms) 안에 새 워커가 안 켜지면 단추를 다시 살림 */
export const APPLY_WAIT_MS = 5000;
/** 다른 탭이 답하기를 기다리는 시간(ms) */
export const TAB_PING_MS = 300;

/** 서비스 워커를 등록해도 되는가 */
export function swAllowed({ prod, nav, search = '' }) {
  if (!prod || !nav || !('serviceWorker' in nav) || nav.webdriver) return false;
  const q = new URLSearchParams(search);
  return !q.has('nosw') && q.get('sw') !== 'off';
}

/** 이미 설치된 앱(전체 화면·홈 화면 앱)으로 열렸나 */
export function isStandalone(win = typeof window !== 'undefined' ? window : null) {
  if (!win) return false;
  try { if (win.matchMedia?.('(display-mode: fullscreen), (display-mode: standalone)').matches) return true; } catch { /* 모름 */ }
  return win.navigator?.standalone === true;
}

/** iPhone·iPad (설치 단추가 없어 '공유 → 홈 화면에 추가' 안내) */
export function isIOSNav(nav) {
  const ua = nav?.userAgent || '';
  return /iP(hone|ad|od)/.test(ua) || (/Macintosh/.test(ua) && (nav.maxTouchPoints || 0) > 1);
}

/** 지금 새로 고침을 막아야 하는 때: 미니게임·컷신·대화 중 */
export function playBusy(g, doc = typeof document !== 'undefined' ? document : null) {
  return !!(g?.busy?.() || g?.cinema?.locked || doc?.querySelector?.('#ui .mg-wrap'));
}

/**
 * 설치·새 버전 상태 (game.pwa). 설정 창에 단추를 그리고, 바뀌면 열린 설정 칸을 다시 그림
 */
export class Pwa {
  constructor(win, game = null) {
    this.win = win; this.game = game;
    this.prompt = null; // beforeinstallprompt 이벤트 (설치 단추용)
    this.reg = null; this.waiting = null;
    this.installed = false; this._reloading = false; this._toasted = false;
    this._els = new Set();
  }

  /** 설치 단추를 보일까: 설치 이벤트가 있고 아직 앱으로 열리지 않음 */
  get canInstall() { return !!this.prompt && !this.installed && !isStandalone(this.win); }
  /** 아이폰·아이패드 사파리: 설치 이벤트가 없어 안내만 */
  get iosTip() { return isIOSNav(this.win?.navigator) && !isStandalone(this.win); }

  async install() {
    const p = this.prompt;
    if (!p) return false;
    this.prompt = null;
    try { p.prompt(); const r = await p.userChoice; this.installed = r?.outcome === 'accepted'; } catch { /* 취소 */ }
    this.refresh();
    return this.installed;
  }

  /** 새 워커가 기다림 → 알림 한 번 + 설정 단추 */
  setWaiting(w) {
    this.waiting = w || null;
    if (w && !this._toasted && this.game?.ui?.toast) { this._toasted = true; this.game.ui.toast(`✨ ${UPDATE_TOAST}`, { key: 'sw', type: 'info' }); }
    this.refresh();
  }

  /** 저장 → 새 워커 켜기 → 주인이 바뀌면 한 번만 새로 고침. 놀이 중이면 하지 않음 */
  applyUpdate() {
    const w = this.waiting;
    if (!w || this._reloading || playBusy(this.game, this.win?.document)) return false;
    this._reloading = true;
    try { this.game?.save?.(); } catch { /* 저장 실패여도 새로 고침은 */ }
    const sw = this.win?.navigator?.serviceWorker;
    let changed = false;
    sw?.addEventListener?.('controllerchange', () => { changed = true; this.win.location.reload(); }, { once: true });
    w.postMessage('SKIP_WAITING');
    this.refresh(); // 누른 단추는 바로 꺼짐
    // 새 워커가 버려지거나 안 켜지면 단추가 계속 꺼져 있지 않게
    const later = this.win?.setTimeout?.bind(this.win) || setTimeout;
    later(() => { if (!changed) { this._reloading = false; this.refresh(); } }, APPLY_WAIT_MS)?.unref?.();
    return true;
  }

  /** 설정 창의 한 칸: 앱으로 설치 · 아이폰 안내 · 새 버전 적용 (없으면 비움) */
  renderSettings(el) {
    if (!el) return;
    this._els.add(el);
    const doc = el.ownerDocument || this.win?.document;
    el.replaceChildren();
    if (this.canInstall) {
      const b = doc.createElement('button');
      b.className = 'pwa-install';
      this._label(b, 'install', '앱으로 설치');
      b.title = '홈 화면·바탕 화면에 유니코 팜을 앱처럼 두고, 인터넷이 끊겨도 열 수 있어요';
      b.onclick = () => this.install();
      el.append(b);
    } else if (this.iosTip) {
      const p = doc.createElement('p');
      p.className = 'pwa-tip';
      this._label(p, 'install', '아이폰·아이패드: 사파리 아래 공유 단추 → \'홈 화면에 추가\' 를 누르면 앱처럼 열 수 있어요');
      el.append(p);
    }
    if (this.waiting) {
      const b = doc.createElement('button');
      b.className = 'pwa-update';
      const busy = playBusy(this.game, doc);
      this._label(b, 'auto', '지금 새로 고침');
      b.title = busy ? '미니게임·이야기가 끝난 뒤에 눌러 주세요' : '저장하고 새 버전으로 다시 열어요';
      b.disabled = busy || this._reloading;
      b.onclick = () => this.applyUpdate();
      const t = doc.createElement('small');
      t.textContent = '새 버전이 준비됐어요 (농장은 저장돼요)';
      el.append(b, t);
    }
    el.hidden = !el.childElementCount;
  }

  /** 글 + 자체 아이콘 (UI 믹스인 ico 가 있을 때만, 없으면 글만) */
  _label(el, icon, text) {
    const ic = this.game?.ui?.ico;
    if (typeof ic === 'function') el.innerHTML = `${ic(icon)}<span>${text.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c])}</span>`;
    else el.textContent = text;
  }

  /** 상태가 바뀌면 화면에 붙어 있는 칸만 다시 그림 */
  refresh() {
    for (const el of this._els) { if (el.isConnected) this.renderSettings(el); else this._els.delete(el); }
  }
}

/**
 * 설정 창(panel)에 설치·새 버전 칸을 넣음 (제목 바로 아래). 설정 창 코드가 직접 '.pwa-row' 를 그렸으면 그대로 둠
 * @returns 넣었거나 이미 있는 칸 (설정 창이 아니면 null)
 */
export function mountSettingsRow(panel, pwa) {
  if (!panel || panel.dataset?.kind !== 'settings') return null;
  const had = panel.querySelector?.('.pwa-row');
  if (had) return had;
  const doc = panel.ownerDocument;
  const row = doc.createElement('div');
  row.className = 'pwa-row';
  pwa.renderSettings(row);
  const head = panel.querySelector?.('h2');
  if (head?.after) head.after(row); else panel.append(row);
  return row;
}

/** 설정 창이 열릴 때마다 칸을 넣도록 ui.openSettings 를 감쌈 (한 번만) */
export function hookSettings(ui, pwa) {
  const open = ui?.openSettings;
  if (typeof open !== 'function' || open.__pwa) return false;
  const wrapped = function (...a) {
    const r = open.apply(this, a);
    try { mountSettingsRow(this.panel, pwa); } catch { /* 설정 창은 그대로 */ }
    return r;
  };
  wrapped.__pwa = true;
  ui.openSettings = wrapped;
  return true;
}

/**
 * 같은 사이트를 연 다른 탭이 있나 (BroadcastChannel 로 물어보고 ms 안에 답이 오면 true).
 * 알 수 없으면(BroadcastChannel 없음) 있다고 봄 → 제목 화면에서 저절로 새 버전을 켜지 않음
 */
export function otherTabs(win, ms = TAB_PING_MS) {
  const BC = win?.BroadcastChannel;
  if (typeof BC !== 'function') return Promise.resolve(true);
  return new Promise((done) => {
    let ch;
    try { ch = new BC('unico-tabs'); } catch { done(true); return; }
    const end = (v) => { try { ch.close(); } catch { /* 이미 닫힘 */ } done(v); };
    ch.onmessage = (e) => { if (e?.data === 'here') end(true); };
    try { ch.postMessage('ping'); } catch { end(true); return; }
    (win.setTimeout?.bind(win) || setTimeout)(() => end(false), ms);
  });
}

/** 다른 탭이 물으면 '여기 있어요' 로 답함 (탭마다 한 번) */
export function answerTabs(win) {
  const BC = win?.BroadcastChannel;
  if (typeof BC !== 'function') return null;
  try {
    const ch = new BC('unico-tabs');
    ch.onmessage = (e) => { if (e?.data === 'ping') ch.postMessage('here'); };
    return ch;
  } catch { return null; }
}

/** 'unico-*' 캐시와 등록을 모두 지움 (?sw=off) */
export async function swOff(win) {
  try { for (const r of await win.navigator.serviceWorker.getRegistrations()) await r.unregister(); } catch { /* 없음 */ }
  try { for (const k of await win.caches.keys()) if (k.startsWith('unico-')) await win.caches.delete(k); } catch { /* 없음 */ }
}

/** 등록 + 새 버전 살피기 */
async function register(win, pwa) {
  const nav = win.navigator;
  const base = (import.meta.env?.BASE_URL || '/');
  let reg;
  try { reg = await nav.serviceWorker.register(`${base}sw.js`, { scope: base, updateViaCache: 'none' }); } catch { return; }
  pwa.reg = reg;
  const watch = (w) => {
    if (!w) return;
    const done = () => { if (w.state === 'installed' && nav.serviceWorker.controller) pwa.setWaiting(w); };
    done();
    w.addEventListener?.('statechange', done);
  };
  if (reg.waiting && nav.serviceWorker.controller) pwa.setWaiting(reg.waiting);
  watch(reg.installing);
  reg.addEventListener?.('updatefound', () => watch(reg.installing));
  const check = () => { try { reg.update()?.catch?.(() => {}); } catch { /* 망 없음 */ } };
  win.setInterval(check, SW_CHECK_MS);
  win.document.addEventListener('visibilitychange', () => { if (win.document.visibilityState === 'visible') check(); });
}

/** 시작: 설치 이벤트는 바로 받아 두고, 등록은 게임이 뜬 뒤 한가할 때 */
export function startPwa(win = typeof window !== 'undefined' ? window : null, prod = !!import.meta.env?.PROD) {
  if (!win?.navigator) return null;
  const pwa = new Pwa(win);
  win.addEventListener?.('beforeinstallprompt', (e) => { e.preventDefault(); pwa.prompt = e; pwa.refresh(); });
  win.addEventListener?.('appinstalled', () => { pwa.installed = true; pwa.prompt = null; pwa.refresh(); });
  const search = win.location?.search || '';
  if (new URLSearchParams(search).get('sw') === 'off' && 'serviceWorker' in win.navigator) { swOff(win); return pwa; }
  const ok = swAllowed({ prod, nav: win.navigator, search });
  // 제목 화면(게임 전)에 이미 새 버전이 기다리면 그 자리에서 적용 (놀이 중이 아님)
  // 다른 탭이 열려 있으면 하지 않음: 그 탭의 워커가 새로 고침 없이 바뀌고 옛 캐시가 지워짐 → 설정의 단추로
  if (ok) {
    answerTabs(win);
    win.navigator.serviceWorker.getRegistration?.().then(async (r) => {
      if (!r?.waiting || !win.navigator.serviceWorker.controller || win.game) return;
      pwa.waiting = r.waiting;
      if (!(await otherTabs(win)) && !win.game) pwa.applyUpdate();
    }).catch(() => {});
  }
  // 게임이 생기기를 기다림 (제목 화면에 오래 머물 수 있어 1초마다)
  const attach = () => {
    const g = win.game;
    if (!g?.whenShown) { win.setTimeout(attach, 1000); return; }
    pwa.game = g;
    g.pwa = pwa;
    hookSettings(g.ui, pwa); // 설정 창에 설치·새 버전 칸 (ui 가 늦게 생기면 화면이 뜬 뒤 한 번 더)
    g.whenShown(() => hookSettings(g.ui, pwa));
    if (pwa.waiting) pwa.setWaiting(pwa.waiting);
    if (!ok) return;
    g.whenShown(() => {
      const idle = win.requestIdleCallback ? (f) => win.requestIdleCallback(f, { timeout: 8000 }) : (f) => win.setTimeout(f, 3000);
      idle(() => register(win, pwa));
    });
  };
  attach();
  return pwa;
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') startPwa();
