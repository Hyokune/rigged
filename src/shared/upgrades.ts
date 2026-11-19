// Roguelike upgrades. Every so often the game pauses and each player is offered three cards; a cursor
// cycles over them and their one button locks in whichever is lit. Most cards help your own claw;
// a few rare "sabotage" cards rig everyone else's, and once in a blue moon a legendary card turns up.
//
// Upgrades travel over the network as indices into UPGRADES, so only ever add to the end of the list.

export interface UpgradeType {
  name: string;
  emoji: string;
  desc: string;
  /** how many times one player can take it */
  max: number;
  /** relative chance of being offered */
  weight: number;
  /** affects everyone else instead of you */
  sabotage?: boolean;
  /** super rare, and shown off to everyone when taken */
  legendary?: boolean;
}

export const UPGRADES: UpgradeType[] = [
  { name: 'Iron Grip', emoji: '🦾', desc: '+12% chance to hold on', max: 3, weight: 3 },
  { name: 'Sticky Fingers', emoji: '🍯', desc: 'Prizes slip 35% less', max: 3, weight: 3 },
  { name: 'Magnet Claw', emoji: '🧲', desc: 'Grab from 30% further away', max: 2, weight: 3 },
  { name: 'Steady Hands', emoji: '🧘', desc: 'Roams slower and sways less', max: 2, weight: 2.5 },
  { name: 'Turbo Winch', emoji: '⚡', desc: 'Drop, lift and carry 25% faster', max: 3, weight: 3 },
  { name: 'Greedy', emoji: '💰', desc: '+20% points per prize', max: 3, weight: 2.5 },
  { name: 'Bomb Suit', emoji: '🦺', desc: 'Bombs cost half as much', max: 2, weight: 2 },
  { name: 'Lucky Box', emoji: '🍀', desc: 'Mystery boxes always pay big', max: 1, weight: 2 },
  { name: 'Butterfingers', emoji: '🧈', desc: "Everyone else's prizes slip 30% more", max: 2, weight: 1.2, sabotage: true },
  { name: 'Earthquake', emoji: '🌋', desc: "Everyone else's claws sway much harder", max: 2, weight: 1.2, sabotage: true },
  { name: 'Espresso', emoji: '☕', desc: "Everyone else's claws roam 25% faster", max: 2, weight: 1.2, sabotage: true },
  // ~0.5% of cards dealt: about one pick in 70 has it
  { name: 'Mega Claw', emoji: '🦀', desc: 'A giant claw that grabs up to 3 prizes at once', max: 1, weight: 0.12, legendary: true },
];

const IRON_GRIP = 0, STICKY = 1, MAGNET = 2, STEADY = 3, TURBO = 4, GREEDY = 5, BOMB_SUIT = 6, LUCKY = 7;
const BUTTERFINGERS = 8, EARTHQUAKE = 9, ESPRESSO = 10, MEGA_CLAW = 11;

/** Mega Claw: how much bigger the claw is, and its extra reach and grip. */
const MEGA_SCALE = 1.6;
const MEGA_REACH = 1.5;
const MEGA_GRIP = 0.15;
const MEGA_GRABS = 3;

// ---------- timing (shared so clients can draw the cursor where the host has it) ----------

/** Seconds of play between upgrade picks. */
export const DRAFT_EVERY = 15;
/**
 * Seconds the cursor rests on each card: about 16 cards a second, faster than anyone can react, so it's a
 * gamble rather than aiming for the best card. It starts moving (and players can stop it) as soon as the cards appear.
 */
export const CURSOR_STEP = 0.06;
/** Once everyone has picked, show the picks this long before play resumes. */
export const DRAFT_OUTRO = 0.8;

/** Which card the cursor is on at time t into a pick (-1 if there are no cards). */
export const draftCursor = (t: number, cards: number) => (cards <= 0 ? -1 : Math.floor(t / CURSOR_STEP) % cards);

// ---------- offers ----------

const count = (owned: number[], u: number) => owned.filter((x) => x === u).length;

/**
 * Three different cards for a player who already owns `owned`. Maxed-out cards aren't offered, and
 * sabotage is left out when there's nobody to sabotage.
 */
export const rollOffers = (owned: number[], players: number, cards = 3): number[] => {
  const pool = UPGRADES.map((_, i) => i).filter((i) => count(owned, i) < UPGRADES[i].max && (players > 1 || !UPGRADES[i].sabotage));
  const offers: number[] = [];

  while (offers.length < cards && pool.length) {
    const total = pool.reduce((sum, i) => sum + UPGRADES[i].weight, 0);
    let roll = Math.random() * total;
    let k = 0;

    while (roll >= UPGRADES[pool[k]].weight && k < pool.length - 1) {
      roll -= UPGRADES[pool[k]].weight;
      k++;
    }

    offers.push(pool[k]);
    pool.splice(k, 1);
  }

  return offers;
};

// ---------- effects ----------

/** Multipliers and bonuses for one player's claw, from their own upgrades and everyone else's sabotage. */
export interface Mods {
  /** added to the prize's grip chance */
  grip: number;
  /** × slip chance */
  slip: number;
  /** × grab reach */
  reach: number;
  /** × roaming speed */
  roam: number;
  /** × how much the carriage starting and stopping swings the claw */
  sway: number;
  /** × drop / lift / carry speed */
  winch: number;
  /** × points for a prize */
  points: number;
  /** × a bomb's penalty */
  bomb: number;
  /** mystery boxes roll from the top of the table */
  lucky: boolean;
  /** size of the claw (Mega Claw) */
  scale: number;
  /** how many prizes one grab can pick up */
  grabs: number;
}

/** Mods for player i, given every player's upgrades. */
export const computeMods = (owned: number[][], i: number): Mods => {
  const mine = (u: number) => count(owned[i] ?? [], u);
  const others = (u: number) => owned.reduce((sum, list, j) => sum + (j === i ? 0 : count(list, u)), 0);
  const mega = mine(MEGA_CLAW) > 0;

  return {
    grip: 0.12 * mine(IRON_GRIP) + (mega ? MEGA_GRIP : 0),
    slip: 0.65 ** mine(STICKY) * 1.3 ** others(BUTTERFINGERS),
    reach: (1 + 0.3 * mine(MAGNET)) * (mega ? MEGA_REACH : 1),
    roam: 0.85 ** mine(STEADY) * 1.25 ** others(ESPRESSO),
    sway: 0.6 ** mine(STEADY) * 1.8 ** others(EARTHQUAKE),
    winch: 1 + 0.25 * mine(TURBO),
    points: 1 + 0.2 * mine(GREEDY),
    bomb: Math.max(0, 1 - 0.5 * mine(BOMB_SUIT)),
    lucky: mine(LUCKY) > 0,
    scale: mega ? MEGA_SCALE : 1,
    grabs: mega ? MEGA_GRABS : 1,
  };
};

/** "🦾×2 🧲" for a list of owned upgrades. */
export const upgradeSummary = (owned: number[]) =>
  [...new Set(owned)].map((u) => UPGRADES[u].emoji + (count(owned, u) > 1 ? `×${count(owned, u)}` : '')).join(' ');
