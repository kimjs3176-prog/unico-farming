import test from 'node:test';
import assert from 'node:assert/strict';
import { camDefaults, zoomStep, savedCam, FollowCamera, ZOOM_STEP } from '../src/game/camera.js';

test('카메라 기본값: PC 는 예전 그대로(거리 9), 터치 기기는 더 멀리·더 높이서', () => {
  const pc = camDefaults({ touch: false });
  assert.equal(pc.distance, 9); assert.equal(pc.pitch, 0.45);
  const port = camDefaults({ touch: true, aspect: 390 / 844 }), land = camDefaults({ touch: true, aspect: 844 / 390 });
  assert.ok(port.distance > pc.distance && land.distance > pc.distance, `세로 ${port.distance} 가로 ${land.distance}`);
  assert.ok(port.pitch > pc.pitch && land.pitch > pc.pitch);
  assert.ok(port.distance >= land.distance, '세로 화면은 가로 폭이 좁아 더 멀리');
  assert.ok(port.max > pc.max, '터치 기기는 더 멀리까지 줌 가능');
});

test('줌 한 단계: 배율로 움직이고 한계를 넘지 않음', () => {
  const lim = { min: 5, max: 24 };
  assert.equal(zoomStep(10, +1, lim), 12.5);
  assert.equal(zoomStep(10, -1, lim), 8);
  assert.equal(zoomStep(23, +1, lim), 24);
  assert.equal(zoomStep(5.5, -1, lim), 5);
  // 끝까지 눌렀다 되돌아와도 한계 안
  let d = 10; for (let i = 0; i < 20; i++) d = zoomStep(d, +1, lim);
  assert.equal(d, 24);
  assert.equal(ZOOM_STEP, 1.25);
});

test('저장한 카메라 값: 한계 밖이면 잘라 내고, 깨진 값이면 무시', () => {
  const lim = camDefaults({ touch: true, aspect: 0.5 });
  assert.deepEqual(savedCam({ distance: 99, pitch: 9 }, lim), { distance: lim.max, pitch: lim.pitchMax });
  assert.equal(savedCam({ distance: 'abc', pitch: 0.5 }, lim), null);
  assert.equal(savedCam(null, lim), null);
});

test('추적 카메라: 터치 기기는 멀리서 시작, 저장값이 있으면 그 값, ＋/－·🎥 버튼 동작', () => {
  const cam = { position: { copy() { return { add() {} }; } }, lookAt() {} };
  const c = new FollowCamera(cam, { touch: true, aspect: 0.46 });
  assert.equal(c.distance, camDefaults({ touch: true, aspect: 0.46 }).distance);
  const s = new FollowCamera(cam, { touch: true, aspect: 0.46, saved: { distance: 7, pitch: 0.9 } });
  assert.equal(s.distance, 7); assert.equal(s.pitch, 0.9);
  s.zoom(-1); assert.equal(s.distance, 5.6);
  s.zoom(+1); assert.equal(s.distance, 7);
  s.yaw = 2; s.resetView(0);
  assert.equal(s.distance, c.defaults.distance);
  assert.equal(s.pitch, c.defaults.pitch);
  assert.equal(+s.yaw.toFixed(5), +Math.PI.toFixed(5), '캐릭터가 +Z 를 보면 카메라는 그 뒤(−Z 쪽)에서');
  const pc = new FollowCamera(cam, {});
  assert.equal(pc.distance, 9);
});
