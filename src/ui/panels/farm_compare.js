// 농장 비교 카드·요약 (부팅 화면의 '농장 가져오기'에서도 씀): 설정 창 코드와 떼어 첫 화면에 작게 실음
import { h, esc } from '../dom.js';
import { localSummary, hasBrokenSave } from '../../game/save.js';

/** 농장 요약 한 줄: '별님 · 12일차 · 3,450코인' */
export function summaryText(s) {
  if (!s) return '저장된 농장 없음';
  const at = s.at ? new Date(s.at) : null;
  return `${s.name} · ${s.day}일차 · ${s.coins.toLocaleString()}코인${at && !Number.isNaN(+at) ? ` · ${at.getMonth() + 1}월 ${at.getDate()}일 저장` : ''}`;
}
/** 두 농장 요약이 같은 농장으로 보이는지 (이름·날짜·코인이 모두 같음) */
export const sameFarm = (a, b) => !!a && !!b && a.name === b.name && a.day === b.day && a.coins === b.coins;

/**
 * 가져올 농장 비교 카드: '이 기기 → 가져올 농장' + [바꾸기]·[취소] (확인 없이는 덮어쓰지 않음)
 * broken: 이 기기에 못 읽은 기록이 있음 (요약이 없어도 '농장 없음'이라 하지 않음)
 * @returns 카드 요소
 */
export function compareCard(incoming, { local = localSummary(), broken = !local && hasBrokenSave(), okLabel = '가져온 농장으로 바꾸기', noLabel = '취소', onOk, onNo } = {}) {
  const here = local ? summaryText(local) : broken ? '읽지 못한 기록 있음' : '저장된 농장 없음';
  const note = local ? '지금 농장은 백업으로 한 번 남겨 두고 바뀌어요.'
    : broken ? '이 기기의 읽지 못한 기록은 지우지 않고 따로 남겨 둬요.' : '이 기기에는 아직 농장이 없어요.';
  const same = sameFarm(local, incoming);
  const card = h('div', 'farm-compare', `
    <div class="fc-row"><span class="fc-k">이 기기</span><b>${esc(here)}</b></div>
    <div class="fc-arrow" aria-hidden="true"><span>⬇</span></div>
    <div class="fc-row in"><span class="fc-k">가져올 농장</span><b>${esc(summaryText(incoming))}</b></div>
    ${same ? '<p class="fc-same">🔁 같은 농장 같아요 — 바꿔도 거의 달라지지 않아요</p>' : ''}
    <p class="fc-note">${note} 옮긴 뒤에는 두 기기의 농장이 따로 자라요.</p>
    <div class="fc-btns"><button class="gold fc-ok"></button><button class="ghost fc-no"></button></div>`);
  card.setAttribute('role', 'group');
  card.setAttribute('aria-label', '농장 비교');
  card.querySelector('.fc-ok').textContent = okLabel;
  card.querySelector('.fc-no').textContent = noLabel;
  card.querySelector('.fc-ok').onclick = () => onOk?.();
  card.querySelector('.fc-no').onclick = () => onNo?.();
  return card;
}

