import test from 'node:test';
import assert from 'node:assert/strict';
import { describeWeather, PRESETS } from '../src/game/sim/weather_codes.js';
import { FarmSim } from '../src/game/sim/farm.js';

test('weather codes map to game states', () => {
  assert.equal(describeWeather({ code: 0 }).kind, 'clear');
  assert.equal(describeWeather({ code: 0, isDay: 0 }).emoji, '🌙');
  assert.equal(describeWeather({ code: 3 }).kind, 'cloudy');
  assert.equal(describeWeather({ code: 45 }).fog, 1);
  const rain = describeWeather({ code: 63, wind: 20 });
  assert.equal(rain.kind, 'rain');
  assert.ok(rain.autoWater);
  assert.equal(rain.wind, 0.5);
  assert.equal(describeWeather({ code: 75 }).kind, 'snow');
  assert.ok(describeWeather({ code: 95 }).thunder);
  assert.equal(describeWeather({ code: 12345 }).kind, 'clear', 'unknown code falls back to clear');
  for (const p of Object.values(PRESETS)) {
    const d = describeWeather(p);
    assert.ok(d.cloud >= 0 && d.cloud <= 1 && d.precip >= 0 && d.precip <= 1);
  }
});

test('rain waters dry growing plots, snow slows growth', () => {
  const f = new FarmSim(3);
  f.till(0); f.plant(0, 'carrot');
  f.till(1);
  assert.equal(f.rain(), 1);
  assert.ok(f.plots[0].water > 0);
  assert.equal(f.rain(), 0, 'already wet');
  const a = new FarmSim(1), b = new FarmSim(1);
  for (const x of [a, b]) { x.till(0); x.plant(0, 'carrot'); x.water(0); }
  b.weatherMult = 0.6;
  a.tick(10); b.tick(10);
  assert.ok(Math.abs(b.plots[0].progress - a.plots[0].progress * 0.6) < 1e-9);
});
