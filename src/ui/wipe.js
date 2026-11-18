// 장면 전환: 크림빛 막에 뚫린 동그란 구멍(아이리스)이 캐릭터 둘레로 좁혀져 화면을 덮고,
// 덮인 동안 가는 곳 이름표를 잠깐 보여 준 뒤, 새 자리의 캐릭터에서 구멍이 넓어지며 열림
// (지도 이동·KOAT 체험관 이동. 집 문·잠자기의 어두운 페이드와는 다른 밝은 막)

/** 덮기·열기 각각 걸리는 시간 (ms) */
export const WIPE_MS = 280;
/** 움직임 줄이기 설정이면 크기 대신 투명도로 (ms) */
export const WIPE_FADE_MS = 200;
/** 다 덮인 뒤 이만큼(ms) 더 머묾: 순간이동·첫 프레임 멈칫이 가려지고 이름표를 읽을 틈 */
export const WIPE_HOLD_MS = 120;

const reducedMotion = () => !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** 화면 (w, h) 어디서 시작해도 구멍이 화면 밖까지 다 열리는 원 지름 */
export const irisSize = (w, h) => Math.ceil(2 * Math.hypot(w, h));
/** 화면 점 (x, y) 에서 구멍이 화면을 막 다 여는 지름 (가장 먼 모서리 + 테두리 여유) → 좁히기 시작하자마자 막이 보임 */
export const irisFor = (x, y, w, h) => Math.ceil(2 * Math.hypot(Math.max(x, w - x), Math.max(y, h - y)) + 24);

export class Wipe {
  /** @param root 막을 붙일 곳 (기본 body: #ui 의 글자 배율이 원 크기에 곱해지지 않게) */
  constructor(root = globalThis.document?.body) {
    this.root = root;
    this.busy = false;
  }

  /**
   * 한 번 전환. at(): 지금 캐릭터의 화면 점 { x, y } (CSS px, 없으면 가운데)
   * mid(): 화면이 다 덮였을 때 (여기서 이동), done(): 다 열린 뒤
   * opts.label: 덮인 동안 가운데 보일 가는 곳 (예: '🛒 장터')
   * 이미 전환 중이면 false
   */
  run(at, mid, done, { label } = {}) {
    if (this.busy || typeof this.root?.append !== 'function') return false; // 화면이 없으면(시험) 부른 쪽이 바로 처리
    this.busy = true;
    const reduced = reducedMotion();
    const el = document.createElement('div');
    el.className = 'wipe-iris' + (reduced ? ' fade' : '');
    el.setAttribute('aria-hidden', 'true');
    // 가는 곳 이름표 (화면 전체를 덮는 투명한 층: 전환 동안 누름이 게임으로 새지 않게)
    const card = document.createElement('div');
    card.className = 'wipe-card';
    const tag = document.createElement('span');
    tag.className = 'wipe-label';
    tag.setAttribute('role', 'status');
    tag.textContent = label || '✨ 이동 중';
    card.append(tag);
    const size = (d) => { el.style.width = `${d}px`; el.style.height = `${d}px`; };
    let full = 0;
    const place = () => {
      const w = globalThis.innerWidth || 800, h = globalThis.innerHeight || 600;
      const p = at?.() || { x: w / 2, y: h / 2 };
      const x = Math.min(w, Math.max(0, p.x)), y = Math.min(h, Math.max(0, p.y));
      el.style.left = `${x}px`; el.style.top = `${y}px`;
      full = irisFor(x, y, w, h);
    };
    place(); size(full);
    this.root.append(el, card);
    const ms = reduced ? WIPE_FADE_MS : WIPE_MS;
    const raf = (f) => (globalThis.requestAnimationFrame || ((g) => setTimeout(g, 16)))(f);
    raf(() => raf(() => { el.classList.add('on'); size(0); })); // 활짝 연 구멍을 그린 다음 좁히기 시작
    setTimeout(() => {
      el.classList.add('covered');
      card.classList.add('on');
      try { mid?.(); } catch (e) { console.error(e); }
      // 잠깐 머물고, 새 자리를 두 프레임 그린 뒤 (카메라가 옮겨진 뒤) 새 캐릭터 자리에서 열기
      setTimeout(() => raf(() => raf(() => {
        el.classList.add('snap'); place(); void el.offsetWidth; el.classList.remove('snap');
        el.classList.remove('covered', 'on');
        card.classList.remove('on');
        size(full);
        setTimeout(() => { el.remove(); card.remove(); this.busy = false; done?.(); }, ms + 20);
      })), WIPE_HOLD_MS);
    }, ms + 40);
    return true;
  }
}
