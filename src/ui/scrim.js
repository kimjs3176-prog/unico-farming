// 창 배경막: 누름이 배경막에서 시작하고 끝나야만 닫음
// (말풍선·대화창은 pointerdown 에서 창을 열어서, 손가락을 뗄 때 오는 click 이 새 배경막에 떨어짐 → 바로 닫히던 문제)

/** el 에 '배경막에서 시작한 누름만' 닫는 동작을 붙임 */
export function armScrim(el, onDismiss) {
  let armed = false;
  el.addEventListener('pointerdown', (e) => { armed = e.target === el; });
  el.addEventListener('pointercancel', () => { armed = false; });
  el.addEventListener('click', (e) => {
    const ok = armed && e.target === el;
    armed = false;
    if (ok) onDismiss();
  });
  return el;
}
