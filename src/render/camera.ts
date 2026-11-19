// Frames the machine for any screen shape, starts each player looking at their own side, follows your
// claw on phones, lets players drag to look around, and slowly circles the machine in the menus.
import * as THREE from 'three';
import { polygonCorners, sideAngle, type Layout } from '../shared/layout';

/** Half-width of the view when following your claw on a phone. */
const FOLLOW_HALF_WIDTH = 5.5;
/** Radians of camera turn per pixel dragged. */
const DRAG_SPEED = 0.006;
/** Lowest and highest viewing angle (radians above level) you can tilt to. Near the top the roof fades out (see View). */
const MIN_ELEVATION = 0.05;
const MAX_ELEVATION = 1.15;
/** How quickly the camera catches up with a drag (per second). */
const DRAG_SMOOTHING = 12;
/** Menu camera: radians per second it circles the machine. */
const ORBIT_SPEED = 0.12;
/** The cabinet sticks out this far past the glass (matches machine.ts). */
const CABINET_LIP = 0.5;

export class CameraRig {
  /**
   * Near plane at 1 (not the usual 0.1): the camera is always 15+ units from the machine, and a larger near
   * plane makes depth sorting ~10x more precise, which stops nearby surfaces flickering against each other.
   */
  readonly camera = new THREE.PerspectiveCamera(36, 1, 1, 300);
  /** Slowly circle the machine (menus). */
  orbit = false;
  private dist = 20;
  private centerY = 3;
  private elevation = 0.3;
  /** The direction the view starts from: the player's own side of the machine. */
  private homeYaw = 0;
  private follow = false;
  private followRange = 0;
  /** Your claw's carriage (x, z), when zoomed in on a phone. */
  private followTarget: [number, number] | null = null;
  /** Sideways slide of the zoomed-in phone view. */
  private slide = 0;
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

  /**
   * Recompute framing for a machine, looking at side `side` (your own side; 0 for the menus).
   * `hasOwnClaw` enables the phone follow-cam.
   */
  frame(L: Layout, side: number, hasOwnClaw: boolean) {
    this.homeYaw = sideAngle(L.sides, side);

    const vf = THREE.MathUtils.degToRad(this.camera.fov);
    const hf = 2 * Math.atan(Math.tan(vf / 2) * this.camera.aspect);
    const portrait = this.camera.aspect < 0.9;
    // How wide the machine looks from the front of a side (it's the same from every side).
    const corners = polygonCorners(L.sides, L.apothem + CABINET_LIP);
    const machineHalfW = Math.max(...corners.map(([x]) => Math.abs(x)));
    // On tall phone screens, crop the cabinet edges and look in more level so the claws aren't hidden by the roof.
    let halfW = machineHalfW + (portrait ? -0.4 : 0.4);

    // On a phone with a big machine, zoom in to a window around your own claw and follow it sideways.
    this.follow = portrait && hasOwnClaw && halfW > FOLLOW_HALF_WIDTH;

    if (this.follow) {
      halfW = FOLLOW_HALF_WIDTH;
    }

    this.followRange = Math.max(0, machineHalfW - halfW);

    const top = L.height + 1.6, bottom = -1.2;
    const halfH = (top - bottom) / 2 + 0.2;

    this.dist = Math.max(halfW / Math.tan(hf / 2), halfH / Math.tan(vf / 2)) + L.apothem + CABINET_LIP;
    this.centerY = (top + bottom) / 2;
    this.elevation = portrait ? 0.14 : 0.3;
  }

  /** Back to the starting view (new machine). */
  reset() {
    this.slide = 0;
    this.targetYaw = this.targetPitch = this.yaw = this.pitch = 0;
  }

  /** Turn the view by a drag of (dx, dy) pixels: sideways circles the machine, up/down tilts. */
  drag(dx: number, dy: number) {
    this.targetYaw -= dx * DRAG_SPEED;
    this.targetPitch = THREE.MathUtils.clamp(
      this.targetPitch + dy * DRAG_SPEED,
      MIN_ELEVATION - this.elevation,
      MAX_ELEVATION - this.elevation,
    );
  }

  /** Ease back to the starting view (the short way round). */
  resetView() {
    this.targetYaw = Math.round(this.targetYaw / (Math.PI * 2)) * Math.PI * 2;
    this.targetPitch = 0;
  }

  /** Where your claw's carriage is (x, z), for the phone follow-cam; null = nothing to follow. */
  setFollowTarget(target: [number, number] | null) {
    this.followTarget = target;
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

    const heading = this.homeYaw + this.yaw + (this.orbit ? this.time * ORBIT_SPEED : 0);
    const elevation = this.elevation + this.pitch;
    // "Right" as seen from the camera; the phone follow-cam slides along it.
    const rightX = Math.cos(heading), rightZ = -Math.sin(heading);
    const along = this.followTarget ? this.followTarget[0] * rightX + this.followTarget[1] * rightZ : 0;
    const wantSlide = this.follow && this.followTarget ? THREE.MathUtils.clamp(along, -this.followRange, this.followRange) : 0;

    this.slide += (wantSlide - this.slide) * (1 - Math.exp(-dt * 3));
    this.shake = Math.max(0, this.shake - dt * 2);

    const sx = (Math.random() - 0.5) * this.shake * 0.5, sy = (Math.random() - 0.5) * this.shake * 0.5;
    const flat = this.dist * Math.cos(elevation);
    const cx = this.slide * rightX, cz = this.slide * rightZ;

    this.camera.position.set(
      cx + Math.sin(heading) * flat + sx,
      this.centerY + this.dist * Math.sin(elevation) + sy,
      cz + Math.cos(heading) * flat,
    );
    this.camera.lookAt(cx, this.centerY - 0.4, cz);
  }
}
