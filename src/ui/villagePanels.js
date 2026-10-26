import { NPCS } from '../data/npcs.js';
import { getItem } from '../data/items.js';
import { clock } from '../systems/time.js';
import { periodOf } from '../data/npcs.js';
import * as Relations from '../systems/relations.js';
import * as Orders from '../systems/orders.js';
import * as Shops from '../systems/shops.js';
import { el } from './hud.js';
import { guarded } from './guard.js';

// Village interfaces: villager dialogue, the notice board, the General Store
// and the trader. Installed onto Panels (see panels.js).

const initials = (name) => name.slice(0, 1).toUpperCase();

function orderRow(game, ord, { showGiver = false, showAccept = false, showDeliver = false } = {}) {
  const s = game.state;
  const npc = NPCS[ord.giver];
  const owned = Orders.have(s, ord);
  const left = Orders.daysLeft(s, ord);
  const item = getItem(ord.item);
  const can = owned >= ord.qty;
  return el('div', { class: `row order${ord.status === 'accepted' ? ' accepted' : ''}`, 'data-order': ord.id },
    el('img', { src: game.assets.url(item.icon), alt: '' }),
    el('div', { class: 'row-main' },
      el('strong', {}, `${ord.qty} × ${item.name}`),
      el('small', {}, `${showGiver ? `${npc.name} (${npc.place}) · ` : ''}Reward ${ord.coins} coins + friendship · ${left <= 0 ? 'last day!' : `${left} day${left === 1 ? '' : 's'} left`}`
        + (ord.status === 'accepted' ? ` · you have ${owned}/${ord.qty}` : ''))),
    el('div', { class: 'row-actions' },
      showAccept ? el('button', { class: 'primary', 'data-accept': ord.id, onclick: guarded(() => game.acceptOrder(ord.id)) }, 'Accept') : null,
      showDeliver ? el('button', { class: 'primary', 'data-deliver': ord.id, disabled: !can, onclick: guarded(() => game.deliverOrder(ord.id, ord.giver)) },
        can ? 'Hand over' : `Need ${ord.qty - owned} more`) : null));
}

export function installVillagePanels(Panels) {
  // ---- villager dialogue with numbered choices
  Panels.prototype.talk = function talk(npcId) {
    const game = this.game;
    const def = NPCS[npcId];
    const talked = Relations.talk(game.state, npcId, game.bus);
    if (talked.gained) game.hud.toast(`+${talked.gained} friendship with ${def.name}`, 'good');
    if (talked.levelUp) game.hud.toast(`${def.name} now counts you as: ${talked.levelUp}`, 'quest');
    const day = clock(game.state.time).day;
    const period = periodOf(clock(game.state.time).minuteOfDay);
    const greetings = def.lines[period];
    let view = 'main';
    let said = greetings[day % greetings.length];
    let chatCount = 0;
    const content = el('div', { class: 'talk' });
    let choices = [];

    const render = () => {
      const s = game.state;
      const lvl = Relations.levelName(s, npcId);
      const next = Relations.nextLevel(s, npcId);
      const head = el('div', { class: 'talk-head' },
        el('div', { class: 'portrait', style: `background:${def.accent}` }, initials(def.name)),
        el('div', {}, el('strong', {}, def.name), el('small', {}, `${def.role} · ${lvl}${next ? ` (${next.needed} to ${next.name})` : ''}`)));
      const bubble = el('p', { class: 'say' }, said);
      choices = [];
      const choice = (label, fn, opts = {}) => choices.push({ label, fn, ...opts });

      if (view === 'main') {
        if (def.shop === 'general') choice('Show me your wares.', () => { game.panels.generalStore(); });
        if (def.shop === 'trader') choice('I have goods to sell.', () => { game.panels.trader(); });
        const mine = Orders.offersFor(s, npcId);
        const ready = mine.filter((o) => o.status === 'accepted' && Orders.have(s, o) >= o.qty);
        for (const o of ready) {
          choice(`Hand over ${Orders.describe(o)} (+${o.coins} coins).`, () => {
            const r = game.deliverOrder(o.id, npcId);
            said = r.ok ? 'Wonderful, exactly what I needed. Thank you!' : r.reason;
            render();
          }, { primary: true });
        }
        choice(mine.length ? `Any work for me? (${mine.length} request${mine.length === 1 ? '' : 's'})` : 'Any work for me?', () => { view = 'work'; said = mine.length ? 'As a matter of fact, yes.' : "Nothing from me just now — check the notice board in the square."; render(); });
        choice('How are you?', () => {
          const lines = def.chat[Relations.level(s, npcId)];
          said = lines[(day + chatCount++) % lines.length];
          render();
        });
        choice('Goodbye.', () => game.panels.close());
      } else {
        const mine = Orders.offersFor(s, npcId);
        choice('Back.', () => { view = 'main'; said = greetings[day % greetings.length]; render(); });
        content.dataset.view = 'work';
        const rows = mine.length
          ? mine.map((o) => orderRow(game, o, { showAccept: o.status === 'open', showDeliver: o.status === 'accepted' }))
          : [el('p', { class: 'empty' }, 'No requests right now.')];
        content.replaceChildren(head, bubble, el('div', { class: 'rows' }, rows),
          el('div', { class: 'choices' }, choices.map((c, i) => el('button', { 'data-choice': i + 1, onclick: guarded(c.fn) }, `${i + 1}. ${c.label}`))));
        return;
      }
      content.dataset.view = 'main';
      content.replaceChildren(head, bubble,
        el('div', { class: 'choices' }, choices.map((c, i) => el('button', { class: c.primary ? 'primary' : '', 'data-choice': i + 1, onclick: guarded(c.fn) }, `${i + 1}. ${c.label}`))));
    };

    const panel = this.show(def.name, content, { onClose: () => game.autosave('talk') });
    panel.render = render;
    panel.onKey = (e) => {
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && choices[n - 1]) {
        guarded(choices[n - 1].fn)();
        return true;
      }
      return false;
    };
    render();
  };

  // ---- notice board: every open and accepted request
  Panels.prototype.board = function board() {
    const game = this.game;
    const content = el('div', { class: 'board' });
    const render = () => {
      const s = game.state;
      Orders.rollover(s);
      const accepted = Orders.acceptedOrders(s);
      const offers = Orders.openOffers(s);
      content.replaceChildren(
        el('p', { class: 'muted' }, 'Accept a request, then bring the goods to the villager who posted it and talk to them to hand them over.'),
        el('h3', {}, `Your requests (${accepted.length}/${Orders.MAX_ACCEPTED})`),
        el('div', { class: 'rows' }, accepted.length
          ? accepted.map((o) => orderRow(game, o, { showGiver: true }))
          : [el('p', { class: 'empty' }, 'None accepted yet.')]),
        el('h3', {}, 'New requests'),
        el('div', { class: 'rows' }, offers.length
          ? offers.map((o) => orderRow(game, o, { showGiver: true, showAccept: true }))
          : [el('p', { class: 'empty' }, 'No new requests today. New ones are posted every morning.')]));
    };
    this.show('Notice Board', content, { wide: true, onClose: () => game.autosave('board') }).render = render;
    render();
  };

  // ---- General Store (Mara): limited daily stock, friendship discount
  Panels.prototype.generalStore = function generalStore() {
    const game = this.game;
    const content = el('div', { class: 'shop' });
    const render = () => {
      const s = game.state;
      const disc = Relations.discount(s, 'mara');
      const rows = Shops.storeEntries(s).map(({ item, price, unlocked, lockedText, left }) => el('div', { class: `row${unlocked ? '' : ' locked'}` },
        el('img', { src: game.assets.url(item.icon), alt: '' }),
        el('div', { class: 'row-main' }, el('strong', {}, item.name),
          el('small', {}, unlocked ? `${price} coins · ${left} left today · owned ${s.inventory[item.id] || 0}` : `Locked — ${lockedText}`)),
        el('div', { class: 'row-actions' },
          el('button', { disabled: !unlocked || left < 1 || s.coins < price, 'data-store-buy': item.id, onclick: guarded(() => game.storeBuy(item.id, 1)) }, `Buy 1 (${price})`),
          el('button', { class: 'primary', disabled: !unlocked || left < 5 || s.coins < price * 5, 'data-store-buy5': item.id, onclick: guarded(() => game.storeBuy(item.id, 5)) }, `Buy 5 (${price * 5})`))));
      content.replaceChildren(
        el('p', { class: 'muted' }, disc ? `Mara's friend discount: ${Math.round(disc * 100)}% off. Stock is limited each day.` : 'Stock is limited each day. Friends of the store get a discount.'),
        el('div', { class: 'rows' }, rows),
        el('div', { class: 'footer' }, el('span', { class: 'coin' }), ` ${s.coins.toLocaleString()} coins`));
    };
    this.show('General Store', content, { wide: true, onClose: () => game.autosave('store') }).render = render;
    render();
  };

  // ---- Tobias the trader: premium price for the first units of each product per day
  Panels.prototype.trader = function trader() {
    const game = this.game;
    const content = el('div', { class: 'shop' });
    const render = () => {
      const s = game.state;
      const sellable = Object.entries(s.inventory).filter(([id]) => getItem(id)?.sellPrice != null);
      const rows = sellable.length
        ? sellable.map(([id, qty]) => {
          const item = getItem(id);
          const unit = Shops.traderUnit(s, id, 0);
          const demand = Shops.traderDemandLeft(s, id);
          return el('div', { class: 'row' },
            el('img', { src: game.assets.url(item.icon), alt: '' }),
            el('div', { class: 'row-main' }, el('strong', {}, item.name),
              el('small', {}, `You have ${qty} · ${unit} coins each${demand ? ` (premium for ${demand} more today)` : ' (premium used up today)'}`)),
            el('div', { class: 'row-actions' },
              el('button', { 'data-trade': id, onclick: guarded(() => game.traderSell(id, 1)) }, `Sell 1 (+${unit})`),
              el('button', { class: 'primary', 'data-trade-all': id, onclick: guarded(() => game.traderSell(id, s.inventory[id] || 0)) }, `Sell all (+${Shops.traderQuote(s, id, qty)})`)));
        })
        : [el('p', { class: 'empty' }, 'You have nothing Tobias wants. He buys crops, eggs, milk and wool.')];
      content.replaceChildren(
        el('p', { class: 'muted' }, `Tobias pays ${Math.round((Shops.TRADER_PREMIUM - 1) * 100)}% extra for the first ${Shops.TRADER_DAILY_DEMAND} of each product every day. Spread your sales across different goods.`),
        el('div', { class: 'rows' }, rows),
        el('div', { class: 'footer' }, el('span', { class: 'coin' }), ` ${s.coins.toLocaleString()} coins`));
    };
    this.show("Tobias's Stall", content, { wide: true, onClose: () => game.autosave('trader') }).render = render;
    render();
  };
}
