// Showing and filling in the screens: title, lobby, in-game HUD and results.
import { MAX_PLAYERS } from '../shared/constants';
import { PRIZE_TYPES } from '../shared/prizes';
import type { RoundResult, Snapshot } from '../shared/protocol';
import { UPGRADES, upgradeSummary } from '../shared/upgrades';
import { S, isPlaying, publicRoster, type Screen } from './context';
import { $, escapeHtml, plural } from './dom';
import { hasPicked, syncDraft } from './draft';

export const show = (screen: Screen) => {
  S.screen = screen;

  for (const id of ['title', 'lobby', 'results'] as const) {
    $(id).classList.toggle('hidden', id !== screen);
  }

  $('hud').classList.toggle('hidden', screen !== 'game');

  const playing = screen === 'game' && isPlaying();

  $('grab').classList.toggle('hidden', !playing);
  $('spectate').classList.toggle('hidden', !(screen === 'game' && !playing));
  $('lookHint').classList.toggle('hidden', screen !== 'game');
  document.body.classList.toggle('frenzy', false);

  if (screen !== 'game') {
    syncDraft(undefined);
  }
};

// ---------- lobby ----------

export const renderLobby = () => {
  const isHost = S.role === 'host';
  const list = isHost ? publicRoster() : S.lobby?.players ?? [];
  const open = MAX_PLAYERS - list.length;
  const rows = list.map((p, i) => {
    const badges = [
      i === S.you ? '<em>you</em>' : '',
      p.kind === 'host' ? '<span class="badge">host</span>' : '',
      p.kind === 'local' ? `<span class="badge">key ${escapeHtml(p.keyLabel)}</span>` : '',
      p.connected === false ? '<span class="badge">left</span>' : '',
    ].join('');
    const remove = isHost && p.kind === 'local' ? `<button class="x" data-rm="${i}" title="Remove">✕</button>` : '';

    return `<li style="--c:${p.color}"><span class="dot"></span><span class="nm">${escapeHtml(p.name)}</span>${badges}${remove}</li>`;
  });

  if (open > 0) {
    rows.push(`<li class="empty">${plural(open, 'open slot')}</li>`);
  }

  $('lobbyCode').textContent = S.code;
  $('playerList').innerHTML = rows.join('');
  $('hostControls').classList.toggle('hidden', !isHost);
  $('waitMsg').classList.toggle('hidden', isHost);
  $<HTMLButtonElement>('btnLocal').disabled = list.length >= MAX_PLAYERS;
};

// ---------- in-game HUD ----------

/** Last scoreboard and upgrade list drawn, so they're only rebuilt when something changes. */
let scoreboardKey = '';
let upgradesKey = '';

export const resetHud = () => {
  scoreboardKey = '';
  upgradesKey = '';
  $('timer').textContent = '';
  $('myUps').innerHTML = '';
  syncDraft(undefined);
};

/** Your upgrades, under the timer. */
const renderMyUpgrades = (owned: number[]) => {
  const key = owned.join(',');

  if (key === upgradesKey) {
    return;
  }

  upgradesKey = key;
  $('myUps').innerHTML = [...new Set(owned)]
    .map((u) => {
      const n = owned.filter((x) => x === u).length;

      const tip = `${UPGRADES[u].name}: ${UPGRADES[u].desc}`;

      // focusable so a tap shows the tooltip on phones (no hover there)
      return `<span tabindex="0" data-tip="${escapeHtml(tip)}">${UPGRADES[u].emoji}${n > 1 ? `<b>${n}</b>` : ''}</span>`;
    })
    .join('');
};

export const updateHud = (snap: Snapshot) => {
  if (!S.round) {
    return;
  }

  const players = S.round.players;
  const timer = $('timer');

  timer.textContent = String(snap.tm);
  timer.classList.toggle('low', snap.ph === 'play' && snap.tm <= 10);

  let order = players.map((_, i) => i).sort((a, b) => (snap.sc[b] ?? 0) - (snap.sc[a] ?? 0));

  if (innerWidth < 640 && order.length > 4) {
    order = order.filter((i, rank) => rank < 3 || i === S.you); // compact on phones
  }

  const key = order.map((i) => `${i}:${snap.sc[i]}`).join(',');

  if (key !== scoreboardKey) {
    scoreboardKey = key;
    $('scores').innerHTML = order
      .map((i) => `<li class="${i === S.you ? 'me' : ''}" style="--c:${players[i].color}"><span class="dot"></span><span class="nm">${escapeHtml(players[i].name)}</span><b>${snap.sc[i] ?? 0}</b></li>`)
      .join('');
  }

  const mine = snap.c[S.you];
  const drafting = snap.ph === 'draft';
  const busy = drafting ? hasPicked(S.you) : !mine || mine[4] === 1 || snap.ph !== 'play';

  $('grab').classList.toggle('busy', busy);
  $('grab').classList.toggle('pick', drafting);
  $('grab').querySelector('span')!.textContent = drafting ? 'PICK' : 'GRAB';
  renderMyUpgrades(snap.up?.[S.you] ?? []);
  document.body.classList.toggle('frenzy', !!snap.fz);
};

// ---------- results ----------

const MEDALS = ['🥇', '🥈', '🥉'];

export const showResults = (results: RoundResult[]) => {
  S.lastResults = results;

  const order = results.map((r, i) => ({ ...r, i })).sort((a, b) => b.score - a.score);
  const rows = order.map((r, rank) => {
    const ups = r.ups?.length ? ` · ${upgradeSummary(r.ups)}` : '';
    const stats = `${plural(r.prizes, 'prize')} · ${plural(r.slips, 'slip')}${r.bombs ? ` · ${r.bombs} 💣` : ''}${ups}`;

    return `<li style="--c:${r.color}" class="${r.i === S.you ? 'me' : ''}"><span class="rank">${MEDALS[rank] || rank + 1}</span><span class="dot"></span><span class="nm">${escapeHtml(r.name)}<small>${stats}</small></span><b>${r.score}</b></li>`;
  });
  const mostRigged = order.reduce<(typeof order)[number] | null>((a, b) => (b.slips > (a ? a.slips : 0) ? b : a), null);

  $('resultTitle').textContent = order.length > 1 ? `${order[0].name} wins!` : `Final score: ${order[0].score}`;
  $('resultList').innerHTML = rows.join('');
  $('awards').innerHTML = mostRigged
    ? `😭 Most rigged: <b>${escapeHtml(mostRigged.name)}</b> (${plural(mostRigged.slips, 'prize')} slipped away)`
    : '';
  $('resultHost').classList.toggle('hidden', S.role !== 'host');
  $('resultWait').classList.toggle('hidden', S.role === 'host');
  show('results');
};

// ---------- title ----------

/** Prize legend on the title screen, grouped by points, e.g. "🐥🐷🐱🐶🐰 10". */
export const renderLegend = () => {
  const tiers = new Map<string, typeof PRIZE_TYPES>();

  for (const t of PRIZE_TYPES) {
    tiers.set(String(t.pts), [...(tiers.get(String(t.pts)) ?? []), t]);
  }

  $('legend').innerHTML = [...tiers]
    .map(([pts, list]) => `<span title="${list.map((t) => t.name).join(', ')}">${list.map((t) => t.emoji).join('')}<b>${pts}</b></span>`)
    .join('');
};
