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
    this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.09, 0.3, 1.6);
    if (quality.bloom) this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass(ColorGradeShader);
    this.composer.addPass(this.grade);
    this.smaa = new SMAAPass();
    if (quality.smaa) this.composer.addPass(this.smaa);
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
    // 환경맵
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.32;
    pmrem.dispose();
    this.enabled = true;
    this.scene = scene;
    this.camera = camera;
  }

  setSize(w, h) {
    this.composer.setSize(w, h);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.gtao?.setSize(w, h);
    if (this.tiltH) { this.tiltH.uniforms.h.value = 1.6 / w; this.tiltV.uniforms.v.value = 1.6 / h; }
  }

  render() {
    if (this.enabled) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }
}
