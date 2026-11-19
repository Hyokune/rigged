// A claw: its carriage on the ceiling, how it roams, and how the head swings on its cable.
import { clawPose, GRIP_POINT, HUB_ABOVE_TIP, type ClawPose } from '../shared/claw-pose';
import { clampInside, sideNormal, type Chute, type Layout } from '../shared/layout';
import { approach, clamp, rand, toWorld, type Quat, type Vec3 } from '../shared/math';
import { GRAVITY, GROUPS, rapier, toRotation, toVector, type ImpulseJoint, type RigidBody, type World } from './physics';

export type ClawPhase = 'roam' | 'drop' | 'close' | 'lift' | 'carry' | 'release';

export interface Claw {
  /** carriage position on the ceiling */
  x: number; z: number;
  vx: number; vz: number;
  prevVx: number; prevVz: number;
  /** fingertip height if hanging straight down */
  y: number;
  open: number;
  phase: ClawPhase;
  /** time spent in the current phase */
  t: number;
  /** id of the prize being carried, or -1 */
  held: number;
  /** where it's wandering to, and when it'll pick somewhere new */
  tx: number; tz: number;
  retarget: number;
  chute: Chute | null;
  /** per-claw speed multiplier so they don't move in lockstep */
  pace: number;
  /** pendulum swing (radians) and angular velocities */
  swingX: number; swingZ: number; wX: number; wZ: number;
  /** twist around the cable */
  yaw: number; wYaw: number;
  /** kinematic physics body for the head, posed from the swing every step */
  body: RigidBody;
  pose: ClawPose;
  joint: ImpulseJoint | null;
  /** grip anchor slides from where the prize was caught to the fingertips */
  anchorFrom: Vec3;
  anchorT: number;
  /** held prize's orientation relative to the claw at the moment it was caught */
  gripRel: Quat;
  /** sim time at which a fumbled grab lets go (0 = not fumbling); see Sim.tryGrab */
  fumbleAt: number;
}

/** Claw i, starting in the pit in front of its player's own side. */
export const createClaw = (world: World, L: Layout, i: number): Claw => {
  const { RigidBodyDesc, ColliderDesc } = rapier();
  const [nx, nz] = sideNormal(L.sides, i);
  const x = nx * L.roamRadius * 0.6, z = nz * L.roamRadius * 0.6;
  const pose = clawPose(L.height, x, z, L.topY, 0, 0, 0);
  const body = world.createRigidBody(RigidBodyDesc.kinematicPositionBased().setTranslation(...pose.hub));

  world.createCollider(ColliderDesc.ball(0.2).setTranslation(0, 0.1, 0).setCollisionGroups(GROUPS.claw), body);

  const claw: Claw = {
    x, z, vx: 0, vz: 0, prevVx: 0, prevVz: 0, y: L.topY, open: 1, phase: 'roam', t: 0, held: -1,
    tx: x, tz: z, retarget: 0, chute: null, pace: rand(0.85, 1.15),
    swingX: 0, swingZ: 0, wX: 0, wZ: 0, yaw: 0, wYaw: 0,
    body, pose, joint: null, anchorFrom: [...GRIP_POINT], anchorT: 1, gripRel: [0, 0, 0, 1], fumbleAt: 0,
  };

  pickTarget(claw, L);

  return claw;
};

/** How far a claw wanders before picking somewhere new. */
const WANDER = 4;

/** Choose somewhere nearby to wander to next (anywhere over the pit). */
export const pickTarget = (c: Claw, L: Layout) => {
  let tx = c.x + rand(-WANDER, WANDER), tz = c.z + rand(-WANDER, WANDER);
  const d = Math.hypot(tx, tz);

  if (d > L.roamRadius) {
    tx *= L.roamRadius / d;
    tz *= L.roamRadius / d;
  }

  c.tx = tx;
  c.tz = tz;
  c.retarget = rand(1.2, 3.5);
  c.t = 0;
};

/** Wander around the pit (the 'roam' phase), keeping clear of the other claws. */
export const roam = (c: Claw, others: Claw[], L: Layout, dt: number, boost: number) => {
  c.open = approach(c.open, 1, dt * 3);
  c.y = approach(c.y, L.topY, dt * 4);
  c.t += dt;

  const dx = c.tx - c.x, dz = c.tz - c.z, d = Math.hypot(dx, dz);

  if (d < 0.3 || c.t > c.retarget) {
    pickTarget(c, L);
  }

  const speed = 2.3 * c.pace * boost;
  let wx = d > 1e-3 ? (dx / d) * speed : 0;
  let wz = d > 1e-3 ? (dz / d) * speed : 0;

  for (const o of others) {
    if (o === c) {
      continue;
    }

    const ox = c.x - o.x, oz = c.z - o.z, od = Math.hypot(ox, oz);

    if (od < 1.9 && od > 1e-4) {
      const push = (1.9 - od) * 5;

      wx += (ox / od) * push;
      wz += (oz / od) * push;
    }
  }

  const k = Math.min(1, dt * 3);

  c.vx += (wx - c.vx) * k;
  c.vz += (wz - c.vz) * k;
  [c.x, c.z] = clampInside(L, c.x + c.vx * dt, c.z + c.vz * dt, L.apothem - 0.6);
};

/** While dropping, sway dies away at this rate (per second), so the claw lands where you pressed. */
const STEADY_RATE = 10;

/**
 * The claw head is a damped pendulum hanging from the carriage. Carriage acceleration makes it sway,
 * and a prize hanging off-centre (heldAt = its x/z) pulls it over until the combined weight sits under the cable.
 * `steady` (dropping / closing): the claw steadies itself and comes straight down instead.
 */
export const updateSwing = (c: Claw, heldAt: { x: number; z: number } | null, dt: number, steady: boolean) => {
  const ax = (c.vx - c.prevVx) / dt, az = (c.vz - c.prevVz) / dt;

  c.prevVx = c.vx;
  c.prevVz = c.vz;
  c.wYaw += (-14 * c.yaw - 2.5 * c.wYaw) * dt; // the cable resists twisting
  c.yaw += c.wYaw * dt;

  if (steady) {
    const decay = Math.exp(-dt * STEADY_RATE);

    c.swingX *= decay;
    c.swingZ *= decay;
    c.wX *= decay;
    c.wZ *= decay;

    return;
  }

  const len = c.pose.len + 0.6; // effective length: the claw's weight sits below the hub
  let eqX = 0, eqZ = 0;

  if (heldAt) {
    const ox = heldAt.x - c.pose.hub[0], oz = heldAt.z - c.pose.hub[2];

    eqX = clamp(-Math.atan((0.45 * ox) / len) * 1.5, -0.35, 0.35);
    eqZ = clamp(-Math.atan((0.45 * oz) / len) * 1.5, -0.35, 0.35);
  }

  const k = GRAVITY / len;
  const inertia = 0.22; // how strongly carriage starts/stops kick the claw (1 = a free pendulum)

  c.wX += (-k * Math.sin(c.swingX - eqX) - inertia * (ax / len) * Math.cos(c.swingX) - 2.2 * c.wX) * dt;
  c.wZ += (-k * Math.sin(c.swingZ - eqZ) - inertia * (az / len) * Math.cos(c.swingZ) - 2.2 * c.wZ) * dt;
  c.swingX = clamp(c.swingX + c.wX * dt, -0.4, 0.4);
  c.swingZ = clamp(c.swingZ + c.wZ * dt, -0.4, 0.4);
};

/** Recompute where the head hangs and move its physics body there for the next physics step. */
export const updatePose = (c: Claw, L: Layout) => {
  c.pose = clawPose(L.height, c.x, c.z, c.y, c.swingX, c.swingZ, c.yaw);
  c.body.setNextKinematicTranslation(toVector(c.pose.hub));
  c.body.setNextKinematicRotation(toRotation(c.pose.quat));
};

/** World position of the fingertips (follows the swing). */
export const clawTip = (c: Claw): Vec3 => toWorld(c.pose.hub, c.pose.quat, [0, -HUB_ABOVE_TIP, 0]);
