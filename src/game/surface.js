import * as THREE from 'three';

/**
 * 재질 고도화 (vendored skill threejs-aaa-graphics-builder: "공유 재질 역할 + 절차적 디테일·마모")
 * 텍스처/UV 없이 셰이더에서 월드 좌표 3D 노이즈로 재질별 디테일을 입힌다.
 *  wood: 나뭇결·판자 얼룩 / roof: 기와 줄 / paint: 칠 바램·아랫단 때 / stone: 얼룩·틈 / foliage: 잎 덩어리·윗면 햇빛
 *  soil: 흙 알갱이 / hay: 짚 결 / metal: 결 / fur: 털 결 / 공통: 지면 가까이 접지 어둠(가짜 AO)
 */
/** 모든 재질이 공유하는 시간·바람 (main 루프에서 갱신) */
export const SURF = { time: { value: 0 }, wind: { value: 0.15 }, snow: { value: 0 } };

const NOISE = /* glsl */ `
varying vec3 vSW; varying vec3 vSN;
float sh31(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float svn(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(sh31(i), sh31(i + vec3(1,0,0)), f.x), mix(sh31(i + vec3(0,1,0)), sh31(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(sh31(i + vec3(0,0,1)), sh31(i + vec3(1,0,1)), f.x), mix(sh31(i + vec3(0,1,1)), sh31(i + vec3(1,1,1)), f.x), f.y), f.z); }
float sfbm(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * svn(p); p *= 2.03; a *= 0.5; } return s; }
`;

const KIND_CODE = {
  wood: `float k = 0.8 + 0.3 * sfbm(vSW * 5.0) + 0.07 * sin((vSW.x + vSW.z) * 38.0 + sfbm(vSW * 2.5) * 9.0);`,
  roof: `float rows = smoothstep(0.0, 0.09, fract(vSW.y * 6.5 + svn(vSW * 3.0) * 0.15));
         float k = mix(0.7, 1.0, rows) * (0.86 + 0.24 * sfbm(vSW * 4.0));`,
  paint: `float k = (0.9 + 0.17 * sfbm(vSW * 3.5)) * mix(0.8, 1.0, smoothstep(0.0, 0.7, vSW.y));`,
  stone: `float k = 0.68 + 0.52 * sfbm(vSW * 5.5);`,
  foliage: `float f = sfbm(vSW * 2.3);
            float k = 0.66 + 0.58 * f;
            diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.15, 1.1, 0.78), smoothstep(0.2, 1.0, vSN.y) * 0.45);`,
  soil: `float k = 0.74 + 0.46 * sfbm(vSW * 9.0);`,
  hay: `float k = 0.8 + 0.36 * sfbm(vSW * vec3(26.0, 3.0, 26.0));`,
  metal: `float k = 0.9 + 0.14 * sfbm(vSW * vec3(1.5, 30.0, 1.5));`,
  fur: `float k = 0.93 + 0.1 * sfbm(vSW * 14.0);`,
  base: `float k = 0.94 + 0.1 * sfbm(vSW * 3.0);`,
};

export function kindOf(name = '') {
  const n = name.toLowerCase();
  if (/roof/.test(n)) return 'roof';
  if (/wood|plank|crate|bench|drum|wheel_wood/.test(n)) return 'wood';
  if (/barn_red|cream|mail|shirt|awning|paint|lamp_iron/.test(n)) return 'paint';
  if (/stone|rock/.test(n)) return 'stone';
  if (/grass|pine|orchard|leaf|bush|canopy|cabbage/.test(n)) return 'foliage';
  if (/soil/.test(n)) return 'soil';
  if (/hay|straw|burlap/.test(n)) return 'hay';
  if (/steel|iron|tire|hub|solar/.test(n)) return 'metal';
  if (/^white|cow_spot|sheep|udder/.test(n)) return 'fur';
  return 'base';
}

/** 재질에 디테일 셰이더 주입 (한 재질에 한 번) */
export function enhanceMaterial(m, kind = kindOf(m.name), { contact = true, rim = 0, spots = 0 } = {}) {
  if (!m || m.userData.enhanced || m.transparent || !m.isMeshStandardMaterial) return m;
  m.userData.enhanced = kind;
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    prev?.call(m, sh, r);
    sh.uniforms.uSurfTime = SURF.time;
    sh.uniforms.uSurfWind = SURF.wind;
    sh.uniforms.uSurfSnow = SURF.snow;
    let vs = 'varying vec3 vSW; varying vec3 vSN; varying vec3 vOP; uniform float uSurfTime; uniform float uSurfWind;\n' + sh.vertexShader;
    if (kind === 'foliage') {
      // 나무 잎: 바람에 흔들림 (높을수록 크게)
      vs = vs.replace('#include <begin_vertex>', `#include <begin_vertex>
        vec4 fw = modelMatrix * vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          fw = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
        #endif
        float lift = max(0.0, fw.y - 0.9);
        float sway = (sin(uSurfTime * 1.3 + fw.x * 0.35 + fw.z * 0.27) + 0.5 * sin(uSurfTime * 2.9 + fw.x * 1.1)) * (0.025 + uSurfWind * 0.08) * lift;
        transformed.x += sway; transformed.z += sway * 0.6;`);
    }
    sh.vertexShader = vs.replace('#include <project_vertex>', `#include <project_vertex>
      vec4 sw4 = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        sw4 = instanceMatrix * sw4;
      #endif
      vSW = (modelMatrix * sw4).xyz;
      vOP = position; // 바인드 포즈 기준 좌표: 뼈대 애니메이션에도 무늬가 몸에 붙어 다님
      vSN = normalize(mat3(modelMatrix) * objectNormal);`);
    sh.fragmentShader = 'varying vec3 vOP; uniform float uSurfSnow;\n' + NOISE + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      ${KIND_CODE[kind] || KIND_CODE.base}
      ${spots ? `float spt = smoothstep(0.5, 0.53, sfbm(vOP * ${spots.toFixed(2)} + vec3(3.7, 1.3, 8.1)));
      #ifdef USE_COLOR
        spt *= step(0.8, vColor.r) * step(0.8, vColor.g) * step(vColor.b, 0.95); // 흰 몸통에만 (눈·주둥이·발굽 제외)
      #endif
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.045, 0.04, 0.04), spt);` : ''}
      ${kind !== 'fur' ? `// 눈 오는 날: 위를 향한 면에 서서히 눈이 쌓임
      float snowCov = uSurfSnow * smoothstep(0.45, 0.85, vSN.y) * smoothstep(0.25, 0.6, sfbm(vSW * 1.7) + uSurfSnow * 0.35);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.92, 0.95, 1.0), snowCov);` : ''}
      ${contact ? 'k *= mix(0.62, 1.0, smoothstep(0.0, 0.32, vSW.y));' : ''}
      diffuseColor.rgb *= k;`);
    if (rim > 0) {
      sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float fres = pow(1.0 - clamp(dot(normalize(vNormal), normalize(vViewPosition)), 0.0, 1.0), 3.0);
        totalEmissiveRadiance += vec3(1.0, 0.97, 0.9) * fres * ${rim.toFixed(2)};`);
    }
  };
  m.customProgramCacheKey = () => `surf-${kind}-${contact}-${rim}-${spots}`;
  m.needsUpdate = true;
  return m;
}

/** 후처리 색 보정 (대비·채도·하이라이트 따뜻하게·그림자 살짝 차갑게) */
export const ColorGradeShader = {
  uniforms: { tDiffuse: { value: null }, contrast: { value: 1.07 }, saturation: { value: 1.12 }, warmth: { value: 0.035 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float contrast, saturation, warmth; varying vec2 vUv;
    void main(){
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      c = (c - 0.5) * contrast + 0.5;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, saturation);
      c += vec3(warmth, warmth * 0.45, -warmth * 0.6) * smoothstep(0.45, 1.0, l);
      c += vec3(-0.012, 0.0, 0.022) * (1.0 - smoothstep(0.0, 0.35, l));
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }`,
};
