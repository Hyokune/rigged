// What's on screen and running: the attract-mode demo, entering a round, going back to the title,
// and the render loop.
import { machineLayout } from '../shared/layout';
import type { RoundPlayer, Snapshot } from '../shared/protocol';
import { Sim } from '../sim/sim';
import { S, view } from './context';
import { $, setBusy } from './dom';
import { handleEvents } from './events';
import { resetHud, show, updateHud } from './screens';

/** How often demo claws press their button (chance per second). */
const DEMO_PRESS_RATE = 0.35;

// Each Sim owns a physics world in WebAssembly memory, which has to be freed explicitly.

/** Bot-driven game behind the menus. */
export const startDemo = () => {
  stopDemo();
  S.demo = new Sim(4, { demo: true });
  view.build(S.demo.layout, null, -1);
  view.orbit = true;
};

export const stopDemo = () => {
  S.demo?.dispose();
  S.demo = null;
};

/** Host only: stop and free the running game. */
export const stopHostSim = () => {
  clearInterval(S.tickHandle);
  S.sim?.dispose();
  S.sim = null;
};

/** Show a game state. `instant` skips smoothing (the host and demo have exact state every frame). */
export const applySnapshot = (snap: Snapshot, instant: boolean) => {
  view.setClaws(snap.c, instant);
  view.setPrizes(snap.p, instant);

  if (S.screen === 'game') {
    updateHud(snap);
  }
};

/** Switch to the in-game screen for a round. `you` beyond the player list means spectating. */
export const enterGame = (players: RoundPlayer[], you: number) => {
  (document.activeElement as HTMLElement | null)?.blur(); // so Space can't re-click a focused menu button
  stopDemo();
  S.round = { players };
  S.you = you;
  resetHud();
  view.build(machineLayout(players.length), players, you);
  view.orbit = false;

  if (you >= 0 && you < players.length) {
    $('grab').style.setProperty('--c', players[you].color);
  }

  show('game');
};

/** Leave any room and go back to the title screen. */
export const resetToTitle = () => {
  stopHostSim();
  S.hostNet?.destroy();
  S.clientNet?.destroy();
  Object.assign(S, {
    hostNet: null, clientNet: null, role: null, sim: null, round: null, players: [], lobby: null, you: -1, code: '', keymap: new Map(),
  });
  setBusy($<HTMLButtonElement>('btnHost'));
  setBusy($<HTMLButtonElement>('btnJoin'));
  startDemo();
  show('title');
};

/** Draw every animation frame; also drives the demo game. (The host's real game runs on its own timer.) */
export const startRenderLoop = () => {
  let last = performance.now();

  const frame = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);

    last = now;

    if (S.demo) {
      for (let i = 0; i < S.demo.n; i++) {
        if (Math.random() < dt * DEMO_PRESS_RATE) {
          S.demo.press(i);
        }
      }

      S.demo.step(dt);
      applySnapshot(S.demo.snapshot(), true);
      handleEvents(S.demo.events.splice(0), true);
    }

    view.update(dt);
    requestAnimationFrame(frame);
  };

  requestAnimationFrame(frame);
};
