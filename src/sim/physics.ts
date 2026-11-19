// Rapier physics engine setup: loading, collision groups, and the machine's static colliders.
import type * as Rapier from '@dimforge/rapier3d-compat';
import { polygonCorners, sideAngle, sideNormal, sideTangent, type Layout } from '../shared/layout';
import { yawQuat, type Quat, type Vec3 } from '../shared/math';

export type { RigidBody, Collider, ImpulseJoint, World } from '@dimforge/rapier3d-compat';

/** Fixed physics timestep (seconds). */
export const STEP = 1 / 60;
export const GRAVITY = 18;

// Rapier is ~4 MB (its WebAssembly is embedded), so it's loaded as a separate chunk in parallel
// with the models instead of holding up the first paint.
let engine: typeof Rapier.default | null = null;
let loading: Promise<void> | null = null;

/** Loads the physics engine. Must resolve before creating a Sim. */
export const initPhysics = (): Promise<void> => {
  loading ??= import('@dimforge/rapier3d-compat').then(async (m) => {
    await m.default.init();
    engine = m.default;
  });

  return loading;
};

/** The loaded Rapier module. */
export const rapier = () => {
  if (!engine) {
    throw new Error('Physics not loaded: await initPhysics() first');
  }

  return engine;
};

// Collision groups: (membership << 16) | which groups it collides with.
const STATIC = 1, PRIZE = 2, CLAW = 4, HELD = 8;
const group = (member: number, filter: number) => (member << 16) | filter;

export const GROUPS = {
  static: group(STATIC, 0xffff),
  prize: group(PRIZE, STATIC | PRIZE | CLAW | HELD),
  /** A held prize ignores claws, so it doesn't fight the fingers holding it. */
  held: group(HELD, STATIC | PRIZE),
  claw: group(CLAW, PRIZE),
};

// Rapier takes {x, y, z} objects; our shared maths uses tuples.
export const toVector = (v: Vec3) => ({ x: v[0], y: v[1], z: v[2] });
export const toRotation = (q: Quat) => ({ x: q[0], y: q[1], z: q[2], w: q[3] });
export const fromVector = (v: { x: number; y: number; z: number }): Vec3 => [v.x, v.y, v.z];
export const fromRotation = (q: { x: number; y: number; z: number; w: number }): Quat => [q.x, q.y, q.z, q.w];

export const createWorld = (): Rapier.World => {
  const world = new (rapier().World)({ x: 0, y: -GRAVITY, z: 0 });

  world.timestep = STEP;

  return world;
};

/** Friction of the floor, walls and divider. */
const SURFACE_FRICTION = 0.8;
/**
 * The chute shelves are slippery trays, so the push toward the chutes (prize.ts) always beats friction
 * and nothing comes to rest on them. Uses the Min combine rule so the toys' own grippy friction doesn't win.
 */
const SHELF_FRICTION = 0.05;
const TUBE_WALL = 0.025;
const GLASS_THICKNESS = 0.5;

/**
 * Pit floor, a chute shelf (with a hole and drop tube) on every side, the acrylic dividers, the glass
 * walls and the ceiling. Per-side pieces are described in that side's own frame: u runs along the side,
 * v points outward from the centre.
 */
export const buildMachineColliders = (world: Rapier.World, L: Layout) => {
  const { ColliderDesc, CoefficientCombineRule } = rapier();
  const N = L.sides, H = L.height, slope = Math.tan(Math.PI / N);

  const add = (desc: Rapier.ColliderDesc | null, slippery = false) => {
    if (!desc) {
      return;
    }

    desc.setFriction(slippery ? SHELF_FRICTION : SURFACE_FRICTION).setCollisionGroups(GROUPS.static);

    if (slippery) {
      desc.setFrictionCombineRule(CoefficientCombineRule.Min);
    }

    world.createCollider(desc);
  };

  /** A convex slab between heights y0 and y1 whose outline is `outline` (x, z) points. */
  const slab = (outline: [number, number][], y0: number, y1: number) =>
    ColliderDesc.convexHull(new Float32Array(outline.flatMap(([x, z]) => [x, y0, z, x, y1, z])));

  /** Side k's (u, v) coordinates to world (x, z). */
  const toWorld = (k: number, u: number, v: number): [number, number] => {
    const [nx, nz] = sideNormal(N, k), [tx, tz] = sideTangent(N, k);

    return [u * tx + v * nx, u * tz + v * nz];
  };

  /** A box lined up with side k: centred at (u, y, v), with half-sizes along the side, up, and outward. */
  const sideBox = (k: number, u: number, y: number, v: number, halfU: number, halfY: number, halfV: number) => {
    const [x, z] = toWorld(k, u, v);

    return ColliderDesc.cuboid(halfU, halfY, halfV).setTranslation(x, y, z).setRotation(toRotation(yawQuat(sideAngle(N, k))));
  };

  add(slab(polygonCorners(N, L.innerApothem), -1, 0)); // prize pit floor

  for (let k = 0; k < N; k++) {
    const ai = L.innerApothem, ao = L.apothem;
    const ch = L.chutes[k], h = ch.size / 2;
    const v = Math.hypot(ch.x, ch.z); // chute centre, outward from the middle
    const quad = (pts: [number, number][]) => slab(pts.map(([pu, pv]) => toWorld(k, pu, pv)), -1, 0);

    // The shelf around the chute hole, in four pieces.
    add(quad([[-ai * slope, ai], [-h, ai], [-h, ao], [-ao * slope, ao]]), true);
    add(quad([[h, ai], [ai * slope, ai], [ao * slope, ao], [h, ao]]), true);
    add(quad([[-h, ai], [h, ai], [h, v - h], [-h, v - h]]), true);
    add(quad([[-h, v + h], [h, v + h], [h, ao], [-h, ao]]), true);

    // The drop tube under the hole.
    add(sideBox(k, -h - TUBE_WALL, -1.5, v, TUBE_WALL, 1.5, h), true);
    add(sideBox(k, h + TUBE_WALL, -1.5, v, TUBE_WALL, 1.5, h), true);
    add(sideBox(k, 0, -1.5, v - h - TUBE_WALL, h, 1.5, TUBE_WALL), true);
    add(sideBox(k, 0, -1.5, v + h + TUBE_WALL, h, 1.5, TUBE_WALL), true);

    add(sideBox(k, 0, L.dividerH / 2, ai, ai * slope, L.dividerH / 2, 0.02)); // acrylic divider
    add(sideBox(k, 0, (H - 3) / 2, ao + GLASS_THICKNESS / 2, ao * slope + GLASS_THICKNESS, (H + 3) / 2, GLASS_THICKNESS / 2)); // glass
  }

  add(slab(polygonCorners(N, L.apothem + GLASS_THICKNESS), H, H + 0.5)); // ceiling
};
