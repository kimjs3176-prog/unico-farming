/** 키보드 + 마우스 + 터치(가상 조이스틱) 입력 */
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

    // 터치: 왼쪽 절반 = 조이스틱, 오른쪽 절반 = 시점 드래그
    this.touches = new Map();
    this.tapStart = new Map();
    this.pinch = null;
    canvas.addEventListener('touchstart', (e) => {
      for (const t of e.changedTouches) {
        this.tapStart.set(t.identifier, { x: t.clientX, y: t.clientY, t: performance.now(), moved: 0 });
        if (t.clientX < window.innerWidth / 2 && !this.joy.active) {
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
      e.preventDefault();
    }, { passive: false });
    canvas.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        const st = this.tapStart.get(t.identifier);
        if (st) st.moved = Math.max(st.moved, Math.hypot(t.clientX - st.x, t.clientY - st.y));
      }
      // 두 손가락 핀치 줌 (시점 영역 터치 2개)
      if (this.touches.size >= 2) {
        const [a, b] = [...this.touches.keys()].slice(0, 2).map((id) => [...e.touches].find((x) => x.identifier === id)).filter(Boolean);
        if (a && b) {
          const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
          if (this.pinch) this.wheel += (this.pinch - dist) * 3;
          this.pinch = dist;
          e.preventDefault();
          return;
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
        } else if (this.touches.has(t.identifier)) {
          const p = this.touches.get(t.identifier);
          this.drag.dx += t.clientX - p.x;
          this.drag.dy += t.clientY - p.y;
          p.x = t.clientX;
          p.y = t.clientY;
        }
      }
      e.preventDefault();
    }, { passive: false });
    const touchEnd = (e) => {
      for (const t of e.changedTouches) {
        const st = this.tapStart.get(t.identifier);
        if (st && st.moved < 12 && performance.now() - st.t < 300 && e.type === 'touchend') this.clicks.push({ x: st.x, y: st.y });
        this.tapStart.delete(t.identifier);
        if (t.identifier === this.joy.id) {
          this.joy.active = false;
          this.joy.id = null;
          this.joy.x = this.joy.y = 0;
          this.onJoystick?.(false);
        }
        this.touches.delete(t.identifier);
      }
      if (this.touches.size < 2) this.pinch = null;
    };
    canvas.addEventListener('touchend', touchEnd);
    canvas.addEventListener('touchcancel', touchEnd);
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

  endFrame() {
    this.pressed.clear();
    this.clicks.length = 0;
    this.drag.dx = this.drag.dy = 0;
    this.wheel = 0;
    this.interactTap = false;
  }
}
