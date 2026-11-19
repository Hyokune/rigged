// Tiny synthesized sound effects (no audio files needed).
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;

/** Must be called from a user gesture (click/keypress) before sounds can play. */
export const unlockAudio = () => {
  try {
    if (!ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
    }

    if (ctx.state === 'suspended') {
      void ctx.resume();
    }
  } catch { /* audio is optional */ }
};

export const setMuted = (m: boolean) => {
  muted = m;

  if (master) {
    master.gain.value = m ? 0 : 0.5;
  }
};

interface ToneOptions { f?: number; f2?: number; d?: number; type?: OscillatorType; v?: number; at?: number }

const tone = ({ f = 440, f2, d = 0.15, type = 'square', v = 0.2, at = 0 }: ToneOptions) => {
  if (!ctx || !master || muted) {
    return;
  }

  const t0 = ctx.currentTime + at;
  const o = ctx.createOscillator();
  const g = ctx.createGain();

  o.type = type;
  o.frequency.setValueAtTime(f, t0);

  if (f2) {
    o.frequency.exponentialRampToValueAtTime(f2, t0 + d);
  }

  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(v, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
  o.connect(g).connect(master);
  o.start(t0);
  o.stop(t0 + d + 0.05);
};

const noise = ({ d = 0.5, v = 0.4, cutoff = 700 }) => {
  if (!ctx || !master || muted) {
    return;
  }

  const len = Math.floor(ctx.sampleRate * d);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);

  for (let i = 0; i < len; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  }

  const src = ctx.createBufferSource();

  src.buffer = buf;

  const filter = ctx.createBiquadFilter();

  filter.type = 'lowpass';
  filter.frequency.value = cutoff;

  const g = ctx.createGain();

  g.gain.value = v;
  src.connect(filter).connect(g).connect(master);
  src.start();
};

const semis = (base: number, s: number) => base * 2 ** (s / 12);
const loud = (mine: boolean) => (mine ? 1 : 0.35); // other players' claws are quieter than yours

export const sfx = {
  press: () => tone({ f: 660, f2: 440, d: 0.08, v: 0.15 }),
  drop: (mine: boolean) => tone({ f: 520, f2: 160, d: 0.6, type: 'sawtooth', v: 0.06 * loud(mine) }),
  grab: (mine: boolean) => {
    tone({ f: 180, d: 0.08, v: 0.15 * loud(mine) });
    tone({ f: 520, f2: 780, d: 0.12, v: 0.1 * loud(mine), at: 0.06 });
  },
  miss: (mine: boolean) => tone({ f: 300, f2: 140, d: 0.25, type: 'triangle', v: 0.14 * loud(mine) }),
  slip: (mine: boolean) => {
    tone({ f: 620, f2: 180, d: 0.55, type: 'triangle', v: 0.16 * loud(mine) });
    tone({ f: 470, f2: 140, d: 0.55, type: 'triangle', v: 0.1 * loud(mine), at: 0.1 });
  },
  score: (pts: number, mine: boolean) => {
    const base = pts >= 50 ? 659 : 523;

    [0, 4, 7, 12].forEach((s, k) => tone({ f: semis(base, s), d: 0.14, v: 0.09 * loud(mine), at: k * 0.07 }));
  },
  bomb: () => {
    noise({ d: 0.8, v: 0.6, cutoff: 500 });
    tone({ f: 120, f2: 35, d: 0.7, type: 'sawtooth', v: 0.22 });
  },
  tick: () => tone({ f: 440, d: 0.12, v: 0.15 }),
  go: () => tone({ f: 880, d: 0.4, v: 0.15 }),
  frenzy: () => [0, 3, 6, 9, 12].forEach((s, k) => tone({ f: semis(440, s), d: 0.1, type: 'sawtooth', v: 0.07, at: k * 0.06 })),
  end: () => [12, 7, 4, 0].forEach((s, k) => tone({ f: semis(523, s), d: 0.22, v: 0.1, at: k * 0.16 })),
  join: () => tone({ f: 700, f2: 1050, d: 0.12, v: 0.08 }),
  /** upgrade pick: cards dealt, the cursor moving, a card locked in */
  draft: () => [0, 4, 7, 11, 14].forEach((s, k) => tone({ f: semis(392, s), d: 0.16, type: 'triangle', v: 0.1, at: k * 0.07 })),
  cursor: () => tone({ f: 1200, d: 0.03, type: 'triangle', v: 0.05 }),
  legendary: () => [0, 4, 7, 12, 16, 19, 24].forEach((s, k) => tone({ f: semis(523, s), d: 0.25, type: 'triangle', v: 0.12, at: k * 0.06 })),
  pick: (mine: boolean) => {
    tone({ f: 660, f2: 990, d: 0.1, v: 0.12 * loud(mine) });
    tone({ f: 990, f2: 1320, d: 0.16, v: 0.1 * loud(mine), at: 0.08 });
  },
};
