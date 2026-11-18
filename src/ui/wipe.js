// 장면 전환: 동그란 막(아이리스)이 캐릭터 자리에서 커져 화면을 덮고, 이동한 뒤 새 자리로 줄어들며 열림
// (지도 이동·KOAT 체험관 이동. 집 문·잠자기의 어두운 페이드와는 다른 밝은 막)

/** 덮기·열기 각각 걸리는 시간 (ms) */
export const WIPE_MS = 280;
/** 움직임 줄이기 설정이면 크기 대신 투명도로 (ms) */
export const WIPE_FADE_MS = 200;

const reducedMotion = () => !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** 화면 (w, h) 어디서 시작해도 화면을 다 덮는 원 지름 */
export const irisSize = (w, h) => Math.ceil(2 * Math.hypot(w, h));

export class Wipe {
  /** @param root 막을 붙일 곳 (기본 body: #ui 의 글자 배율이 원 크기에 곱해지지 않게) */
  constructor(root = globalThis.document?.body) {
    this.root = root;
    this.busy = false;
  }

  /**
   * 한 번 전환. at(): 지금 캐릭터의 화면 점 { x, y } (CSS px, 없으면 가운데)
   * mid(): 화면이 다 덮였을 때 (여기서 이동), done(): 다 열린 뒤
   * 이미 전환 중이면 false
   */
  run(at, mid, done) {
    if (this.busy || typeof this.root?.append !== 'function') return false; // 화면이 없으면(시험) 부른 쪽이 바로 처리
    this.busy = true;
    const reduced = reducedMotion();
    const el = document.createElement('div');
    el.className = 'wipe-iris' + (reduced ? ' fade' : '');
    el.setAttribute('aria-hidden', 'true');
    const place = () => {
      const w = globalThis.innerWidth || 800, h = globalThis.innerHeight || 600, D = irisSize(w, h);
      const p = at?.() || { x: w / 2, y: h / 2 };
      const x = Math.min(w, Math.max(0, p.x)), y = Math.min(h, Math.max(0, p.y));
      Object.assign(el.style, { width: `${D}px`, height: `${D}px`, left: `${x - D / 2}px`, top: `${y - D / 2}px` });
    };
    place();
    this.root.append(el);
    const ms = reduced ? WIPE_FADE_MS : WIPE_MS;
    const raf = (f) => (globalThis.requestAnimationFrame || ((g) => setTimeout(g, 16)))(f);
    raf(() => raf(() => el.classList.add('on'))); // 처음 크기(0)를 그린 다음 커지기 시작
    setTimeout(() => {
      try { mid?.(); } catch (e) { console.error(e); }
      // 새 자리를 두 프레임 그린 뒤 (카메라가 새 자리로 옮겨진 뒤) 새 캐릭터 자리로 옮겨 열기
      raf(() => raf(() => {
        el.classList.add('snap'); place(); void el.offsetWidth; el.classList.remove('snap');
        el.classList.remove('on');
        setTimeout(() => { el.remove(); this.busy = false; done?.(); }, ms + 20);
      }));
    }, ms + 40);
    return true;
  }
}
