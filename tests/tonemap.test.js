// 저사양 색감: 후처리를 끈 화질은 톤 매핑 안에 보통 화면에 맞춘 색 보정을 넣고(패스 추가 없음), 보통·높음은 ACES + 색 보정 패스 그대로
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { installGradeToneMapping, toneMappingFor, GRADE, LOW_GRADE, GRADE_TONEMAP_GLSL, gradeLinear, DARK } from '../src/game/tonemap.js';
import { ColorGradeShader } from '../src/game/surface.js';
import { resolveQuality, PRESETS } from '../src/game/quality.js';

globalThis.innerWidth ??= 1200; globalThis.innerHeight ??= 800;
const { PostFX } = await import('../src/game/postfx.js');

test('톤 매핑: 낮음은 색 보정 톤 매핑(Custom), 보통·높음은 ACES 그대로', () => {
  for (const level of Object.keys(PRESETS)) {
    const q = resolveQuality({ preset: level, ...PRESETS[level] }, 1);
    assert.equal(toneMappingFor(q.post), level === 'low' ? THREE.CustomToneMapping : THREE.ACESFilmicToneMapping, level);
  }
});

test('셰이더 조각: 빈 CustomToneMapping 을 ACES + 색 보정으로 바꿈 (한 번만, 다른 톤 매핑은 그대로)', () => {
  const chunk = { tonemapping_pars_fragment: THREE.ShaderChunk.tonemapping_pars_fragment };
  assert.equal(installGradeToneMapping(chunk), true);
  const src = chunk.tonemapping_pars_fragment;
  assert.ok(src.includes(GRADE_TONEMAP_GLSL));
  assert.ok(!src.includes('vec3 CustomToneMapping( vec3 color ) { return color; }'));
  assert.ok(/CustomToneMapping[\s\S]*ACESFilmicToneMapping\( color \)/.test(src), '데스크톱과 같은 ACES 곡선 (노출 포함)');
  assert.ok(src.indexOf('vec3 ACESFilmicToneMapping') < src.indexOf('vec3 CustomToneMapping'), 'ACES 가 먼저 정의됨');
  assert.equal(installGradeToneMapping(chunk), true);
  assert.equal(chunk.tonemapping_pars_fragment, src, '두 번 넣지 않음');
  assert.equal(installGradeToneMapping({ tonemapping_pars_fragment: 'vec3 Other() {}' }), false, 'three 가 바뀌면 건드리지 않음');
  // postfx.js 를 불러오면 실제 three 조각도 바뀌어 있음
  assert.ok(THREE.ShaderChunk.tonemapping_pars_fragment.includes(GRADE_TONEMAP_GLSL));
});

test('데스크톱 값(GRADE) = 색 보정 패스 기본값, 셰이더 숫자 = 저사양 값(LOW_GRADE)', () => {
  const u = ColorGradeShader.uniforms;
  assert.equal(GRADE.contrast, u.contrast.value);
  assert.equal(GRADE.saturation, u.saturation.value);
  assert.equal(GRADE.warmth, u.warmth.value);
  for (const v of [LOW_GRADE.saturation, LOW_GRADE.warmth]) assert.ok(GRADE_TONEMAP_GLSL.includes(v.toFixed(5)), String(v));
  assert.ok(!GRADE_TONEMAP_GLSL.includes(GRADE.saturation.toFixed(5)), '데스크톱 채도를 그대로 쓰지 않음');
  if (LOW_GRADE.contrast === 1) assert.ok(!GRADE_TONEMAP_GLSL.includes('smoothstep( 0.15'), '대비 1 이면 그 줄은 빠짐 (픽셀마다 아끼기)');
  else assert.ok(GRADE_TONEMAP_GLSL.includes(DARK[0].toFixed(5)) && GRADE_TONEMAP_GLSL.includes(LOW_GRADE.contrast.toFixed(5)));
  assert.ok(ColorGradeShader.fragmentShader.includes('vec3(-0.012, 0.0, 0.022)') && GRADE_TONEMAP_GLSL.includes('vec3( -0.012, 0.0, 0.022 )'), '어두운 곳 푸른 기');
  assert.ok((GRADE_TONEMAP_GLSL.match(/smoothstep/g) || []).length <= 2 + (LOW_GRADE.contrast === 1 ? 0 : 1), '픽셀마다 도는 계산을 늘리지 않음');
});

test('색 보정 곡선: 채도는 거의 그대로, 밝은 곳은 따뜻하게, 어두운 곳은 살짝 푸르게, 밤 밝기 그대로, 0~1 안', () => {
  const sat = (c) => (Math.max(...c) - Math.min(...c)) / Math.max(...c);
  const grass = [0.32, 0.52, 0.16]; // 풀빛 (선형)
  const g = gradeLinear(grass);
  assert.ok(Math.abs(sat(g) / sat(grass) - 1) < 0.06, `채도 ${sat(grass).toFixed(3)} → ${sat(g).toFixed(3)}`);
  assert.ok(sat(gradeLinear(grass, GRADE)) > sat(g) * 1.1, '데스크톱 값이면 훨씬 진해짐 (그래서 따로 맞춤)');
  const lo = gradeLinear([0.12, 0.12, 0.12]), hi = gradeLinear([0.7, 0.7, 0.7]);
  const Y = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  for (const v of [0.01, 0.02, 0.04]) { const n = [v * 0.8, v, v * 1.2]; assert.ok(Math.abs(Y(gradeLinear(n)) / Y(n) - 1) < 0.03, `밤 밝기 ${v}: ${(Y(gradeLinear(n)) / Y(n)).toFixed(3)}`); }
  assert.ok(hi[0] > hi[2], '밝은 회색은 살짝 따뜻하게');
  assert.ok(lo[2] > lo[0], '어두운 회색은 살짝 푸르게');
  for (let v = 0; v <= 1; v += 0.05) for (const c of gradeLinear([v, v * 0.8, v * 0.5])) assert.ok(c >= 0 && c <= 1);
  let prev = -1;
  for (let v = 0; v <= 1; v += 0.02) { const [r] = gradeLinear([v, v, v]); assert.ok(r >= prev - 1e-9, '밝기 순서 유지'); prev = r; }
});

/** sRGB 0~1 ↔ 선형 */
const dec = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const enc = (v) => (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.max(0, v) ** (1 / 2.4) - 0.055);
/** 화면 픽셀 묶음의 밝기 평균·표준편차(0~255)·채도 평균 (스크린샷 측정과 같은 식) */
function stats(px) {
  let s = 0, s2 = 0, st = 0;
  for (const [r, g, b] of px) {
    const L = 255 * (0.2126 * r + 0.7152 * g + 0.0722 * b), mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    s += L; s2 += L * L; st += mx ? (mx - mn) / mx : 0;
  }
  const n = px.length, m = s / n;
  return { L: m, sd: Math.sqrt(s2 / n - m * m), sat: st / n };
}
const hex = (h) => { const out = []; for (let i = 0; i < h.length; i += 6) out.push([0, 2, 4].map((k) => parseInt(h.slice(i + k, i + k + 2), 16) / 255)); return out; };

test('저사양 색 보정 맞춤: 같은 시점 보통 화면과 채도 ±5%, 밝기 표준편차 ±3 안 (세로·가로 폰 스크린샷 픽셀)', () => {
  const S = JSON.parse(readFileSync(new URL('./fixtures/low_grade_samples.json', import.meta.url), 'utf8'));
  for (const view of ['port', 'land']) {
    const low = hex(S[view].low), med = stats(hex(S[view].medium));
    const graded = stats(low.map((c) => gradeLinear(c.map(dec)).map(enc)));
    const desk = stats(low.map((c) => gradeLinear(c.map(dec), GRADE).map(enc)));
    const tag = `${view}: 채도 ${graded.sat.toFixed(3)} (보통 ${med.sat.toFixed(3)}, 데스크톱 값이면 ${desk.sat.toFixed(3)}), 표준편차 ${graded.sd.toFixed(1)} (보통 ${med.sd.toFixed(1)})`;
    assert.ok(Math.abs(graded.sat / med.sat - 1) <= 0.05, tag);
    assert.ok(Math.abs(graded.sd - med.sd) <= 3, tag);
    assert.ok(Math.abs(desk.sat / med.sat - 1) > 0.1, `${tag} — 데스크톱 값은 맞지 않음`);
  }
});

test('PostFX: 후처리 켜고 끄기가 톤 매핑을 함께 바꿈, 저사양은 장면에 아무것도 더하지 않음 (그리기 수 그대로)', () => {
  const r = { getPixelRatio: () => 1, getSize: (v) => v.set(800, 600), setRenderTarget() {}, getRenderTarget: () => null, render() {}, autoClear: true, toneMapping: THREE.ACESFilmicToneMapping };
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera();
  const low = new PostFX(r, scene, cam, { post: false, bloom: false, smaa: false, env: false });
  assert.equal(r.toneMapping, THREE.CustomToneMapping);
  assert.equal(scene.children.length, 0, '저사양 장면에 덧붙인 물체 없음');
  low.enabled = true;
  assert.equal(r.toneMapping, THREE.ACESFilmicToneMapping);
  low.enabled = false;
  assert.equal(r.toneMapping, THREE.CustomToneMapping);
  low.dispose();
  const hi = new PostFX(r, scene, cam, { post: true, bloom: false, smaa: false, env: false });
  assert.equal(r.toneMapping, THREE.ACESFilmicToneMapping);
  assert.equal(scene.children.length, 0);
  hi.dispose();
});
