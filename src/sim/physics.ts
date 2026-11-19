// Rapier physics engine setup: loading, collision groups, and the machine's static colliders.
import type * as Rapier from '@dimforge/rapier3d-compat';
import type { Layout } from '../shared/layout';
import type { Quat, Vec3 } from '../shared/math';

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
 * The chute shelf is a slippery tray, so the push toward the chutes (prize.ts) always beats friction
 * and nothing comes to rest on it. Uses the Min combine rule so the toys' own grippy friction doesn't win.
 */
const SHELF_FRICTION = 0.05;

/** Floor, chute shelf (with holes and drop tubes), acrylic divider, glass walls and ceiling. */
export const buildMachineColliders = (world: Rapier.World, L: Layout) => {
  const { ColliderDesc, CoefficientCombineRule } = rapier();
  const W2 = L.width / 2, D2 = L.depth / 2, H = L.height;

  const box = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, slippery = false) => {
    if (x1 - x0 < 1e-3 || y1 - y0 < 1e-3 || z1 - z0 < 1e-3) {
      return;
    }

    const desc = ColliderDesc.cuboid((x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2)
      .setTranslation((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)
      .setFriction(slippery ? SHELF_FRICTION : SURFACE_FRICTION)
      .setCollisionGroups(GROUPS.static);

    if (slippery) {
      desc.setFrictionCombineRule(CoefficientCombineRule.Min);
    }

    world.createCollider(desc);
  };

  box(-W2, W2, -1, 0, -D2, L.dividerZ); // prize pit floor

  // The chute shelf in front of the divider, with a hole and a drop tube for each chute.
  let x = -W2;

  for (const ch of [...L.chutes].sort((a, b) => a.x - b.x)) {
    const h = ch.size / 2, x0 = ch.x - h, x1 = ch.x + h, z0 = ch.z - h, z1 = ch.z + h, t = 0.05;

    box(x, x0, -1, 0, L.dividerZ, D2, true);
    box(x0, x1, -1, 0, L.dividerZ, z0, true);
    box(x0, x1, -1, 0, z1, D2, true);
    box(x0 - t, x0, -3, 0, z0, z1, true);
    box(x1, x1 + t, -3, 0, z0, z1, true);
    box(x0, x1, -3, 0, z0 - t, z0, true);
    box(x0, x1, -3, 0, z1, z1 + t, true);
    x = x1;
  }

  box(x, W2, -1, 0, L.dividerZ, D2, true);

  box(-W2, W2, 0, L.dividerH, L.dividerZ - 0.02, L.dividerZ + 0.02); // acrylic divider

  const T = 0.5; // glass walls and ceiling

  box(-W2 - T, -W2, -3, H, -D2, D2);
  box(W2, W2 + T, -3, H, -D2, D2);
  box(-W2, W2, -3, H, -D2 - T, -D2);
  box(-W2, W2, -3, H, D2, D2 + T);
  box(-W2, W2, H, H + T, -D2, D2);
};
