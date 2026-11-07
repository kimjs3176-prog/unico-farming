import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { cellKey, planStaticGroups, shadowFit, snapToTexel } from '../src/game/world.js';
import { groupByCell, countBelow } from '../src/game/scenery.js';
import { activeCount } from '../src/game/precip.js';
import { fbmCompensation } from '../src/game/surface.js';

test('칸 이름: 음수 좌표도 아래쪽 칸으로 (경계에서 갈라지지 않게 floor)', () => {
  assert.equal(cellKey(0, 0, 20), '0,0');
  assert.equal(cellKey(19.99, -0.01, 20), '0,-1');
  assert.equal(cellKey(-20, 20, 20), '-1,1');
  assert.equal(cellKey(-20.01, 39.9, 20), '-2,1');
});

test('정적 병합 계획: 작은 묶음은 통째로, 큰 묶음은 칸마다 + 아주 작은 칸은 한데', () => {
  const small = new Map([['0,0', 500], ['1,0', 400], ['-2,1', 300]]);
  assert.deepEqual(planStaticGroups(small, { splitTris: 3000, minCellTris: 400 }), [['0,0', '1,0', '-2,1']]);
  const big = new Map([['0,0', 2500], ['1,0', 1800], ['-2,1', 120], ['1,1', 90]]);
  const g = planStaticGroups(big, { splitTris: 3000, minCellTris: 400 });
  assert.deepEqual(g, [['0,0'], ['1,0'], ['-2,1', '1,1']]);
  // 모든 칸이 정확히 한 번씩 들어감
  assert.deepEqual(g.flat().sort(), [...big.keys()].sort());
  // 칸이 하나뿐이면 나누지 않음, 비어 있으면 아무것도
  assert.deepEqual(planStaticGroups(new Map([['3,3', 90000]])), [['3,3']]);
  assert.deepEqual(planStaticGroups(new Map()), []);
});

test('잔디 칸 나누기: 칸 안 번호는 오름차순, 앞쪽 n 포기만 그리면 예전 전역 순서와 같은 풀', () => {
  const pts = Array.from({ length: 500 }, (_, i) => [Math.sin(i * 12.9898) * 40, Math.cos(i * 78.233) * 40]);
  const cells = groupByCell(pts.length, (i) => pts[i][0], (i) => pts[i][1], 20);
  let total = 0;
  for (const [k, ids] of cells) {
    total += ids.length;
    for (let j = 1; j < ids.length; j++) assert.ok(ids[j] > ids[j - 1]);
    for (const i of ids) assert.equal(cellKey(pts[i][0], pts[i][1], 20), k);
  }
  assert.equal(total, pts.length);
  for (const n of [0, 1, 137, 250, 499, 500]) {
    let shown = 0;
    for (const ids of cells.values()) {
      const c = countBelow(ids, n);
      shown += c;
      assert.ok(ids.slice(0, c).every((i) => i < n) && ids.slice(c).every((i) => i >= n));
    }
    assert.equal(shown, n, `밀도 ${n}`);
  }
});

test('그림자 상자: 세로 화면은 작게, 앞 34m·뒤 12m 를 늘 덮음, 가로 PC 화면은 지금(±34)과 비슷', () => {
  for (const aspect of [412 / 839, 390 / 844, 1280 / 800, 1100 / 740, 839 / 412]) {
    const { r, a } = shadowFit(aspect);
    assert.ok(a >= 0);
    assert.ok(a + r >= 34 - 1e-9, `앞쪽 ${a + r}`);
    assert.ok(r - a >= 12 - 1e-9, `뒤쪽 ${r - a}`);
    assert.ok(r >= 16 && r <= 36);
    // 앞쪽 끝(카메라 최대 16m 뒤)에서 화면 가로 반폭을 덮음 (최대치에 걸린 아주 넓은 화면 제외)
    const halfW = (34 + 16) * aspect * Math.tan(THREE.MathUtils.degToRad(22.5));
    if (r < 36) assert.ok(r >= halfW - 1e-9);
  }
  const phone = shadowFit(412 / 839), pc = shadowFit(1280 / 800);
  assert.ok(phone.r < 25, `세로 폰 ${phone.r}`);
  assert.ok(phone.a > 8, '상자를 앞으로 밀어 둠');
  assert.ok(Math.abs(pc.r - 34) < 1.5, `PC ${pc.r}`);
});

test('그림자 중심 격자 맞춤: 빛 공간 좌표가 그림자 맵 한 칸의 정수배, 빛 방향으로는 움직이지 않음', () => {
  const dir = new THREE.Vector3(57, 36.7, 35).normalize();
  const texel = (2 * 23) / 1024;
  const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), dir).normalize();
  const upv = new THREE.Vector3().crossVectors(dir, right);
  const isMul = (v) => Math.abs(v / texel - Math.round(v / texel)) < 1e-6;
  for (const p of [[0, 0, 0], [3.21, 0.4, -7.77], [-12.345, -200, 150.5], [39.9, 2.2, -39.9]]) {
    const c = new THREE.Vector3(...p);
    const s = snapToTexel(c, dir, texel);
    assert.ok(isMul(s.dot(right)) && isMul(s.dot(upv)), `격자 ${p}`);
    const d = s.clone().sub(c);
    assert.ok(Math.abs(d.dot(dir)) < 1e-9, '빛 방향 성분은 그대로');
    assert.ok(d.length() <= texel * Math.SQRT1_2 + 1e-9, '반 칸 이내로만 움직임');
    // 같은 자리를 빛 방향으로 옮겨도 격자 위치는 같음 (높이가 달라도 떨리지 않음)
    const s2 = snapToTexel(c.clone().addScaledVector(dir, 5.5), dir, texel);
    assert.ok(Math.abs(s2.dot(right) - s.dot(right)) < 1e-9 && Math.abs(s2.dot(upv) - s.dot(upv)) < 1e-9);
  }
  // 조금씩 움직이면 한 칸 단위로만 바뀜 (떨림 없음)
  let prev = null, changes = 0;
  for (let i = 0; i <= 100; i++) {
    const x = snapToTexel(new THREE.Vector3(i * 0.001, 0, 0), dir, texel).dot(right);
    if (prev !== null && Math.abs(x - prev) > 1e-9) { changes++; assert.ok(Math.abs(Math.abs(x - prev) - texel) < 1e-9); }
    prev = x;
  }
  assert.ok(changes <= 3);
});

test('비·눈 입자 수: 세기와 품질 비율에 비례, 0 이면 계산·업로드 없음', () => {
  assert.equal(activeCount(2200, 0, 1), 0);
  assert.equal(activeCount(2200, 1, 0), 0);
  assert.equal(activeCount(2200, 1, 1), 2200);
  assert.equal(activeCount(2200, 1.7, 1), 2200);
  assert.equal(activeCount(2200, 0.5, 0.4), 440);
  assert.equal(activeCount(2200, 0.0001, 1), 0);
});

// surface.js 셰이더 노이즈를 그대로 옮김 (옥타브를 줄여도 평균 밝기가 같은지)
const fract = (x) => x - Math.floor(x);
function sh31(x, y, z) {
  x = fract(x * 0.3183099 + 0.1) * 17; y = fract(y * 0.3183099 + 0.1) * 17; z = fract(z * 0.3183099 + 0.1) * 17;
  return fract(x * y * z * (x + y + z));
}
function svn(x, y, z) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  let fx = x - ix, fy = y - iy, fz = z - iz;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); fz = fz * fz * (3 - 2 * fz);
  const m = (a, b, t) => a + (b - a) * t;
  const s = (a, b, c) => sh31(ix + a, iy + b, iz + c);
  return m(m(m(s(0, 0, 0), s(1, 0, 0), fx), m(s(0, 1, 0), s(1, 1, 0), fx), fy), m(m(s(0, 0, 1), s(1, 0, 1), fx), m(s(0, 1, 1), s(1, 1, 1), fx), fy), fz);
}
function sfbm(x, y, z, oct) {
  let a = 0.5, s = 0;
  for (let i = 0; i < oct; i++) { s += a * svn(x, y, z); x *= 2.03; y *= 2.03; z *= 2.03; a *= 0.5; }
  return s + fbmCompensation(oct);
}

test('재질 노이즈: 저사양 2옥타브도 보정값으로 평균 밝기가 4옥타브와 같음', () => {
  assert.equal(fbmCompensation(4), 0);
  assert.equal(fbmCompensation(2), 0.09375);
  let m4 = 0, m2 = 0;
  const N = 20000;
  for (let i = 0; i < N; i++) {
    const x = fract(Math.sin(i * 12.9898) * 43758.5453) * 60 - 30, y = fract(Math.sin(i * 78.233) * 43758.5453) * 8, z = fract(Math.sin(i * 37.719) * 43758.5453) * 60 - 30;
    m4 += sfbm(x * 5.5, y * 5.5, z * 5.5, 4); m2 += sfbm(x * 5.5, y * 5.5, z * 5.5, 2);
  }
  m4 /= N; m2 /= N;
  assert.ok(Math.abs(m4 - m2) < 0.01, `4옥타브 ${m4.toFixed(4)} · 2옥타브 ${m2.toFixed(4)}`);
});
