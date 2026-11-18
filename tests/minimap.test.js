// 미니맵: 이름표 겹침 없음, 보는 방향 화살표, 큰 지도 누른 점 → 세계 좌표, 픽셀 배율 (src/ui/minimap.js)
import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.window ??= { addEventListener() {} };
const { placeLabels, arrowAngle, mapToWorld, mapScale, mapDpr } = await import('../src/ui/minimap.js');

const overlap = (a, b) => Math.abs(a.x - b.x) * 2 < a.w + b.w && Math.abs(a.y - b.y) * 2 < a.h + b.h;

test('이름표 놓기: 한곳에 몰린 이름표도 서로 겹치지 않고, 지도 밖으로 나가지 않음', () => {
  // 준비: 예전에 '장터과수원'·'우리 집/밭갈이' 처럼 붙던 상황 + 무작위로 빽빽한 점
  const S = 300, h = 12, measure = (t) => t.length * 11;
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const labels = [{ text: '장터', x: 150, y: 120 }, { text: '과수원', x: 165, y: 121 }, { text: '우리 집', x: 150, y: 200 }, { text: '밭갈이', x: 160, y: 204 }];
  for (let i = 0; i < 30; i++) labels.push({ text: '이름'.repeat(1 + (i % 3)), x: rnd() * S, y: rnd() * S, r: 3 });
  // 실행
  const out = placeLabels(labels, measure, h, S);
  // 확인
  for (let i = 0; i < out.length; i++) for (let j = i + 1; j < out.length; j++) assert.ok(!overlap(out[i], out[j]), `${out[i].text}·${out[j].text} 겹침`);
  for (const a of out) assert.ok(a.x - a.w / 2 >= 0 && a.x + a.w / 2 <= S && a.y - a.h / 2 >= 0 && a.y + a.h / 2 <= S, `${a.text} 지도 밖`);
  assert.equal(out[0].text, '장터', '중요한 곳은 먼저, 기본은 아래쪽');
  assert.ok(out[0].y > 120);
  assert.ok(out.some((a) => a.text === '과수원'), '붙어 있던 이름표는 다른 쪽으로 옮겨 놓임');
});

test('화살표: 북쪽(-z)을 보면 위, 동쪽(+x)이면 오른쪽, 남쪽(+z)이면 아래', () => {
  // 화살표는 위(0, -1)를 향해 그려 각도 θ 만큼 돌림 → (sin θ, -cos θ)
  const dir = (facing) => { const t = arrowAngle(facing); return [Math.round(Math.sin(t) * 1e6) / 1e6 + 0, Math.round(-Math.cos(t) * 1e6) / 1e6 + 0]; };
  assert.deepEqual(dir(Math.PI), [0, -1]);      // facing π = atan2(0, -1): 북쪽
  assert.deepEqual(dir(Math.PI / 2), [1, 0]);   // 동쪽
  assert.deepEqual(dir(0), [0, 1]); // 남쪽
});

test('큰 지도 누른 점: 화면에 보이는 크기와 상관없이 논리 크기로 나눠 세계 좌표 (가운데 = 원점)', () => {
  const S = 440, { B } = mapScale(S);
  for (const w of [440, 300, 660]) {
    const mid = mapToWorld(w / 2, w / 2, w, w, S);
    assert.ok(Math.abs(mid.x) < 1e-9 && Math.abs(mid.z) < 1e-9, `보이는 폭 ${w}`);
    const corner = mapToWorld(0, w, w, w, S);
    assert.ok(Math.abs(corner.x + B) < 1e-9 && Math.abs(corner.z - B) < 1e-9);
  }
});

test('캔버스 배율: 상한 2, 낮음 품질은 1.5, 최소 1', () => {
  assert.equal(mapDpr(3, false), 2);
  assert.equal(mapDpr(3, true), 1.5);
  assert.equal(mapDpr(0.5, false), 1);
  assert.equal(mapDpr(1.25, false), 1.25);
});
