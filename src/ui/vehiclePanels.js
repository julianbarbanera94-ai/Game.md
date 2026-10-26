import { VEHICLES, IMPLEMENTS, UPGRADES, GARAGE_FUEL_PRICE, FIELD_FUEL_PRICE, MAX_VEHICLES } from '../data/vehicles.js';
import { getItem } from '../data/items.js';
import * as V from '../systems/vehicles.js';
import { levelOf } from '../systems/level.js';
import { el } from './hud.js';
import { guarded } from './guard.js';

// Garage (buy, fuel, repair, upgrade, tow) and the little menu for a parked vehicle.

const bar = (value, max, low) => el('div', { class: `bar${low ? ' low' : ''}` }, el('span', { style: `width:${Math.max(0, Math.min(100, Math.round((value / Math.max(1, max)) * 100)))}%` }));

function stats(v) {
  return el('div', { class: 'vrow-stats' },
    el('small', {}, `Fuel ${Math.round(v.fuel)}/${V.tankSize(v)}`), bar(v.fuel, V.tankSize(v), v.fuel < V.tankSize(v) * 0.15),
    el('small', {}, `Condition ${Math.round(v.condition)}%`), bar(v.condition, 100, v.condition < 30));
}

export function installVehiclePanels(Panels) {
  // ---- the garage building
  Panels.prototype.garage = function garage(uid) {
    const game = this.game;
    const content = el('div', { class: 'garage' });
    const render = () => {
      const s = game.state;
      const lvl = levelOf(s);
      const fleet = s.vehicles.map((v) => {
        const def = VEHICLES[v.type];
        const next = UPGRADES[v.upgrade];
        return el('div', { class: 'row vehicle-row', 'data-vehicle': v.uid },
          el('div', { class: 'row-main' },
            el('strong', {}, `${def.name}${v.upgrade ? ` · ${UPGRADES[v.upgrade - 1].name}` : ''}`),
            el('small', {}, `${v.mount.front ? IMPLEMENTS[v.mount.front].name : 'no implement'}${v.mount.rear ? ' + trailer' : ''}`),
            stats(v)),
          el('div', { class: 'row-actions' },
            el('button', { 'data-refuel': v.uid, disabled: v.fuel >= V.tankSize(v) - 0.5, onclick: guarded(() => game.refuelVehicle(v.uid)) },
              `Refuel (${GARAGE_FUEL_PRICE}/unit)`),
            el('button', { 'data-repair': v.uid, disabled: v.condition >= 99.5, onclick: guarded(() => game.repairVehicle(v.uid)) },
              `Repair (${V.repairCost(v)})`),
            next ? el('button', { 'data-upgrade-vehicle': v.uid, onclick: guarded(() => game.upgradeVehicle(v.uid)) }, `${next.name} (${next.cost})`) : null,
            el('button', { 'data-tow': v.uid, onclick: guarded(() => game.towVehicle(v.uid)) }, 'Bring to garage'),
            el('button', { class: 'primary', 'data-drive': v.uid, onclick: guarded(() => { game.panels.close(true); game.enterVehicle(v.uid); }) }, 'Drive')));
      });
      const buyVehicles = Object.values(VEHICLES).map((def) => {
        const locked = lvl < def.level;
        const full = s.vehicles.length >= MAX_VEHICLES;
        return el('div', { class: `row${locked ? ' locked' : ''}`, 'data-for-sale': def.id },
          el('div', { class: 'row-main' }, el('strong', {}, def.name), el('small', {}, def.blurb),
            el('small', { class: 'status' }, locked ? `Locked — reach farm level ${def.level}` : full ? 'The garage is full' : `${def.cost} coins`)),
          el('div', { class: 'row-actions' },
            el('button', { class: 'primary', 'data-buy-vehicle': def.id, disabled: locked || full || s.coins < def.cost, onclick: guarded(() => game.buyVehicle(def.id)) }, `Buy (${def.cost})`)));
      });
      const buyImplements = Object.values(IMPLEMENTS).map((def) => {
        const owned = s.owned.implements.includes(def.id);
        const on = V.mountedOn(s, def.id);
        return el('div', { class: 'row compact', 'data-implement': def.id },
          el('div', { class: 'row-main' }, el('strong', {}, def.name), el('small', {}, def.blurb),
            owned ? el('small', { class: 'status' }, on ? `Fitted to a ${VEHICLES[on.type].name}` : 'In the garage') : null),
          el('div', { class: 'row-actions' },
            owned ? el('span', { class: 'tick' }, '✔ Owned')
              : el('button', { class: 'primary', 'data-buy-implement': def.id, disabled: s.coins < def.cost, onclick: guarded(() => game.buyImplement(def.id)) }, `Buy (${def.cost})`)));
      });
      content.replaceChildren(
        el('h3', {}, `Your machines (${s.vehicles.length}/${MAX_VEHICLES})`),
        el('div', { class: 'rows' }, fleet.length ? fleet : [el('p', { class: 'empty' }, 'No machines yet. Buy a tractor below.')]),
        el('h3', {}, 'Tractors'), el('div', { class: 'rows' }, buyVehicles),
        el('h3', {}, 'Implements and trailers'), el('div', { class: 'rows' }, buyImplements),
        el('div', { class: 'footer' }, el('span', { class: 'coin' }), ` ${s.coins.toLocaleString()} coins · farm level ${lvl}`));
    };
    const rec = game.state.placed.find((p) => p.uid === uid);
    const draw = () => {
      render();
      if (rec) content.append(el('div', { class: 'move-row' }, el('button', { 'data-move': uid, onclick: guarded(() => game.startMove(uid)) }, 'Move this building'), el('small', {}, 'Free. Parked machines stay where they are.')));
    };
    this.show('Garage', content, { wide: true, onClose: () => game.autosave('garage') }).render = draw;
    draw();
  };

  // ---- a parked tractor in the field
  Panels.prototype.vehicle = function vehicle(uid) {
    const game = this.game;
    const content = el('div', { class: 'vehicle-panel' });
    const render = () => {
      const s = game.state;
      const v = V.findVehicle(s, uid);
      if (!v) return;
      const def = VEHICLES[v.type];
      const front = Object.values(IMPLEMENTS).filter((i) => i.slot === 'front' && s.owned.implements.includes(i.id));
      const trailers = Object.values(IMPLEMENTS).filter((i) => i.slot === 'rear' && s.owned.implements.includes(i.id));
      const fit = (imp) => {
        const on = V.mountedOn(s, imp.id);
        const here = v.mount[imp.slot] === imp.id;
        return el('div', { class: 'row compact', 'data-fit': imp.id },
          el('div', { class: 'row-main' }, el('strong', {}, imp.name), el('small', {}, here ? 'Fitted' : on ? `On a ${VEHICLES[on.type].name}` : 'In the garage')),
          el('div', { class: 'row-actions' },
            here ? el('button', { 'data-detach': imp.slot, onclick: guarded(() => game.detachImplement(uid, imp.slot)) }, 'Detach')
              : el('button', { 'data-attach': imp.id, disabled: !!on, onclick: guarded(() => game.attachImplement(uid, imp.id)) }, 'Attach')));
      };
      const cargo = Object.entries(v.cargo).map(([id, q]) => `${q} ${getItem(id).name}`).join(', ');
      content.replaceChildren(
        el('div', { class: 'row vehicle-row' }, el('div', { class: 'row-main' }, el('strong', {}, def.name), stats(v))),
        el('div', { class: 'actions' },
          el('button', { class: 'primary', 'data-drive': uid, onclick: guarded(() => { game.panels.close(true); game.enterVehicle(uid); }) }, 'Get in and drive'),
          el('button', { 'data-field-refuel': uid, disabled: v.fuel >= V.tankSize(v) - 0.5, onclick: guarded(() => game.refuelVehicle(uid, true)) }, `Add fuel from the can (${FIELD_FUEL_PRICE}/unit)`),
          el('button', { 'data-tow': uid, onclick: guarded(() => game.towVehicle(uid)) }, 'Tow back to the garage')),
        front.length || trailers.length ? el('h3', {}, 'Implements') : el('p', { class: 'muted' }, 'Buy implements and a trailer at the garage.'),
        el('div', { class: 'rows' }, [...front, ...trailers].map(fit)),
        v.mount.rear ? el('div', { class: 'row compact' }, el('div', { class: 'row-main' }, el('strong', {}, `Trailer ${V.cargoUsed(v)}/${V.cargoCapacity(v)}`), el('small', {}, cargo || 'Empty')),
          el('div', { class: 'row-actions' }, el('button', { 'data-unload': uid, disabled: V.cargoUsed(v) === 0, onclick: guarded(() => game.unloadVehicle(uid)) }, 'Unload into bag'))) : null);
    };
    const v0 = V.findVehicle(game.state, uid);
    this.show(v0 ? VEHICLES[v0.type].name : 'Vehicle', content, { wide: true, onClose: () => game.autosave('vehicle') }).render = render;
    render();
  };
}
