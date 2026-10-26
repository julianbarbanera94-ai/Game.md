import test from 'node:test';
import assert from 'node:assert/strict';
import { createNewState } from '../../src/systems/state.js';
import { weatherOn, isSnowing, rainTick, RAIN_CHANCE } from '../../src/systems/weather.js';
import { advanceTime } from '../../src/systems/simulation.js';

const at = (day, hour = 10) => (day - 1) * 1440 + hour * 60;
const rainyDay = () => { for (let d = 3; d < 200; d++) if (weatherOn(at(d)) === 'rain') return d; return null; };

test('weather comes from the day number: stable, dry tutorial, no winter rain', () => {
  for (let d = 1; d <= 300; d++) assert.equal(weatherOn(at(d, 7)), weatherOn(at(d, 22)), 'the same all day');
  assert.equal(weatherOn(at(1)), 'clear');
  assert.equal(weatherOn(at(2)), 'clear');
  for (let d = 85; d <= 112; d++) assert.equal(weatherOn(at(d)), 'clear', 'winter is dry');
  const spring = Array.from({ length: 28 * 8 }, (_, i) => i).filter((i) => i % 112 < 28).map((i) => i + 1).filter((d) => d > 2);
  const share = spring.filter((d) => weatherOn(at(d)) === 'rain').length / spring.length;
  assert.ok(Math.abs(share - RAIN_CHANCE[0]) < 0.08, `spring rain share ${share}`);
  assert.equal(isSnowing(at(10)), false, 'no snow in spring');
});

test('rain waters planted, growing, dry plots only', () => {
  const s = createNewState();
  const d = rainyDay();
  s.time = at(d);
  Object.assign(s.plots.starter_5_14, { tilled: true, crop: 'carrot', growth: 0, moistUntil: 0 });
  Object.assign(s.plots.starter_6_14, { tilled: true, crop: null, moistUntil: 0 });
  Object.assign(s.plots.starter_7_14, { tilled: true, crop: 'carrot', growth: 99999, moistUntil: 0 });
  assert.equal(rainTick(s), 1);
  assert.ok(s.plots.starter_5_14.moistUntil > s.time);
  assert.equal(s.plots.starter_6_14.moistUntil, 0, 'empty soil stays as it is');
  assert.equal(s.plots.starter_7_14.moistUntil, 0, 'a ripe crop needs no water');
  assert.equal(rainTick(s), 0, 'already wet');
  s.plots.south_5_17 && Object.assign(s.plots.south_5_17, { tilled: true, crop: 'carrot', growth: 0, moistUntil: 0 });
  rainTick(s);
  assert.equal(s.plots.south_5_17?.moistUntil || 0, 0, 'locked land is not part of the farm yet');
});

test('the clock brings the rain overnight', () => {
  const s = createNewState();
  const d = rainyDay();
  s.time = at(d - 1, 20);
  Object.assign(s.plots.starter_5_14, { tilled: true, crop: 'carrot', growth: 0, moistUntil: 0 });
  advanceTime(s, 11 * 60);
  assert.ok(s.plots.starter_5_14.moistUntil > s.time);
});
