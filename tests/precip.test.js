import test from 'node:test';
import assert from 'node:assert/strict';
import { Precipitation, activeCount, rainCount, rainPxLimits } from '../src/game/precip.js';

const fakeScene = () => ({ added: [], add(...o) { this.added.push(...o); } });

test('빗줄기: GPU 인스턴스 — 그릴 개수는 살아 있는 입자 수와 같고, 매 프레임 버퍼를 올리지 않음', () => {
  const p = new Precipitation(fakeScene());
  assert.ok(p.rainGeo.isInstancedBufferGeometry, '사각형 한 장 × 인스턴스');
  assert.equal(p.rainGeo.attributes.position.count, 4);
  const seed = p.rainGeo.attributes.aSeed;
  assert.equal(seed.count, p.N);
  const v0 = seed.version;
  p.set('rain', 0.6, 0.3);
  p.density = 1;
  for (let i = 0; i < 5; i++) p.update(0.016, { x: 1, z: 2 });
  assert.equal(p.rainGeo.instanceCount, activeCount(p.N, 0.6, 1));
  assert.equal(p.rain.visible, true);
  assert.equal(seed.version, v0, '난수 속성은 처음 한 번만 올림');
  // 시간·바람만 유니폼으로
  assert.ok(p.rainU.uTime.value > 0.07);
  assert.ok(Math.abs(p.rainU.uSlant.value - 1.8) < 1e-9);
});

test('빗줄기: 맑음·실내(밀도 0)이면 그리지 않음', () => {
  const p = new Precipitation(fakeScene());
  p.set('rain', 0.8, 0.2); p.density = 0; p.update(0.016, { x: 0, z: 0 });
  assert.equal(p.rainGeo.instanceCount, 0); assert.equal(p.rain.visible, false);
  p.set('clear', 0, 0.2); p.density = 1; p.update(0.016, { x: 0, z: 0 });
  assert.equal(p.rainGeo.instanceCount, 0); assert.equal(p.rain.visible, false);
});

test('빗줄기 저사양: 품질 비율 0.4 의 3/4 (0.3), 화면 폭은 2px 이하', () => {
  const N = 2200;
  assert.equal(rainCount(N, 1, 0.4, true), activeCount(N, 1, 0.3));
  assert.equal(rainCount(N, 1, 1, false), N);
  const p = new Precipitation(fakeScene());
  p.set('storm', 1, 0.5); p.density = 0.4; p.thin = true; p.update(0.016, { x: 0, z: 0 });
  assert.equal(p.rainGeo.instanceCount, Math.floor(N * 0.3));
  // 폭 한계: 실제 픽셀 비율을 반영, 저사양 최대 2 장치 픽셀
  for (const pr of [1, 1.35, 2, 3]) {
    const lo = rainPxLimits(pr, true), hi = rainPxLimits(pr, false);
    assert.ok(lo.max <= 2 && lo.min <= lo.max, `저사양 pr ${pr}`);
    assert.ok(Math.abs(hi.min - 1.4 * pr) < 1e-9, `고사양 최소 폭 1.4 CSS px (pr ${pr})`);
  }
  assert.equal(rainPxLimits(0.75, false).min, 1.4, '배율이 1보다 작아도 최소 1.4px');
});

test('빗줄기 상자: 플레이어와 카메라 사이 가운데', () => {
  const p = new Precipitation(fakeScene());
  p.set('rain', 0.5, 0); p.view = { x: 10, y: 8, z: 20 }; p.update(0.016, { x: 0, z: 0 });
  assert.deepEqual(p.rainU.uCenter.value.toArray(), [5, 0, 10]);
  assert.deepEqual(p.rainU.uBox.value.toArray(), [30, 18, 30]);
});

test('땅 튀김: 보통·고사양에서만, 물·건물 위(null)는 건너뜀', () => {
  const p = new Precipitation(fakeScene());
  p.set('rain', 1, 0.2); p.splash = false; p.update(0.016, { x: 0, z: 0 });
  assert.equal(p.spl, undefined, '꺼져 있으면 만들지도 않음');
  p.splash = true;
  p.ground = (x) => (x > 0 ? null : 0.5);
  for (let i = 0; i < 40; i++) p.update(0.05, { x: 0, z: 0 });
  assert.ok(p.spl.visible);
  const a = p.splArr;
  let shown = 0;
  for (let i = 0; i < a.length / 4; i++) {
    if (a[i * 4 + 1] === -99) continue;
    shown++;
    assert.ok(a[i * 4] <= 0, '막힌 자리(x>0)에는 놓지 않음');
    assert.equal(a[i * 4 + 1], 0.5, '땅 높이에');
  }
  assert.ok(shown > 5);
});
