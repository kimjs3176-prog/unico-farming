// 음악: 늦게 불린 예약 타이머가 지난 박자를 몰아 내지 않음 (src/game/music.js)
// mobile_gaps.test.js 에서 나눔 — 음악 모듈을 바꾸는 배치가 이 파일을 고침
import test from 'node:test';
import assert from 'node:assert/strict';

const { Music } = await import('../src/game/music.js');

// ---------------------------------------------------------------- 음악: 늦게 불린 예약 타이머
test('음악: 타이머가 늦게 불려도 지난 박자를 한꺼번에 몰아 내지 않음', () => {
  const ctx = { state: 'running', currentTime: 0 };
  const m = new Music({ ctx, enabled: true, musicOn: true });
  m.rainGain = m.windGain = { gain: { setTargetAtTime() {} } };
  m.bird = m.crickets = () => {};
  const ats = [];
  m.playStep = (step, at) => ats.push(at);
  m.nextTime = 1;
  ctx.currentTime = 60; // 배경 탭에서 1분 동안 타이머가 거의 안 불림
  m.schedule();
  assert.ok(ats.length >= 1 && ats.length <= 2, `예약한 박자 ${ats.length}개 (앞 0.25초 분량만)`);
  assert.ok(ats.every((a) => a >= 0), `지난 시각(음수)에 예약하지 않음: ${ats}`);
  assert.ok(m.nextTime > ctx.currentTime);
  // 제때 불리면 박자는 그대로 이어짐 (건너뛰지 않음)
  const next = m.nextTime;
  ctx.currentTime = next - 0.2;
  ats.length = 0;
  m.schedule();
  assert.ok(Math.abs(ats[0] - 0.2) < 1e-9, '다음 박자는 원래 시각');
});

