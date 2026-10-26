import { getItem } from '../data/items.js';
import { QUESTS } from '../data/quests.js';
import { sellPrice, shopEntries, upgradeStatus } from '../systems/economy.js';
import { levelInfo } from '../systems/level.js';
import { levelName } from '../systems/relations.js';
import { NPC_LIST } from '../data/npcs.js';
import { VEHICLES, IMPLEMENTS } from '../data/vehicles.js';
import { BUILDINGS, DECORATIONS } from '../data/buildings.js';
import { jobProgress, placeableInfo, storageSlots, upgradeInfo, FIXED_BUILDINGS } from '../systems/buildings.js';
import { clock, formatClock } from '../systems/time.js';
import { savePreview } from '../systems/save.js';
import { slotsUsed } from '../systems/inventory.js';
import { SPECIES, productLabel } from '../data/animals.js';
import { animalsAt, capacity, hoursFed, isHungry, moodText, readyCount, sellValue } from '../systems/animals.js';
import { rewardText } from '../systems/quests.js';
import { el } from './hud.js';
import { guarded } from './guard.js';
import { installVillagePanels } from './villagePanels.js';
import { installJournalPanels } from './journalPanels.js';
import { installVehiclePanels } from './vehiclePanels.js';
import { installMapPanel } from './mapPanel.js';

// Full-screen / modal interfaces. Every panel closes with Esc, the close
// button or a click on the backdrop, and returns control to gameplay.

// A "Move building" row for panels of placed buildings.
export function moveRow(game, uid) {
  return el('div', { class: 'move-row' }, el('button', { 'data-move': uid, onclick: guarded(() => game.startMove(uid)) }, 'Move this building'),
    el('small', {}, 'Free. Pick it up and put it somewhere else.'));
}

const BAG_TABS = [
  ['all', 'All', null], ['seed', 'Seeds', ['seed']], ['crop', 'Produce', ['crop']], ['animal', 'Animal goods', ['animal', 'feed']], ['farmer', 'Farmer', null],
];
const CATEGORY_LABEL = { seed: 'Seeds', crop: 'Produce', animal: 'Animal goods', feed: 'Feed' };

// The character sheet: level, tools, machines and what the farmer has done.
function farmerSheet(game) {
  const s = game.state;
  const lv = levelInfo(s);
  const c = s.counters;
  const stat = (label, value) => el('div', { class: 'stat' }, el('small', {}, label), el('strong', {}, String(value)));
  const friends = NPC_LIST.map((n) => el('div', { class: 'friend' }, el('strong', {}, n.name), el('small', {}, levelName(s, n.id))));
  const vehicles = s.vehicles.map((v) => VEHICLES[v.type]?.name).filter(Boolean);
  const imps = s.owned.implements.map((id) => IMPLEMENTS[id]?.name).filter(Boolean);
  return el('div', { class: 'farmer' },
    el('div', { class: 'farmer-top' },
      el('div', { class: 'portrait-big' }, el('img', { src: game.assets.url('player.idle_front'), alt: '' })),
      el('div', { class: 'farmer-level' },
        el('strong', {}, `Farm level ${lv.level}`),
        el('div', { class: 'xpbar' }, el('span', { style: `width:${lv.next ? Math.round((lv.into / lv.span) * 100) : 100}%` })),
        el('small', {}, lv.next ? `${lv.xp} XP · ${lv.next - lv.xp} to level ${lv.level + 1}` : `${lv.xp} XP · top level`),
        el('small', {}, `Day ${clock(s.time).day} · ${s.coins.toLocaleString()} coins · ${s.stats.earned.toLocaleString()} earned in total`))),
    el('h3', {}, 'Equipment'),
    el('div', { class: 'stats' },
      stat('Hoe', 'Basic'), stat('Watering can', `${s.can.capacity} water`), stat('Bag', `${game.bagSlots()} slots`),
      stat('Vehicles', vehicles.length ? vehicles.join(', ') : 'none'), stat('Implements', imps.length ? imps.join(', ') : 'none')),
    el('h3', {}, 'Records'),
    el('div', { class: 'stats' },
      stat('Crops harvested', c.harvest || 0), stat('Items sold', c.sell || 0), stat('Animal goods', c.collect || 0),
      stat('Deliveries', c.deliver || 0), stat('Quests done', c.questsClaimed || 0), stat('Gifts given', c.gifts || 0)),
    el('h3', {}, 'Villagers'),
    el('div', { class: 'friends' }, friends));
}

export class Panels {
  constructor(game) {
    this.game = game;
    this.root = document.getElementById('modal-root');
    this.current = null;
  }

  get open() {
    return !!this.current;
  }

  show(title, body, { wide = false, xwide = false, onClose } = {}) {
    this.close(true);
    const close = el('button', { class: 'close', 'aria-label': 'Close', onclick: () => this.close() }, '✕');
    const panel = el('div', { class: `modal${wide ? ' wide' : ''}${xwide ? ' xwide' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      el('div', { class: 'modal-head' }, el('h2', {}, title), close), body);
    const backdrop = el('div', { class: 'backdrop', onclick: (e) => { if (e.target === backdrop) this.close(); } }, panel);
    this.root.replaceChildren(backdrop);
    this.current = { title, onClose, render: null };
    this.game.sfx.play('click');
    return this.current;
  }

  close(silent = false) {
    if (!this.current) return;
    const cb = this.current.onClose;
    this.current = null;
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    this.root.replaceChildren();
    if (!silent) cb?.();
  }

  rerender() {
    this.current?.render?.();
  }

  // ---- generic message / choice dialog
  dialog(title, text, buttons = [{ label: 'OK' }]) {
    const body = el('div', { class: 'dialog' },
      ...String(text).split('\n\n').map((p) => el('p', {}, p)),
      el('div', { class: 'actions' }, buttons.map((b) => el('button', {
        class: b.primary ? 'primary' : '',
        onclick: guarded(() => { this.close(true); b.action?.(); }),
      }, b.label))));
    this.show(title, body);
  }

  // ---- market stall: sell produce, buy seeds
  shop(tab = 'sell') {
    const game = this.game;
    let current = tab;
    const content = el('div', { class: 'shop' });
    const render = () => {
      const s = game.state;
      const tabs = el('div', { class: 'tabs', role: 'tablist' },
        ['sell', 'buy'].map((t) => el('button', {
          class: `tab${t === current ? ' active' : ''}`, role: 'tab', 'aria-selected': String(t === current),
          onclick: () => { current = t; render(); },
        }, t === 'sell' ? 'Sell produce & fish' : 'Buy seeds & tools')));
      let rows;
      if (current === 'sell') {
        const sellable = Object.entries(s.inventory).filter(([id]) => getItem(id)?.sellPrice != null);
        rows = sellable.length
          ? sellable.map(([id, qty]) => {
            const item = getItem(id);
            const price = sellPrice(s, id);
            return el('div', { class: 'row' },
              el('img', { src: game.assets.url(item.icon), alt: '' }),
              el('div', { class: 'row-main' }, el('strong', {}, item.name), el('small', {}, `You have ${qty} · ${price} coins each`)),
              el('div', { class: 'row-actions' },
                el('button', { 'data-sell': id, onclick: guarded(() => game.sell(id, 1)) }, `Sell 1 (+${price})`),
                el('button', { class: 'primary', 'data-sell-all': id, onclick: guarded(() => game.sell(id, s.inventory[id] || 0)) },
                  `Sell all (+${price * qty})`)));
          })
          : [el('p', { class: 'empty' }, 'You have no produce to sell yet. Harvest crops from your garden first.')];
      } else {
        rows = shopEntries(s).map(({ item, unlocked, lockedText }) => el('div', { class: `row${unlocked ? '' : ' locked'}` },
          el('img', { src: game.assets.url(item.icon), alt: '' }),
          el('div', { class: 'row-main' }, el('strong', {}, item.name),
            el('small', {}, unlocked ? `${item.buyPrice} coins · owned ${s.inventory[item.id] || 0}` : `Locked — ${lockedText}`)),
          el('div', { class: 'row-actions' },
            el('button', { disabled: !unlocked || s.coins < item.buyPrice, 'data-buy': item.id, onclick: guarded(() => game.buy(item.id, 1)) }, `Buy 1 (${item.buyPrice})`),
            item.maxStack > 1 ? el('button', { class: 'primary', disabled: !unlocked || s.coins < item.buyPrice * 5, 'data-buy5': item.id, onclick: guarded(() => game.buy(item.id, 5)) },
              `Buy 5 (${item.buyPrice * 5})`) : null)));
      }
      content.replaceChildren(tabs, el('div', { class: 'rows' }, rows),
        el('div', { class: 'footer' }, el('span', { class: 'coin' }), ` ${s.coins.toLocaleString()} coins`));
    };
    this.show('Market Stall', content, { wide: true, onClose: () => game.autosave('market') }).render = render;
    render();
  }

  // ---- upgrade / land purchase panel
  upgrade(id, title) {
    const game = this.game;
    const content = el('div', { class: 'upgrade' });
    const render = () => {
      const st = upgradeStatus(game.state, id);
      const statusText = {
        owned: 'Already purchased.',
        locked: `Locked — requires: ${st.reason}`,
        unaffordable: `You need ${st.up.cost} coins (you have ${game.state.coins}).`,
        available: 'Ready to purchase.',
      }[st.state];
      content.replaceChildren(
        el('h3', {}, st.up.name),
        el('p', {}, st.up.description),
        el('p', { class: 'cost' }, el('span', { class: 'coin' }), ` ${st.up.cost} coins`),
        el('p', { class: `status ${st.state}` }, statusText),
        el('div', { class: 'actions' },
          el('button', { onclick: () => this.close() }, 'Not now'),
          el('button', { class: 'primary', 'data-upgrade': id, disabled: st.state !== 'available', onclick: guarded(() => game.purchaseUpgrade(id)) },
            st.state === 'owned' ? 'Owned' : `Buy for ${st.up.cost}`)));
    };
    this.show(title, content).render = render;
    render();
  }

  // ---- building planner: upgrade existing buildings, place new ones
  planner(tab = 'upgrade') {
    const game = this.game;
    let current = tab;
    const content = el('div', { class: 'planner' });
    const img = (key) => el('img', { src: game.assets.url(key), alt: '' });
    const statusLine = (info) => ({
      locked: `Locked — requires: ${info.reason}`,
      unaffordable: info.reason,
      building: info.job ? `Under construction — ready at ${formatClock(info.job.end)} (${Math.round(jobProgress(info.job, game.state.time) * 100)}%)` : '',
      max: 'Fully upgraded',
      available: 'Ready to build',
    }[info.state]);
    const render = () => {
      const s = game.state;
      const tabs = el('div', { class: 'tabs', role: 'tablist' },
        [['upgrade', 'Upgrade buildings'], ['build', 'Build & decorate']].map(([t, label]) => el('button', {
          class: `tab${t === current ? ' active' : ''}`, role: 'tab', 'aria-selected': String(t === current),
          onclick: () => { current = t; render(); },
        }, label)));
      let rows;
      if (current === 'upgrade') {
        const targets = [
          ...FIXED_BUILDINGS.map((id) => ({ id })),
          ...s.placed.filter((p) => p.kind === 'building').map((p) => ({ uid: p.uid })),
        ];
        rows = targets.map((t) => {
          const info = upgradeInfo(s, t);
          const lvl = info.rec.job ? info.rec.job.toLevel - 1 : info.rec.level;
          const nextLevel = info.next ? lvl + 1 : null;
          return el('div', { class: `row building-row ${info.state}` },
            el('div', { class: 'level-pics' }, info.current ? img(info.current.sprite) : null,
              info.next ? el('span', { class: 'arrow' }, '→') : null, info.next ? img(info.next.sprite) : null),
            el('div', { class: 'row-main' },
              el('strong', {}, `${info.def.name} · level ${Math.max(lvl, 0)}${nextLevel ? ` → ${nextLevel}` : ''}`),
              el('small', {}, info.next ? info.next.effect : info.current.effect),
              el('small', { class: `status ${info.state}` }, statusLine(info))),
            el('div', { class: 'row-actions' },
              info.next && info.state !== 'building'
                ? el('button', { class: 'primary', 'data-upgrade-building': t.id || t.uid, disabled: info.state !== 'available', onclick: guarded(() => game.startUpgrade(t)) },
                  `Upgrade (${info.next.cost})`)
                : null));
        });
      } else {
        const types = [...Object.values(BUILDINGS).filter((b) => b.placeable).map((b) => b.id), ...Object.keys(DECORATIONS)];
        rows = types.map((type) => {
          const info = placeableInfo(s, type);
          const def = DECORATIONS[type] || BUILDINGS[type];
          const sprite = DECORATIONS[type] ? def.sprite : def.levels[0].sprite;
          const desc = DECORATIONS[type] ? def.desc || 'Decoration' : `${def.levels[0].effect} Takes ${def.levels[0].buildMinutes / 60} hours to build.`;
          return el('div', { class: `row ${info.state === 'locked' ? 'locked' : ''}` }, img(sprite),
            el('div', { class: 'row-main' }, el('strong', {}, def.name), el('small', {}, desc),
              info.state === 'locked' ? el('small', { class: 'status locked' }, `Locked — requires: ${info.reason}`) : null),
            el('div', { class: 'row-actions' },
              el('button', { class: 'primary', 'data-place': type, disabled: info.state !== 'available', onclick: guarded(() => game.startPlacement(type)) },
                `Place (${info.cost})`)));
        });
      }
      content.replaceChildren(tabs, el('div', { class: 'rows' }, rows),
        el('div', { class: 'footer' }, el('span', { class: 'coin' }), ` ${s.coins.toLocaleString()} coins`));
    };
    this.show('Building Planner', content, { wide: true }).render = render;
    render();
  }

  // ---- coop / barn: animals, feeding, collecting, buying, selling
  livestock(uid) {
    const game = this.game;
    const content = el('div', { class: 'livestock' });
    let pendingSell = null; // animal uid awaiting a second tap to confirm
    const render = () => {
      const s = game.state;
      const rec = s.placed.find((p) => p.uid === uid);
      if (!rec) return;
      const def = BUILDINGS[rec.type];
      const herd = animalsAt(s, uid);
      const cap = capacity(rec);
      const ready = readyCount(s, uid);
      const hungry = herd.filter((a) => isHungry(s, a)).length;
      const species = Object.values(SPECIES).filter((sp) => sp.home === rec.type);
      const feedLine = [...new Set(species.map((sp) => sp.feed))].map((id) => `${getItem(id).name}: ${s.inventory[id] || 0}`).join(' · ');

      const rows = herd.length
        ? herd.map((a) => {
          const sp = SPECIES[a.species];
          const confirming = pendingSell === a.uid;
          return el('div', { class: `row animal${isHungry(s, a) ? ' hungry' : ''}`, 'data-animal': a.uid },
            el('img', { src: game.assets.url(`animal.${a.species}_d0`), alt: '' }),
            el('div', { class: 'row-main' },
              el('strong', {}, `${a.name} · ${sp.name}`),
              el('small', { class: isHungry(s, a) ? 'status hungry' : 'status' }, isHungry(s, a) ? 'Hungry' : `Fed for about ${hoursFed(s, a)}h`),
              el('div', { class: 'mood', role: 'img', 'aria-label': `Mood ${moodText(a)}, ${Math.round(a.happiness)} of 100` },
                el('span', { class: 'mood-bar' }, el('span', { style: `width:${Math.round(a.happiness)}%` })),
                el('small', {}, moodText(a))),
              a.stock > 0 ? el('small', { class: 'ready' }, `${productLabel(a.species, a.stock)} ready`) : null),
            el('div', { class: 'row-actions' },
              a.stock > 0 ? el('button', { 'data-collect': a.uid, onclick: guarded(() => game.collectFrom(a.uid)) }, 'Collect') : null,
              el('button', {
                class: confirming ? 'danger' : '', 'data-sell-animal': a.uid,
                onclick: guarded(() => {
                  if (pendingSell === a.uid) { pendingSell = null; game.sellAnimal(a.uid); } else { pendingSell = a.uid; render(); }
                }),
              }, confirming ? `Tap again: sell for ${sellValue(a)}` : `Sell (${sellValue(a)})`)));
        })
        : [el('p', { class: 'empty' }, 'No animals yet. Buy some below.')];

      const buys = species.map((sp) => {
        const full = herd.length >= cap;
        const poor = s.coins < sp.cost;
        return el('button', {
          class: 'primary buy-animal', 'data-buy-animal': sp.id, disabled: full || poor,
          title: full ? 'Full — upgrade the building for more room' : poor ? `Needs ${sp.cost} coins` : '',
          onclick: guarded(() => { pendingSell = null; game.buyAnimal(sp.id, uid); }),
        }, `Buy ${sp.name} (${sp.cost})`);
      });

      content.replaceChildren(
        el('div', { class: 'live-summary' },
          el('strong', {}, `${def.name} · level ${rec.level} · ${herd.length}/${cap} animals`),
          el('small', {}, feedLine)),
        el('div', { class: 'live-actions' },
          el('button', { class: 'primary', 'data-collect-all': true, disabled: ready === 0, onclick: guarded(() => { pendingSell = null; game.collectHome(uid); }) }, `Collect all (${ready})`),
          el('button', { class: 'primary', 'data-feed-all': true, disabled: hungry === 0, onclick: guarded(() => { pendingSell = null; game.feedHome(uid); }) }, `Feed hungry (${hungry})`)),
        el('div', { class: 'rows' }, rows),
        el('div', { class: 'live-buy' }, buys.length && herd.length >= cap ? el('small', { class: 'status locked' }, 'Full — upgrade this building at the workbench for more room.') : null, el('div', { class: 'live-buttons' }, buys)),
        el('div', { class: 'footer' }, el('span', { class: 'coin' }), ` ${s.coins.toLocaleString()} coins`));
    };
    const draw = () => { render(); content.append(moveRow(game, uid)); };
    this.show(BUILDINGS[game.state.placed.find((p) => p.uid === uid)?.type]?.name || 'Livestock', content, { wide: true, onClose: () => game.autosave('livestock') }).render = draw;
    draw();
  }

  // ---- storage shed: move items between bag and shed
  storage(uid) {
    const game = this.game;
    const content = el('div', { class: 'storage' });
    const render = () => {
      const s = game.state;
      const shed = s.placed.find((p) => p.uid === uid);
      if (!shed) return;
      const list = (inv, move, verb, attr) => {
        const entries = Object.entries(inv);
        if (!entries.length) return [el('p', { class: 'empty' }, 'Empty')];
        return entries.map(([id, qty]) => {
          const item = getItem(id);
          return el('div', { class: 'row compact' }, el('img', { src: game.assets.url(item.icon), alt: '' }),
            el('div', { class: 'row-main' }, el('strong', {}, item.name), el('small', {}, `× ${qty}`)),
            el('div', { class: 'row-actions' },
              el('button', { onclick: guarded(() => move(id, 1)) }, `${verb} 1`),
              el('button', { class: 'primary', [attr]: id, onclick: guarded(() => move(id, inv[id] || 0)) }, `${verb} all`)));
        });
      };
      content.replaceChildren(
        el('div', { class: 'columns' },
          el('div', {}, el('h3', {}, `Bag (${slotsUsed(s.inventory)}/${game.bagSlots()})`),
            el('div', { class: 'rows' }, list(s.inventory, (id, q) => game.storeItem(uid, id, q), 'Store', 'data-store-all'))),
          el('div', {}, el('h3', {}, `Shed (${slotsUsed(shed.storage)}/${storageSlots(shed)})`),
            el('div', { class: 'rows' }, list(shed.storage, (id, q) => game.takeItem(uid, id, q), 'Take', 'data-take-all')))));
    };
    const draw = () => { render(); content.append(moveRow(game, uid)); };
    this.show('Storage Shed', content, { wide: true, onClose: () => game.autosave('storage') }).render = draw;
    draw();
  }

  // ---- inventory: items by category, plus the farmer's tools and stats
  bag(tab = 'all') {
    const game = this.game;
    const content = el('div', { class: 'bag' });
    const render = () => {
      const s = game.state;
      const tabs = el('div', { class: 'tabs bag-tabs' }, BAG_TABS.map(([id, label]) => el('button', {
        class: `tab${tab === id ? ' active' : ''}`, 'data-bag-tab': id, onclick: () => { tab = id; render(); } }, label)));
      if (tab === 'farmer') {
        content.replaceChildren(tabs, farmerSheet(game));
        return;
      }
      const cats = BAG_TABS.find(([id]) => id === tab)[2];
      const entries = Object.entries(s.inventory).filter(([id, q]) => q > 0 && (!cats || cats.includes(getItem(id)?.category)));
      const grid = el('div', { class: 'bag-grid', 'aria-label': `${slotsUsed(s.inventory)} of ${game.bagSlots()} slots used` },
        entries.length
          ? entries.map(([id, qty]) => {
            const item = getItem(id);
            const price = sellPrice(s, id);
            return el('div', { class: 'bag-slot', title: item.name, 'data-item': id },
              el('img', { src: game.assets.url(item.icon), alt: '' }), el('span', { class: 'slot-count' }, qty), el('small', {}, item.name),
              el('small', { class: 'worth' }, price ? `${price} each` : CATEGORY_LABEL[item.category] || ''));
          })
          : [el('p', { class: 'empty' }, tab === 'all' ? 'Your bag is empty.' : 'Nothing of this kind in your bag.')]);
      const tools = el('div', { class: 'bag-tools' },
        el('div', { class: 'tool' }, el('img', { src: game.assets.url('icon.tool_hoe'), alt: '' }), el('small', {}, 'Hoe')),
        el('div', { class: 'tool' }, el('img', { src: game.assets.url('icon.tool_watering_can'), alt: '' }), el('small', {}, `Watering can ${s.can.water}/${s.can.capacity}`)));
      content.replaceChildren(tabs, grid,
        el('p', { class: 'muted bag-foot' }, `${slotsUsed(s.inventory)} of ${game.bagSlots()} slots used · `, el('span', { class: 'coin' }), ` ${s.coins.toLocaleString()} coins`),
        tab === 'all' ? tools : null);
    };
    this.show('Bag', content, { wide: true }).render = render;
    render();
  }

  // ---- quest log
  // ---- pause menu
  menu(status = null) {
    const g = this.game;
    const content = el('div', { class: 'menu' },
      status ? el('p', { class: `save-status ${status.ok ? 'ok' : 'bad'}`, role: 'status' }, status.text) : null,
      el('button', { class: 'primary', onclick: () => this.close() }, 'Resume'),
      el('button', { 'data-action': 'save', onclick: guarded(() => g.manualSave()) }, 'Save game'),
      el('button', { 'data-action': 'load', onclick: () => this.confirmLoad() }, 'Load last save'),
      el('button', { 'data-action': 'settings', onclick: () => this.settings() }, 'Settings'),
      el('button', { onclick: () => this.controls() }, 'Controls'),
      el('button', { onclick: () => g.quitToTitle() }, 'Save & quit to title'));
    this.show('Paused', content);
  }

  confirmLoad() {
    const prev = savePreview(this.game.storage);
    if (!prev) {
      this.dialog('Load last save', 'There is no saved game to go back to yet.', [{ label: 'Back', action: () => this.menu() }]);
      return;
    }
    this.dialog('Load last save?',
      `Go back to your save from Day ${clock(prev.time).day}, ${formatClock(prev.time)} (${prev.coins.toLocaleString()} coins)? ` +
      'Anything you did since then will be lost.' + (prev.recovered ? '\n\nThe latest save is damaged; this is the backup.' : ''),
      [{ label: 'Cancel', action: () => this.menu() }, { label: 'Load', primary: true, action: () => this.game.loadLastSave() }]);
  }

  // ---- settings (saved with the game)
  settings() {
    const g = this.game;
    const content = el('div', { class: 'settings' });
    const render = () => {
      const st = g.state.settings;
      const choice = (key, options) => el('div', { class: 'seg', role: 'group' },
        options.map(([value, label]) => el('button', { class: st[key] === value ? 'active' : '', 'data-setting': key, 'data-value': String(value),
          'aria-pressed': String(st[key] === value), onclick: () => { g.changeSetting(key, value); render(); } }, label)));
      const slider = (key, label) => {
        const out = el('span', { class: 'muted' }, `${Math.round(st[key] * 100)}%`);
        const input = el('input', { type: 'range', min: '0', max: '100', step: '5', value: String(Math.round(st[key] * 100)), 'data-setting': key,
          'aria-label': `${label} volume`,
          oninput: (e) => { g.changeSetting(key, Number(e.target.value) / 100, false); out.textContent = `${e.target.value}%`; },
          onchange: () => g.autosave('settings') }); // save once the slider is let go
        return el('div', { class: 'set-row' }, el('strong', {}, label), el('div', { class: 'range' }, input, out));
      };
      content.replaceChildren(
        el('div', { class: 'set-row' }, el('strong', {}, 'Sound'), choice('muted', [[false, 'On'], [true, 'Off']])),
        slider('music', 'Music'), slider('ambience', 'Ambience'), slider('volume', 'Effects'),
        el('div', { class: 'set-row' }, el('strong', {}, 'Vibration'), choice('vibration', [[true, 'On'], [false, 'Off']])),
        el('div', { class: 'set-row' }, el('strong', {}, 'Camera'), choice('zoom', [['near', 'Close'], ['normal', 'Normal'], ['far', 'Far']])),
        el('div', { class: 'set-row' }, el('strong', {}, 'Touch controls'), choice('bigControls', [[false, 'Normal'], [true, 'Large']])),
        el('p', { class: 'muted' }, 'Settings are saved with your game. The game also saves itself every minute, when you sleep and when you leave.'),
        el('div', { class: 'actions' }, el('button', { onclick: () => this.menu() }, 'Back')));
    };
    this.show('Settings', content).render = render;
    render();
  }

  controls() {
    this.dialog('Controls',
      'Move: WASD / arrow keys, or the on-screen stick. Run: hold Shift, or push the stick to its edge.\n\n' +
      'Act / interact: E or Space, or the action button. The action adapts to what you face: till, plant, water, harvest, or use buildings.\n\n' +
      'Hotbar: 1–9 or tap a slot to choose which seeds to plant.\n\n' +
      'B: bag · J: journal · M: map · Esc: pause menu · Enter: claim a completed quest.\n\n' +
      'Tractor: W/S drive, A/D steer, E lowers the implement, F gets off.\n\n' +
      'Gamepad: left stick or d-pad moves, A acts, B gets off / backs out, X bag, Y journal, View map, Start menu, LB/RB hotbar, RT runs. In menus the d-pad moves between buttons and A presses.',
      [{ label: 'Back', action: () => this.menu() }]);
  }

}

installVillagePanels(Panels);
installJournalPanels(Panels);
installVehiclePanels(Panels);
installMapPanel(Panels);
