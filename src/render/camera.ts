// Frames the machine for any screen shape, follows your claw on phones, lets players drag to look
// around, and does the attract-mode sway.
import * as THREE from 'three';
import type { Layout } from '../shared/layout';

/** Half-width of the view when following your claw on a phone. */
const FOLLOW_HALF_WIDTH = 5.5;
/** Radians of camera turn per pixel dragged. */
const DRAG_SPEED = 0.006;
/** How far you can swing round to either side (radians) — stops short of looking in from behind. */
const MAX_YAW = 1.1;
/** Lowest and highest viewing angle (radians above level) you can tilt to. Near the top the roof fades out (see View). */
const MIN_ELEVATION = 0.05;
const MAX_ELEVATION = 1.15;
/** How quickly the camera catches up with a drag (per second). */
const DRAG_SMOOTHING = 12;

export class CameraRig {
  /**
   * Near plane at 1 (not the usual 0.1): the camera is always 15+ units from the machine, and a larger near
   * plane makes depth sorting ~10x more precise, which stops nearby surfaces flickering against each other.
   */
  readonly camera = new THREE.PerspectiveCamera(36, 1, 1, 300);
  /** Slowly sway side to side (menus). */
  orbit = false;
  /** Track this x position (your claw) when zoomed in on a phone. */
  followX: number | null = null;
  private dist = 20;
  private centerY = 3;
  private elevation = 0.3;
  private follow = false;
  private followRange = 0;
  private x = 0;
  private time = 0;
  private shake = 0;
  /** Where the player has dragged the view to, and where the camera currently is on the way there. */
  private targetYaw = 0;
  private targetPitch = 0;
  private yaw = 0;
  private pitch = 0;

  setAspect(aspect: number) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** Recompute framing for a machine. `hasOwnClaw` enables the phone follow-cam. */
  frame(L: Layout, hasOwnClaw: boolean) {
    const vf = THREE.MathUtils.degToRad(this.camera.fov);
    const hf = 2 * Math.atan(Math.tan(vf / 2) * this.camera.aspect);
    const portrait = this.camera.aspect < 0.9;
    // On tall phone screens, crop the cabinet sides and look in more level so the claws aren't hidden by the roof.
    let halfW = L.width / 2 + (portrait ? 0.1 : 0.9);

    // On a phone with a big machine, zoom in to a window around your own claw and follow it sideways.
    this.follow = portrait && hasOwnClaw && halfW > FOLLOW_HALF_WIDTH;

    if (this.follow) {
      halfW = FOLLOW_HALF_WIDTH;
    }

    this.followRange = Math.max(0, L.width / 2 + 0.1 - halfW);

    const top = L.height + 1.6, bottom = -1.2;
    const halfH = (top - bottom) / 2 + 0.2;

    this.dist = Math.max(halfW / Math.tan(hf / 2), halfH / Math.tan(vf / 2)) + L.depth / 2;
    this.centerY = (top + bottom) / 2;
    this.elevation = portrait ? 0.14 : 0.3;
  }

  /** Jump back to the default front view (new machine). */
  reset() {
    this.x = 0;
    this.targetYaw = this.targetPitch = this.yaw = this.pitch = 0;
  }

  /** Turn the view by a drag of (dx, dy) pixels: sideways orbits round the machine, up/down tilts. */
  drag(dx: number, dy: number) {
    this.targetYaw = THREE.MathUtils.clamp(this.targetYaw - dx * DRAG_SPEED, -MAX_YAW, MAX_YAW);
    this.targetPitch = THREE.MathUtils.clamp(
      this.targetPitch + dy * DRAG_SPEED,
      MIN_ELEVATION - this.elevation,
      MAX_ELEVATION - this.elevation,
    );
  }

  /** Ease back to the default front view. */
  resetView() {
    this.targetYaw = this.targetPitch = 0;
  }

  /** How far above level the camera is looking from right now (radians). */
  get currentElevation() {
    return this.elevation + this.pitch;
  }

  kick(amount: number) {
    this.shake = Math.max(this.shake, amount);
  }

  update(dt: number) {
    this.time += dt;

    const ease = 1 - Math.exp(-dt * DRAG_SMOOTHING);

    this.yaw += (this.targetYaw - this.yaw) * ease;
    this.pitch += (this.targetPitch - this.pitch) * ease;

    const sway = (this.orbit ? Math.sin(this.time * 0.18) * 0.32 : 0) + this.yaw;
    const elevation = this.elevation + this.pitch;

    this.shake = Math.max(0, this.shake - dt * 2);

    const sx = (Math.random() - 0.5) * this.shake * 0.5, sy = (Math.random() - 0.5) * this.shake * 0.5;
    const wantX = this.follow && this.followX !== null ? THREE.MathUtils.clamp(this.followX, -this.followRange, this.followRange) : 0;

    this.x += (wantX - this.x) * (1 - Math.exp(-dt * 3));

    const flat = this.dist * Math.cos(elevation);

    this.camera.position.set(
      this.x + Math.sin(sway) * flat + sx,
      this.centerY + this.dist * Math.sin(elevation) + sy,
      Math.cos(sway) * flat,
    );
    this.camera.lookAt(this.x, this.centerY - 0.4, 0);
  }
}
