import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { makeLabel, whenFontReady, LABELS, registerLabel, overlapFade, visibleLabels, declutterLabels, setHeroLabel, labelRect, LABEL_FADE, LABEL_OCC, setLabelOccluders, segHitsBox } from '../src/game/label.js';

// 가짜 캔버스: 글꼴을 받기 전에는 글자 폭이 좁고(대체 글꼴), 받은 뒤에는 넓어짐
function fakeDom({ loaded = false, check = true } = {}) {
  const state = { loaded, fills: 0, loads: 0, strokes: 0, shadowed: 0 };
  const ctx = {
    font: '', fillStyle: '', textBaseline: '', textAlign: '', lineWidth: 1, lineJoin: '', strokeStyle: '', shadowColor: '', shadowBlur: 0, shadowOffsetY: 0,
    measureText: (t) => ({ width: t.length * (state.loaded ? 30 : 20) }),
    clearRect() {}, beginPath() {}, moveTo() {}, arcTo() {}, closePath() {}, fill() {},
    fillText() { state.fills++; if (ctx.shadowBlur > 0 && !/,\s*0\)$/.test(ctx.shadowColor)) state.shadowed++; },
    strokeText() { state.strokes++; },
  };
  let resolve;
  const fonts = check ? {
    check: () => state.loaded,
    load: () => { state.loads++; return new Promise((r) => { resolve = () => { state.loaded = true; r([]); }; }); },
  } : undefined;
  globalThis.document = { createElement: () => ({ width: 300, height: 150, getContext: () => ctx }), fonts };
  return { state, finishLoad: async () => { resolve?.(); await new Promise((r) => setTimeout(r, 0)); } };
}

test('이름표: 한글 글꼴 조각이 늦게 오면 받은 뒤 크기를 다시 재고 다시 그림 (옛 텍스처는 해제)', async () => {
  const { state, finishLoad } = fakeDom();
  const s = makeLabel('새 친구 닉네임');
  const tex = s.material.map, w0 = tex.image.width, sx0 = s.scale.x, v0 = tex.version;
  let disposed = 0;
  tex.addEventListener('dispose', () => disposed++);
  assert.equal(state.loads, 1, '아직 없는 조각을 요청');
  await finishLoad();
  assert.ok(tex.image.width > w0, '넓어진 글자 폭에 맞춰 캔버스를 키움');
  assert.ok(s.scale.x > sx0, '스프라이트 크기도 맞춤');
  assert.equal(disposed, 1, '크기가 바뀌면 GPU 텍스처를 새로 잡음');
  assert.ok(tex.version > v0, '다시 올리기');
  assert.equal(state.fills, 2);
  s.userData.dispose();
  delete globalThis.document;
});

test('이름표: 이미 받은 글꼴·확인할 수 없는 환경은 그대로, 치운 이름표는 다시 그리지 않음', async () => {
  let d = fakeDom({ loaded: true });
  makeLabel('유니코').userData.dispose();
  assert.equal(d.state.loads, 0);
  d = fakeDom({ check: false });
  assert.equal(whenFontReady('40px Jua', '가', () => {}), false);
  makeLabel('유니코').userData.dispose();
  d = fakeDom();
  const s = makeLabel('늦게 오는 글자');
  s.userData.dispose();
  await d.finishLoad();
  assert.equal(d.state.fills, 1, '해제한 뒤에는 그리지 않음');
  delete globalThis.document;
});

test('이름표 재질: 화면 색 그대로 (톤 매핑·안개 없음), 깊이 테스트·깊이 쓰기 없음, 맨 위 순서', () => {
  fakeDom({ loaded: true });
  const s = makeLabel('🐕 콩이');
  const m = s.material;
  assert.equal(m.toneMapped, false);
  assert.equal(m.fog, false);
  assert.equal(m.depthTest, false);
  assert.equal(m.depthWrite, false, '뒤 물체·주변광 차폐에 상자 자국을 남기지 않음');
  assert.equal(m.transparent, true);
  assert.equal(s.renderOrder, 999);
  assert.equal(s.layers.mask, 1, '레이어 0 그대로 (클릭·탭으로 캐릭터를 고를 때 이름표도 맞음)');
  assert.equal(m.map.colorSpace, THREE.SRGBColorSpace);
  s.userData.dispose();
  delete globalThis.document;
});

test('이름표 목록: 만들면 들어가고 치우면 빠짐, 복제한 것은 registerLabel 로', () => {
  fakeDom({ loaded: true });
  const n0 = LABELS.size;
  const s = makeLabel('장터 여우');
  assert.ok(LABELS.has(s));
  const c = registerLabel(s.clone());
  assert.ok(LABELS.has(c), '복제도 효과 밖에서 그리게');
  s.userData.dispose();
  assert.ok(!LABELS.has(s));
  LABELS.delete(c);
  assert.equal(LABELS.size, n0);
  delete globalThis.document;
});

test('투명 배경 글자(+코인·감정 아이콘): 글자가 있으면 짙은 테두리, 이모지만이면 그림자만, 배경 있는 이름표는 테두리 없음', () => {
  const { state } = fakeDom({ loaded: true });
  const a = makeLabel('+15 🪙', { bg: 'rgba(0,0,0,0)', size: 56, scale: 0.012 });
  assert.equal(state.strokes, 1, '글자 테두리');
  assert.equal(a.userData.tag, false, '겹침 정리 대상 아님 (보상 글자는 흐리지 않음)');
  const b = makeLabel('💤', { bg: 'rgba(0,0,0,0)', size: 48 });
  assert.equal(state.strokes, 1, '이모지만이면 테두리 없음');
  assert.ok(state.shadowed >= 1, '이모지는 그림자로');
  const c = makeLabel('🛒 장터 여우', { color: '#231916', bg: 'rgba(255,248,225,0.92)' });
  assert.equal(state.strokes, 1);
  assert.equal(c.userData.tag, true);
  for (const s of [a, b, c]) s.userData.dispose();
  delete globalThis.document;
});

test('보이는 이름표: 자신·조상이 모두 보이고 맨 위가 월드 장면인 것만', () => {
  fakeDom({ loaded: true });
  const scene = new THREE.Scene(), other = new THREE.Scene(), g = new THREE.Group(), h = new THREE.Group();
  scene.add(g, h); h.visible = false;
  const a = makeLabel('보임'), b = makeLabel('숨은 부모'), c = makeLabel('다른 장면'), d = makeLabel('떨어짐'), e = makeLabel('자기 숨김');
  g.add(a); h.add(b); other.add(c); scene.add(e); e.visible = false;
  const out = visibleLabels(scene);
  assert.ok(out.includes(a));
  for (const s of [b, c, d, e]) assert.ok(!out.includes(s));
  for (const s of [a, b, c, d, e]) s.userData.dispose();
  delete globalThis.document;
});

const R = (x0, y0, w, h, o = {}) => ({ x0, y0, x1: x0 + w, y1: y0 + h, pri: 0, depth: 5, group: {}, tag: true, fade: false, ...o });

test('겹침 정리: 내 이름표가 먼저, 그다음 가까운 순으로 자리를 잡고 겹친 것만 흐리게 (자리는 안 옮김)', () => {
  const hero = R(100, 100, 120, 30, { pri: 1, depth: 9 });
  const pet = R(150, 110, 80, 24, { depth: 3 }); // 더 가깝지만 내 이름표와 겹침
  const far = R(400, 100, 80, 24, { depth: 20 });
  const npcNear = R(390, 105, 90, 24, { depth: 6 }); // far 와 겹치고 더 가까움
  overlapFade([pet, far, hero, npcNear]);
  assert.equal(hero.fade, false);
  assert.equal(pet.fade, true, '내 이름표에 겹친 반려견 이름표는 흐리게');
  assert.equal(npcNear.fade, false, '가까운 것이 남음');
  assert.equal(far.fade, true, '먼 것이 흐려짐');
  assert.deepEqual([pet.x0, pet.y0], [150, 110], '위치는 그대로');
});

test('겹침 정리: 같은 캐릭터 것끼리·배경 없는 글자는 비교 안 함, 히스테리시스(2px 넘게 겹쳐야 흐림, 4px 떨어져야 또렷)', () => {
  const grp = {};
  const name = R(0, 0, 100, 20, { group: grp, pri: 1 }), bubble = R(0, 10, 100, 20, { group: grp });
  overlapFade([name, bubble]);
  assert.equal(bubble.fade, false, '내 말풍선과 내 이름표');
  const icon = R(10, 5, 30, 30, { tag: false });
  overlapFade([name, icon]);
  assert.equal(icon.fade, false, '감정 아이콘·떠오르는 글자는 그대로');
  const a = R(0, 0, 100, 20, { pri: 1 });
  const b = R(99, 0, 50, 20); // 1px 겹침 → 아직 또렷
  overlapFade([a, b]);
  assert.equal(b.fade, false);
  b.x0 = 97; b.x1 = 147; // 3px 겹침 → 흐림
  overlapFade([a, b]);
  assert.equal(b.fade, true);
  b.x0 = 102; b.x1 = 152; // 2px 떨어짐 → 아직 흐림
  overlapFade([a, b]);
  assert.equal(b.fade, true);
  b.x0 = 105; b.x1 = 155; // 5px 떨어짐 → 또렷
  overlapFade([a, b]);
  assert.equal(b.fade, false);
});

test('흐림 배율: 겹치면 150ms 안에 0.3 쪽으로, 내 이름표가 이미 흐리면(주민 뒤를 가릴 때) 자리를 잡지 않음', () => {
  fakeDom({ loaded: true });
  const cam = new THREE.PerspectiveCamera(45, 1.5, 0.1, 100);
  cam.position.set(0, 2, 8); cam.lookAt(0, 2, 0); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
  const scene = new THREE.Scene(), me = new THREE.Group(), dog = new THREE.Group();
  scene.add(me, dog);
  const hero = makeLabel('⭐ 졸린 우유 (나)'), pet = makeLabel('🐕 콩이');
  me.add(hero); dog.add(pet);
  hero.position.set(0, 2.3, 0); pet.position.set(0.3, 2.2, 0.5);
  scene.updateMatrixWorld(true);
  const r = labelRect(hero, cam, 1200, 800);
  assert.ok(r.x0 < 600 && r.x1 > 600 && r.y1 > r.y0, '화면 가운데 근처 사각형');
  setHeroLabel(hero);
  const shown = [hero, pet];
  for (let i = 0; i < 9; i++) declutterLabels(shown, cam, 1200, 800, 1 / 60); // 150ms
  assert.ok(pet.userData.fadeMul < 0.36, `흐려짐 ${pet.userData.fadeMul}`);
  assert.equal(hero.userData.fadeMul, 1);
  hero.material.opacity = LABEL_FADE.mul; // npcs.js 가 내 이름표를 흐리게 한 상태
  for (let i = 0; i < 30; i++) declutterLabels(shown, cam, 1200, 800, 1 / 60);
  assert.ok(pet.userData.fadeMul > 0.98, '반려견 이름표가 다시 또렷');
  pet.position.set(4, 2.2, 0); hero.material.opacity = 1; scene.updateMatrixWorld(true);
  for (let i = 0; i < 30; i++) declutterLabels(shown, cam, 1200, 800, 1 / 60);
  assert.ok(pet.userData.fadeMul > 0.98, '비키면 또렷');
  setHeroLabel(null);
  hero.userData.dispose(); pet.userData.dispose();
  delete globalThis.document;
});

test('흐림 배율: 거리 때문에 거의 투명해진 이름표는 앞에 있어도 다른 이름표를 흐리게 하지 않음', () => {
  fakeDom({ loaded: true });
  const cam = new THREE.PerspectiveCamera(45, 1.5, 0.1, 100);
  cam.position.set(0, 2, 8); cam.lookAt(0, 2, 0); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
  const scene = new THREE.Scene(), a = new THREE.Group(), b = new THREE.Group();
  scene.add(a, b);
  const ghost = makeLabel('🔬 연구원 너구리'), pet = makeLabel('🐕 콩이');
  a.add(ghost); b.add(pet);
  ghost.position.set(0, 2.2, 2); pet.position.set(0, 2.2, 0); // 같은 자리, 유령 이름표가 더 가까움
  scene.updateMatrixWorld(true);
  setHeroLabel(null);
  ghost.material.opacity = 0.05;
  for (let i = 0; i < 20; i++) declutterLabels([ghost, pet], cam, 1200, 800, 1 / 60);
  assert.ok(pet.userData.fadeMul > 0.98, '안 보이는 이름표 때문에 흐려지지 않음');
  ghost.material.opacity = 1;
  for (let i = 0; i < 20; i++) declutterLabels([ghost, pet], cam, 1200, 800, 1 / 60);
  assert.ok(pet.userData.fadeMul < 0.36, '보이는 이름표가 앞을 가리면 흐려짐');
  ghost.userData.dispose(); pet.userData.dispose();
});

test('이름표 목록: dispose 없이 부모에서 떼어 버린 이름표(쫓겨난 까마귀의 ❗ 등)는 목록에서 빠지고, 다시 붙이면 다시 들어감', () => {
  fakeDom({ loaded: true });
  const n0 = LABELS.size, root = new THREE.Group();
  for (let i = 0; i < 20; i++) { const m = makeLabel('❗'); root.add(m); root.remove(m); } // pests.js _flee 와 같은 모양
  assert.equal(LABELS.size, n0, '떼어 버린 것이 쌓이지 않음');
  const m = makeLabel('❗');
  root.add(m); root.remove(m);
  assert.ok(!LABELS.has(m));
  root.add(m);
  assert.ok(LABELS.has(m), '다시 붙이면 다시 그림 대상');
  const c = registerLabel(m.clone());
  root.add(c); root.remove(c);
  assert.ok(!LABELS.has(c), '복제한 것도 떼면 빠짐 (userData 복사로 추적이 빠지지 않음)');
  m.userData.dispose();
  root.remove(m); root.add(m);
  assert.ok(!LABELS.has(m), '치운 것은 다시 붙여도 들어가지 않음');
  assert.equal(LABELS.size, n0);
  delete globalThis.document;
});

test('건물 뒤 이름표: 카메라→이름표 선이 큰 건물 상자를 지나면 0.35 로 (0.2초마다 잼), 내 이름표·작은 소품·집 안 화면은 그대로', () => {
  fakeDom({ loaded: true });
  const cam = new THREE.PerspectiveCamera(45, 1.5, 0.1, 100);
  cam.position.set(0, 3, 12); cam.lookAt(0, 2, 0); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
  const scene = new THREE.Scene(), a = new THREE.Group(), b = new THREE.Group(), me = new THREE.Group();
  scene.add(a, b, me);
  const behind = makeLabel('🔬 연구원 너구리'), open = makeLabel('🛒 장터 여우'), hero = makeLabel('나');
  a.add(behind); b.add(open); me.add(hero);
  behind.position.set(0, 2.3, -4); open.position.set(6, 2.3, -4); hero.position.set(0, 2.3, 8);
  scene.updateMatrixWorld(true);
  // 집(4×4m, 높이 4m)이 카메라와 너구리 사이, 작은 상자(울타리)·낮은 상자는 셈하지 않음
  setLabelOccluders([{ x: 0, z: 0, hx: 2, hz: 2, h: 4.5 }, { x: 6, z: 0, hx: 0.5, hz: 0.5, h: 3 }, { x: 6, z: 1, hx: 3, hz: 3, h: 1 }]);
  setHeroLabel(hero);
  for (let i = 0; i < 30; i++) declutterLabels([behind, open, hero], cam, 1200, 800, 1 / 60); // 재기(0.2초) + 흐려지기(150ms)
  assert.ok(Math.abs(behind.userData.fadeMul - LABEL_OCC.mul) < 0.02, `가려진 이름표 ${behind.userData.fadeMul}`);
  assert.ok(open.userData.fadeMul > 0.98, '트인 이름표는 또렷');
  assert.equal(hero.userData.fadeMul ?? 1, 1, '내 이름표는 재지 않음');
  // 너구리가 건물 앞으로 나오면 (다음 재기 때) 다시 또렷
  behind.position.set(0, 2.3, 4); scene.updateMatrixWorld(true);
  for (let i = 0; i < 30; i++) declutterLabels([behind, open, hero], cam, 1200, 800, 1 / 60);
  assert.ok(behind.userData.fadeMul > 0.98);
  // 카메라가 건물 안(집 안 화면)이면 가리지 않음
  assert.equal(segHitsBox(0, 2, 0, 0, 2.3, -6, { x0: -2, x1: 2, z0: -2, z1: 2, h: 4 }), false);
  assert.equal(segHitsBox(0, 2, 8, 0, 2.3, -6, { x0: -2, x1: 2, z0: -2, z1: 2, h: 4 }), true);
  assert.equal(segHitsBox(0, 9, 8, 0, 2.3, -6, { x0: -2, x1: 2, z0: -2, z1: 2, h: 4 }), false, '지붕 위로 지나면 안 가림');
  setLabelOccluders([]); setHeroLabel(null);
  for (const l of [behind, open, hero]) l.userData.dispose();
  delete globalThis.document;
});

test('겹침 정리: 사각형은 주어진 객체에 채우고, overlapFade 는 받은 배열을 그대로 돌려줌 (매 프레임 새 객체·배열을 만들지 않게)', () => {
  fakeDom({ loaded: true });
  const cam = new THREE.PerspectiveCamera(45, 1.5, 0.1, 100);
  cam.position.set(0, 2, 8); cam.lookAt(0, 2, 0); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
  const scene = new THREE.Scene(), ls = [];
  for (let i = 0; i < 6; i++) { const g = new THREE.Group(), l = makeLabel(`주민 ${i}`); g.add(l); l.position.set(i * 0.4, 2.2, 0); scene.add(g); ls.push(l); }
  scene.updateMatrixWorld(true);
  const pool = ls.map(() => ({}));
  const rects = ls.map((l, i) => labelRect(l, cam, 1200, 800, pool[i]));
  rects.forEach((r, i) => { assert.equal(r, pool[i]); r.tag = true; r.pri = 0; r.group = i; });
  assert.equal(overlapFade(rects), rects);
  assert.ok(rects.some((r) => r.fade) && rects.some((r) => !r.fade));
  for (let i = 0; i < 5; i++) declutterLabels(ls, cam, 1200, 800, 1 / 60);
  for (const l of ls) l.userData.dispose();
  delete globalThis.document;
});
