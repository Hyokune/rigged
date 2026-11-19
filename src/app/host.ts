// Hosting a room: the lobby roster, running the authoritative game, and streaming it to players.
import type { DataConnection } from 'peerjs';
import { sfx, unlockAudio } from '../audio/sfx';
import { HostNet } from '../net/host';
import { MAX_PLAYERS } from '../shared/constants';
import type { ClientMessage, RoundPlayer, RoundResult } from '../shared/protocol';
import { Sim } from '../sim/sim';
import { S, publicRoster } from './context';
import { $, readPlayerName, sanitizeName, setBusy, toast } from './dom';
import { handleEvents } from './events';
import { renderLobby, show, showResults } from './screens';
import { applySnapshot, enterGame, startDemo, stopHostSim } from './session';

/** Snapshots per second sent to players = 1000 / this. */
const SEND_INTERVAL_MS = 50;
/** Pause on "TIME'S UP!" before the results screen. */
const RESULTS_DELAY_MS = 1800;

/** Tell every remote player who's in the room (and switch them to the lobby if we're there). */
export const broadcastLobby = () => {
  const players = publicRoster();
  const go = S.screen === 'lobby';

  S.players.forEach((p, i) => {
    if (p.kind === 'remote' && p.connected) {
      S.hostNet?.send(p.conn, { t: 'lobby', players, you: i, code: S.code, go });
    }
  });

  if (S.screen === 'lobby') {
    renderLobby();
  }
};

const onPlayerMessage = (conn: DataConnection, msg: ClientMessage) => {
  const net = S.hostNet;

  if (!net) {
    return;
  }

  if (msg.t === 'hello') {
    if (S.players.some((p) => p.conn === conn)) {
      return;
    }

    if (S.players.length >= MAX_PLAYERS) {
      net.send(conn, { t: 'full' });
      setTimeout(() => conn.close(), 500);

      return;
    }

    const name = sanitizeName(msg.name);

    S.players.push({ name, kind: 'remote', conn, connected: true });
    sfx.join();
    toast(`${name} joined`);
    broadcastLobby();

    if (S.round && (S.screen === 'game' || S.screen === 'results')) {
      // Late joiners spectate the current round and play from the next one.
      net.send(conn, { t: 'start', players: S.round.players, you: S.players.length - 1 });

      if (S.screen === 'results' && S.lastResults) {
        net.send(conn, { t: 'end', results: S.lastResults });
      }
    }
  } else if (msg.t === 'press') {
    const seat = S.players.findIndex((p) => p.conn === conn);

    if (S.screen === 'game' && S.sim && seat >= 0 && seat < S.sim.n) {
      S.sim.press(seat, typeof msg.pick === 'number' ? msg.pick : undefined);
    }
  }
};

const onPlayerLeft = (conn: DataConnection) => {
  const seat = S.players.findIndex((p) => p.conn === conn);

  if (seat < 0) {
    return;
  }

  const player = S.players[seat];

  toast(`${player.name} left`);

  if (S.screen === 'lobby') {
    S.players.splice(seat, 1);
  } else {
    player.connected = false; // keep seats stable mid-round; pruned when the next round starts
  }

  broadcastLobby();
};

export const hostGame = async () => {
  if (S.role) {
    return;
  }

  unlockAudio();

  const name = readPlayerName();
  const btn = $<HTMLButtonElement>('btnHost');

  setBusy(btn, 'Opening room…');

  const net = new HostNet({ onData: onPlayerMessage, onClose: onPlayerLeft });

  try {
    S.code = await net.open();
  } catch (err) {
    toast((err as Error).message);
    setBusy(btn);

    return;
  }

  setBusy(btn);
  S.role = 'host';
  S.hostNet = net;
  S.you = 0;
  S.players = [{ name, kind: 'host', connected: true }];
  show('lobby');
  renderLobby();
};

/** Wait for a key press and add a player who uses that key on this keyboard. */
export const addKeyboardPlayer = () => {
  $('keyPrompt').classList.remove('hidden');

  const done = () => {
    S.keyCapture = null;
    $('keyPrompt').classList.add('hidden');
  };

  S.keyCapture = (e) => {
    if (e.code === 'Escape') {
      return done();
    }

    if (['Space', 'Enter', 'Tab'].includes(e.code)) {
      return toast('Space and Enter are the host’s button. Pick another key.');
    }

    if (S.players.some((p) => p.key === e.code)) {
      return toast('That key is already taken.');
    }

    if (S.players.length >= MAX_PLAYERS) {
      return done();
    }

    const keyLabel = e.code.replace(/^(Key|Digit|Numpad)/, '');

    S.players.push({ name: `Player ${S.players.length + 1}`, kind: 'local', key: e.code, keyLabel, connected: true });
    sfx.join();
    done();
    broadcastLobby();
  };
};

export const removePlayer = (seat: number) => {
  S.players.splice(seat, 1);
  broadcastLobby();
};

// The game runs on a timer (not requestAnimationFrame) so it keeps going if the host's tab loses focus.
const tick = () => {
  const sim = S.sim, net = S.hostNet;

  if (!sim || !net) {
    return;
  }

  const now = performance.now();

  if (sim.phase === 'draft') {
    // A pick waits for everyone: pick for players who have left so they can't hold the game up.
    S.players.forEach((p, seat) => {
      if (!p.connected && seat < sim.n) {
        sim.press(seat);
      }
    });
  }

  sim.step(Math.min(1, (now - S.lastTick) / 1000));
  S.lastTick = now;

  const events = sim.events.splice(0);

  S.pendingEvents.push(...events);

  const snap = sim.snapshot();

  applySnapshot(snap, true);
  handleEvents(events, false);

  if (now - S.lastSend >= SEND_INTERVAL_MS) {
    S.lastSend = now;
    snap.ev = S.pendingEvents;
    S.pendingEvents = [];
    net.broadcast(snap);
  }

  if (sim.phase === 'over' && !S.ended) {
    S.ended = true;
    setTimeout(finishRound, RESULTS_DELAY_MS);
  }
};

export const startRound = () => {
  if (S.role !== 'host') {
    return;
  }

  stopHostSim();
  S.players = S.players.filter((p) => p.connected);

  const players: RoundPlayer[] = publicRoster().map((p) => ({
    name: p.kind === 'local' ? `${p.name} [${p.keyLabel}]` : p.name,
    color: p.color,
  }));
  const duration = Number($<HTMLSelectElement>('duration').value) || 90;

  S.sim = new Sim(players.length, { duration });
  S.ended = false;
  S.pendingEvents = [];
  S.keymap = new Map();
  S.players.forEach((p, seat) => {
    if (p.kind === 'local' && p.key) {
      S.keymap.set(p.key, seat);
    }
  });
  enterGame(players, 0);
  S.players.forEach((p, seat) => {
    if (p.kind === 'remote') {
      S.hostNet?.send(p.conn, { t: 'start', players, you: seat });
    }
  });
  S.lastTick = S.lastSend = performance.now();
  S.tickHandle = window.setInterval(tick, 1000 / 60);
};

const finishRound = () => {
  if (S.role !== 'host' || !S.sim || !S.round || S.screen !== 'game') {
    return;
  }

  const { players } = S.round;
  const results: RoundResult[] = S.sim.stats.map((s, i) => ({ ...s, name: players[i].name, color: players[i].color }));

  S.hostNet?.broadcast({ t: 'end', results });
  showResults(results);
};

export const backToLobby = () => {
  stopHostSim();
  S.round = null;
  S.players = S.players.filter((p) => p.connected);
  startDemo();
  show('lobby');
  broadcastLobby();
};
