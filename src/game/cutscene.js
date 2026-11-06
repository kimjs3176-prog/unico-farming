import * as THREE from 'three';

const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * 연출 카메라 + 컷신
 *  - 따라가기 카메라 위에 '연출 샷'을 섞어 씀(blend 0→1→0) → 대화·컷신 진입/종료가 부드럽게 이어짐
 *  - shot(): 지정 위치·시선으로 이징 이동, orbit 으로 천천히 도는 샷
 *  - play(steps): 위아래 영화 띠 + 건너뛰기 + 순서대로 카메라 이동·대사·대기·동작
 */
export class Cinematics {
  constructor(game, root) {
    this.game = game;
    this.blend = 0; this.want = 0;
    this.pos = new THREE.Vector3(); this.look = new THREE.Vector3();
    this.from = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
    this.to = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
    this.t = 1; this.dur = 1;
    this.orbit = 0;
    this.locked = false; // 컷신 중: 이동·상호작용 막음
    this._fp = new THREE.Vector3(); this._fl = new THREE.Vector3();
    // 영화 띠 + 건너뛰기
    this.bars = document.createElement('div');
    this.bars.className = 'cine-bars';
    this.bars.innerHTML = '<i class="top"></i><i class="bot"></i><button class="cine-skip">건너뛰기 ▶▶</button>';
    root.append(this.bars);
    this.bars.querySelector('.cine-skip').onclick = () => { this.skipping = true; this.game.dialogue?.skipAll(); };
  }

  get active() { return this.want > 0 || this.blend > 0.001; }

  /** 연출 샷으로 이동 (현재 카메라 위치에서 이어서) */
  shot(pos, look, dur = 1.2, { orbit = 0 } = {}) {
    const cam = this.game.camera;
    if (this.blend < 0.01) { this.pos.copy(cam.position); this.look.copy(this.game.followCam.smooth); }
    this.from.pos.copy(this.pos); this.from.look.copy(this.look);
    this.to.pos.set(...pos); this.to.look.set(...look);
    this.t = 0; this.dur = Math.max(0.01, dur); this.orbit = orbit;
    this.t0 = performance.now(); // 이동 진행은 실제 경과 시간 기준 (wait() 와 같은 시계)
    this.want = 1;
  }

  /** 두 인물을 담는 대화 구도 (어깨 너머 살짝 비스듬히) */
  focusTalk(a, b) {
    const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
    const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz) || 1;
    const nx = -dz / d, nz = dx / d; // 두 사람을 잇는 선의 옆 방향
    const cam = this.game.camera.position;
    const side = (cam.x - mx) * nx + (cam.z - mz) * nz >= 0 ? 1 : -1; // 지금 카메라가 있는 쪽에서
    const dist = 4.6 + d * 0.9;
    this.shot([mx + nx * side * dist - dx / d * 1.2, 2.5, mz + nz * side * dist - dz / d * 1.2], [mx, 1.1, mz], 0.7);
  }

  /** 대화 중 이름표·표시 숨길 캐릭터 (머리 위 이름표가 대화 구도를 가리지 않게) */
  hideLabelsOf(...unicos) { this.hidden = unicos.filter(Boolean); }

  release() {
    this.want = 0;
    for (const u of this.hidden || []) if (u.labelAlways && u.label) u.label.visible = true;
    this.hidden = null;
  }

  update(dt) {
    const k = 1 - Math.exp(-dt * 5);
    this.blend += (this.want - this.blend) * k;
    if (this.want === 0 && this.blend < 0.002) this.blend = 0;
    if (this.hidden) for (const u of this.hidden) { if (u.label) u.label.visible = false; }
    if (this.blend <= 0) return;
    if (this.t < 1) {
      this.t = Math.min(1, (performance.now() - this.t0) / 1000 / this.dur);
      const e = easeInOut(this.t);
      this.pos.lerpVectors(this.from.pos, this.to.pos, e);
      this.look.lerpVectors(this.from.look, this.to.look, e);
    } else if (this.orbit) { // 천천히 도는 샷
      const a = this.orbit * dt, c = Math.cos(a), s = Math.sin(a);
      const ox = this.pos.x - this.look.x, oz = this.pos.z - this.look.z;
      this.pos.x = this.look.x + ox * c - oz * s; this.pos.z = this.look.z + ox * s + oz * c;
    }
    // 따라가기 카메라와 섞기
    const cam = this.game.camera, b = easeInOut(this.blend);
    this._fp.copy(cam.position); this._fl.copy(this.game.followCam.smooth);
    cam.position.lerpVectors(this._fp, this.pos, b);
    this._fl.lerp(this.look, b);
    cam.lookAt(this._fl);
  }

  wait(s) { return new Promise((r) => { const end = performance.now() + s * 1000; const tick = () => (this.skipping || performance.now() >= end ? r() : requestAnimationFrame(tick)); tick(); }); }

  /**
   * 컷신 실행. steps: { cam:[pos,look,dur,opts] } | { say:[lines] } | { wait:s } | { run:fn }
   * 건너뛰면 남은 카메라·대기는 생략하고 run(상태 변경)만 실행
   */
  async play(steps) {
    if (this.locked) return;
    this.locked = true; this.skipping = false;
    const g = this.game;
    g.player.frozen = true;
    g.ui.closePanel();
    document.body.classList.add('cine');
    for (const s of steps) {
      if (s.run) { s.run(); continue; }
      if (this.skipping) continue;
      if (s.cam) { this.shot(...s.cam); if (s.hold !== false) await this.wait((s.cam[2] ?? 1.2) * (s.hold ?? 1)); }
      else if (s.say) await g.dialogue.say(s.say);
      else if (s.wait) await this.wait(s.wait);
    }
    document.body.classList.remove('cine');
    this.release();
    g.player.frozen = false;
    this.locked = false;
    g.governor?.reset(); // 컷신 동안의 프레임은 화질 자동 조절 측정에서 뺌 (끝난 뒤 새로 잼)
  }
}
