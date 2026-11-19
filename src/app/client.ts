// Joining someone else's room: follow the host's lobby, rounds and results.
import { unlockAudio } from '../audio/sfx';
import { ClientNet } from '../net/client';
import type { HostMessage } from '../shared/protocol';
import { S } from './context';
import { $, readPlayerName, setBusy, toast } from './dom';
import { handleEvents } from './events';
import { renderLobby, show, showResults } from './screens';
import { applySnapshot, enterGame, resetToTitle, startDemo } from './session';

const onHostMessage = (msg: HostMessage) => {
  switch (msg.t) {
    case 'lobby':
      S.lobby = msg;
      S.you = msg.you;

      if (!msg.go && S.screen !== 'title') {
        break; // a roster update mid-round: show it when we're back in the lobby
      }

      if (S.screen !== 'lobby') {
        if (!S.demo) {
          startDemo();
        }

        S.round = null;
        show('lobby');
      }

      renderLobby();
      break;

    case 'start':
      enterGame(msg.players, msg.you);
      break;

    case 's':
      if (S.round && (S.screen === 'game' || S.screen === 'results')) {
        applySnapshot(msg, false);
        handleEvents(msg.ev ?? [], false);
      }

      break;

    case 'end':
      showResults(msg.results);
      break;

    case 'full':
      toast('That room is full (8 players max).');
      resetToTitle();
      break;
  }
};

const onHostLost = () => {
  if (S.role !== 'client') {
    return;
  }

  toast('Disconnected from the host.');
  resetToTitle();
};

export const joinGame = async () => {
  if (S.role) {
    return;
  }

  unlockAudio();

  const codeInput = $<HTMLInputElement>('code');
  const code = codeInput.value.trim().toUpperCase();

  if (!/^[A-Z]{4}$/.test(code)) {
    toast('Room codes are 4 letters.');
    codeInput.focus();

    return;
  }

  const name = readPlayerName();
  const btn = $<HTMLButtonElement>('btnJoin');

  setBusy(btn, '…');

  const net = new ClientNet({ onData: onHostMessage, onClose: onHostLost });

  S.role = 'client';

  try {
    await net.connect(code, name);
  } catch (err) {
    S.role = null;
    toast((err as Error).message);
    setBusy(btn);

    return;
  }

  setBusy(btn);
  S.clientNet = net;
  S.code = code;
};
