// Shapes shared between the host simulation, the network protocol and the renderer.

export type Phase = 'count' | 'play' | 'over';
export type PlayerKind = 'host' | 'local' | 'remote';

/** [carriageX, carriageZ, tipY, open (0..1), busy (1 while dropping/carrying), swingX, swingZ, yaw] — see claw.ts */
export type ClawState = [number, number, number, number, 0 | 1, number, number, number];
/** [id, prizeTypeIndex, x, y, z, qx, qy, qz, qw] */
export type PrizeState = [number, number, number, number, number, number, number, number, number];

export type GameEvent =
  | { k: 'tick'; n: number }
  | { k: 'go' }
  | { k: 'frenzy' }
  | { k: 'end' }
  | { k: 'drop'; c: number }
  | { k: 'grab'; c: number; ok: 0 | 1; type?: number }
  | { k: 'slip'; c: number }
  | { k: 'score'; c: number; pts: number; type: number; x: number; z: number };

export interface Snapshot {
  t: 's';
  ph: Phase;
  tm: number;
  fz: 0 | 1;
  c: ClawState[];
  p: PrizeState[];
  sc: number[];
  ev?: GameEvent[];
}

export interface PlayerStats {
  score: number;
  grabs: number;
  slips: number;
  bombs: number;
  prizes: number;
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
export type ClientMessage = { t: 'hello'; name: string } | { t: 'press' } | { t: 'ping' };
