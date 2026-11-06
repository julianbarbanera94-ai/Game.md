import { QUESTS, QUEST_KINDS } from '../data/quests.js';
import { ACHIEVEMENTS } from '../data/achievements.js';
import { TRACKS, UNLOCKS } from '../data/unlocks.js';
import { rewardText } from '../systems/quests.js';
import { requirementText } from '../systems/economy.js';
import { achievementStatus, achievementValue, unlockMet } from '../systems/progress.js';
import { levelInfo } from '../systems/level.js';
import { activeEvent, calendar, nextEvent } from '../systems/seasons.js';
import { reputation } from '../systems/relations.js';
import { el } from './hud.js';
import { guarded } from './guard.js';

// The journal: quest log (Active / Available / Done), achievements and the
// progression tree. Replaces the simple list that shipped with Phase 1.

const FILTERS = [
  ['active', 'Active', (st) => st === 'active' || st === 'complete'],
  ['available', 'Available', (st) => st === 'available'],
  ['done', 'Done', (st) => st === 'claimed'],
];

const bar = (value, max) => el('div', { class: 'bar' }, el('span', { style: `width:${Math.min(100, Math.round((value / Math.max(1, max)) * 100))}%` }));

export function installJournalPanels(Panels) {
  Panels.prototype.journal = function journal(tab = 'quests') {
    const game = this.game;
    let filter = 'active';
    const content = el('div', { class: 'journal' });

    const header = () => {
      const s = game.state;
      const lv = levelInfo(s);
      const cal = calendar(s.time);
      const ev = activeEvent(s.time);
      const up = nextEvent(s.time);
      return el('div', { class: 'jhead' },
        el('div', { class: 'jlevel' },
          el('strong', {}, `Farm level ${lv.level}`),
          el('small', {}, lv.next ? `${lv.into}/${lv.span} XP to level ${lv.level + 1}` : 'Top level reached'),
          bar(lv.next ? lv.into : 1, lv.next ? lv.span : 1)),
        el('div', { class: 'jseason' },
          el('strong', {}, `${cal.season}, day ${cal.dayOfSeason}`),
          el('small', {}, ev ? `${ev.name} is on! ${ev.blurb}` : up.event ? `${up.event.name} in ${up.inDays} day${up.inDays === 1 ? '' : 's'}` : '')));
    };

    const questCard = (q) => {
      const s = game.state;
      const qs = s.quests[q.id];
      const rewards = `${rewardText(q.reward)} · +${q.xp} XP`;
      return el('div', { class: `jquest ${qs.status}`, 'data-quest-card': q.id },
        el('div', { class: 'jq-head' },
          el('strong', {}, q.title),
          el('span', { class: `badge kind-${q.kind}` }, QUEST_KINDS[q.kind] || q.kind)),
        el('p', {}, q.description),
        el('ul', {}, q.objectives.map((o, i) => el('li', { class: qs.progress[i] >= o.count ? 'done' : '' },
          el('span', {}, `${o.label}: ${qs.progress[i]}/${o.count}`), bar(qs.progress[i], o.count)))),
        el('small', {}, `Reward: ${rewards} · From: ${q.giver}${q.repeatDays ? ` · Repeats every ${q.repeatDays} days` : ''}`),
        el('div', { class: 'jq-actions' },
          qs.status === 'complete' ? el('button', { class: 'primary', 'data-claim': q.id, onclick: guarded(() => game.claimQuest(q.id)) }, 'Claim reward') : null,
          qs.status === 'available' ? el('button', { class: 'primary', 'data-accept-quest': q.id, onclick: guarded(() => game.acceptQuest(q.id)) }, 'Accept quest') : null,
          qs.status === 'active' && q.optional ? el('button', { 'data-abandon': q.id, onclick: guarded(() => game.abandonQuest(q.id)) }, 'Put down') : null));
    };

    const questsView = () => {
      const s = game.state;
      const counts = Object.fromEntries(FILTERS.map(([id, , test]) => [id, QUESTS.filter((q) => test(s.quests[q.id].status)).length]));
      const chips = el('div', { class: 'tabs chips', role: 'tablist' }, FILTERS.map(([id, label]) => el('button', {
        class: `tab${filter === id ? ' active' : ''}`, role: 'tab', 'data-filter': id, 'aria-selected': String(filter === id),
        onclick: () => { filter = id; render(); },
      }, `${label} (${counts[id]})`)));
      const test = FILTERS.find(([id]) => id === filter)[2];
      // finished quests first so a waiting reward is never buried
      const list = QUESTS.filter((q) => test(s.quests[q.id].status)).sort((a, b) => (s.quests[b.id].status === 'complete') - (s.quests[a.id].status === 'complete'));
      const empty = {
        active: 'Nothing in progress. Check Available for optional quests.',
        available: 'No optional quests right now. More appear as you progress.',
        done: 'No completed quests yet.',
      }[filter];
      return [chips, ...(list.length ? list.map(questCard) : [el('p', { class: 'empty' }, empty)])];
    };

    const achievementsView = () => {
      const s = game.state;
      const ready = ACHIEVEMENTS.filter((a) => achievementStatus(s, a) === 'ready').length;
      return [
        el('p', { class: 'muted' }, `${ACHIEVEMENTS.filter((a) => achievementStatus(s, a) === 'claimed').length}/${ACHIEVEMENTS.length} claimed${ready ? ` · ${ready} ready to claim` : ''}`),
        ...ACHIEVEMENTS.map((a) => {
          const st = achievementStatus(s, a);
          const value = Math.min(a.target, achievementValue(s, a));
          return el('div', { class: `jquest ach ${st}`, 'data-ach': a.id },
            el('div', { class: 'jq-head' }, el('strong', {}, a.name), el('span', { class: 'badge' }, a.track)),
            el('p', {}, a.text),
            el('div', { class: 'prog' }, el('span', {}, `${value.toLocaleString()}/${a.target.toLocaleString()}`), bar(value, a.target)),
            el('small', {}, `Reward: ${a.reward.coins} coins · +${a.reward.xp} XP`),
            el('div', { class: 'jq-actions' },
              st === 'ready' ? el('button', { class: 'primary', 'data-claim-ach': a.id, onclick: guarded(() => game.claimAchievement(a.id)) }, 'Claim') : null,
              st === 'claimed' ? el('span', { class: 'tick' }, '✔ Claimed') : null));
        }),
      ];
    };

    const progressView = () => {
      const s = game.state;
      const sections = TRACKS.map((track) => {
        const entries = UNLOCKS.filter((u) => u.track === track);
        return el('div', { class: 'track' },
          el('h3', {}, track),
          el('ul', {}, entries.map((u) => {
            const met = unlockMet(s, u);
            return el('li', { class: met ? 'open' : 'shut', 'data-unlock': u.id },
              el('span', { class: 'lock' }, met ? '✔' : '🔒'),
              el('span', {}, u.name),
              met ? null : el('small', {}, u.requires?.comingSoon ? (u.note || 'Coming later') : requirementText(u.requires)));
          })));
      });
      const lv = levelInfo(s);
      return [
        el('p', { class: 'muted' }, `Farm level ${lv.level} · village reputation ${reputation(s)} · ${UNLOCKS.filter((u) => unlockMet(s, u)).length}/${UNLOCKS.length} unlocked`),
        ...sections,
      ];
    };

    const render = () => {
      const tabs = [['quests', 'Quests'], ['achievements', 'Achievements'], ['progress', 'Progress']];
      const readyAch = ACHIEVEMENTS.filter((a) => achievementStatus(game.state, a) === 'ready').length;
      const nav = el('div', { class: 'tabs', role: 'tablist' }, tabs.map(([id, label]) => el('button', {
        class: `tab${tab === id ? ' active' : ''}`, role: 'tab', 'data-tab': id, 'aria-selected': String(tab === id),
        onclick: () => { tab = id; render(); },
      }, id === 'achievements' && readyAch ? `${label} (${readyAch})` : label)));
      const body = tab === 'quests' ? questsView() : tab === 'achievements' ? achievementsView() : progressView();
      content.replaceChildren(header(), nav, el('div', { class: 'jbody' }, body));
    };
    this.show('Journal', content, { wide: true }).render = render;
    render();
  };
}
