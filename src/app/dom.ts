// Small DOM helpers shared by the UI modules.

/** getElementById that fails loudly if index.html is missing the element. */
export const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const el = document.getElementById(id);

  if (!el) {
    throw new Error(`Missing #${id} in index.html`);
  }

  return el as T;
};

const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escape text for use inside innerHTML (player names come from other people's browsers). */
export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c] ?? c);

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Restart a CSS animation by removing and re-adding its class. */
export const restartAnimation = (el: HTMLElement, className: string) => {
  el.classList.remove(className);
  void el.offsetWidth; // force a reflow so the browser notices
  el.classList.add(className);
};

let toastTimer = 0;

/** A short message that slides in at the top of the screen. */
export const toast = (msg: string) => {
  const el = $('toast');

  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.remove('show'), 3200);
};

/** Big centre-screen text (countdown, GRAB!, FRENZY!). */
export const banner = (text: string, cls = '') => {
  const el = $('banner');

  el.textContent = text;
  el.className = '';
  void el.offsetWidth; // restart the CSS animation
  el.className = 'show ' + cls;
};

/** Disable a button and show `label` while something loads; call without a label to restore it. */
export const setBusy = (btn: HTMLButtonElement, label?: string) => {
  if (label) {
    btn.dataset.label ??= btn.textContent ?? '';
    btn.textContent = label;
    btn.disabled = true;
  } else {
    if (btn.dataset.label) {
      btn.textContent = btn.dataset.label;
    }

    btn.disabled = false;
  }
};

/** Trim and shorten a player name (also used on names that arrive over the network). */
export const sanitizeName = (name: unknown) =>
  String(name || 'Player').replace(/\s+/g, ' ').trim().slice(0, 12) || 'Player';

/** Small preferences remembered in this browser. Storage can be unavailable (private mode), so never throw. */
export const prefs = {
  get: (key: string) => {
    try {
      return localStorage.getItem(`rigged.${key}`);
    } catch {
      return null;
    }
  },
  set: (key: string, value: string) => {
    try {
      localStorage.setItem(`rigged.${key}`, value);
    } catch { /* storage unavailable */ }
  },
};

/** The name typed on the title screen (remembered for next time). */
export const readPlayerName = () => {
  const name = sanitizeName($<HTMLInputElement>('name').value);

  prefs.set('name', name);

  return name;
};
