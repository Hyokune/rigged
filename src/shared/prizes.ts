// The prize table: what's in the machine, what it's worth and how hard it is to hold.

/** Plushie models are ~0.45 units tall in the asset pack; scale them up to prize size. */
export const PLUSH_SCALE = 2.4;

/** Random values a mystery box can be worth. */
export const MYSTERY_POINTS = [5, 10, 20, 40, 75];

/** Collision shape, centred on the prize's centre of mass. */
export type PrizeShape = { kind: 'box'; half: [number, number, number] } | { kind: 'ball'; r: number };

export interface PrizeType {
  name: string;
  emoji: string;
  /** Node name in public/models/arcade.glb, or a code-built prize ('gift' | 'bomb'). */
  model: string;
  shape: PrizeShape;
  /** Rough size used by gameplay checks (how far the claw can reach it, where it stops). */
  r: number;
  /** Points scored; '?' means a random value from MYSTERY_POINTS. */
  pts: number | '?';
  /** Chance the claw closes on it. */
  grip: number;
  /** Chance per second it falls out of the claw (more when the claw is swinging). */
  slip: number;
  /** Relative spawn frequency. */
  weight: number;
}

type Tier = Pick<PrizeType, 'pts' | 'grip' | 'slip' | 'weight'>;

const COMMON: Tier = { pts: 10, grip: 0.85, slip: 0.08, weight: 6 };
const UNCOMMON: Tier = { pts: 25, grip: 0.75, slip: 0.15, weight: 4.4 };
const RARE: Tier = { pts: 50, grip: 0.5, slip: 0.26, weight: 3 };
const JACKPOT: Tier = { pts: 100, grip: 0.35, slip: 0.38, weight: 3 };

/** size = the model's bounding box in the asset pack (before PLUSH_SCALE). Ears and tails stick out, so shrink a little. */
const plush = (name: string, emoji: string, model: string, size: [number, number, number], tier: Tier): PrizeType => {
  const half = size.map((s) => (s * PLUSH_SCALE * 0.88) / 2) as [number, number, number];

  return { name, emoji, model, shape: { kind: 'box', half }, r: Math.max(...half), ...tier };
};

export const PRIZE_TYPES: PrizeType[] = [
  plush('Chick', '🐥', 'Chick_01', [0.4, 0.43, 0.43], COMMON),
  plush('Pig', '🐷', 'Pig_01', [0.36, 0.4, 0.25], COMMON),
  plush('Cat', '🐱', 'Cat_01', [0.32, 0.43, 0.23], COMMON),
  plush('Dog', '🐶', 'Dog_01', [0.38, 0.43, 0.29], COMMON),
  plush('Rabbit', '🐰', 'Rabbit_01', [0.3, 0.5, 0.22], COMMON),
  plush('Bear', '🐻', 'Bear_01', [0.32, 0.41, 0.25], UNCOMMON),
  plush('Panda', '🐼', 'Panda_01', [0.32, 0.39, 0.26], UNCOMMON),
  plush('Koala', '🐨', 'Koala_01', [0.4, 0.44, 0.28], UNCOMMON),
  plush('Fox', '🦊', 'Fox_01', [0.33, 0.45, 0.32], UNCOMMON),
  plush('Penguin', '🐧', 'Penguin_01', [0.46, 0.41, 0.39], UNCOMMON),
  plush('Lion', '🦁', 'Lion_01', [0.32, 0.4, 0.27], RARE),
  plush('Elephant', '🐘', 'Elephant_01', [0.44, 0.41, 0.29], RARE),
  plush('Crocodile', '🐊', 'Crocodile_01', [0.32, 0.42, 0.4], RARE),
  plush('Shark', '🦈', 'Shark_01', [0.44, 0.49, 0.51], RARE),
  plush('Unicorn', '🦄', 'Unicorn_01', [0.34, 0.47, 0.3], JACKPOT),
  { name: 'Mystery Box', emoji: '🎁', model: 'gift', shape: { kind: 'box', half: [0.31, 0.28, 0.31] }, r: 0.36, pts: '?', grip: 0.7, slip: 0.18, weight: 13 },
  { name: 'Bomb', emoji: '💣', model: 'bomb', shape: { kind: 'ball', r: 0.36 }, r: 0.36, pts: -40, grip: 0.95, slip: 0.03, weight: 9 },
];

const TOTAL_WEIGHT = PRIZE_TYPES.reduce((s, t) => s + t.weight, 0);

/** Index into PRIZE_TYPES, picked by spawn weight. */
export const randomPrizeType = (): number => {
  let roll = Math.random() * TOTAL_WEIGHT;

  for (let i = 0; i < PRIZE_TYPES.length; i++) {
    roll -= PRIZE_TYPES[i].weight;

    if (roll <= 0) {
      return i;
    }
  }

  return 0;
};

/** Points for a prize that just went down a chute. `lucky` (the Lucky Box upgrade): mystery boxes only roll from the top three values. */
export const rollPoints = (t: PrizeType, lucky = false): number => {
  if (t.pts !== '?') {
    return t.pts;
  }

  const table = lucky ? MYSTERY_POINTS.slice(-3) : MYSTERY_POINTS;

  return table[Math.floor(Math.random() * table.length)];
};
