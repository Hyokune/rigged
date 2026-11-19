// Holding a prize: a ball joint at the spot the fingers caught it, plus a spring that keeps it
// roughly at the angle it was caught. Caught off-centre, it hangs lopsided and the claw leans.
import { PRIZE_TYPES } from '../shared/prizes';
import { clamp, conjugate, mulQuat, toLocal, toWorld, type Quat, type Vec3 } from '../shared/math';
import { GRAVITY, GROUPS, fromRotation, fromVector, rapier, toVector, type World } from './physics';
import { PRIZE_ANGULAR_DAMPING, type Prize } from './prize';
import { gripPoint, type Claw, type ExtraGrip } from './claw';

const HELD_ANGULAR_DAMPING = 1.5;
/**
 * How firmly the fingers hold a prize at the angle it was caught. Lower = it tips further when grabbed
 * off-centre (roughly: tilt in radians ≈ grip offset / this).
 */
const GRIP_STIFFNESS = 0.45;
/** Seconds for the grip point to slide from where the prize was touched to the middle of the fingers. */
const ANCHOR_SLIDE_TIME = 0.4;
/** After letting go, a prize ignores claws for this long so the opening fingers don't bat it away. */
const RELEASE_GRACE = 0.5;
/**
 * Multi-grab: extra prizes are held by their centre, pulled in to this far out from the main grip point
 * (× claw size) and a little lower, so they bunch up around the main prize and drop into the same chute.
 */
const EXTRA_SPREAD = 0.5;
const EXTRA_DROP = 0.3;

/** Mark a prize as held by claw i: it stops colliding with claws and steadies its spin. */
const takeHold = (p: Prize, i: number) => {
  p.heldBy = i;
  p.lastHolder = i;
  p.regroupAt = 0;
  p.collider.setCollisionGroups(GROUPS.held);
  p.body.setAngularDamping(HELD_ANGULAR_DAMPING);
};

/** Back to a loose prize. Claw i still gets the points if it tumbles into a chute. */
const loseHold = (p: Prize, i: number, now: number) => {
  p.heldBy = -1;
  p.lastHolder = i;
  p.regroupAt = now + RELEASE_GRACE;
  p.body.setAngularDamping(PRIZE_ANGULAR_DAMPING);
};

/** Join prize p to claw c (claw index i). */
export const attach = (world: World, c: Claw, i: number, p: Prize) => {
  const pose = c.pose;
  const pPos = fromVector(p.body.translation()), pRot = fromRotation(p.body.rotation());
  // Nearest point on (just inside) the prize to the fingertips: that's where it's held.
  const local = toLocal(pPos, pRot, toWorld(pose.hub, pose.quat, gripPoint(c)));
  const shape = PRIZE_TYPES[p.type].shape;

  if (shape.kind === 'box') {
    for (let k = 0; k < 3; k++) {
      local[k] = clamp(local[k], -shape.half[k] * 0.8, shape.half[k] * 0.8);
    }
  } else {
    const l = Math.hypot(...local), max = shape.r * 0.8;

    if (l > max) {
      for (let k = 0; k < 3; k++) {
        local[k] *= max / l;
      }
    }
  }

  const heldAt = toWorld(pPos, pRot, local);
  const anchor = toLocal(pose.hub, pose.quat, heldAt);

  c.joint = world.createImpulseJoint(rapier().JointData.spherical(toVector(anchor), toVector(local)), c.body, p.body, true);
  c.joint.setContactsEnabled(false);
  c.anchorFrom = anchor;
  c.anchorT = 0;
  c.gripRel = mulQuat(conjugate(pose.quat), pRot);
  c.held = p.id;
  // A lopsided grab twists the claw on its cable.
  c.wYaw += (heldAt[0] - pose.hub[0] - (heldAt[2] - pose.hub[2])) * 6;
  takeHold(p, i);
};

/** Multi-grab: also hold prize p, alongside the main one. */
export const attachExtra = (world: World, c: Claw, i: number, p: Prize) => {
  const pose = c.pose;
  const pRot = fromRotation(p.body.rotation());
  const from = toLocal(pose.hub, pose.quat, fromVector(p.body.translation()));
  const g = gripPoint(c), side = Math.hypot(from[0], from[2]) || 1;
  const spread = EXTRA_SPREAD * c.scale;
  const to: Vec3 = [g[0] + (from[0] / side) * spread, g[1] - EXTRA_DROP, g[2] + (from[2] / side) * spread];
  const joint = world.createImpulseJoint(rapier().JointData.spherical(toVector(from), { x: 0, y: 0, z: 0 }), c.body, p.body, true);

  joint.setContactsEnabled(false);
  c.extras.push({ id: p.id, joint, from, to, t: 0, rel: mulQuat(conjugate(pose.quat), pRot) });
  takeHold(p, i);
};

/** Let go of whatever claw c (index i) is holding. `now` is the sim clock. */
export const detach = (world: World, c: Claw, p: Prize | undefined, i: number, now: number) => {
  if (c.joint) {
    world.removeImpulseJoint(c.joint, true);
    c.joint = null;
  }

  c.held = -1;

  if (p) {
    loseHold(p, i, now); // a slipped prize that tumbles into a chute still counts for you
  }
};

/** Let go of a multi-grab's extra prize. */
export const detachExtra = (world: World, e: ExtraGrip, p: Prize | undefined, i: number, now: number) => {
  world.removeImpulseJoint(e.joint, true);

  if (p) {
    loseHold(p, i, now);
  }
};

const smooth = (t: number) => t * t * (3 - 2 * t);
const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** Ease the grip point from where the prize was touched to the middle of the fingers (and extras in snug). */
export const slideGripAnchor = (c: Claw, dt: number) => {
  if (c.joint && c.anchorT < 1) {
    c.anchorT = Math.min(1, c.anchorT + dt / ANCHOR_SLIDE_TIME);
    c.joint.setAnchor1(toVector(lerp3(c.anchorFrom, gripPoint(c), smooth(c.anchorT))));
  }

  for (const e of c.extras) {
    if (e.t < 1) {
      e.t = Math.min(1, e.t + dt / ANCHOR_SLIDE_TIME);
      e.joint.setAnchor1(toVector(lerp3(e.from, e.to, smooth(e.t))));
    }
  }
};

/**
 * The ball joint alone would let a gripped prize flop around like it's on a string. Real fingers clamp it,
 * so pull it back toward the angle it was caught at with a damped spring. Gravity still tips an
 * off-centre prize over part of the way, and it sways as the claw moves.
 * `rel`: the prize's orientation relative to the claw when caught.
 */
export const gripSpring = (c: Claw, p: Prize, dt: number, rel: Quat = c.gripRel) => {
  let err = mulQuat(fromRotation(p.body.rotation()), conjugate(mulQuat(c.pose.quat, rel)));

  if (err[3] < 0) {
    err = err.map((v) => -v) as Quat; // take the short way round
  }

  const s = Math.hypot(err[0], err[1], err[2]);

  if (s < 1e-6) {
    return;
  }

  const angle = 2 * Math.atan2(s, err[3]);
  const k = p.body.mass() * GRAVITY * GRIP_STIFFNESS, damp = k * 0.15;
  const w = p.body.angvel();

  p.body.applyTorqueImpulse({
    x: (-k * angle * (err[0] / s) - damp * w.x) * dt,
    y: (-k * angle * (err[1] / s) - damp * w.y) * dt,
    z: (-k * angle * (err[2] / s) - damp * w.z) * dt,
  }, true);
};
