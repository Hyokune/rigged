// Look around while playing: drag on the 3D scene to turn the camera, double-click / double-tap to reset.
// (Grabbing is on the GRAB button and the keyboard, so the scene itself is free for this.)
import { S, view } from './context';

/** A press that moves less than this (px) and lifts quickly counts as a tap, not a drag. */
const TAP_MOVE_PX = 8;
const TAP_MS = 300;
/** Two taps this close together reset the view. */
const DOUBLE_TAP_MS = 350;

interface Drag {
  id: number;
  x: number;
  y: number;
  moved: number;
  startedAt: number;
}

export const bindCameraControls = (canvas: HTMLCanvasElement) => {
  let drag: Drag | null = null;
  let lastTapAt = 0;

  canvas.addEventListener('pointerdown', (e) => {
    if (S.screen !== 'game' || drag) {
      return; // menus have their own camera sway; ignore extra fingers
    }

    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0, startedAt: performance.now() };
    canvas.setPointerCapture(e.pointerId);
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) {
      return;
    }

    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;

    drag.x = e.clientX;
    drag.y = e.clientY;
    drag.moved += Math.hypot(dx, dy);
    view.dragCamera(dx, dy);
  });

  const endDrag = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) {
      return;
    }

    const wasTap = drag.moved < TAP_MOVE_PX && performance.now() - drag.startedAt < TAP_MS;

    drag = null;

    if (!wasTap) {
      return;
    }

    const now = performance.now();

    if (now - lastTapAt < DOUBLE_TAP_MS) {
      view.resetCamera();
      lastTapAt = 0;
    } else {
      lastTapAt = now;
    }
  };

  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
};
