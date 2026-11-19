// Prize rigid bodies: spawning, and the tray in front of the chutes that slides them in.
import { PRIZE_TYPES, randomPrizeType } from '../shared/prizes';
import { nearestChute, outwardDistance, type Layout } from '../shared/layout';
import { mulQuat, pitchQuat, rand, yawQuat } from '../shared/math';
import { GROUPS, rapier, toRotation, type Collider, type RigidBody, type World } from './physics';

export const PRIZE_ANGULAR_DAMPING = 0.9;

export interface Prize {
  id: number;
  /** index into PRIZE_TYPES */
  type: number;
  body: RigidBody;
  collider: Collider;
  /** index of the claw holding it, or -1 */
  heldBy: number;
  /** last claw to hold it; gets the points if it lands in a chute */
  lastHolder: number;
  /** sim time at which a released prize can collide with claws again (0 = already can) */
  regroupAt: number;
  /** seconds it's been sitting still in the drop area */
  stuckFor: number;
}

/**
 * A random prize somewhere over the pit. `initial` prizes start low and upright so the first pile
 * settles quickly; later ones drop in from the top at a slight angle.
 */
export const spawnPrize = (world: World, L: Layout, id: number, initial: boolean): Prize => {
  const { RigidBodyDesc, ColliderDesc } = rapier();
  const type = randomPrizeType();
  const t = PRIZE_TYPES[type];
  const yaw = rand(-Math.PI, Math.PI); // players look in from every side, so any way round is fine
  const tilt = initial ? 0 : rand(-0.5, 0.5);
  // Anywhere in the pit: a random point in the circle that fits inside the divider.
  const angle = rand(0, Math.PI * 2), dist = Math.sqrt(Math.random()) * (L.innerApothem - t.r - 0.2);
  const body = world.createRigidBody(
    RigidBodyDesc.dynamic()
      .setTranslation(Math.sin(angle) * dist, initial ? t.r + Math.random() * 3 : L.height - 0.8, Math.cos(angle) * dist)
      .setRotation(toRotation(mulQuat(yawQuat(yaw), pitchQuat(tilt))))
      .setLinearDamping(0.15)
      .setAngularDamping(PRIZE_ANGULAR_DAMPING),
  );
  const s = t.shape;
  const bevel = 0.08;
  const shape = s.kind === 'ball'
    ? ColliderDesc.ball(s.r)
    : ColliderDesc.roundCuboid(s.half[0] - bevel, s.half[1] - bevel, s.half[2] - bevel, bevel);
  const collider = world.createCollider(
    shape.setFriction(0.9).setRestitution(0.05).setDensity(1).setCollisionGroups(GROUPS.prize),
    body,
  );

  return { id, type, body, collider, heldBy: -1, lastHolder: -1, regroupAt: 0, stuckFor: 0 };
};

/**
 * Push toward the chute on the shelf (units/s²). The shelf is slippery (see physics.ts), so this always
 * beats friction: it acts like the tray sloping down into the nearest chute.
 */
const SHELF_PUSH = 6;
/** A prize in the drop area that hasn't moved for this long (seconds) is wedged: give it a hop. */
const UNSTICK_AFTER = 1.5;
const UNSTICK_HOP = 3;

/**
 * Centre within this distance of the divider (and above it) = balanced on top of it. Kept tight so toys
 * merely stacked against the pit side of the divider aren't pushed over into a chute for free.
 */
const ON_DIVIDER_RANGE = 0.2;

/** On a chute shelf or a chute's rim, or balanced on top of a divider. */
const inDropArea = (t: { x: number; y: number; z: number }, L: Layout) => {
  if (t.y < -0.5 || t.y > 1.6) {
    return false;
  }

  const out = outwardDistance(L, t.x, t.z);

  return out > L.innerApothem || (Math.abs(out - L.innerApothem) < ON_DIVIDER_RANGE && t.y > L.dividerH);
};

/** Slide prizes in the drop area into the nearest chute, so nothing gets stuck there. */
export const nudgeTowardChute = (p: Prize, L: Layout, dt: number) => {
  const t = p.body.translation();

  if (p.heldBy >= 0 || !inDropArea(t, L)) {
    p.stuckFor = 0;

    return;
  }

  const ch = nearestChute(L, t.x, t.z);
  const dx = ch.x - t.x, dz = ch.z - t.z, d = Math.hypot(dx, dz) || 1;
  const m = p.body.mass();

  p.body.applyImpulse({ x: (dx / d) * m * SHELF_PUSH * dt, y: 0, z: (dz / d) * m * SHELF_PUSH * dt }, true);

  // Still not moving (wedged against a wall or another toy)? Bump it, like a vibrating tray.
  const v = p.body.linvel();

  p.stuckFor = Math.hypot(v.x, v.y, v.z) < 0.1 ? p.stuckFor + dt : 0;

  if (p.stuckFor > UNSTICK_AFTER) {
    p.stuckFor = 0;
    p.body.applyImpulse({ x: (dx / d) * m * 1.5, y: m * UNSTICK_HOP, z: (dz / d) * m * 1.5 }, true);
  }
};
