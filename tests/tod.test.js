import test from 'node:test';
import assert from 'node:assert/strict';
import { timeOfDay } from '../src/game/sim/tod.js';

const at = (h) => timeOfDay(h / 24);

test('시간대 색: 한낮은 흰빛, 노을은 주황, 밤은 푸른빛', () => {
  const noon = at(12), sunset = at(18), night = at(1);
  assert.ok(noon.sun[0] > 0.95 && noon.sun[2] > 0.85, '한낮 햇빛은 거의 흰색');
  assert.ok(sunset.sun[0] > 0.95 && sunset.sun[2] < 0.4, '노을은 붉은 쪽');
  assert.ok(night.sun[2] > night.sun[0], '밤은 푸른 쪽');
  assert.ok(sunset.warmth > noon.warmth && night.warmth < 0);
});

test('시간대 색: 1분 간격으로 볼 때 갑자기 튀지 않음 (자정 넘어갈 때 포함)', () => {
  let prev = at(0), worst = 0;
  for (let m = 1; m <= 24 * 60 + 1; m++) {
    const cur = timeOfDay((m / 60 / 24) % 1);
    for (const k of ['sun', 'tint']) for (let c = 0; c < 3; c++) worst = Math.max(worst, Math.abs(cur[k][c] - prev[k][c]));
    worst = Math.max(worst, Math.abs(cur.sat - prev.sat) * 0.5);
    prev = cur;
  }
  assert.ok(worst < 0.02, `한 단계 최대 변화 ${worst.toFixed(4)}`);
});

test('시간대 색: 범위 밖 값도 안전 (음수·1 이상)', () => {
  assert.deepEqual(timeOfDay(-0.5), timeOfDay(0.5));
  assert.deepEqual(timeOfDay(1.25), timeOfDay(0.25));
});

test('시간대 색: 넘긴 객체를 다시 채워도 새로 만든 값과 같음 (매 프레임 할당 없이)', () => {
  const out = { sun: [0, 0, 0], tint: [0, 0, 0], warmth: 0, sat: 0 };
  const { sun, tint } = out;
  for (const h of [0, 3, 5.9, 7.3, 12, 17.5, 18.4, 19.9, 23.99, 6, 1]) {
    const r = timeOfDay(h / 24, out);
    assert.equal(r, out, '같은 객체를 돌려줌');
    assert.equal(r.sun, sun);
    assert.equal(r.tint, tint);
    assert.deepEqual(r, at(h), `${h}시 값이 새로 만든 것과 같아야 함`);
  }
  const a = at(12), b = at(12);
  assert.notEqual(a, b, '넘기지 않으면 호출마다 새 객체');
  assert.notEqual(a.sun, b.sun);
});
