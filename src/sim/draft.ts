// An upgrade pick in progress (the host's side). The Sim freezes everything else while one runs,
// and it lasts until every player has picked (the host auto-picks for anyone who disconnects).
import { DRAFT_OUTRO, draftCursor, rollOffers } from '../shared/upgrades';
import { round2 } from '../shared/math';
import type { DraftState } from '../shared/protocol';

export interface Draft {
  /** seconds since the pick started */
  t: number;
  /** when it closes: set once everyone has picked */
  endAt: number;
  /** cards offered to each player (upgrade indices) */
  offers: number[][];
  /** index into that player's offers, or -1 */
  picks: number[];
}

/** Deal three cards to each player, given what they already own. */
export const createDraft = (owned: number[][]): Draft => ({
  t: 0,
  endAt: Infinity,
  offers: owned.map((ups) => rollOffers(ups, owned.length)),
  picks: owned.map(() => -1),
});

/**
 * Player i locks in a card: `pick` if given (the card their screen showed lit; screens run a little behind
 * the host, so trust it rather than the cursor here), otherwise wherever the cursor is now.
 * Returns the upgrade taken, or -1 if nothing was picked (no cards, or already picked).
 */
export const lockPick = (d: Draft, i: number, pick?: number): number => {
  const offers = d.offers[i];

  if (!offers?.length || d.picks[i] >= 0) {
    return -1;
  }

  const valid = typeof pick === 'number' && Number.isInteger(pick) && pick >= 0 && pick < offers.length;
  const k = valid ? pick : draftCursor(d.t, offers.length);

  d.picks[i] = k;

  if (d.picks.every((p, j) => p >= 0 || !d.offers[j].length)) {
    d.endAt = d.t + DRAFT_OUTRO;
  }

  return offers[k];
};

export const draftState = (d: Draft): DraftState => ({ t: round2(d.t), o: d.offers, p: d.picks });
