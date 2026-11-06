import test from 'node:test';
import assert from 'node:assert/strict';
import { PARCELS, PARCEL_BY_ID, RIVER, pointInPoly, distToLine } from '../../src/data/land.js';
import { PLOTS, PLOT_GROUPS } from '../../src/data/world.js';
import { UPGRADES } from '../../src/data/progression.js';
import { createNewState } from '../../src/systems/state.js';
import { upgradeStatus, purchaseUpgrade } from '../../src/systems/economy.js';
import { deserialize, serialize } from '../../src/systems/save.js';

test('every parcel is one data entry: upgrade, plot group, plots and a field inside its meadow', () => {
  for (const p of PARCELS) {
    assert.ok(UPGRADES[p.id] && UPGRADES[p.id].cost === p.price, `${p.id} upgrade`);
    assert.equal(PLOT_GROUPS[p.group].unlock, p.id);
    assert.equal(PLOTS.filter((x) => x.group === p.group).length, p.field.cols * p.field.rows);
    const f = p.field;
    for (const [x, y] of [[f.x0, f.y0], [f.x0 + f.cols, f.y0], [f.x0, f.y0 + f.rows], [f.x0 + f.cols, f.y0 + f.rows]]) assert.ok(pointInPoly(x, y, p.poly), `${p.id} field corner`);
    assert.ok(createNewState().unlocks[p.id] === false);
  }
});

test('parcels are bought in order: each sign stands on land you already own', () => {
  const order = ['riversidePaddock', 'northernMeadow', 'woodlandGlade'];
  const prev = { northernMeadow: 'riversidePaddock', woodlandGlade: 'northernMeadow' };
  for (const id of order.slice(1)) {
    const p = PARCEL_BY_ID[id];
    assert.ok(pointInPoly(p.sign[0], p.sign[1], PARCEL_BY_ID[prev[id]].poly), `${id} sign is on the previous parcel`);
    assert.deepEqual(p.requires, { unlock: prev[id] });
  }
  assert.ok(distToLine(...PARCEL_BY_ID.hillsidePasture.sign, PARCEL_BY_ID.hillsidePasture.road.line) < 3, 'hillside sign by its track');
});

test('buying a parcel needs its requirement and the coins, and saves', () => {
  const s = createNewState();
  s.coins = 99999;
  assert.equal(upgradeStatus(s, 'riversidePaddock').state, 'locked', 'the road is not open yet');
  s.flags.roadOpen = true;
  assert.equal(upgradeStatus(s, 'northernMeadow').state, 'locked');
  assert.equal(purchaseUpgrade(s, 'riversidePaddock').ok, true);
  assert.equal(s.coins, 99999 - 900);
  assert.equal(upgradeStatus(s, 'northernMeadow').state, 'available');
  const back = deserialize(serialize(s));
  assert.equal(back.unlocks.riversidePaddock, true);
  assert.equal(back.unlocks.northernMeadow, false);
});

test('no plot sits in the river or on a track', () => {
  for (const p of PARCELS) {
    for (const pl of PLOTS.filter((x) => x.group === p.group)) {
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        const x = pl.tx + dx, y = pl.ty + dy;
        assert.ok(distToLine(x, y, RIVER.line) > RIVER.width / 2 + 0.5, `${p.id} plot ${pl.id} in the river`);
        if (p.road) assert.ok(distToLine(x, y, p.road.line) > p.road.width / 2, `${p.id} plot ${pl.id} on the track`);
      }
    }
  }
});
