// 휴대폰 첫 조작 안내 (한 번만): 왼쪽 끌기 = 이동, 오른쪽 끌기 = 둘러보기, 톡 = 걸어가서 바로 하기
// 그림은 CSS 애니메이션만 (css/coach.css). 조이스틱을 처음 쓰거나 8초가 지나면 사라짐
import { h } from './dom.js';

export const COACH_MS = 8000;

export function showTouchCoach(g) {
  if (typeof document === 'undefined') return null;
  const root = document.getElementById('ui') || document.body;
  const el = h('div', 'coach', '<div class="coach-joy"><i class="ring"></i><i class="dot"></i><b>끌어서 이동</b></div>'
    + '<div class="coach-look"><i class="swipe">↔</i><b>끌어서 둘러보기</b></div>'
    + '<div class="coach-cap">👆 땅·밭을 톡 누르면 걸어가서 바로 해요</div>');
  el.setAttribute('aria-hidden', 'true');
  root.append(el);
  const I = g.input;
  const prev = I?.onJoystick;
  let done = false, timer = 0;
  const wrap = (...a) => { prev?.(...a); if (a[0]) end(); };
  function end() {
    if (done) return;
    done = true;
    clearTimeout(timer);
    if (I && I.onJoystick === wrap) I.onJoystick = prev;
    el.classList.add('out');
    setTimeout(() => el.remove(), 450);
  }
  if (I) I.onJoystick = wrap;
  timer = setTimeout(end, COACH_MS);
  return { el, end };
}
