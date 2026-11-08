/** 키보드 + 마우스 + 터치(가상 조이스틱) 입력 */

export const TAP_MOVE = 12;   // 이만큼(px) 안 움직이고 뗀 터치는 탭
export const TAP_MS = 300;
export const PINCH_MS = 150;  // 두 번째 손가락이 이 시간 안에 닿으면 핀치 시작으로 봄

let coarseMq = null;
/** 터치 화면인가 (CSS 의 .hint-kbd 숨김과 같은 조건) — 안내 문구를 기기에 맞게 고를 때 */
export const touchUI = () => typeof matchMedia !== 'undefined' && (coarseMq ||= matchMedia('(pointer: coarse)')).matches;

/**
 * 두 번째 손가락이 닿았을 때 핀치(확대·축소) 시작인가
 * a: 먼저 닿은 손가락 {x, y, t, moved}, b: 지금 닿은 손가락 {x, y, t}
 * 거의 함께 닿았고, 먼저 닿은 손가락이 아직 안 움직였고, 두 손가락이 너무 멀지 않을 때
 * (양손 엄지로 걷기 + 시점 돌리기는 보통 멀리 떨어져 있고, 먼저 닿은 엄지가 이미 움직이는 중)
 * 화면 가운데를 사이에 둔 두 손가락은 더 가까워야 핀치: 세로 폰(390px)에서 양손 엄지는 왼쪽·오른쪽 반 가운데쯤이라
 * 200px 남짓 떨어져 있음 → 그 거리는 조이스틱 + 시점 돌리기로 둠
 */
export function isPinchStart(a, b, viewW) {
  const split = (a.x < viewW / 2) !== (b.x < viewW / 2);
  const lim = split ? Math.min(Math.max(viewW * 0.35, 120), 260) : Math.max(220, viewW * 0.5);
  return b.t - a.t < PINCH_MS && a.moved < TAP_MOVE && Math.hypot(a.x - b.x, a.y - b.y) < lim;
}

const viewW = () => (typeof window !== 'undefined' ? window.innerWidth : 0);

/** 채팅 입력칸에 포커스가 있으면 뺌 (터치는 preventDefault 라 화면을 눌러도 키보드가 안 닫힘) */
export function blurTextInput() {
  const ae = typeof document !== 'undefined' ? document.activeElement : null;
  if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) ae.blur();
}

export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.pressed = new Set();
    this.drag = { active: false, dx: 0, dy: 0, lastX: 0, lastY: 0 };
    this.wheel = 0;
    this.joy = { active: false, x: 0, y: 0, id: null, cx: 0, cy: 0 };
    this.interactTap = false;
    this.canvas = canvas;
    this.enabled = true;
    this.clicks = []; // 클릭/탭 위치 (화면 좌표) — 이동·상호작용 대상 선택
    this.virtual = { x: 0, y: 0 }; // 화면 버튼(트랙터 등) 입력
    this.hover = null; // 마우스 위치 (커서 모양 갱신용)
    this.down = null;

    window.addEventListener('keydown', (e) => {
      if (e.isComposing) return; // 한글 조합 중 키는 게임 입력이 아님
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') return; // 터치는 조이스틱/시점 분리 처리
      this.drag.active = true;
      this.drag.lastX = e.clientX;
      this.drag.lastY = e.clientY;
      this.down = { x: e.clientX, y: e.clientY, t: performance.now(), button: e.button };
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'touch') this.hover = { x: e.clientX, y: e.clientY };
      if (e.pointerType === 'touch' || !this.drag.active) return;
      this.drag.dx += e.clientX - this.drag.lastX;
      this.drag.dy += e.clientY - this.drag.lastY;
      this.drag.lastX = e.clientX;
      this.drag.lastY = e.clientY;
    });
    canvas.addEventListener('pointerup', (e) => {
      if (e.pointerType === 'touch') return;
      this.drag.active = false;
      const d = this.down;
      if (d && d.button === 0 && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 6 && performance.now() - d.t < 450) this.clicks.push({ x: e.clientX, y: e.clientY });
      this.down = null;
    });
    canvas.addEventListener('pointercancel', () => (this.drag.active = false));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', (e) => {
      this.wheel += e.deltaY;
      e.preventDefault();
    }, { passive: false });

    // 터치: 왼쪽 절반 = 조이스틱, 오른쪽 절반 = 시점 드래그, 두 손가락 = 핀치 줌
    this.touches = new Map();
    this.tapStart = new Map();
    this.pinch = null;
    canvas.addEventListener('touchstart', (e) => { this.touchStart(e); e.preventDefault(); }, { passive: false });
    canvas.addEventListener('touchmove', (e) => { this.touchMove(e); e.preventDefault(); }, { passive: false });
    canvas.addEventListener('touchend', (e) => this.touchEnd(e));
    canvas.addEventListener('touchcancel', (e) => this.touchEnd(e));
  }

  _joyOff() {
    this.joy.active = false;
    this.joy.id = null;
    this.joy.x = this.joy.y = 0;
    this.onJoystick?.(false);
  }

  touchStart(e, now = performance.now()) {
    blurTextInput();
    // 조이스틱 손가락을 뗀 이벤트를 놓쳤으면(화면 밖으로 끌고 나감 등) 먼저 풀어 줌 → 새 손가락으로 다시 잡힘
    if (this.joy.active && e.touches && ![...e.touches].some((o) => o.identifier === this.joy.id)) this._joyOff();
    for (const t of e.changedTouches) {
      const st = { x: t.clientX, y: t.clientY, t: now, moved: 0 };
      // 다른 손가락 하나가 방금 닿았다면 → 핀치 (좌우 어느 쪽이든, 어느 손가락이 먼저든)
      const others = [...e.touches].filter((o) => o.identifier !== t.identifier);
      const o = others.length === 1 ? others[0] : null;
      const s0 = o ? this.tapStart.get(o.identifier) : null;
      this.tapStart.set(t.identifier, st);
      if (s0 && isPinchStart(s0, st, viewW())) {
        if (o.identifier === this.joy.id) this._joyOff(); // 조이스틱으로 잡힌 손가락은 시점 터치로 옮김
        this.touches.set(o.identifier, { x: o.clientX, y: o.clientY });
        this.touches.set(t.identifier, { x: t.clientX, y: t.clientY });
        this.pinch = null;
        s0.moved = st.moved = Infinity; // 핀치 손가락은 탭 이동으로 치지 않음
      } else if (t.clientX < viewW() / 2 && !this.joy.active) {
        this.joy.active = true;
        this.joy.id = t.identifier;
        this.joy.cx = t.clientX;
        this.joy.cy = t.clientY;
        this.joy.x = this.joy.y = 0;
        this.onJoystick?.(true, t.clientX, t.clientY, 0, 0);
      } else {
        this.touches.set(t.identifier, { x: t.clientX, y: t.clientY });
      }
    }
  }

  touchMove(e) {
    for (const t of e.changedTouches) {
      const st = this.tapStart.get(t.identifier);
      if (st) st.moved = Math.max(st.moved, Math.hypot(t.clientX - st.x, t.clientY - st.y));
    }
    // 두 손가락 핀치 줌 (시점 영역 터치 2개). 핀치 중엔 회전만 빼고, 기준 좌표·조이스틱은 계속 갱신
    let pinching = false;
    if (this.touches.size >= 2) {
      const [a, b] = [...this.touches.keys()].slice(0, 2).map((id) => [...e.touches].find((x) => x.identifier === id)).filter(Boolean);
      if (a && b) {
        const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        if (this.pinch) this.wheel += (this.pinch - dist) * 3;
        this.pinch = dist;
        pinching = true;
        for (const t of [a, b]) { const s = this.tapStart.get(t.identifier); if (s) s.moved = Infinity; }
      }
    }
    for (const t of e.changedTouches) {
      if (t.identifier === this.joy.id) {
        const dx = t.clientX - this.joy.cx, dy = t.clientY - this.joy.cy;
        const len = Math.hypot(dx, dy), max = 60;
        const k = len > max ? max / len : 1;
        this.joy.x = (dx * k) / max;
        this.joy.y = (dy * k) / max;
        this.onJoystick?.(true, this.joy.cx, this.joy.cy, dx * k, dy * k);
      } else {
        const p = this.touches.get(t.identifier);
        if (!p) continue;
        if (!pinching) {
          this.drag.dx += t.clientX - p.x;
          this.drag.dy += t.clientY - p.y;
        }
        p.x = t.clientX;
        p.y = t.clientY;
      }
    }
  }

  touchEnd(e, now = performance.now()) {
    for (const t of e.changedTouches) {
      const st = this.tapStart.get(t.identifier);
      if (st && st.moved < TAP_MOVE && now - st.t < TAP_MS && e.type === 'touchend') this.clicks.push({ x: st.x, y: st.y, touch: true });
      this.tapStart.delete(t.identifier);
      if (t.identifier === this.joy.id) this._joyOff();
      this.touches.delete(t.identifier);
    }
    // 남은 시점 손가락의 기준 좌표를 지금 위치로 (핀치를 끝낸 뒤 시점이 홱 돌지 않게)
    for (const t of e.touches || []) { const p = this.touches.get(t.identifier); if (p) { p.x = t.clientX; p.y = t.clientY; } }
    if (this.touches.size < 2) this.pinch = null;
  }

  isDown(code) { return this.enabled && this.keys.has(code); }
  justPressed(code) { return this.enabled && this.pressed.has(code); }

  /** 이동 입력 (-1..1), x: 좌우, y: 앞뒤(앞 = -1) */
  axis() {
    let x = 0, y = 0;
    if (this.enabled) {
      if (this.isDown('KeyA') || this.isDown('ArrowLeft')) x -= 1;
      if (this.isDown('KeyD') || this.isDown('ArrowRight')) x += 1;
      if (this.isDown('KeyW') || this.isDown('ArrowUp')) y -= 1;
      if (this.isDown('KeyS') || this.isDown('ArrowDown')) y += 1;
      if (this.joy.active) { x += this.joy.x; y += this.joy.y; }
      x += this.virtual.x; y += this.virtual.y;
    }
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    return { x, y };
  }

  interact() {
    const v = this.justPressed('KeyE') || this.justPressed('Enter') || this.interactTap;
    return v;
  }

  /** 프레임 끝: 1회성 입력 초기화 */
  /** 키보드/조이스틱으로 직접 움직이는 중인지 (클릭 이동 취소용) */
  manual() {
    const a = this.axis();
    return Math.abs(a.x) + Math.abs(a.y) > 0.05;
  }

  /** 화면을 벗어날 때(앱 전환 등): 손 뗀 이벤트를 놓쳐 눌린 채 남은 키·조이스틱·시점 터치 정리 */
  reset() {
    this.keys.clear(); this.pressed.clear();
    this.clicks.length = 0;
    this.drag.active = false; this.drag.dx = this.drag.dy = 0;
    this.down = null; this.wheel = 0; this.interactTap = false;
    this.touches.clear(); this.tapStart.clear(); this.pinch = null;
    this.virtual.x = this.virtual.y = 0;
    if (this.joy.active || this.joy.id != null) this._joyOff();
  }

  endFrame() {
    this.pressed.clear();
    this.clicks.length = 0;
    this.drag.dx = this.drag.dy = 0;
    this.wheel = 0;
    this.interactTap = false;
  }
}
