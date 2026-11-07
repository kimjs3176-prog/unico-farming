import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { VignetteShader } from 'three/addons/shaders/VignetteShader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ColorGradeShader } from './surface.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { HorizontalTiltShiftShader } from 'three/addons/shaders/HorizontalTiltShiftShader.js';
import { VerticalTiltShiftShader } from 'three/addons/shaders/VerticalTiltShiftShader.js';

const ENV = new WeakMap(); // 장면 → 환경맵 렌더 타깃

/**
 * 후처리 파이프라인: 렌더 → 주변광 차폐(GTAO, 고사양) → 약한 블룸 → 톤매핑/sRGB 출력 → 색 보정
 *   → SMAA 안티앨리어싱 → 틸트시프트(화면 위·아래를 살짝 흐려 미니어처 디오라마 느낌) → 비네팅
 * + 환경맵(RoomEnvironment PMREM) 으로 은은한 반사/간접광
 */
export class PostFX {
  constructor(renderer, scene, camera, quality = { bloom: true, smaa: true }) {
    this.renderer = renderer;
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));
    if (quality.ao) {
      // 접촉면·틈새를 어둡게 해 물체가 땅에 붙어 보이고 형태가 또렷해짐
      this.gtao = new GTAOPass(scene, camera, innerWidth, innerHeight);
      this.gtao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.4, thickness: 1.2, scale: 1.0, samples: 12 });
      this.gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
      this.gtao.blendIntensity = 0.85;
      this.composer.addPass(this.gtao);
    }
    // 꺼진 효과는 만들지 않음 (후처리를 끈 저사양에서 블룸·SMAA 객체와 이미지 디코딩을 아낌)
    if (quality.bloom) {
      this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.09, 0.3, 1.6);
      this.composer.addPass(this.bloom);
    }
    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass(ColorGradeShader);
    this.composer.addPass(this.grade);
    if (quality.smaa) {
      this.smaa = new SMAAPass();
      this.composer.addPass(this.smaa);
    }
    if (quality.tiltShift) {
      this.tiltH = new ShaderPass(HorizontalTiltShiftShader);
      this.tiltV = new ShaderPass(VerticalTiltShiftShader);
      for (const t of [this.tiltH, this.tiltV]) t.uniforms.r.value = 0.52;
      this.composer.addPass(this.tiltH);
      this.composer.addPass(this.tiltV);
    }
    this.vignette = new ShaderPass(VignetteShader);
    this.vignette.uniforms.offset.value = 1.05;
    this.vignette.uniforms.darkness.value = 0.95;
    this.composer.addPass(this.vignette);
    this.enabled = true;
    this.scene = scene;
    this.camera = camera;
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

  setSize(w, h) {
    this.composer.setSize(w, h);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.gtao?.setSize(w, h);
    if (this.tiltH) { this.tiltH.uniforms.h.value = 1.6 / w; this.tiltV.uniforms.v.value = 1.6 / h; }
  }

  /** 컴포저에 넣은 패스 전부 해제 (SMAA 렌더 타깃·셰이더 패스·출력 패스 포함). 환경맵은 다음 PostFX 가 다시 씀 */
  dispose() {
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

  render() {
    if (this.enabled) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }
}
