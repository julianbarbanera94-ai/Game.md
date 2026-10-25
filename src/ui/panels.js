import { getItem } from '../data/items.js';
import { QUESTS } from '../data/quests.js';
import { shopEntries, upgradeStatus } from '../systems/economy.js';
import { rewardText } from '../systems/quests.js';
import { el } from './hud.js';

// Full-screen / modal interfaces. Every panel closes with Esc, the close
// button or a click on the backdrop, and returns control to gameplay.

// Guards against double-taps triggering a transaction twice. The cooldown is
// shared by every panel button because panels re-render (replacing their
// buttons) after each transaction, so a per-button flag would reset.
const ACTION_COOLDOWN_MS = 350;
let lastActionAt = 0;
function guarded(fn) {
  return (e) => {
    const now = performance.now();
    if (now - lastActionAt < ACTION_COOLDOWN_MS) return;
    lastActionAt = now;
    fn(e);
  };
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

  show(title, body, { wide = false, onClose } = {}) {
    this.close(true);
    const close = el('button', { class: 'close', 'aria-label': 'Close', onclick: () => this.close() }, '✕');
    const panel = el('div', { class: `modal${wide ? ' wide' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
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
        }, t === 'sell' ? 'Sell produce' : 'Buy seeds')));
      let rows;
      if (current === 'sell') {
        const sellable = Object.entries(s.inventory).filter(([id]) => getItem(id)?.sellPrice != null);
        rows = sellable.length
          ? sellable.map(([id, qty]) => {
            const item = getItem(id);
            return el('div', { class: 'row' },
              el('img', { src: game.assets.url(item.icon), alt: '' }),
              el('div', { class: 'row-main' }, el('strong', {}, item.name), el('small', {}, `You have ${qty} · ${item.sellPrice} coins each`)),
              el('div', { class: 'row-actions' },
                el('button', { 'data-sell': id, onclick: guarded(() => game.sell(id, 1)) }, `Sell 1 (+${item.sellPrice})`),
                el('button', { class: 'primary', 'data-sell-all': id, onclick: guarded(() => game.sell(id, s.inventory[id] || 0)) },
                  `Sell all (+${item.sellPrice * qty})`)));
          })
          : [el('p', { class: 'empty' }, 'You have no produce to sell yet. Harvest crops from your garden first.')];
      } else {
        rows = shopEntries(s).map(({ item, unlocked, lockedText }) => el('div', { class: `row${unlocked ? '' : ' locked'}` },
          el('img', { src: game.assets.url(item.icon), alt: '' }),
          el('div', { class: 'row-main' }, el('strong', {}, item.name),
            el('small', {}, unlocked ? `${item.buyPrice} coins · owned ${s.inventory[item.id] || 0}` : `Locked — ${lockedText}`)),
          el('div', { class: 'row-actions' },
            el('button', { disabled: !unlocked || s.coins < item.buyPrice, 'data-buy': item.id, onclick: guarded(() => game.buy(item.id, 1)) }, `Buy 1 (${item.buyPrice})`),
            el('button', { class: 'primary', disabled: !unlocked || s.coins < item.buyPrice * 5, 'data-buy5': item.id, onclick: guarded(() => game.buy(item.id, 5)) },
              `Buy 5 (${item.buyPrice * 5})`))));
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

  // ---- inventory
  bag() {
    const s = this.game.state;
    const entries = Object.entries(s.inventory);
    const grid = el('div', { class: 'bag-grid' },
      entries.length
        ? entries.map(([id, qty]) => {
          const item = getItem(id);
          return el('div', { class: 'bag-slot', title: item.name },
            el('img', { src: this.game.assets.url(item.icon), alt: '' }), el('span', { class: 'slot-count' }, qty), el('small', {}, item.name));
        })
        : [el('p', { class: 'empty' }, 'Your bag is empty.')]);
    const tools = el('p', { class: 'muted' }, `Tools: Hoe · Watering can (${s.can.water}/${s.can.capacity})`);
    this.show('Bag', el('div', {}, grid, tools));
  }

  // ---- quest log
  journal() {
    const s = this.game.state;
    const content = el('div', { class: 'journal' });
    const render = () => {
      const list = QUESTS.filter((q) => s.quests[q.id].status !== 'locked').map((q) => {
        const qs = s.quests[q.id];
        return el('div', { class: `jquest ${qs.status}` },
          el('div', { class: 'jq-head' }, el('strong', {}, q.title), el('span', { class: 'badge' }, qs.status)),
          el('p', {}, q.description),
          el('ul', {}, q.objectives.map((o, i) => el('li', {}, `${o.label}: ${qs.progress[i]}/${o.count}`))),
          el('small', {}, `Reward: ${rewardText(q.reward)} · From: ${q.giver}`),
          qs.status === 'complete' ? el('button', { class: 'primary', onclick: guarded(() => { this.game.claimQuest(q.id); render(); }) }, 'Claim reward') : null);
      });
      content.replaceChildren(...list);
    };
    this.show('Journal', content, { wide: true }).render = render;
    render();
  }

  // ---- pause menu
  menu() {
    const g = this.game;
    const content = el('div', { class: 'menu' },
      el('button', { class: 'primary', onclick: () => this.close() }, 'Resume'),
      el('button', { 'data-action': 'save', onclick: guarded(() => g.manualSave()) }, 'Save game'),
      el('button', { onclick: () => { g.toggleMute(); this.menu(); } }, g.state.settings.muted ? 'Sound: off' : 'Sound: on'),
      el('button', { onclick: () => this.controls() }, 'Controls'),
      el('button', { onclick: () => g.quitToTitle() }, 'Save & quit to title'));
    this.show('Paused', content);
  }

  controls() {
    this.dialog('Controls',
      'Move: WASD / arrow keys, or the on-screen stick.\n\n' +
      'Act / interact: E or Space, or the action button. The action adapts to what you face: till, plant, water, harvest, or use buildings.\n\n' +
      'Hotbar: 1–9 or tap a slot to choose which seeds to plant.\n\n' +
      'B: bag · J: journal · Esc: pause menu · Enter: claim a completed quest.',
      [{ label: 'Back', action: () => this.menu() }]);
  }
}
