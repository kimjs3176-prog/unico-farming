import * as THREE from 'three';

/**
 * 저사양(후처리 끔) 색감: 색 보정을 톤 매핑 안에 상수로 넣음 → 화면 패스를 더하지 않음
 *  - 곡선은 데스크톱과 같은 ACES (노출 포함), 그 뒤 화면 공간 근사(제곱근 ≈ sRGB)에서 채도·밝은 곳 따뜻하게·어두운 곳 살짝 푸르게
 *  - 값은 데스크톱 패스(GRADE)가 아니라 '보통' 화면에 맞춘 것 (LOW_GRADE): 낮음 화면은 원래 보통보다 채도가 조금 높아서
 *    데스크톱 값을 그대로 쓰면 풀빛이 형광처럼 뜸. 보통 화면과 채도 ±5%, 밝기 표준편차 ±3 안 (스크린샷으로 맞춤, tests/tonemap.test.js)
 *  - 보통·높음은 그대로 ACES + 색 보정 패스 (시간대 색 setGrade 포함)
 */
export const GRADE = { contrast: 1.07, saturation: 1.12, warmth: 0.035 };
export const LOW_GRADE = { contrast: 1, saturation: 0.96, warmth: 0.02 };
/** 대비는 이 밝기(화면 공간) 사이에서 서서히 켬: 밤·그늘은 더 어두워지지 않게 (대비 1 이면 셰이더에서 빠짐) */
export const DARK = [0.15, 0.45];

const STOCK = 'vec3 CustomToneMapping( vec3 color ) { return color; }';
const MARK = '// unico-grade';
const f = (v) => v.toFixed(5);
const G = LOW_GRADE;

/** CustomToneMapping 본문 (GLSL). 숫자는 LOW_GRADE 와 같음. 픽셀마다 도는 것이라 대비가 1 이면 그 줄은 넣지 않음 */
export const GRADE_TONEMAP_GLSL = `vec3 CustomToneMapping( vec3 color ) { ${MARK}
	vec3 c = sqrt( ACESFilmicToneMapping( color ) );${G.contrast === 1 ? '' : `
	c = mix( c, ( c - 0.5 ) * ${f(G.contrast)} + 0.5, smoothstep( ${f(DARK[0])}, ${f(DARK[1])}, dot( c, vec3( 0.2126, 0.7152, 0.0722 ) ) ) );`}
	float l = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
	c = mix( vec3( l ), c, ${f(G.saturation)} );
	c += vec3( ${f(G.warmth)}, ${f(G.warmth * 0.45)}, ${f(-G.warmth * 0.6)} ) * smoothstep( 0.45, 1.0, l );
	c += vec3( -0.012, 0.0, 0.022 ) * ( 1.0 - smoothstep( 0.0, 0.35, l ) );
	c = clamp( c, 0.0, 1.0 );
	return c * c;
}`;

/** three 의 빈 CustomToneMapping 을 색 보정 톤 매핑으로 바꿈 (첫 셰이더 컴파일 전에 한 번). 바꿨거나 이미 바뀌어 있으면 true */
export function installGradeToneMapping(chunk = THREE.ShaderChunk) {
  const src = chunk.tonemapping_pars_fragment;
  if (src.includes(MARK)) return true;
  if (!src.includes(STOCK)) return false; // three 가 바뀌면 그대로 둠 (화면은 ACES 없이 나오므로 시험이 잡음)
  chunk.tonemapping_pars_fragment = src.replace(STOCK, GRADE_TONEMAP_GLSL);
  return true;
}

/** 후처리를 켜면 ACES (색 보정은 패스가), 끄면 색 보정까지 넣은 톤 매핑 */
export function toneMappingFor(post) {
  return post ? THREE.ACESFilmicToneMapping : THREE.CustomToneMapping;
}

/** 시험·비교용: 위 GLSL 의 색 보정 부분을 그대로 옮긴 것 (ACES 를 거친 0~1 선형 색 → 0~1 선형 색). g 를 주면 그 값으로 (비교용) */
export function gradeLinear([r, g, b], G = LOW_GRADE) {
  const sm = (a, z, x) => { const t = Math.min(1, Math.max(0, (x - a) / (z - a))); return t * t * (3 - 2 * t); };
  const a = [r, g, b].map((v) => Math.sqrt(Math.max(0, v)));
  const k0 = G.contrast === 1 ? 0 : sm(DARK[0], DARK[1], 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2]);
  let c = a.map((v) => v + ((v - 0.5) * G.contrast + 0.5 - v) * k0);
  const l = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  c = c.map((v) => l + (v - l) * G.saturation);
  const w = sm(0.45, 1, l), k = 1 - sm(0, 0.35, l), W = G.warmth;
  c = [c[0] + W * w - 0.012 * k, c[1] + W * 0.45 * w, c[2] - W * 0.6 * w + 0.022 * k];
  return c.map((v) => Math.min(1, Math.max(0, v)) ** 2);
}
