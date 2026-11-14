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
  closePanel() { this.panel?.remove(); this.panel = null; this.game.input.enabled = true; this.game.player.frozen = this.game.ride.driving || this.game.smartfarm.active; }
  openPanel(title) {
    this.closePanel();
    this.game.input.enabled = false;
    this.game.player.frozen = true;
    const p = h('div', 'panel');
    const head = h('h2', '', `${title} <button class="ghost close" aria-label="닫기">✕</button>`);
    head.querySelector('.close').onclick = () => this.closePanel();
    p.append(head);
    this.root.append(p);
    this.panel = p;
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
