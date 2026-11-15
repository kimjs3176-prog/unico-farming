import * as THREE from 'three';

/**
 * 재질 고도화 (vendored skill threejs-aaa-graphics-builder: "공유 재질 역할 + 절차적 디테일·마모")
 * 텍스처/UV 없이 셰이더에서 월드 좌표 3D 노이즈로 재질별 디테일을 입힌다.
 *  wood: 나뭇결·판자 얼룩 / roof: 기와 줄 / paint: 칠 바램·아랫단 때 / stone: 얼룩·틈 / foliage: 잎 덩어리·윗면 햇빛
 *  soil: 흙 알갱이 / hay: 짚 결 / metal: 결 / fur: 털 결 / 공통: 지면 가까이 접지 어둠(가짜 AO)
 */
/** 모든 재질이 공유하는 시간·바람 (main 루프에서 갱신) */
export const SURF = {
  time: { value: 0 }, wind: { value: 0.15 }, snow: { value: 0 },
  floor: { value: 0 }, // 바닥 높이 (실내처럼 땅속 방에서는 그 방바닥 → 발치 접지 음영 기준)
  // 시야 구멍: 카메라와 캐릭터 사이를 가리는 물체를 캐릭터 둘레만 점묘로 투명하게 (카메라를 당기지 않음)
  seeCam: { value: new THREE.Vector3(0, 50, 0) }, seeTarget: { value: new THREE.Vector3() }, seeOn: { value: 1 },
  // 계절 잎 색 (view/season_view.js 가 계절마다 채움): 나무마다 a/b 반반, 드문 나무는 red
  leafA: { value: new THREE.Color(0x3f9a35) }, leafB: { value: new THREE.Color(0x3f9a35) }, leafR: { value: new THREE.Color(0x3f9a35) },
  leafAmt: { value: new THREE.Vector4() }, // [활엽수, 단풍나무, 침엽수, 덤불]
  blossom: { value: 0 }, bloomA: { value: new THREE.Color(0xf490b6) }, bloomB: { value: new THREE.Color(0xffc0d6) },
};

/** 계절 잎 역할 (셰이더 번호): 0 없음(작물·꽃·화분·실내 등은 물들지 않음) */
export const LEAF_ROLE = { none: 0, canopy: 1, autumnal: 2, conifer: 3, shrub: 4, orchard: 5 };
/** 모델 이름 → 계절 잎 역할 (재질 이름이 아니라 모델로: 소나무와 활엽수가 'leaf' 재질을 같이 씀) */
export function seasonRole(model = '') {
  if (/^fruit_tree$/.test(model)) return LEAF_ROLE.orchard;
  if (/^(tree(_\d)?|birch_\d|willow_\d)$/.test(model)) return LEAF_ROLE.canopy;
  if (/^autumn_\d$/.test(model)) return LEAF_ROLE.autumnal;
  if (/^pine(_\d)?$/.test(model)) return LEAF_ROLE.conifer;
  if (/^(bush(_\d)?|berrybush_\d)$/.test(model)) return LEAF_ROLE.shrub;
  return LEAF_ROLE.none;
}
/** 정적 병합용 잎 값: 역할 + 0.5 × 나무마다 난수 (셰이더가 floor/fract 로 나눔 → 나무 하나가 한 색) */
export function leafAttrValue(role, x, z) {
  const h = Math.sin(Math.floor(x * 2) * 12.9898 + Math.floor(z * 2) * 78.233) * 43758.5453;
  return role + 0.5 * (h - Math.floor(h)) * 0.999;
}

/**
 * 노이즈 세밀도: 옥타브 수 (기본 4, 저사양 2). 셰이더를 만들 때 읽으므로 첫 렌더 전에 한 번만 정함
 * (게임 중에 품질을 바꿔도 재질 수십 개를 다시 컴파일하지 않도록 다음 접속부터 적용)
 */
export const SURF_DETAIL = { oct: 4 };
export function setSurfaceDetail(low) { SURF_DETAIL.oct = low ? 2 : 4; }
/** 빠진 옥타브의 평균(0.5 × 진폭 합)을 더해 밝기·얼룩 면적·눈 덮임 비율이 4옥타브와 같게 */
export function fbmCompensation(oct) { let a = 0.5, s = 0; for (let i = 0; i < 4; i++) { if (i >= oct) s += a * 0.5; a *= 0.5; } return s; }

const noise = (oct) => /* glsl */ `
#define SURF_OCT ${oct}
#define SURF_FBM_COMP ${fbmCompensation(oct).toFixed(5)}
varying vec3 vSW; varying vec3 vSN;
float sh31(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float svn(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(sh31(i), sh31(i + vec3(1,0,0)), f.x), mix(sh31(i + vec3(0,1,0)), sh31(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(sh31(i + vec3(0,0,1)), sh31(i + vec3(1,0,1)), f.x), mix(sh31(i + vec3(0,1,1)), sh31(i + vec3(1,1,1)), f.x), f.y), f.z); }
float sfbm(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < SURF_OCT; i++) { s += a * svn(p); p *= 2.03; a *= 0.5; } return s + SURF_FBM_COMP; }
`;

const KIND_CODE = {
  wood: `float k = 0.8 + 0.3 * sfbm(vSW * 5.0) + 0.07 * sin((vSW.x + vSW.z) * 38.0 + sfbm(vSW * 2.5) * 9.0);`,
  roof: `float rows = smoothstep(0.0, 0.09, fract(vSW.y * 6.5 + svn(vSW * 3.0) * 0.15));
         float k = mix(0.7, 1.0, rows) * (0.86 + 0.24 * sfbm(vSW * 4.0));`,
  paint: `float k = (0.9 + 0.17 * sfbm(vSW * 3.5)) * mix(0.8, 1.0, smoothstep(0.0, 0.7, vSW.y));`,
  stone: `float k = 0.68 + 0.52 * sfbm(vSW * 5.5);`,
  foliage: `float f = sfbm(vSW * 2.3);
            float k = 0.66 + 0.58 * f;
            LEAF_SEASON
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

/**
 * 계절 잎 색 (foliage 이고 역할이 있을 때만 끼움, 이미 계산한 잎 노이즈 f 를 다시 씀 → 노이즈 추가 없음)
 *  - 밝기를 지키며 계절 색으로: 초록에 분홍을 반쯤 섞어 잿빛이 되는 일 없음
 *  - 봄 꽃송이: 과수원 + 활엽수 30% 의 위를 향한 잎 덩어리만 온전히 분홍
 *  - 눈 쌓임 배율: 활엽수 1.4, 침엽수 1.2
 */
const LEAF_SEASON = `
  float lr = vLeaf.x, tid = vLeaf.y;
  float isOrc = step(4.5, lr);
  float isCan = step(0.5, lr) * step(lr, 1.5) + isOrc;
  float isAut = step(1.5, lr) * step(lr, 2.5), isCon = step(2.5, lr) * step(lr, 3.5), isShr = step(3.5, lr) * step(lr, 4.5);
  float lamt = dot(uLeafAmt, vec4(isCan, isAut, isCon, isShr));
  if (lamt > 0.001) {
    float llum = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
    vec3 lt = mix(mix(uLeafA, uLeafB, step(0.5, tid)), uLeafR, step(0.85, tid) * isCan * (1.0 - isOrc));
    lt *= clamp(llum / max(dot(lt, vec3(0.2126, 0.7152, 0.0722)), 1e-3), 0.6, 1.5);
    diffuseColor.rgb = mix(diffuseColor.rgb, lt, lamt);
  }
  if (uBlossom > 0.001) {
    float bl = uBlossom * max(isOrc, isCan * step(tid, 0.3)) * smoothstep(0.48, 0.62, f) * smoothstep(0.1, 0.6, vSN.y);
    diffuseColor.rgb = mix(diffuseColor.rgb, mix(uBloomA, uBloomB, step(0.5, fract(tid * 7.0 + f * 3.0))), bl);
  }
  snowW = 1.0 + 0.4 * isCan + 0.2 * isCon;`;

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
    sh.uniforms.uSeeCam = SURF.seeCam;
    sh.uniforms.uSeeTarget = SURF.seeTarget;
    sh.uniforms.uSeeOn = SURF.seeOn;
    sh.uniforms.uSurfFloor = SURF.floor;
    const leafAttr = !!m.userData.leafAttr, role = m.userData.leafRole || 0, leaf = kind === 'foliage' && (leafAttr || role > 0);
    if (leaf) {
      Object.assign(sh.uniforms, { uLeafA: SURF.leafA, uLeafB: SURF.leafB, uLeafR: SURF.leafR, uLeafAmt: SURF.leafAmt, uBlossom: SURF.blossom, uBloomA: SURF.bloomA, uBloomB: SURF.bloomB });
    }
    let vs = 'varying vec3 vSW; varying vec3 vSN; varying vec3 vOP; uniform float uSurfTime; uniform float uSurfWind;\n' + sh.vertexShader;
    if (leaf) {
      // 잎 역할·나무 난수: 합친 숲은 정점 속성(aLeaf), 따로 그리는 나무는 재질 역할 + 나무 위치 난수
      vs = (leafAttr ? '#define USE_LEAF_ATTR\nattribute float aLeaf;\n' : '') + 'varying vec2 vLeaf;\n' + vs.replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_LEAF_ATTR
          vLeaf = vec2(floor(aLeaf + 0.001), fract(aLeaf) * 2.0);
        #else
          vec4 lc = modelMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          #ifdef USE_INSTANCING
            lc = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          #endif
          vLeaf = vec2(${role.toFixed(1)}, fract(sin(dot(floor(lc.xz * 2.0), vec2(12.9898, 78.233))) * 43758.5453));
        #endif`);
    }
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
    const leafHead = leaf ? 'varying vec2 vLeaf; uniform vec3 uLeafA; uniform vec3 uLeafB; uniform vec3 uLeafR; uniform vec4 uLeafAmt; uniform float uBlossom; uniform vec3 uBloomA; uniform vec3 uBloomB;\n' : '';
    sh.fragmentShader = 'varying vec3 vOP; uniform float uSurfSnow; uniform float uSurfFloor; uniform vec3 uSeeCam; uniform vec3 uSeeTarget; uniform float uSeeOn;\n' + leafHead + noise(SURF_DETAIL.oct) + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      float snowW = 1.0;
      ${kind !== 'fur' ? `// 시야 구멍: 카메라→캐릭터 선분 가까이에 있는 조각을 점묘(dither)로 버림 (노이즈 계산보다 먼저: 버릴 조각은 계산 생략)
      if (uSeeOn > 0.5 && vSW.y > 0.35) {
        vec3 seg = uSeeTarget - uSeeCam; float segL = length(seg); vec3 sd = seg / max(segL, 1e-3);
        float st = dot(vSW - uSeeCam, sd);
        if (st > 0.0 && st < segL - 0.5) {
          float sr = length(vSW - (uSeeCam + sd * st));
          float sR = 1.3 + 1.5 * (st / segL);
          float seeFade = 1.0 - smoothstep(sR * 0.82, sR, sr);
          float ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
          if (seeFade * 0.9 > ign) discard;
        }
      }` : ''}
      ${(KIND_CODE[kind] || KIND_CODE.base).replace('LEAF_SEASON', leaf ? LEAF_SEASON : '')}
      ${spots ? `float spt = smoothstep(0.5, 0.53, sfbm(vOP * ${spots.toFixed(2)} + vec3(3.7, 1.3, 8.1)));
      #ifdef USE_COLOR
        spt *= step(0.8, vColor.r) * step(0.8, vColor.g) * step(vColor.b, 0.95); // 흰 몸통에만 (눈·주둥이·발굽 제외)
      #endif
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.045, 0.04, 0.04), spt);` : ''}
      ${kind !== 'fur' ? `// 눈 오는 날: 위를 향한 면에 서서히 눈이 쌓임 (눈이 없으면 노이즈 계산을 건너뜀, 유니폼 분기라 모든 조각이 같은 길)
      if (uSurfSnow > 0.001) {
        float snowCov = min(1.0, uSurfSnow * snowW * smoothstep(0.45, 0.85, vSN.y) * smoothstep(0.25, 0.6, sfbm(vSW * 1.7) + uSurfSnow * 0.35 * snowW));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.92, 0.95, 1.0), snowCov);
      }` : ''}
      ${contact ? 'k *= mix(0.62, 1.0, smoothstep(0.0, 0.32, vSW.y - uSurfFloor));' : ''}
      diffuseColor.rgb *= k;`);
    if (rim > 0) {
      sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float fres = pow(1.0 - clamp(dot(normalize(vNormal), normalize(vViewPosition)), 0.0, 1.0), 3.0);
        totalEmissiveRadiance += vec3(1.0, 0.97, 0.9) * fres * ${rim.toFixed(2)};`);
    }
  };
  m.customProgramCacheKey = () => `surf-${kind}-${contact}-${rim}-${spots}-${SURF_DETAIL.oct}` + (kind === 'foliage' ? `-${m.userData.leafAttr ? 'la' : m.userData.leafRole || 0}` : '');
  m.needsUpdate = true;
  return m;
}

/** 후처리 색 보정 (대비·채도·하이라이트 따뜻하게·그림자 살짝 차갑게) */
export const ColorGradeShader = {
  uniforms: { tDiffuse: { value: null }, contrast: { value: 1.07 }, saturation: { value: 1.12 }, warmth: { value: 0.035 }, tint: { value: new THREE.Vector3(1, 1, 1) } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float contrast, saturation, warmth; uniform vec3 tint; varying vec2 vUv;
    void main(){
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      c = (c - 0.5) * contrast + 0.5;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, saturation);
      c += vec3(warmth, warmth * 0.45, -warmth * 0.6) * smoothstep(0.45, 1.0, l);
      c += vec3(-0.012, 0.0, 0.022) * (1.0 - smoothstep(0.0, 0.35, l));
      c *= tint; // 시간대 색 (sim/tod.js: 아침 금빛·노을 주황·밤 푸른빛)
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }`,
};
