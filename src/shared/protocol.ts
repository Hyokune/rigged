// Shapes shared between the host simulation, the network protocol and the renderer.

/** 'draft': play is paused while everyone picks an upgrade (see upgrades.ts). */
export type Phase = 'count' | 'play' | 'draft' | 'over';
export type PlayerKind = 'host' | 'local' | 'remote';

/** [carriageX, carriageZ, tipY, open (0..1), busy (1 while dropping/carrying), swingX, swingZ, yaw, scale] — see claw.ts */
export type ClawState = [number, number, number, number, 0 | 1, number, number, number, number];
/** [id, prizeTypeIndex, x, y, z, qx, qy, qz, qw] */
export type PrizeState = [number, number, number, number, number, number, number, number, number];

export type GameEvent =
  | { k: 'tick'; n: number }
  | { k: 'go' }
  | { k: 'frenzy' }
  | { k: 'end' }
  | { k: 'drop'; c: number }
  /** n: how many prizes it picked up, when more than one (Mega Claw) */
  | { k: 'grab'; c: number; ok: 0 | 1; type?: number; n?: number }
  | { k: 'slip'; c: number }
  | { k: 'score'; c: number; pts: number; type: number; x: number; z: number }
  | { k: 'draft' }
  /** player c locked in upgrade u */
  | { k: 'pick'; c: number; u: number };

/** An upgrade pick in progress. It lasts until everyone has picked. */
export interface DraftState {
  /** seconds since the pick started (drives the cursor) */
  t: number;
  /** the cards offered to each player (upgrade indices) */
  o: number[][];
  /** each player's chosen card (index into their offers), or -1 */
  p: number[];
}

export interface Snapshot {
  t: 's';
  ph: Phase;
  tm: number;
  fz: 0 | 1;
  c: ClawState[];
  p: PrizeState[];
  sc: number[];
  /** upgrades each player has taken */
  up: number[][];
  dr?: DraftState;
  ev?: GameEvent[];
}

export interface PlayerStats {
  score: number;
  grabs: number;
  slips: number;
  bombs: number;
  prizes: number;
  /** upgrades taken, in order */
  ups: number[];
}

/** A player as everyone sees them in the lobby. */
export interface PublicPlayer {
  name: string;
  color: string;
  kind: PlayerKind;
  keyLabel: string;
  connected: boolean;
}

/** A player as shown in-game (claw label, scoreboard). */
export interface RoundPlayer {
  name: string;
  color: string;
}

export interface RoundResult extends PlayerStats, RoundPlayer {}

/** Messages the host sends to clients. */
export type HostMessage =
  | Snapshot
  | { t: 'lobby'; players: PublicPlayer[]; you: number; code: string; go: boolean }
  | { t: 'start'; players: RoundPlayer[]; you: number }
  | { t: 'end'; results: RoundResult[] }
  | { t: 'full' }
  | { t: 'ping' };

/** Messages clients send to the host. */
export type ClientMessage =
  | { t: 'hello'; name: string }
  /** during an upgrade pick, `pick` is the card this player saw lit up when they pressed */
  | { t: 'press'; pick?: number }
  | { t: 'ping' };
