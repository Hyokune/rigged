// Entry point. Title -> lobby -> game -> results; see src/app for the flow, src/sim for the game,
// src/render for the 3D view and src/net for multiplayer.
import './styles.css';
import { initPhysics } from './sim/sim';
import { loadModels } from './render/assets';
import { S } from './app/context';
import { $, prefs, setBusy, toast } from './app/dom';
import { bindControls } from './app/input';
import { renderLegend, show } from './app/screens';
import { startDemo, startRenderLoop } from './app/session';

const prefillFromUrlAndPrefs = () => {
  $<HTMLInputElement>('name').value = prefs.get('name') ?? '';

  const room = new URLSearchParams(location.search).get('room');

  if (room) {
    $<HTMLInputElement>('code').value = room.toUpperCase().slice(0, 4);
    $('title').classList.add('invited');
  }
};

/** Hold the buttons until the toys and physics are loaded, so nobody starts a round full of placeholders. */
const loadEverything = async () => {
  const hostBtn = $<HTMLButtonElement>('btnHost'), joinBtn = $<HTMLButtonElement>('btnJoin');

  setBusy(hostBtn, 'Loading toys…');
  joinBtn.disabled = true;

  try {
    const [modelsOk] = await Promise.all([loadModels(), initPhysics()]);

    if (!modelsOk) {
      toast('Could not load the 3D toys. Using simple shapes instead.');
    }
  } catch (err) {
    console.error(err);
    toast('Could not start the physics engine. Try reloading the page.');

    return;
  }

  setBusy(hostBtn);
  joinBtn.disabled = false;

  if (!S.role) {
    startDemo();
  }
};

bindControls();
renderLegend();
prefillFromUrlAndPrefs();
show('title');
startRenderLoop();
void loadEverything();
