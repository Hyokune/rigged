// Turns game events (from the sim or the network) into sounds, banners and popups.
import { sfx } from '../audio/sfx';
import { COLORS } from '../shared/constants';
import { PRIZE_TYPES } from '../shared/prizes';
import type { GameEvent } from '../shared/protocol';
import { S, view } from './context';
import { banner } from './dom';

const SLIP_TAUNTS = ['RIGGED!', 'SLIPPED!', 'NOPE!', 'SO CLOSE…'];

const randomTaunt = () => SLIP_TAUNTS[Math.floor(Math.random() * SLIP_TAUNTS.length)];

const colorOf = (seat: number, quiet: boolean) =>
  quiet || !S.round ? COLORS[seat % COLORS.length] : S.round.players[seat]?.color || '#fff';

/** @param quiet attract mode: show popups, but no sounds or banners */
export const handleEvents = (events: GameEvent[], quiet: boolean) => {
  for (const e of events) {
    const mine = !quiet && 'c' in e && S.mySeats.includes(e.c);
    // Other players' popups are toned down so they don't distract from your own claw.
    const faded = !quiet && !mine && S.mySeats.length > 0 ? ' faded' : '';

    switch (e.k) {
      case 'tick':
        if (!quiet) {
          sfx.tick();
          banner(String(e.n));
        }

        break;

      case 'go':
        if (!quiet) {
          sfx.go();
          banner('GRAB!');
        }

        break;

      case 'frenzy':
        if (!quiet) {
          sfx.frenzy();
          banner('FRENZY!', 'hot');
        }

        break;

      case 'end':
        if (!quiet) {
          sfx.end();
          banner("TIME'S UP!");
        }

        break;

      case 'drop':
        if (!quiet) {
          sfx.drop(mine);
        }

        break;

      case 'grab': {
        if (!quiet) {
          (e.ok ? sfx.grab : sfx.miss)(mine);
        }

        if (!e.ok && mine) {
          const p = view.clawPos(e.c);

          view.popup(p.x, p.y, p.z, 'MISS', '#ffffff', 'small');
        }

        break;
      }

      case 'slip': {
        if (!quiet) {
          sfx.slip(mine);
        }

        const p = view.clawPos(e.c);

        view.popup(p.x, p.y, p.z, randomTaunt(), '#ffffff', 'slip' + faded);
        break;
      }

      case 'score': {
        const isBomb = e.pts < 0;

        if (!quiet && isBomb) {
          sfx.bomb();
          view.kick(1);
        } else if (!quiet) {
          sfx.score(e.pts, mine);
        }

        const label = `${isBomb ? '' : '+'}${e.pts} ${PRIZE_TYPES[e.type].emoji}`;

        view.popup(e.x, 0.8, e.z, label, colorOf(e.c, quiet), (isBomb ? 'bad' : e.pts >= 50 ? 'big' : '') + faded);
        break;
      }
    }
  }
};
