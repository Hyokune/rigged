// The machine's shape: a regular polygon with one side per player (at least 4 — a square for 1-4
// players, then pentagon, hexagon, heptagon, octagon). Each side has its own chute, owned by that
// player. Every client derives the same layout from the player count, so it's never sent over the network.
//
// Geometry: side k faces outward along `normal(k)`; side 0 faces +z (toward the default camera).
// "Apothem" = distance from the centre to the middle of a side.

export interface Chute {
  x: number;
  z: number;
  size: number;
  /** which side of the machine it's on (= the seat of the player who owns it) */
  side: number;
}

export interface Layout {
  /** players */
  n: number;
  /** sides of the polygon */
  sides: number;
  height: number;
  /** centre to the glass walls */
  apothem: number;
  /** centre to the glass corners */
  radius: number;
  /** centre to the acrylic divider that separates the prize pit from the chute shelves */
  innerApothem: number;
  dividerH: number;
  /** one per side; chute i belongs to player i */
  chutes: Chute[];
  /** claw tip height when fully raised */
  topY: number;
  /** claws wander within this distance of the centre */
  roamRadius: number;
  /** floor area of the prize pit (for scaling the number of prizes) */
  pitArea: number;
}

const MIN_SIDES = 4;
const HEIGHT = 6.2;
const CHUTE_SIZE = 1.7;
/** Margin around a chute hole on its shelf. */
const CHUTE_MARGIN = 0.1;
/** Depth of the shelf between the divider and the glass. */
const SHELF_DEPTH = CHUTE_SIZE + CHUTE_MARGIN * 2;
/** Pit size: the square's pit is 7 x 7, and each extra side adds a bit more room. */
const PIT_APOTHEM_SQUARE = 3.5;
const PIT_APOTHEM_PER_SIDE = 0.375;

export const machineLayout = (players: number): Layout => {
  const n = Math.max(1, players | 0);
  const sides = Math.max(MIN_SIDES, n);
  const half = Math.PI / sides;
  const innerApothem = PIT_APOTHEM_SQUARE + PIT_APOTHEM_PER_SIDE * (sides - MIN_SIDES);
  const apothem = innerApothem + SHELF_DEPTH;
  const chuteDist = apothem - CHUTE_MARGIN - CHUTE_SIZE / 2;
  const chutes = Array.from({ length: sides }, (_, k) => {
    const [nx, nz] = sideNormal(sides, k);

    return { x: nx * chuteDist, z: nz * chuteDist, size: CHUTE_SIZE, side: k };
  });

  return {
    n,
    sides,
    height: HEIGHT,
    apothem,
    radius: apothem / Math.cos(half),
    innerApothem,
    dividerH: 0.9,
    chutes,
    topY: HEIGHT - 1.7,
    roamRadius: innerApothem - 0.9,
    pitArea: sides * innerApothem * innerApothem * Math.tan(half),
  };
};

/** Angle of side k's outward normal, measured from +z toward +x. */
export const sideAngle = (sides: number, k: number) => (2 * Math.PI * k) / sides;

/** Unit vector (x, z) pointing out through the middle of side k. */
export const sideNormal = (sides: number, k: number): [number, number] => {
  const a = sideAngle(sides, k);

  return [Math.sin(a), Math.cos(a)];
};

/** Unit vector (x, z) along side k (to the right, looking at that side from outside). */
export const sideTangent = (sides: number, k: number): [number, number] => {
  const a = sideAngle(sides, k);

  return [Math.cos(a), -Math.sin(a)];
};

/** Corners of the polygon whose sides are `apothem` from the centre, as (x, z), in side order. */
export const polygonCorners = (sides: number, apothem: number): [number, number][] => {
  const r = apothem / Math.cos(Math.PI / sides);

  return Array.from({ length: sides }, (_, k) => {
    const a = sideAngle(sides, k) + Math.PI / sides; // corner between side k and k + 1

    return [Math.sin(a) * r, Math.cos(a) * r];
  });
};

/**
 * How far out a point is, measured toward its nearest wall: < innerApothem is in the pit,
 * between innerApothem and apothem is on a chute shelf.
 */
export const outwardDistance = (L: Layout, x: number, z: number) => {
  let max = -Infinity;

  for (let k = 0; k < L.sides; k++) {
    const [nx, nz] = sideNormal(L.sides, k);

    max = Math.max(max, x * nx + z * nz);
  }

  return max;
};

/** Pull a point back inside the polygon whose sides are `apothem` from the centre. */
export const clampInside = (L: Layout, x: number, z: number, apothem: number): [number, number] => {
  for (let k = 0; k < L.sides; k++) {
    const [nx, nz] = sideNormal(L.sides, k);
    const over = x * nx + z * nz - apothem;

    if (over > 0) {
      x -= nx * over;
      z -= nz * over;
    }
  }

  return [x, z];
};

export const nearestChute = (L: Layout, x: number, z: number): Chute =>
  L.chutes.reduce((best, ch) => (Math.hypot(ch.x - x, ch.z - z) < Math.hypot(best.x - x, best.z - z) ? ch : best));

/** The chute a player's claw carries prizes to. */
export const ownChute = (L: Layout, seat: number): Chute => L.chutes[seat % L.chutes.length];
