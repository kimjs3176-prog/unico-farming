import { test } from 'node:test';
import assert from 'node:assert/strict';
import { starsFor, MINIGAMES, bestOf } from '../src/ui/minigame_frame.js';
import { SmartFarmSim, SMART_EVENTS, SMART_TIME } from '../src/game/sim/smartfarm.js';

test('star thresholds: 0~3 stars, every minigame has ascending thresholds', () => {
  assert.equal(starsFor(0, [3, 5, 6]), 0);
  assert.equal(starsFor(3, [3, 5, 6]), 1);
  assert.equal(starsFor(5, [3, 5, 6]), 2);
  assert.equal(starsFor(9, [3, 5, 6]), 3);
  for (const m of MINIGAMES) assert.ok(m.th[0] < m.th[1] && m.th[1] < m.th[2], m.id);
  assert.equal(bestOf('nothing'), 0, '저장소가 없어도 0');
});

test('smart farm events: off by default, scheduled and announced when enabled', () => {
  const seeded = (s = 3) => () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const a = new SmartFarmSim(seeded());
  a.start();
  for (let t = 0; t < SMART_TIME; t += 0.1) a.tick(0.1);
  assert.equal(a.event, null);
  const b = new SmartFarmSim(seeded());
  b.start({ events: true });
  const seen = new Set();
  for (let t = 0; t < SMART_TIME; t += 0.1) { b.tick(0.1); if (b.newEvent) { seen.add(b.newEvent.key); b.newEvent = null; } }
  assert.ok(seen.size >= 2, `돌발 상황 ${[...seen]}`);
  for (const k of seen) assert.ok(SMART_EVENTS.some((e) => e.key === k));
});
