// The big claw machine cabinet, built from primitives and sized to the layout.
import * as THREE from 'three';
import type { Layout } from '../shared/layout';
import type { MachineMaterials } from './materials';
import { backWallTexture, frontPanelTexture, marqueeTexture } from './textures';

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const plane = (w: number, h: number) => new THREE.PlaneGeometry(w, h);

// Surfaces that lie on top of each other need a real gap between them, or the GPU can't tell which is in
// front and they flicker ("z-fighting"). These heights/offsets keep every layer apart. (The physics floor
// is at y = 0; a centimetre of difference in the drawing is invisible.)
/** Pit floor surface, just above the lower cabinet's top (y = 0). */
const FLOOR_TOP = 0.01;
/** Chute shelf surface, above the pit floor. */
const SHELF_TOP = 0.03;
/** The dark covers that make the chute openings look like holes, above the shelf. */
const HOLE_Y = 0.045;
/** How far pictures (front panel, marquee) stand off the cabinet face they're mounted on. */
const DECAL_GAP = 0.02;
/** Ceiling light panel, below the roof's underside. */
const CEILING_GAP = 0.02;

/**
 * Adds the machine's meshes and lights to `group`. Everything added here is disposed by View.clear().
 * Returns the roof's materials, which the view fades out when the camera looks down from above.
 */
export const buildMachine = (group: THREE.Group, L: Layout, m: MachineMaterials): { roofMaterials: THREE.Material[] } => {
  const W = L.width, D = L.depth, H = L.height;

  const add = (
    geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number,
    { cast = false, receive = true } = {},
  ) => {
    const mesh = new THREE.Mesh(geometry, material);

    mesh.position.set(x, y, z);
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
    group.add(mesh);

    return mesh;
  };

  // lower cabinet + decorated front panel
  add(box(W + 1, 3, D + 1), m.cabinet, 0, -1.5, 0);
  add(plane(W + 0.6, 2.5), new THREE.MeshStandardMaterial({ map: frontPanelTexture(W), roughness: 0.6 }), 0, -1.5, D / 2 + 0.5 + DECAL_GAP);

  for (const y of [-0.04, -2.96]) {
    add(box(W + 1.05, 0.08, 0.08), m.neonPink, 0, y, D / 2 + 0.52, { receive: false });
  }

  // prize pit, chute shelf, chutes
  add(box(W, 0.1, D), m.floor, 0, FLOOR_TOP - 0.05, 0);

  const shelfDepth = D / 2 - L.dividerZ;

  add(box(W, SHELF_TOP - FLOOR_TOP, shelfDepth), m.shelf, 0, (SHELF_TOP + FLOOR_TOP) / 2, L.dividerZ + shelfDepth / 2);

  for (const ch of L.chutes) {
    const s = ch.size, t = 0.08;

    add(plane(s, s).rotateX(-Math.PI / 2), m.hole, ch.x, HOLE_Y, ch.z);
    add(box(s + t, 0.06, t), m.neonYellow, ch.x, 0.05, ch.z - s / 2);
    add(box(s + t, 0.06, t), m.neonYellow, ch.x, 0.05, ch.z + s / 2);
    add(box(t, 0.06, s + t), m.neonYellow, ch.x - s / 2, 0.05, ch.z);
    add(box(t, 0.06, s + t), m.neonYellow, ch.x + s / 2, 0.05, ch.z);
  }

  add(box(W, L.dividerH, 0.04), m.acrylic, 0, L.dividerH / 2, L.dividerZ, { receive: false });
  add(box(W, 0.05, 0.07), m.chrome, 0, L.dividerH, L.dividerZ);

  // back wall, glass, posts
  add(plane(W, H), new THREE.MeshStandardMaterial({ map: backWallTexture(W, H), roughness: 0.85 }), 0, H / 2, -D / 2 + 0.01);
  add(plane(W, H), m.glass, 0, H / 2, D / 2, { receive: false });

  for (const side of [-1, 1]) {
    add(plane(D, H), m.glass, side * (W / 2), H / 2, 0, { receive: false }).rotation.y = Math.PI / 2;
  }

  for (let i = 0; i < 3; i++) { // fake reflections on the front glass
    const x = -W * 0.3 + i * 0.5 + (i > 1 ? W * 0.45 : 0);
    const streak = add(plane(0.35 + i * 0.2, H * 1.3), m.shine, x, H / 2, D / 2 + 0.01, { receive: false });

    streak.rotation.z = -0.5;
    streak.scale.y = 0.75;
  }

  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      add(box(0.3, H, 0.3), m.chrome, sx * (W / 2 + 0.15), H / 2, sz * (D / 2 + 0.15));
    }
  }

  // top cabinet, marquee, ceiling light, gantry rails
  add(box(W + 1, 1.5, D + 1), m.roof, 0, H + 0.75, 0, { receive: false });

  const marquee = new THREE.MeshBasicMaterial({ map: marqueeTexture(), transparent: true, toneMapped: false });

  add(plane(Math.min(W * 0.8, 9), 1.25), marquee, 0, H + 0.75, D / 2 + 0.5 + DECAL_GAP, { receive: false }).renderOrder = 2;

  for (const y of [H + 0.02, H + 1.48]) {
    add(box(W + 1.05, 0.08, 0.08), m.neonCyan, 0, y, D / 2 + 0.52, { receive: false });
  }

  add(plane(W - 0.2, D - 0.2).rotateX(Math.PI / 2), m.ceiling, 0, H - CEILING_GAP, 0, { receive: false });

  for (const sz of [-1, 1]) {
    add(box(W, 0.1, 0.12), m.chrome, 0, H - 0.08, sz * (D / 2 - 0.3));
  }

  for (const [x, color] of [[-W * 0.3, '#ff4fd8'], [W * 0.3, '#38f0ff']] as const) {
    const light = new THREE.PointLight(color, 10, 12, 1.5);

    light.position.set(x, H - 0.8, 0.5);
    group.add(light);
  }

  return { roofMaterials: [m.roof, m.neonCyan, marquee] };
};
