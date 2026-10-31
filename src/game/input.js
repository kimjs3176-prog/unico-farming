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
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch' || !this.drag.active) return;
      this.drag.dx += e.clientX - this.drag.lastX;
      this.drag.dy += e.clientY - this.drag.lastY;
      this.drag.lastX = e.clientX;
      this.drag.lastY = e.clientY;
    });
    const end = () => (this.drag.active = false);
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('wheel', (e) => {
      this.wheel += e.deltaY;
      e.preventDefault();
    }, { passive: false });

    // 터치: 왼쪽 절반 = 조이스틱, 오른쪽 절반 = 시점 드래그
    this.touches = new Map();
    canvas.addEventListener('touchstart', (e) => {
      for (const t of e.changedTouches) {
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
        if (t.identifier === this.joy.id) {
          this.joy.active = false;
          this.joy.id = null;
          this.joy.x = this.joy.y = 0;
          this.onJoystick?.(false);
        }
        this.touches.delete(t.identifier);
      }
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
  endFrame() {
    this.pressed.clear();
    this.drag.dx = this.drag.dy = 0;
    this.wheel = 0;
    this.interactTap = false;
  }
}
