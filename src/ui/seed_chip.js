// 씨앗 칩: 심기 안내가 떠 있을 때만 E 버튼 옆에 지금 고른 씨앗을 보여 줌
// 누르면 고르기 창(고르기만), R 키로 가진 씨앗을 차례로 바꿈 (입력 중·창·대화 중에는 무시)
import { CROPS } from '../game/sim/crops.js';

/** 지금 키 입력을 받으면 안 되는 상황인가 (글자 입력 중) */
const typing = (el) => !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);

export class SeedChip {
  constructor(game, farm) {
    this.game = game;
    this.farm = farm;
    this.el = null;
    this.shown = false;
    this.key = '';
    this.posT = 0;
    this._onKey = (e) => {
      if (e.code !== 'KeyR' || e.repeat || !this.shown) return;
      const g = this.game;
      if (typing(e.target) || typing(document.activeElement) || g.ui?.panel || g.dialogue?.active || g.cinema?.locked) return;
      if (this.farm.ownedSeeds().length < 2) return;
      const c = this.farm.cycleSeed(1);
      if (!c) return;
      g.audio?.play?.('pop', 0.5);
      this.render(true);
    };
    if (typeof addEventListener === 'function') addEventListener('keydown', this._onKey);
  }

  _build() {
    const root = this.game.ui?.root;
    if (!root || typeof document === 'undefined') return false;
    const b = document.createElement('button');
    b.className = 'seed-chip hidden';
    b.type = 'button';
    b.setAttribute('aria-label', '심을 씨앗 바꾸기');
    const pick = (e) => {
      e.preventDefault(); e.stopPropagation();
      this.farm.pickSeed(() => this.render(true));
    };
    b.addEventListener('pointerdown', (e) => e.stopPropagation()); // 화면 탭 이동·시점 돌리기로 새지 않게
    b.addEventListener('click', pick);
    root.append(b);
    this.el = b;
    return true;
  }

  /** 지금 보여 줄지: 심기 안내가 떠 있고 창·대화·컷신이 없을 때 */
  _want() {
    const g = this.game, p = g.ui?.currentPrompt;
    if (!p || p.key !== 'plant' || g.ui.panel || g.dialogue?.active || g.cinema?.locked) return false;
    const c = this.farm.seedChoice();
    return !!c && !c.ask;
  }

  render(bump = false) {
    if (!this.el) return;
    const c = this.farm.seedChoice();
    if (!c) return;
    const C = CROPS[c.crop], n = this.game.economy.inventory.seeds[c.crop] || 0;
    const fert = this.farm.seedFert();
    const key = `${c.crop}|${n}|${fert}`;
    if (key !== this.key) {
      if (this.key && this.key.split('|')[0] !== c.crop) bump = true; // R·탭·떨어져서 자동으로 — 어떻게 바뀌든 통 튀어 알림
      this.key = key;
      this.el.innerHTML = `<span class="sc-e">${C.emoji}</span><span class="sc-n">${n}</span>${fert ? '<span class="sc-f">🟫</span>' : ''}<span class="sc-t" aria-hidden="true">⇄</span>`;
      this.el.title = `${C.name} 씨앗 ${n}개 — 눌러서 바꾸기`;
    }
    if (bump) { this.el.classList.remove('bump'); void this.el.offsetWidth; this.el.classList.add('bump'); }
  }

  /** 자리 잡기: 터치 E 버튼이 보이면 그 왼쪽(윗변 맞춤, 8px 띄움), 아니면 안내 말풍선 오른쪽 */
  _place() {
    const ui = this.game.ui, el = this.el;
    const z = +getComputedStyle(el).zoom || 1; // #ui 아래는 --ui-zoom 으로 커짐 → 화면 px 를 CSS px 로
    const btn = ui.touchBtn?.getBoundingClientRect?.();
    if (btn && btn.width > 0) {
      el.classList.add('on-btn');
      el.style.left = `${(btn.left - 8) / z}px`;
      el.style.top = `${btn.top / z}px`;
      return;
    }
    el.classList.remove('on-btn');
    const pr = ui.prompt?.getBoundingClientRect?.();
    if (!pr || !pr.width) return;
    el.style.left = `${(pr.right + 8) / z}px`;
    el.style.top = `${(pr.top + pr.height / 2) / z}px`;
  }

  /** 매 프레임 (밭 갱신에서 부름): 보일 때만 글자·자리 갱신 (자리는 0.4초마다) */
  update() {
    const want = this._want();
    if (!want && !this.shown) return;
    if (!this.el && !this._build()) return;
    if (want !== this.shown) {
      this.shown = want;
      this.el.classList.toggle('hidden', !want);
      if (want) { this.render(); this._place(); this.posT = performance.now(); }
      return;
    }
    if (!want) return;
    this.render();
    const now = performance.now();
    if (now - this.posT > 400) { this.posT = now; this._place(); }
  }
}
