// Small maths helpers. Vectors and quaternions are plain tuples so they can be shared by the
// simulation (no three.js) and sent over the network.

export type Vec3 = [number, number, number];
export type Quat = [number, number, number, number];

export const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

/** Move v toward target by at most step. */
export const approach = (v: number, target: number, step: number) =>
  v < target ? Math.min(target, v + step) : Math.max(target, v - step);

export const rand = (min: number, max: number) => min + Math.random() * (max - min);

/** Round to 2 decimals (positions on the wire). */
export const round2 = (v: number) => Math.round(v * 100) / 100;
/** Round to 3 decimals (angles and quaternions on the wire). */
export const round3 = (v: number) => Math.round(v * 1000) / 1000;

export const normalizeQuat = (q: Quat): Quat => {
  const l = Math.hypot(...q) || 1;

  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
};

/** Hamilton product a * b (apply b, then a). */
export const mulQuat = (a: Quat, b: Quat): Quat => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];

export const conjugate = (q: Quat): Quat => [-q[0], -q[1], -q[2], q[3]];

/** Rotation of `angle` radians around the y axis. */
export const yawQuat = (angle: number): Quat => [0, Math.sin(angle / 2), 0, Math.cos(angle / 2)];

/** Rotation of `angle` radians around the x axis. */
export const pitchQuat = (angle: number): Quat => [Math.sin(angle / 2), 0, 0, Math.cos(angle / 2)];

/** Rotate vector v by unit quaternion q. */
export const rotate = (q: Quat, v: Vec3): Vec3 => {
  // v' = v + w*t + q.xyz × t, where t = 2 * (q.xyz × v)
  const [x, y, z, w] = q;
  const tx = 2 * (y * v[2] - z * v[1]);
  const ty = 2 * (z * v[0] - x * v[2]);
  const tz = 2 * (x * v[1] - y * v[0]);

  return [
    v[0] + w * tx + (y * tz - z * ty),
    v[1] + w * ty + (z * tx - x * tz),
    v[2] + w * tz + (x * ty - y * tx),
  ];
};

/** Transform a world point into a body's local frame. */
export const toLocal = (pos: Vec3, rot: Quat, world: Vec3): Vec3 =>
  rotate(conjugate(rot), [world[0] - pos[0], world[1] - pos[1], world[2] - pos[2]]);

/** Transform a local point on a body into world space. */
export const toWorld = (pos: Vec3, rot: Quat, local: Vec3): Vec3 => {
  const r = rotate(rot, local);

  return [pos[0] + r[0], pos[1] + r[1], pos[2] + r[2]];
};
