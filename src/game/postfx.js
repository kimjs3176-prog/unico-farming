import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { VignetteShader } from 'three/addons/shaders/VignetteShader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ColorGradeShader } from './surface.js';
import { installGradeToneMapping, toneMappingFor } from './tonemap.js';
import { visibleLabels, declutterLabels } from './label.js';

installGradeToneMapping(); // 첫 셰이더 컴파일 전에: 저사양 톤 매핑에 색 보정을 넣어 둠

/** 무거운 패스 모듈: 처음 필요할 때 한 번 받음 */
let PASSES = null, passesLoading = null;
const loadPasses = () => (passesLoading ||= import('./postfx_passes.js').then((m) => (PASSES = m)));

const ENV = new WeakMap(); // 장면 → 환경맵 렌더 타깃
const NO_CHILDREN = Object.freeze([]); // 이름표 장면은 그릴 때만 자식을 빌림

/**
 * 고주사율(100Hz 이상) 모바일 화면 프레임 제한: 화면 갱신(vsync)의 정수 배로만 건너뛰어 고르게 그림
 * 120Hz → 60, 144Hz → 72, 90Hz·60Hz 는 그대로. 그리기가 무거워 갱신 간격이 벌어지면 저절로 꺼짐
 */
export class FrameCap {
  constructor() { this.iv = 0; this.reset(); }
  /** 탭 숨김·복귀: 간격 측정과 마지막 그린 시각만 초기화 (화면 주사율 추정은 유지) */
  reset() { this.prev = undefined; this.last = -1e9; }
  /** rAF 시각(ms)을 받아 이번 갱신에 그릴지 */
  tick(now) {
    const d = now - (this.prev ?? now);
    this.prev = now;
    if (d > 0 && d < 50) this.iv = this.iv ? this.iv + (d - this.iv) * 0.05 : d;
    const k = this.iv && this.iv < 10 ? Math.round(1000 / 60 / this.iv) : 1; // 몇 번에 한 번 그릴지
    if (k > 1 && now - this.last < (k - 0.5) * this.iv) return false; // 시각 기준: 한 번 늦어져도 박자가 밀리지 않음
    this.last = now;
    return true;
  }
}

/** 미니어처 흐림 띠의 초점 높이 (화면 아래에서 비율). 대화 구도가 렌즈를 올리면(카메라 view offset) 얼굴 높이로 따라 올라감 */
export const TILT_R = 0.52;
export function tiltFocus(camera) {
  const v = camera?.view;
  return v?.enabled && v.fullHeight ? Math.min(0.9, TILT_R + v.offsetY / v.fullHeight) : TILT_R;
}

/**
 * 후처리 파이프라인: 렌더 → 주변광 차폐(GTAO, 고사양) → 약한 블룸 → 톤매핑/sRGB 출력 → 색 보정
 *   → SMAA 안티앨리어싱 → 틸트시프트(화면 위·아래를 살짝 흐려 미니어처 디오라마 느낌) → 비네팅 → 이름표 (효과 밖에서 화면 색 그대로)
 * + 환경맵(RoomEnvironment PMREM) 으로 은은한 반사/간접광
 * 후처리를 끈 저사양은 한 번에 그리고, 색 보정은 톤 매핑 안에서 (tonemap.js, 패스·그리기 추가 없음.
 *  비네팅은 넣지 않음: 그리기가 1번 늘고, 재 보니 보통보다 오히려 어두워짐)
 */
export class PostFX {
  constructor(renderer, scene, camera, quality = { bloom: true, smaa: true }) {
    this.renderer = renderer;
    this.composer = new EffectComposer(renderer);
    this.renderPass = new RenderPass(scene, camera);
    this.scene = scene;
    this.camera = camera;
    // 무거운 패스(GTAO·블룸·SMAA·틸트시프트)는 따로 받아 끼움 (받는 동안은 기본 패스만으로 그림). 꺼진 효과는 만들지 않음
    this.output = new OutputPass();
    this.grade = new ShaderPass(ColorGradeShader);
    this._q = quality;
    if (quality.ao || quality.bloom || quality.smaa || quality.tiltShift) {
      if (PASSES) this._addHeavy(PASSES);
      else loadPasses().then((m) => { if (!this._disposed) { this._addHeavy(m); if (this._w) this.setSize(this._w, this._h); } }).catch(() => { /* 효과 없이 */ });
    }
    this.vignette = new ShaderPass(VignetteShader);
    this.vignette.uniforms.offset.value = 1.05;
    this.vignette.uniforms.darkness.value = 0.95;
    this._order();
    // 이름표만 담는 빈 장면 (배경·안개·불빛 없음): 월드 장면의 이름표를 자식 목록으로만 빌려 마지막에 화면 위에 그림
    this.labelScene = new THREE.Scene();
    this.labelScene.matrixWorldAutoUpdate = false; // 월드 행렬은 본 장면을 그릴 때 이미 맞춰짐 (부모는 그대로)
    this._shown = []; this._kept = [];
    this._size = new THREE.Vector2(1, 1);
    this._t = -1;
    this.enabled = quality.post !== false;
    // 환경맵: 장면마다 한 번만 구워 다시 씀 (PostFX 를 다시 만들 때 새로 굽거나 새지 않게)
    // quality.env === false 면 끔 (값이 없으면 지금처럼 켬)
    this.envOn = quality.env !== false;
    if (!this.envOn) { ENV.get(scene)?.dispose(); ENV.delete(scene); scene.environment = null; }
    else if (ENV.has(scene)) scene.environment = ENV.get(scene).texture;
    else this.rebuildEnvironment();
    scene.environmentIntensity = 0.32;
  }

  /** 환경맵 굽기. WebGL 컨텍스트가 복구되면 렌더 타깃 내용이 비므로 다시 부름 */
  rebuildEnvironment() {
    const { renderer, scene } = this;
    if (!this.envOn) return;
    ENV.get(scene)?.dispose();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    const rt = pmrem.fromScene(room, 0.04);
    room.dispose();
    pmrem.dispose();
    ENV.set(scene, rt);
    scene.environment = rt.texture;
  }

  /** 후처리 켜기/끄기: 끄면 톤 매핑이 색 보정까지 맡음 (켜면 ACES, 색 보정은 패스가) */
  get enabled() { return this._enabled; }
  set enabled(v) {
    this._enabled = !!v;
    this.renderer.toneMapping = toneMappingFor(this._enabled);
  }

  /** 무거운 패스 만들기 (모듈을 받은 뒤) */
  _addHeavy(P) {
    const q = this._q, scene = this.scene, camera = this.camera;
    if (q.ao) {
      // 접촉면·틈새를 어둡게 해 물체가 땅에 붙어 보이고 형태가 또렷해짐
      this.gtao = new P.GTAOPass(scene, camera, innerWidth, innerHeight);
      this.gtao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.4, thickness: 1.2, scale: 1.0, samples: 12 });
      this.gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
      this.gtao.blendIntensity = 0.85;
    }
    if (q.bloom) this.bloom = new P.UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.09, 0.3, 1.6);
    if (q.smaa) this.smaa = new P.SMAAPass();
    if (q.tiltShift) {
      this.tiltH = new ShaderPass(P.HorizontalTiltShiftShader);
      this.tiltV = new ShaderPass(P.VerticalTiltShiftShader);
      for (const t of [this.tiltH, this.tiltV]) t.uniforms.r.value = TILT_R;
    }
    this._order();
  }

  /** 패스 순서: 장면 → GTAO → 블룸 → 출력(톤 매핑) → 색 보정 → SMAA → 틸트시프트 → 비네트 */
  _order() {
    const C = this.composer, pr = C._pixelRatio || 1;
    C.passes = [this.renderPass, this.gtao, this.bloom, this.output, this.grade, this.smaa, this.tiltH, this.tiltV, this.vignette].filter(Boolean);
    for (const p of C.passes) p.setSize?.(C._width * pr, C._height * pr); // addPass 와 같이 크기 맞춤
  }

  setSize(w, h) {
    this._w = w; this._h = h;
    this.composer.setSize(w, h);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.gtao?.setSize(w, h);
    if (this.tiltH) { this.tiltH.uniforms.h.value = 1.6 / w; this.tiltV.uniforms.v.value = 1.6 / h; }
  }

  /** 컴포저에 넣은 패스 전부 해제 (SMAA 렌더 타깃·셰이더 패스·출력 패스 포함). 환경맵은 다음 PostFX 가 다시 씀 */
  dispose() {
    this._disposed = true;
    for (const p of new Set([...this.composer.passes, this.bloom, this.smaa])) p?.dispose?.();
    this.composer.dispose?.();
  }

  /** 시간대 색 보정 (world.tod): 흐린 날은 약하게 */
  setGrade(tod, overcast = 0) {
    if (!this.grade) return;
    const u = this.grade.uniforms;
    if (!tod) { u.warmth.value = 0.035; u.saturation.value = 1.12; u.tint.value.set(1, 1, 1); return; } // 기본 (실내 등)
    const k = 1 - Math.min(1, overcast) * 0.6;
    u.warmth.value = tod.warmth * k;
    u.saturation.value = 1 + (tod.sat - 1) * (0.55 + 0.45 * k);
    u.tint.value.set(1 + (tod.tint[0] - 1) * k, 1 + (tod.tint[1] - 1) * k, 1 + (tod.tint[2] - 1) * k);
  }

  /**
   * 한 프레임 그리기. 이름표: 겹치면 흐리게(label.js), 후처리를 켰으면 효과 패스 동안 숨겼다가 마지막에 따로 그림
   * (깊이 테스트를 안 하므로 순서만 맨 위. 따로 그리는 장면엔 불빛·그림자가 없어 그림자를 다시 그리지 않음)
   */
  render() {
    const { renderer, scene, camera } = this;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const dt = this._t < 0 ? 0 : Math.min(0.1, (now - this._t) / 1000);
    this._t = now;
    const shown = visibleLabels(scene, this._shown);
    renderer.getSize?.(this._size);
    declutterLabels(shown, camera, this._size.x, this._size.y, dt);
    const kept = this._kept;
    kept.length = 0;
    for (const s of shown) {
      const m = s.userData.fadeMul ?? 1;
      if (m < 0.999) { kept.push(s, s.material.opacity); s.material.opacity *= m; }
    }
    try {
      if (!this.enabled) { renderer.render(scene, camera); return; }
      if (this.tiltH) this.tiltH.uniforms.r.value = this.tiltV.uniforms.r.value = tiltFocus(camera);
      for (const s of shown) s.visible = false;
      try { this.composer.render(); } finally { for (const s of shown) s.visible = true; }
      if (shown.length) this._drawLabels(shown);
    } finally {
      for (let i = 0; i < kept.length; i += 2) kept[i].material.opacity = kept[i + 1];
    }
  }

  /** 효과를 다 입힌 화면 위에 이름표만 (지우지 않고 덧그림) */
  _drawLabels(shown) {
    const { renderer, camera } = this, L = this.labelScene;
    const ac = renderer.autoClear, rt = renderer.getRenderTarget?.() ?? null;
    L.children = shown;
    renderer.autoClear = false;
    try {
      renderer.setRenderTarget(null);
      renderer.render(L, camera);
    } finally {
      L.children = NO_CHILDREN;
      renderer.autoClear = ac;
      renderer.setRenderTarget(rt);
    }
  }
}
