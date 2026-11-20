import { installKoatUI } from './koat_ui.js';
import { h } from './dom.js';
import { HudUI } from './hud.js';
import { ObjectiveUI } from './objective.js';
import { PromptUI } from './prompt.js';
import { ToastUI } from './toast.js';
import { ChatUI } from './chat.js';
import { ActionbarUI } from './actionbar.js';
import { MarketPanel } from './panels/market.js';
import { QuestsPanel } from './panels/quests.js';
import { BagPanel } from './panels/bag.js';
import { VillagerPanel } from './panels/villager.js';
import { SettingsPanel } from './panels/settings.js';
import { ActivityUI } from './panels/activity.js';

// 다른 파일이 ui.js 에서 가져가던 것은 그대로 (전체 화면·iOS 판별은 actionbar.js, 터치 화면 판별은 input.js)
export { isIOS, canFullscreen, toggleFullscreen } from './actionbar.js';
export { touchUI } from '../game/input.js';

/** DOM 기반 HUD / 패널 — 클래스는 하나, 화면 조각별 메서드는 hud.js·prompt.js·panels/… 에서 합침 */
export class UI {
  constructor(game, root) {
    this.game = game;
    this.root = root;
    this.panel = null;
    root.innerHTML = '';
    // iOS 사파리: 조상에 터치 리스너가 있어야 버튼 :active(눌림 모양)가 보임 (아무것도 하지 않음)
    root.addEventListener('touchstart', () => {}, { passive: true });
    // 붙이는 순서가 곧 겹침 순서: FPS·위쪽 HUD·배너 → 알림 → 안내·조이스틱·E → 채팅 → 행동 막대·☰ (바꾸지 말 것)
    this.buildHud();
    this.buildToasts();
    this.buildPrompt();
    this.buildChat();
    this.smart = null;
    this.buildActionbar();
  }

  // ---------------------------------------------------------------- 패널
  /**
   * 창 닫기: 상태(입력·멈춤)는 바로 되돌리고, 창과 배경막은 0.14초 동안 흐려지며 사라짐 (그동안 눌리지 않음)
   * animate=false: 창을 바꿔 열 때 — 바로 지우고 소리도 내지 않음
   * 창이 건 멈춤('panel')만 풂: 대화·컷신·운전 같은 다른 까닭의 멈춤은 그대로
   */
  closePanel(animate = true) {
    const p = this.panel, scrim = this._scrim;
    this.panel = null; this._scrim = null;
    this.game.input.enabled = true;
    this.game.player.unhold?.('panel');
    document.body.classList.remove('panel-open', 'panel-see');
    if (p && animate) { clearTimeout(this._closeSnd); this._closeSnd = setTimeout(() => this.game.audio?.play('close'), 0); } // 곧바로 다른 창이 열리면 openPanel 이 취소
    for (const n of [p, scrim]) {
      if (!n) continue;
      if (!animate || !n.isConnected) { n.remove(); continue; }
      n.classList.add('closing');
      const done = () => n.remove();
      n.addEventListener('animationend', (e) => { if (e.target === n) done(); });
      setTimeout(done, 200); // 애니메이션이 없거나 멈춘 탭이어도 지움
    }
  }

  /** 사용자가 창을 치움(✕·배경막·Esc): 창마다 정한 onDismiss(예: 결과 창의 '확인')를 먼저 부름. 배경막 누름은 고정 창(sticky)에서 무시 */
  dismiss(fromScrim = false) {
    const p = this.panel;
    if (!p) return;
    if (fromScrim && (p.dataset.sticky || p.dataset.kind === 'ctxlost')) return;
    try { p.onDismiss?.(); } finally { if (this.panel === p) this.closePanel(); }
  }

  openPanel(title) {
    const had = !!this.panel;
    clearTimeout(this._closeSnd);
    this.closePanel(false);
    for (const n of this.root.querySelectorAll(':scope > .closing')) n.remove(); // 닫히는 중인 창과 겹쳐 보이지 않게
    this.game.input.enabled = false;
    this.game.player.hold?.('panel');
    // 배경막: 창 밖을 누르면 닫힘. 옷장·꾸미기처럼 뒤를 봐야 하는 창은 body.panel-see 로 숨김
    const scrim = h('div', 'scrim');
    scrim.addEventListener('click', () => this.dismiss(true));
    const p = h('div', 'panel');
    const head = h('h2', '', `${title} <button class="ghost close" aria-label="닫기">✕</button>`);
    head.querySelector('.close').onclick = () => this.dismiss();
    p.append(head);
    this.root.append(scrim, p);
    this.panel = p; this._scrim = scrim;
    document.body.classList.add('panel-open');
    // 부르는 쪽이 돌려받은 뒤 클래스를 붙이므로(옷장·꾸미기) 그림 그리기 전에 한 번 더 봄
    queueMicrotask(() => { if (this.panel === p && p.matches('.wardrobe, .decor')) document.body.classList.add('panel-see'); });
    if (!had) this.game.audio?.play('open');
    return p;
  }

  result(title, lines) {
    const p = this.openPanel(title);
    p.dataset.kind = 'result'; // 오토플레이 중에는 잠시 보여 준 뒤 자동으로 닫음
    p.append(h('div', 'rows', lines.map((t) => `<div class="row">${t}</div>`).join('')));
    const b = h('button', '', '확인');
    b.style.marginTop = '10px';
    b.onclick = () => this.closePanel();
    p.append(b);
  }
}

Object.assign(UI.prototype, HudUI, ObjectiveUI, PromptUI, ToastUI, ChatUI, ActionbarUI, MarketPanel, QuestsPanel, BagPanel, VillagerPanel, SettingsPanel, ActivityUI);
installKoatUI(UI);
