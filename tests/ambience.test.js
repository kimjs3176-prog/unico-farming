// 장소 환경음·자리 있는 효과음·집 안 필터 (src/game/ambience.js · audio.js playAt/setIndoor)
import test from 'node:test';
import assert from 'node:assert/strict';
import { MockAudioContext } from './lib/audio_mock.js';

const { Ambience, zoneGain, bedCap, pickBeds, buildZones } = await import('../src/game/ambience.js');
const { Audio, spatial } = await import('../src/game/audio.js');
const { LAYOUT } = await import('../src/game/world.js');

function make() {
  globalThis.window = { AudioContext: MockAudioContext };
  const a = new Audio(); a.rng = () => 0.5; a._ctx();
  return a;
}
const S0 = { x: 0, z: 0, yaw: 0, inside: false, season: 'spring', low: false, rain: false, night: false };

test('자리 크기: 반지름 안 1, 반지름+10m 밖 0, 사이는 부드럽게 줄어듦', () => {
  assert.equal(zoneGain(3, 6), 1);
  assert.equal(zoneGain(16, 6), 0);
  assert.equal(zoneGain(11, 6), 0.5);
  assert.ok(zoneGain(8, 6) > zoneGain(12, 6));
});

test('바닥 소리 상한: 낮은 품질 2개, 그 밖 3개, 큰 것부터', () => {
  assert.equal(bedCap(true), 2); assert.equal(bedCap(false), 3);
  const p = pickBeds([{ id: 'a', gain: 0.2 }, { id: 'b', gain: 0.9 }, { id: 'c', gain: 0 }, { id: 'd', gain: 0.5 }], 2);
  assert.deepEqual(p.map((x) => x.id), ['b', 'd']);
});

test('LAYOUT 의 호수(r 6)·연못(r 4.5)이 물가 바닥 소리, 논·연못이 개구리 자리', () => {
  const Z = buildZones(LAYOUT);
  assert.deepEqual(Z.beds.map((b) => [b.id, b.r]), [['lake', 6], ['pond', 4.5]]);
  assert.deepEqual(Z.frogs.map((f) => f.id), ['paddy', 'pond']);
  assert.ok(Z.trees.length >= 4);
});

test('낮은 품질은 물가 세 곳 곁에서도 바닥 소리를 2개만 켜고, 멀어지면 5초 뒤 멈추고 끊음', () => {
  // 준비: 가까이 모인 물가 셋
  const a = make(), am = new Ambience(a, {});
  am.zones = [{ id: 'w1', x: 2, z: 0, r: 3 }, { id: 'w2', x: -2, z: 0, r: 3 }, { id: 'w3', x: 0, z: 4, r: 3 }];
  am.nextPlop = 1e9;
  // 실행
  am.update(1, { ...S0, low: true });
  // 확인
  assert.equal(am.beds.size, 2);
  am.update(1.3, { ...S0, low: false });
  assert.equal(am.beds.size, 3);
  // 멀리 감 → 줄임 → 5초 뒤 멈춤
  const b = am.beds.get('w1');
  am.update(2, { ...S0, x: 100 });
  assert.equal(am.beds.size, 3, '바로 끊지 않고 줄임');
  am.update(8, { ...S0, x: 100 });
  assert.equal(am.beds.size, 0);
  assert.ok(b.src.t1 !== undefined, '노이즈 멈춤');
});

test('초당 4번까지만 계산 (0.25초 안 두 번째는 건너뜀), 듣는 자리를 audio 에 알려 줌', () => {
  const a = make(), am = new Ambience(a, {});
  assert.equal(am.update(1, { ...S0, x: 5 }), true);
  assert.equal(am.update(1.1, { ...S0, x: 9 }), false);
  assert.deepEqual(a.listener, { x: 5, z: 0, yaw: 0 });
});

test('집 안: 주변 소리 700Hz 저역통과·-8dB, 비가 오면 지붕 빗소리, 나오면 되돌림', () => {
  const a = make(), am = new Ambience(a, {});
  am.update(1, { ...S0, inside: true, rain: true, rainLevel: 0.09 });
  assert.equal(a.ambLP.frequency.events.at(-1)[1], 700);
  assert.ok(Math.abs(a.amb.gain.events.at(-1)[1] - a.volume.amb * Math.pow(10, -8 / 20)) < 1e-9);
  assert.ok(am.roof, '지붕 빗소리');
  assert.ok(am.roof.out.outs.includes(a.ambDuck), '지붕 소리는 집 안 필터를 거치지 않음');
  am.update(2, { ...S0 });
  assert.equal(a.ambLP.frequency.events.at(-1)[1], 20000);
});

test('봄·여름 밤 논 곁: 개구리, 겨울 밤에는 없음', () => {
  const run = (season) => {
    const a = make(), am = new Ambience(a, { layout: LAYOUT });
    am.nextPlop = 1e9; am.nextFrog = 0;
    const p = am.frogZones[0], n = a.ctx.started.length;
    am.update(1, { ...S0, x: p.x, z: p.z, night: true, season });
    return a.ctx.started.slice(n).filter((s) => s.kind === 'osc' && s.type === 'square').length;
  };
  assert.ok(run('summer') >= 6, '개굴 묶음');
  assert.equal(run('winter'), 0);
});

test('자리 있는 효과음: 1/(1+d/8) 로 작아지고 30m 밖은 안 남, 경고는 minGain 만큼 들림, 좌우는 카메라 기준 ±0.7', () => {
  const L = { x: 0, z: 0, yaw: 0 };
  assert.ok(Math.abs(spatial(L, 8, 0).gain - 0.5) < 1e-9);
  assert.equal(spatial(L, 31, 0), null);
  assert.equal(spatial(L, 40, 0, 0.35).gain, 0.35);
  assert.equal(spatial(L, 10, 0).pan, 0.7, '오른쪽(+x, yaw 0)');
  assert.equal(spatial(L, -10, 0).pan, -0.7);
  // 실제 소리: 패너를 거쳐 효과음 버스로
  const a = make(); a.listener = L;
  const n = a.ctx.started.length;
  a.playAt('moo', 4, 0, 1);
  const o = a.ctx.started[n];
  assert.ok(o, '소리 남');
  a.ctx.currentTime += 1;
  const m = a.ctx.started.length;
  a.playAt('moo', 50, 0, 1);
  assert.equal(a.ctx.started.length, m, '30m 밖은 조용');
});

test('동물 목소리(소·양·닭·말·당나귀·알파카)·여우 깽깽·빗질·축제 가락은 소리를 내고, pitch 로 높이가 바뀜', () => {
  const a = make(), c = a.ctx;
  for (const n of ['moo', 'baa', 'cluck', 'neigh', 'heehaw', 'hum', 'yip', 'growl', 'bristle', 'fest']) {
    for (const s of c.started) s.onended?.();
    c.currentTime += 1;
    const from = c.started.length;
    a.play(n);
    assert.ok(c.started.length > from, n);
  }
  const f = (p) => { for (const s of c.started) s.onended?.(); c.currentTime += 1; const k = c.started.length; a.play('moo', 1, { pitch: p }); return c.started.slice(k).find((s) => s.type === 'sawtooth').frequency.events[0][1]; };
  assert.ok(Math.abs(f(1.06) / f(1) - 1.06) < 1e-9);
});
