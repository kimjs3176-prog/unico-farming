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

/**
 * 후처리 파이프라인: 렌더 → 약한 블룸 → 톤매핑/sRGB 출력 → SMAA 안티앨리어싱 → 비네팅
 * + 환경맵(RoomEnvironment PMREM) 으로 은은한 반사/간접광
 */
export class PostFX {
  constructor(renderer, scene, camera, quality = { bloom: true, smaa: true }) {
    this.renderer = renderer;
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.09, 0.3, 1.6);
    if (quality.bloom) this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass(ColorGradeShader);
    this.composer.addPass(this.grade);
    this.smaa = new SMAAPass();
    if (quality.smaa) this.composer.addPass(this.smaa);
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
  }

  render() {
    if (this.enabled) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }
}
