// 레벨업 축하: 위에서 떨어지는 'Lv.N!' 리본(창 위에서도 바로) + 해금 카드(창·대화·컷신이 없을 때)
// 둘 다 입력을 막지 않음: 리본은 눌리지 않고, 카드는 버튼만 눌림 (게임은 계속 움직임)
import { h, esc } from './dom.js';
import { unlocksBetween, nextUnlockLine, cardAction } from '../game/sim/unlocks.js';

/** 리본이 떠 있는 시간(ms) — CSS 애니메이션 길이와 같음 */
export const RIBBON_MS = 1800;
/** 카드가 저절로 닫히기까지(ms): 보통 / 자동 진행 */
export const CARD_MS = 6000;
export const CARD_MS_AUTO = 2000;

/**
 * 리본 하나 (같은 종류가 떠 있으면 바꿔 끼움)
 * @param root UI 층
 * @param o { title: 'Lv.2!', sub: 작은 줄, skill: true 면 작은 청록 리본 }
 */
export function showRibbon(root, { title, sub = '', skill = false }) {
  const cls = skill ? 'lvl-ribbon skill' : 'lvl-ribbon';
  root.querySelector(skill ? '.lvl-ribbon.skill' : '.lvl-ribbon:not(.skill)')?.remove();
  const el = h('div', cls, `<b>${esc(title)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}`);
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  root.append(el);
  setTimeout(() => el.remove(), RIBBON_MS + 100);
  return el;
}

/** 해금 묶음 → 카드 본문 HTML (종류별 한 줄: '🥬 양배추 씨앗 · 🍅 토마토 씨앗') */
export function unlockRowsHTML(groups) {
  return groups.map((g) => `<div class="lvl-row"><span class="lvl-kind">${esc(g.label)}</span><span class="lvl-items">${g.items.map((u) => `<span class="lvl-it"><i>${u.icon}</i>${esc(u.name)}</span>`).join('')}</span></div>`).join('');
}

/**
 * 해금 카드 (창이 아님: 화면 위쪽 가운데, 저절로 닫힘, 손가락·마우스를 올리면 멈춤)
 * @param ui UI (root·game·openMarket 사용)
 * @param before 이전 레벨 · after 새 레벨
 * @param o { auto: 자동 진행 중이면 짧게 }
 */
export function showUnlockCard(ui, before, after, o = {}) {
  const root = ui.root, g = ui.game;
  root.querySelector('.lvl-card')?.remove();
  const groups = unlocksBetween(before, after);
  const card = h('div', 'lvl-card');
  card.setAttribute('role', 'status');
  card.setAttribute('aria-live', 'polite');
  const body = groups.length ? unlockRowsHTML(groups) : `<div class="lvl-next">${esc(nextUnlockLine(after))}</div>`;
  card.innerHTML = `<div class="lvl-head"><span class="lvl-big">Lv.${after}</span><span class="lvl-t">${groups.length ? '새로 열렸어요!' : '레벨이 올랐어요!'}</span></div>${body}`;
  const foot = h('div', 'lvl-foot');
  const act = cardAction(groups);
  let timer = 0;
  const close = () => { clearTimeout(timer); card.classList.add('out'); setTimeout(() => card.remove(), 260); };
  if (act) {
    const b = h('button', 'gold', act.label);
    b.onclick = () => { close(); if (act.open === 'market') ui.openMarket?.(groups.some((x) => x.kind === 'seed') ? 'buy' : 'cos'); else g.decor?.open?.(); };
    foot.append(b);
  }
  const x = h('button', 'ghost lvl-x', '✕');
  x.setAttribute('aria-label', '닫기');
  x.onclick = close;
  card.append(x);
  if (act) card.append(foot);
  if (groups.length) card.append(h('div', 'lvl-next small', esc(nextUnlockLine(after))));
  // 저절로 닫힘: 올려 두거나 누르는 동안은 멈춤
  const ms = o.auto ? CARD_MS_AUTO : CARD_MS;
  const arm = () => { clearTimeout(timer); timer = setTimeout(close, ms); };
  card.addEventListener('pointerenter', () => clearTimeout(timer));
  card.addEventListener('pointerdown', () => clearTimeout(timer));
  card.addEventListener('pointerleave', arm);
  card.addEventListener('pointerup', arm);
  arm();
  root.append(card);
  return card;
}
