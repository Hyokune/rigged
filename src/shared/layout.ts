// The machine's dimensions. It grows wider with more players; every client derives the same layout
// from the player count, so it never needs to be sent over the network.

export interface Chute {
  x: number;
  z: number;
  size: number;
}

export interface Layout {
  n: number;
  width: number;
  depth: number;
  height: number;
  chutes: Chute[];
  chuteZ: number;
  /** z of the acrylic wall between the prize pit and the chute shelf. */
  dividerZ: number;
  dividerH: number;
  /** Claw tip height when fully raised. */
  topY: number;
  /** Where claws wander while waiting for the button. */
  roam: { minX: number; maxX: number; minZ: number; maxZ: number };
}

export const machineLayout = (players: number): Layout => {
  const n = Math.max(1, players | 0);
  const width = Math.max(9, 3.6 + n * 2.2);
  const depth = 7;
  const height = 6.2;
  const chuteSize = 1.7;
  const chuteZ = depth / 2 - chuteSize / 2 - 0.1;
  const dividerZ = chuteZ - chuteSize / 2 - 0.1;
  const count = Math.max(1, Math.ceil(n / 2));
  const chutes = Array.from({ length: count }, (_, i) => ({
    x: -width / 2 + (width * (i + 0.5)) / count,
    z: chuteZ,
    size: chuteSize,
  }));

  return {
    n, width, depth, height, chutes, chuteZ, dividerZ,
    dividerH: 0.9,
    topY: height - 1.7,
    roam: { minX: -width / 2 + 0.9, maxX: width / 2 - 0.9, minZ: -depth / 2 + 0.9, maxZ: dividerZ - 0.5 },
  };
};

export const nearestChute = (L: Layout, x: number): Chute =>
  L.chutes.reduce((best, ch) => (Math.abs(ch.x - x) < Math.abs(best.x - x) ? ch : best));
