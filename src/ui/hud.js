import { getItem } from '../data/items.js';
import { clock, darkness, formatClock } from '../systems/time.js';
import { trackedQuests, rewardText } from '../systems/quests.js';

// Heads-up display (DOM). Reads game state each frame and only touches the
// DOM when something visible changed.

export function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v === true) e.setAttribute(k, '');
    else if (v !== false && v != null) e.setAttribute(k, v);
  }
  for (const c of children.flat()) if (c != null) e.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return e;
}

export class Hud {
  constructor(game) {
    this.game = game;
    this.root = document.getElementById('hud');
    this.dayEl = document.getElementById('clock-day');
    this.timeEl = document.getElementById('clock-time');
    this.coinsEl = document.getElementById('coins');
    this.questsEl = document.getElementById('quest-tracker');
    this.promptEl = document.getElementById('prompt');
    this.hotbarEl = document.getElementById('hotbar');
    this.toastsEl = document.getElementById('toasts');
    this.sunEl = document.querySelector('.clock .sun');
    this.touch = window.matchMedia('(pointer: coarse)').matches;
    this.cache = {};
  }

  set(key, value, fn) {
    if (this.cache[key] === value) return;
    this.cache[key] = value;
    fn(value);
  }

  update() {
    const { state, target } = this.game;
    const c = clock(state.time);
    this.set('day', `Day ${c.day}`, (v) => (this.dayEl.textContent = v));
    this.set('time', formatClock(state.time), (v) => (this.timeEl.textContent = v));
    this.set('night', darkness(state.time) > 0.4, (v) => this.sunEl.classList.toggle('moon', v));
    this.set('coins', state.coins, (v) => (this.coinsEl.textContent = v.toLocaleString()));

    const prompt = target && !this.game.uiOpen ? `${target.ok ? '1' : '0'}|${target.label}` : '';
    this.set('prompt', prompt, () => {
      this.promptEl.hidden = !prompt;
      if (!prompt) return;
      this.promptEl.className = `prompt${target.ok ? '' : ' prompt-disabled'}`;
      this.promptEl.replaceChildren(el('span', { class: 'key' }, target.ok ? (this.touch ? 'A' : 'E') : '•'), el('span', {}, target.label));
    });

    const quests = trackedQuests(state);
    const qsig = JSON.stringify(quests.map((q) => [q.def.id, q.state.status, q.state.progress]));
    this.set('quests', qsig, () => this.renderQuests(quests));

    const hsig = JSON.stringify([state.inventory, state.selectedSeed, state.can, this.game.activeTool]);
    this.set('hotbar', hsig, () => this.renderHotbar());
  }

  renderQuests(quests) {
    const items = quests.slice(0, 3).map(({ def, state: qs }) => {
      if (qs.status === 'complete') {
        return el('div', { class: 'quest complete' },
          el('div', { class: 'quest-title' }, `✔ ${def.title}`),
          el('button', { class: 'claim', 'data-quest': def.id, onclick: () => this.game.claimQuest(def.id) },
            `Claim: ${rewardText(def.reward)}`));
      }
      const obj = def.objectives.map((o, i) => el('div', { class: `objective${qs.progress[i] >= o.count ? ' done' : ''}` },
        el('span', {}, o.label), el('span', { class: 'count' }, `${qs.progress[i]}/${o.count}`)));
      return el('div', { class: 'quest' }, el('div', { class: 'quest-title' }, def.title), obj);
    });
    this.questsEl.replaceChildren(el('div', { class: 'panel-heading' }, 'Quests'), ...items);
    this.questsEl.hidden = items.length === 0;
  }

  hotbarSlots() {
    const { state } = this.game;
    const slots = [
      { id: 'hoe', icon: 'icon.tool_hoe', label: 'Hoe', kind: 'tool' },
      { id: 'can', icon: 'icon.tool_watering_can', label: 'Watering can', kind: 'tool', count: `${state.can.water}/${state.can.capacity}`, meter: state.can.water / state.can.capacity },
    ];
    for (const [id, qty] of Object.entries(state.inventory)) {
      const item = getItem(id);
      if (item?.category === 'seed') slots.push({ id, icon: item.icon, label: item.name, kind: 'seed', count: qty });
    }
    return slots;
  }

  renderHotbar() {
    const { state } = this.game;
    const slots = this.hotbarSlots().slice(0, 9);
    this.hotbarEl.replaceChildren(...slots.map((s, i) => {
      const selected = (s.kind === 'seed' && s.id === state.selectedSeed) || (s.kind === 'tool' && this.game.activeTool === s.id);
      return el('button', {
        class: `slot${selected ? ' selected' : ''}`, title: s.label, 'aria-label': s.label,
        onclick: () => this.game.selectSlot(i),
      },
      el('span', { class: 'slot-key' }, i + 1),
      el('img', { src: this.game.assets.url(s.icon), alt: '' }),
      s.count != null ? el('span', { class: 'slot-count' }, s.count) : null,
      s.meter != null ? el('span', { class: 'meter' }, el('span', { style: `width:${Math.round(s.meter * 100)}%` })) : null);
    }));
  }

  toast(text, kind = 'info') {
    const t = el('div', { class: `toast ${kind}`, role: 'status' }, text);
    this.toastsEl.append(t);
    while (this.toastsEl.children.length > 4) this.toastsEl.firstChild.remove();
    setTimeout(() => t.classList.add('out'), 2600);
    setTimeout(() => t.remove(), 3100);
  }
}
