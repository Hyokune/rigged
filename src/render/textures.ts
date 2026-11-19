// Textures painted on a <canvas>: the marquee sign, the back wall and the cabinet's front panel.
import * as THREE from 'three';

type Painter = (ctx: CanvasRenderingContext2D, w: number, h: number) => void;

const DISPLAY_FONT = 'Bungee, Impact, sans-serif';

const canvasTexture = (w: number, h: number, paint: Painter) => {
  const canvas = document.createElement('canvas');

  canvas.width = w;
  canvas.height = h;

  const tex = new THREE.CanvasTexture(canvas);

  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;

  const ctx = canvas.getContext('2d');

  const repaint = () => {
    if (!ctx) {
      return;
    }

    paint(ctx, w, h);
    tex.needsUpdate = true;
  };

  repaint();
  document.fonts?.ready.then(repaint); // repaint once the display font has loaded

  return tex;
};

/** The glowing "RIGGED" sign on top of the machine. */
export const marqueeTexture = () =>
  canvasTexture(1024, 256, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);

    const bg = ctx.createLinearGradient(0, 0, 0, h);

    bg.addColorStop(0, '#2b0b4f');
    bg.addColorStop(1, '#14062a');
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.roundRect(8, 8, w - 16, h - 16, 40);
    ctx.fill();
    ctx.lineWidth = 8;
    ctx.strokeStyle = '#ff4fd8';
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `150px ${DISPLAY_FONT}`;
    ctx.shadowColor = '#ff4fd8';
    ctx.shadowBlur = 30;

    const text = ctx.createLinearGradient(0, 40, 0, 200);

    text.addColorStop(0, '#fff3a3');
    text.addColorStop(1, '#ffb703');
    ctx.fillStyle = text;
    ctx.fillText('RIGGED', w / 2, h / 2 + 8);
    ctx.shadowBlur = 0;
  });

/** Purple polka-dot wall behind the prizes, sized to a W x H machine. */
export const backWallTexture = (W: number, H: number) =>
  canvasTexture(1024, Math.round((1024 * H) / W), (ctx, w, h) => {
    const bg = ctx.createLinearGradient(0, 0, 0, h);

    bg.addColorStop(0, '#5a189a');
    bg.addColorStop(1, '#240046');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = '#ffffff';

    const step = 64;

    for (let y = 0; y < h + step; y += step) {
      for (let x = (y / step) % 2 ? step / 2 : 0; x < w + step; x += step) {
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.globalAlpha = 0.12;
    ctx.font = `${Math.round(h * 0.35)}px ${DISPLAY_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?!', w / 2, h * 0.45);
    ctx.globalAlpha = 1;
  });

/** Striped front of the lower cabinet with the slogan and a coin slot, for a machine W wide. */
export const frontPanelTexture = (W: number) =>
  canvasTexture(1024, Math.round((1024 * 2.5) / (W + 0.6)), (ctx, w, h) => {
    ctx.fillStyle = '#3c096c';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#ff4fd8';
    ctx.globalAlpha = 0.12;

    for (let x = -h; x < w; x += 60) { // diagonal stripes
      ctx.beginPath();
      ctx.moveTo(x, h);
      ctx.lineTo(x + 30, h);
      ctx.lineTo(x + 30 + h, 0);
      ctx.lineTo(x + h, 0);
      ctx.fill();
    }

    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${Math.min(h * 0.16, 56)}px ${DISPLAY_FONT}`;
    ctx.fillStyle = '#ffe14d';
    ctx.fillText('ONE BUTTON • ONE CLAW • ZERO MERCY', w / 2, h * 0.32);
    // coin slot
    ctx.fillStyle = '#111';
    ctx.strokeStyle = '#c8ccd8';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.roundRect(w / 2 - 50, h * 0.55, 100, h * 0.22, 12);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ff4d6d';
    ctx.fillRect(w / 2 - 6, h * 0.58, 12, h * 0.16);
  });
