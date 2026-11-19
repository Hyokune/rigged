// Where the claw head hangs, given its carriage, cable length and swing.
// Shared by the host simulation (to move the physics body) and the renderer (to draw it), so both agree.
import { mulQuat, normalizeQuat, yawQuat, type Quat, type Vec3 } from './math';

/** Distance from the claw's fingertips up to the hub centre. */
export const HUB_ABOVE_TIP = 0.85;
/** The cable hangs from this far below the machine's ceiling. */
export const PIVOT_BELOW_CEILING = 0.35;
/** Point between the fingertips (in the hub's local frame) that a grabbed prize hangs from. */
export const GRIP_POINT: Vec3 = [0, -0.72, 0];

export interface ClawPose {
  pivot: Vec3;
  hub: Vec3;
  /** Hub orientation (tilted along the cable, plus twist). */
  quat: Quat;
  /** Unit vector from the pivot down the cable. */
  dir: Vec3;
  /** Cable length from pivot to hub centre. */
  len: number;
}

/**
 * @param tipY   fingertip height if the claw hung straight down
 * @param swingX swing angle that displaces the claw toward +x (radians)
 * @param swingZ swing angle that displaces the claw toward +z (radians)
 * @param yaw    twist around the cable (radians)
 * @param scale  size of the claw head (Mega Claw is bigger, so its hub sits further above its tips)
 */
export const clawPose = (
  ceiling: number, cx: number, cz: number, tipY: number, swingX: number, swingZ: number, yaw: number, scale = 1,
): ClawPose => {
  const pivot: Vec3 = [cx, ceiling - PIVOT_BELOW_CEILING, cz];
  const len = Math.max(0.05, pivot[1] - (tipY + HUB_ABOVE_TIP * scale));
  const tx = Math.tan(swingX), tz = Math.tan(swingZ);
  const inv = 1 / Math.hypot(tx, 1, tz);
  const dir: Vec3 = [tx * inv, -inv, tz * inv];
  const hub: Vec3 = [pivot[0] + dir[0] * len, pivot[1] + dir[1] * len, pivot[2] + dir[2] * len];
  // Shortest rotation from straight down (0,-1,0) to dir, then twist around the hub's own up axis.
  const tilt = normalizeQuat([-dir[2], 0, dir[0], 1 - dir[1]]);

  return { pivot, hub, quat: mulQuat(tilt, yawQuat(yaw)), dir, len };
};
