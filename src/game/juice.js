/**
 * 게임 필(juice) 헬퍼 — vendored skill `game-feel` 의 패턴 적용
 * - 트라우마 기반 화면 흔들림 (랜덤 지터 대신 trauma² 로 감쇠, 부드러운 노이즈)
 * - 스쿼시&스트레치 팝 (이징 트윈)
 */
import * as THREE from 'three';

export class Juice {
  constructor() {
    this.trauma = 0;
    this.pops = [];
    this.t = 0;
    this.offset = new THREE.Vector3();
  }

  /** 0..1 트라우마 추가 (여러 충격이 겹치면 누적, 최대 1) */
  shake(amount) { this.trauma = Math.min(1, this.trauma + amount); }

  /** 오브젝트를 순간 키웠다가(스트레치) 원래 크기로 복귀 */
  pop(obj, amount = 0.25, duration = 0.35) {
    this.pops.push({ obj, amount, duration, t: 0, base: obj.scale.clone() });
  }

  update(dt, camera) {
    this.t += dt;
    // 화면 흔들림: 강도 = trauma², 선형 감쇠
    if (this.trauma > 0) {
      const k = this.trauma * this.trauma;
      const n = (s) => Math.sin(this.t * 31 * s) * Math.cos(this.t * 17 * s + s);
      this.offset.set(n(1.3) * 0.25 * k, n(0.9) * 0.2 * k, 0);
      camera.position.add(this.offset);
      camera.rotation.z += n(1.1) * 0.02 * k;
      this.trauma = Math.max(0, this.trauma - dt * 1.6);
    }
    for (let i = this.pops.length - 1; i >= 0; i--) {
      const p = this.pops[i];
      p.t += dt;
      const u = Math.min(1, p.t / p.duration);
      // easeOutBack 계열: 빠르게 커졌다가 살짝 오버슈트 후 복귀
      const s = 1 + p.amount * Math.sin(u * Math.PI) * (1 - u * 0.5);
      p.obj.scale.set(p.base.x * s, p.base.y * (2 - s), p.base.z * s);
      if (u >= 1) { p.obj.scale.copy(p.base); this.pops.splice(i, 1); }
    }
  }
}
