// The upgrade pick overlay: three cards per player on this device, with a cursor that cycles over them.
// The cursor runs off the pick's clock from the host, extrapolated between snapshots, so every screen
// shows (nearly) the same card lit; a client's press sends the card *its* screen showed.
import { sfx } from '../audio/sfx';
import type { DraftState } from '../shared/protocol';
import { UPGRADES, draftCursor } from '../shared/upgrades';
import { S } from './context';
import { $, escapeHtml } from './dom';

let draft: DraftState | null = null;
/** Local clock for the pick (seconds since it started), advanced every frame. */
let t = 0;
/** Picks made on this device that the host hasn't confirmed yet, by seat. */
const pending = new Map<number, number>();
/** Identifies the cards on screen, so they're only rebuilt for a new pick. */
let builtFor = '';
let lastCursor = -1;

export const isDrafting = () => !!draft;

/** Seat's chosen card: confirmed by the host, or pressed here and on its way. -1 if none. */
const pickOf = (seat: number) => (draft && draft.p[seat] >= 0 ? draft.p[seat] : pending.get(seat) ?? -1);

/** The card lit for a seat right now (what a press would pick), or -1. */
export const cursorFor = (seat: number) => (draft ? draftCursor(t, draft.o[seat]?.length ?? 0) : -1);

/** This device pressed for `seat`; show it as locked straight away. */
export const markPicked = (seat: number) => {
  const k = cursorFor(seat);

  if (k >= 0 && pickOf(seat) < 0) {
    pending.set(seat, k);
  }
};

/** True if this seat has already locked in a card in the current pick. */
export const hasPicked = (seat: number) => pickOf(seat) >= 0;

const cardHtml = (u: number) => {
  const up = UPGRADES[u];
  const tag = up.legendary ? '<span class="leg">Legendary</span>' : up.sabotage ? '<span class="sab">Sabotage</span>' : '';
  const kind = up.legendary ? ' legendary' : up.sabotage ? ' sabotage' : '';

  return `<div class="card${kind}" data-tip="${escapeHtml(up.desc)}"><span class="em">${up.emoji}</span><b>${escapeHtml(up.name)}</b><small>${escapeHtml(up.desc)}</small>${tag}</div>`;
};

const build = (d: DraftState) => {
  const players = S.round?.players ?? [];
  const seats = S.mySeats.filter((seat) => d.o[seat]?.length);
  const named = seats.length > 1; // several players on one keyboard: label each row

  $('draftRows').innerHTML = seats
    .map((seat) => {
      const p = players[seat];
      const label = named && p ? `<p class="who" style="--c:${p.color}"><span class="dot"></span>${escapeHtml(p.name)}</p>` : '';

      return `<div class="drow" data-seat="${seat}" style="--c:${p?.color ?? '#fff'}">${label}<div class="cards">${d.o[seat].map(cardHtml).join('')}</div></div>`;
    })
    .join('');
  $('draftRows').classList.toggle('many', seats.length > 1);
};

/** "Press when…" until this device has picked for all its players, then who everyone's waiting on. */
const updateStatus = (d: DraftState) => {
  const players = S.round?.players ?? [];
  const mineLeft = S.mySeats.some((seat) => d.o[seat]?.length && pickOf(seat) < 0);
  const waiting = d.o
    .map((offers, seat) => (offers.length && pickOf(seat) < 0 ? players[seat]?.name : ''))
    .filter(Boolean);
  const text = mineLeft
    ? 'Press when the one you want lights up'
    : waiting.length
      ? `Waiting for ${waiting.join(', ')}…`
      : 'Here we go!';
  const el = $('draftStatus');

  if (el.textContent !== text) {
    el.textContent = text;
  }
};

/** A new snapshot: show, update or hide the overlay. */
export const syncDraft = (d: DraftState | undefined) => {
  if (!d) {
    if (draft) {
      draft = null;
      builtFor = '';
      pending.clear();
      $('draft').classList.add('hidden');
    }

    return;
  }

  const key = JSON.stringify(d.o);

  if (key !== builtFor) {
    builtFor = key;
    lastCursor = -1;
    pending.clear();
    build(d);
  }

  draft = d;
  t = d.t;
  $('draft').classList.remove('hidden');
};

/** Every frame: move the cursor and update who's still picking. */
export const tickDraft = (dt: number) => {
  if (!draft) {
    return;
  }

  t += dt;

  let moved = false;

  for (const row of document.querySelectorAll<HTMLElement>('#draftRows .drow')) {
    const seat = Number(row.dataset.seat);
    const picked = pickOf(seat);
    const lit = picked >= 0 ? picked : cursorFor(seat);

    row.classList.toggle('locked', picked >= 0);
    row.querySelectorAll('.card').forEach((card, k) => card.classList.toggle('on', k === lit));

    if (picked < 0 && seat === S.you) {
      moved = lit !== lastCursor;
      lastCursor = lit;
    }
  }

  if (moved && lastCursor >= 0) {
    sfx.cursor();
  }

  updateStatus(draft);
};
