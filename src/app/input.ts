// The one button (Space / Enter / the GRAB button / a keyboard player's key) and every other control.
import { setMuted, sfx, unlockAudio } from '../audio/sfx';
import { bindCameraControls } from './camera-controls';
import { S, isPlaying } from './context';
import { $, prefs, restartAnimation, toast } from './dom';
import { joinGame } from './client';
import { addKeyboardPlayer, backToLobby, hostGame, removePlayer, startRound } from './host';
import { resetToTitle } from './session';

/** This browser's player pressed their button. */
const pressMine = () => {
  unlockAudio();

  if (S.screen !== 'game' || !isPlaying()) {
    return;
  }

  const btn = $('grab');

  restartAnimation(btn, 'hit');

  if (S.role === 'host') {
    if (S.sim?.press(S.you)) {
      sfx.press();
    }
  } else {
    S.clientNet?.send({ t: 'press' });

    if (!btn.classList.contains('busy')) {
      sfx.press();
    }
  }
};

const onKeyDown = (e: KeyboardEvent) => {
  if (S.keyCapture) {
    e.preventDefault();
    S.keyCapture(e);

    return;
  }

  if (e.repeat) {
    return;
  }

  const target = e.target as HTMLElement;
  const tag = target.tagName;

  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'BUTTON') {
    // Enter in the name box hosts (or joins, if a code is filled in); Enter in the code box joins.
    if (e.key === 'Enter' && target.id === 'code') {
      void joinGame();
    } else if (e.key === 'Enter' && target.id === 'name') {
      void ($<HTMLInputElement>('code').value.trim() ? joinGame() : hostGame());
    }

    if (tag !== 'BUTTON' || S.screen !== 'game') {
      return;
    }
  }

  if (S.screen !== 'game') {
    return;
  }

  if (e.code === 'Space' || e.code === 'Enter') {
    e.preventDefault();
    pressMine();

    return;
  }

  const seat = S.keymap.get(e.code);

  if (S.role === 'host' && seat !== undefined) {
    e.preventDefault();

    if (S.sim?.press(seat)) {
      sfx.press();
    }
  }
};

const copyInviteLink = async () => {
  const url = `${location.origin}${location.pathname}?room=${S.code}`;

  try {
    await navigator.clipboard.writeText(url);
    toast('Invite link copied!');
  } catch {
    prompt('Copy this invite link:', url);
  }
};

const toggleMute = () => {
  const btn = $('mute');
  const muted = btn.classList.toggle('off');

  btn.textContent = muted ? '🔇' : '🔊';
  setMuted(muted);
  prefs.set('muted', muted ? '1' : '');
};

/** Hook up every control on the page. Call once at startup. */
export const bindControls = () => {
  addEventListener('keydown', onKeyDown);
  $('grab').addEventListener('pointerdown', (e) => {
    e.preventDefault();
    pressMine();
  });
  bindCameraControls($<HTMLCanvasElement>('scene'));

  $('btnHost').onclick = () => void hostGame();
  $('btnJoin').onclick = () => void joinGame();
  $('btnStart').onclick = startRound;
  $('btnAgain').onclick = startRound;
  $('btnToLobby').onclick = backToLobby;
  $('btnLeave').onclick = resetToTitle;
  $('btnCopy').onclick = () => void copyInviteLink();
  $('btnLocal').onclick = addKeyboardPlayer;
  $('mute').onclick = toggleMute;
  $('playerList').addEventListener('click', (e) => {
    const seat = (e.target as HTMLElement).dataset.rm;

    if (seat !== undefined && S.role === 'host') {
      removePlayer(Number(seat));
    }
  });

  if (prefs.get('muted')) {
    toggleMute();
  }
};
