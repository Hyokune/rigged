// App-wide state and the single 3D view. Everything in app/ reads and writes these.
import type { DataConnection } from 'peerjs';
import { COLORS } from '../shared/constants';
import type { GameEvent, PlayerKind, PublicPlayer, RoundPlayer, RoundResult } from '../shared/protocol';
import type { HostNet } from '../net/host';
import type { ClientNet } from '../net/client';
import type { Sim } from '../sim/sim';
import { View } from '../render/view';
import { $ } from './dom';

export type Screen = 'title' | 'lobby' | 'game' | 'results';

/** Host-side roster entry. */
export interface HostPlayer {
  name: string;
  kind: PlayerKind;
  connected: boolean;
  /** local players: KeyboardEvent.code of their button */
  key?: string;
  keyLabel?: string;
  /** remote players: their connection */
  conn?: DataConnection;
}

export interface AppState {
  screen: Screen;
  role: 'host' | 'client' | null;
  hostNet: HostNet | null;
  clientNet: ClientNet | null;
  code: string;
  /** host only: everyone in the room, in seat order */
  players: HostPlayer[];
  /** client only: the last lobby update from the host */
  lobby: { players: PublicPlayer[] } | null;
  /** your seat (-1 if none) */
  you: number;
  /** seats played from this device: yours, plus (on the host) keyboard players. Other claws are faded. */
  mySeats: number[];
  /** the round currently on screen */
  round: { players: RoundPlayer[] } | null;
  /** host only: the authoritative game */
  sim: Sim | null;
  /** attract-mode game behind the menus */
  demo: Sim | null;
  /** host only: keyboard code -> seat, for players sharing the host's keyboard */
  keymap: Map<string, number>;
  /** host only: game loop timer and network send bookkeeping */
  tickHandle: number;
  lastTick: number;
  lastSend: number;
  pendingEvents: GameEvent[];
  ended: boolean;
  lastResults: RoundResult[] | null;
  /** set while waiting for "press a key" when adding a keyboard player */
  keyCapture: ((e: KeyboardEvent) => void) | null;
}

export const S: AppState = {
  screen: 'title',
  role: null,
  hostNet: null,
  clientNet: null,
  code: '',
  players: [],
  lobby: null,
  you: -1,
  mySeats: [],
  round: null,
  sim: null,
  demo: null,
  keymap: new Map(),
  tickHandle: 0,
  lastTick: 0,
  lastSend: 0,
  pendingEvents: [],
  ended: false,
  lastResults: null,
  keyCapture: null,
};

declare global {
  interface Window { __rigged: AppState }
}
window.__rigged = S; // handy for debugging in the console

export const view = new View($<HTMLCanvasElement>('scene'), $('labels'), $('popups'));

/** The host's roster as everyone else sees it (seat colours, no connections). */
export const publicRoster = (): PublicPlayer[] =>
  S.players.map((p, i) => ({ name: p.name, color: COLORS[i], kind: p.kind, keyLabel: p.keyLabel ?? '', connected: p.connected }));

/** True when this browser has a claw in the round on screen (not spectating). */
export const isPlaying = () => !!S.round && S.you >= 0 && S.you < S.round.players.length;
