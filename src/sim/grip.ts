// Holding a prize: a ball joint at the spot the fingers caught it, plus a spring that keeps it
// roughly at the angle it was caught. Caught off-centre, it hangs lopsided and the claw leans.
import { PRIZE_TYPES } from '../shared/prizes';
import { GRIP_POINT } from '../shared/claw-pose';
import { clamp, conjugate, mulQuat, toLocal, toWorld, type Quat, type Vec3 } from '../shared/math';
import { GRAVITY, GROUPS, fromRotation, fromVector, rapier, toVector, type World } from './physics';
import { PRIZE_ANGULAR_DAMPING, type Prize } from './prize';
import type { Claw } from './claw';

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

/** Join prize p to claw c (claw index i). */
export const attach = (world: World, c: Claw, i: number, p: Prize) => {
  const pose = c.pose;
  const pPos = fromVector(p.body.translation()), pRot = fromRotation(p.body.rotation());
  // Nearest point on (just inside) the prize to the fingertips: that's where it's held.
  const local = toLocal(pPos, pRot, toWorld(pose.hub, pose.quat, GRIP_POINT));
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

  p.heldBy = i;
  p.lastHolder = i;
  p.regroupAt = 0;
  p.collider.setCollisionGroups(GROUPS.held);
  p.body.setAngularDamping(HELD_ANGULAR_DAMPING);
};

/** Let go of whatever claw c (index i) is holding. `now` is the sim clock. */
export const detach = (world: World, c: Claw, p: Prize | undefined, i: number, now: number) => {
  if (c.joint) {
    world.removeImpulseJoint(c.joint, true);
    c.joint = null;
  }

  c.held = -1;

  if (!p) {
    return;
  }

  p.heldBy = -1;
  p.lastHolder = i; // a slipped prize that tumbles into a chute still counts for you
  p.regroupAt = now + RELEASE_GRACE;
  p.body.setAngularDamping(PRIZE_ANGULAR_DAMPING);
};

/** Ease the grip point from where the prize was touched to the middle of the fingers. */
export const slideGripAnchor = (c: Claw, dt: number) => {
  if (!c.joint || c.anchorT >= 1) {
    return;
  }

  c.anchorT = Math.min(1, c.anchorT + dt / ANCHOR_SLIDE_TIME);

  const e = c.anchorT * c.anchorT * (3 - 2 * c.anchorT);

  c.joint.setAnchor1(toVector(c.anchorFrom.map((v, k) => v + (GRIP_POINT[k] - v) * e) as Vec3));
};

/**
 * The ball joint alone would let a gripped prize flop around like it's on a string. Real fingers clamp it,
 * so pull it back toward the angle it was caught at with a damped spring. Gravity still tips an
 * off-centre prize over part of the way, and it sways as the claw moves.
 */
export const gripSpring = (c: Claw, p: Prize, dt: number) => {
  let err = mulQuat(fromRotation(p.body.rotation()), conjugate(mulQuat(c.pose.quat, c.gripRel)));

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
