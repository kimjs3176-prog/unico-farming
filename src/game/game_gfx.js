// Game 믹스인: 그래픽 품질·절전 단계·UI 배율·화면 크기·셰이더 미리 준비
// main.js 에서 Object.assign(Game.prototype, …) 으로 붙임 (축약 메서드라 this 는 Game)
import * as THREE from 'three';
import { DEFERRED_MODELS } from './assets.js';
import { fovFor } from './camera.js';
import { Unico } from './unico.js';
import { PostFX } from './postfx.js';
import { saveSettings, resolveQuality, uiScaleOf } from './quality.js';

export const GameGfx = {
  /** 환경설정에서 그래픽 설정을 바꿨을 때 (저장 + 즉시 적용) */
  setGraphics(settings) {
    this.saver = 0; // 설정을 바꾸면 절전 단계 풀림
    this.gfx = settings;
    saveSettings(settings);
    const prev = this.quality;
    const q = resolveQuality(settings);
    const rebuildPost = prev.post !== q.post || prev.ao !== q.ao || prev.tiltShift !== q.tiltShift || prev.env !== q.env; // env: 환경맵(IBL) 켜고 끄기
    this.applyQuality(q, { rebuildPost });
  },

  applyQuality(q, { rebuildPost = false } = {}) {
    this.quality = q;
    this.world.quality = q;
    Unico.setQuality(q.level); // 낮음이면 NPC·다른 접속자는 저해상도 몸·실제 그림자 끔
    this.renderer.setPixelRatio(q.pixelRatio);
    // 그림자: 끄기/켜기, 해상도 바꾸면 그림자 맵 다시 만들기
    const sun = this.world.sun;
    sun.castShadow = q.shadows !== 'off';
    if (sun.shadow.mapSize.x !== q.shadowMap) {
      sun.shadow.mapSize.set(q.shadowMap, q.shadowMap);
      sun.shadow.map?.dispose();
      sun.shadow.map = null;
    }
    // 그림자 맵은 loop 에서 한 프레임에 한 번만 갱신 (자동 갱신이면 GTAO·반사 연못의 추가 render 마다 똑같이 다시 그림)
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.needsUpdate = true;
    this.world.scenery?.setDensity(q.grass);
    this.fx?.setQuality(q); // 입자 상한
    if (rebuildPost) {
      this.world.scenery?._water(); // 반사 연못은 화면 효과가 켜진 품질에서만
      this.postfx.dispose();
      this.postfx = new PostFX(this.renderer, this.world.scene, this.camera, q);
    }
    this.postfx.enabled = q.post;
    this.resize();
    this.ui?.updateFps?.();
    this.applyUiScale();
  },

  /** 자동 품질이 이미 가장 낮은데도 끊길 때: 저장하지 않는 절전 단계 (새로 고치거나 설정을 바꾸면 원래대로) */
  lighten() {
    if ((this.saver || 0) >= 2) return;
    this.saver = (this.saver || 0) + 1;
    this.applyQuality(this.withSaver(resolveQuality(this.gfx)));
    if (this.saver === 1) this.ui.toast('⚙️ 화면이 끊겨서 풀과 그림자 갱신을 줄여 더 가볍게 했어요');
  },

  /** 절전 단계: 1) 풀 절반 + 그림자 갱신 덜 자주 2) 해상도 80% (셰이더를 다시 만들지 않는 항목만) */
  withSaver(q) {
    const s = this.saver || 0;
    if (!s) return q;
    return {
      ...q,
      grass: q.grass * 0.5,
      shadowEvery: q.shadowEvery > 0 ? Math.max(q.shadowEvery, 6) : q.shadowEvery,
      pixelRatio: s >= 2 ? Math.max(0.5, q.pixelRatio * 0.8) : q.pixelRatio,
    };
  },

  /** 글자·버튼 크기: 화면 UI 요소마다 배율 (환경설정) */
  applyUiScale() {
    const v = uiScaleOf(this.gfx);
    document.getElementById('ui')?.style.setProperty('--ui-zoom', String(v));
    document.body.classList.toggle('ui-big', v > 1);
    this.ui?.syncHudBottom?.();
  },

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = fovFor(w / h); // 세로 폰: 주변이 보이도록 시야를 넓힘
    this.camera.updateProjectionMatrix();
    this.postfx?.setSize(w, h);
  },

  /** 로딩 화면 뒤에서 인트로 전경 시점으로 한 번 그려 둠: 처음 화면에 들어오는 물체·그림자를 미리 준비해 인트로 첫 몇 초의 끊김을 줄임 */
  warmUp() {
    if (this.flags.intro) return; // 인트로를 이미 본 저장이면 생략
    const cam = this.camera, p = cam.position.clone(), q = cam.quaternion.clone();
    try {
      for (const [pos, look] of [[[10, 22, 30], [0, 0, 0]], [[16, 16, 26], [0, 0, 0]]]) {
        cam.position.set(...pos); cam.lookAt(...look); cam.updateMatrixWorld();
        this.renderer.shadowMap.needsUpdate = true;
        this.postfx.render();
      }
    } catch { /* 첫 프레임에 준비 */ }
    cam.position.copy(p); cam.quaternion.copy(q); cam.updateMatrixWorld();
  },

  /**
   * 뒤에서 받은 동물(말·당나귀·알파카·늑대·여우)의 셰이더를 미리 준비 → 처음 화면에 나올 때 끊기지 않게 (가능하면 병렬).
   * 도착한 것 중 아직 안 한 것만 (여러 번 불러도 모델마다 한 번). 준비가 끝나면 풀리는 약속, 할 것이 없으면 null
   */
  warmDeferred() {
    const r = this.renderer, A = this.assets;
    if (this._warmedDeferred) return null;
    if (!r?.compileAsync) { this._warmedDeferred = true; return null; }
    const done = (this._warmedNames ||= new Set());
    const batch = new THREE.Object3D();
    for (const n of DEFERRED_MODELS.flat()) {
      if (done.has(n) || !A.has(n)) continue;
      done.add(n);
      batch.add(A.anims.get(n)?.length ? A.cloneAnimated(n).root : A.clone(n)); // 실제로 놓을 때와 같은 복제 (재질 공유)
    }
    if (A.deferredDone || done.size === DEFERRED_MODELS.flat().length) this._warmedDeferred = true; // 더 올 것이 없음
    if (!batch.children.length) return null;
    const prevRT = r.getRenderTarget?.() ?? null;
    try {
      // 화면 효과가 켜져 있으면 그 버퍼에 그리므로(톤매핑·색 공간이 다름) 그 대상으로 준비, 불빛·안개는 실제 장면 것
      r.setRenderTarget?.(this.postfx?.enabled ? this.postfx.composer.readBuffer : null);
      return r.compileAsync(batch, this.camera, this.world.scene).catch(() => {});
    } catch { return null; /* 처음 나올 때 준비 */ } finally { r.setRenderTarget?.(prevRT); }
  },
};
