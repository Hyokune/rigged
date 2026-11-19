// The big claw machine: a polygon with one glass side (and chute) per player, built from primitives
// and sized to the layout.
import * as THREE from 'three';
import { polygonCorners, sideAngle, sideNormal, sideTangent, type Layout } from '../shared/layout';
import type { MachineMaterials } from './materials';
import { frontPanelTexture, marqueeTexture } from './textures';

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
/** The cabinet (base and roof) sticks out this far past the glass. */
const CABINET_LIP = 0.5;

/** A flat polygon outline as a shape for ShapeGeometry (which works in x/y; we lay it flat afterwards). */
const polygonShape = (sides: number, apothem: number, flipZ: boolean) =>
  new THREE.Shape(polygonCorners(sides, apothem).map(([x, z]) => new THREE.Vector2(x, flipZ ? -z : z)));

/**
 * An N-sided prism (the cabinet's base and roof) with flat faces, turned so face k points the same way as
 * the machine's side k.
 */
const prism = (sides: number, apothem: number, height: number) => {
  const r = apothem / Math.cos(Math.PI / sides);
  const geometry = new THREE.CylinderGeometry(r, r, height, sides, 1, false, -Math.PI / sides).toNonIndexed();

  geometry.computeVertexNormals(); // non-indexed, so each face gets its own flat normal

  return geometry;
};

/**
 * Adds the machine's meshes and lights to `group`. Everything added here is disposed by View.clear().
 * Returns the roof's materials, which the view fades out when the camera looks down from above.
 */
export const buildMachine = (group: THREE.Group, L: Layout, m: MachineMaterials): { roofMaterials: THREE.Material[] } => {
  const N = L.sides, H = L.height, ai = L.innerApothem, ao = L.apothem, cab = ao + CABINET_LIP;
  const sideLength = (apothem: number) => 2 * apothem * Math.tan(Math.PI / N);

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

  /** Add a mesh on side k: `u` along the side, `v` outward from the centre, facing outward. */
  const onSide = (
    k: number, geometry: THREE.BufferGeometry, material: THREE.Material, u: number, y: number, v: number,
    options: { cast?: boolean; receive?: boolean } = {},
  ) => {
    const [nx, nz] = sideNormal(N, k), [tx, tz] = sideTangent(N, k);
    const mesh = add(geometry, material, u * tx + v * nx, y, u * tz + v * nz, options);

    mesh.rotation.y = sideAngle(N, k);

    return mesh;
  };

  // Shared by every side.
  const frontPanel = new THREE.MeshStandardMaterial({ map: frontPanelTexture(sideLength(cab) * 0.9), roughness: 0.6 });
  const marquee = new THREE.MeshBasicMaterial({ map: marqueeTexture(), transparent: true, toneMapped: false });

  // lower cabinet, prize pit floor, and the ring of chute shelves around it
  add(prism(N, cab, 3), m.cabinet, 0, -1.5, 0);
  add(new THREE.ShapeGeometry(polygonShape(N, ai, true)).rotateX(-Math.PI / 2), m.floor, 0, FLOOR_TOP, 0);

  const shelfRing = polygonShape(N, ao, true);

  shelfRing.holes.push(polygonShape(N, ai, true));
  add(new THREE.ShapeGeometry(shelfRing).rotateX(-Math.PI / 2), m.shelf, 0, SHELF_TOP, 0);

  for (let k = 0; k < N; k++) {
    // decorated front panel and neon trim on this face of the base
    onSide(k, plane(sideLength(cab) * 0.9, 2.5), frontPanel, 0, -1.5, cab + DECAL_GAP);

    for (const y of [-0.04, -2.96]) {
      onSide(k, box(sideLength(cab) + 0.05, 0.08, 0.08), m.neonPink, 0, y, cab + 0.02, { receive: false });
    }

    // this side's chute: a dark "hole" with a glowing rim
    const s = L.chutes[k].size, t = 0.08, v = Math.hypot(L.chutes[k].x, L.chutes[k].z);

    onSide(k, plane(s, s).rotateX(-Math.PI / 2), m.hole, 0, HOLE_Y, v);
    onSide(k, box(s + t, 0.06, t), m.neonYellow, 0, 0.05, v - s / 2);
    onSide(k, box(s + t, 0.06, t), m.neonYellow, 0, 0.05, v + s / 2);
    onSide(k, box(t, 0.06, s + t), m.neonYellow, -s / 2, 0.05, v);
    onSide(k, box(t, 0.06, s + t), m.neonYellow, s / 2, 0.05, v);

    // acrylic divider between the pit and the shelf, with a chrome top
    onSide(k, box(sideLength(ai), L.dividerH, 0.04), m.acrylic, 0, L.dividerH / 2, ai, { receive: false });
    onSide(k, box(sideLength(ai), 0.05, 0.07), m.chrome, 0, L.dividerH, ai);

    // glass wall, with a fake reflection streak
    onSide(k, plane(sideLength(ao), H), m.glass, 0, H / 2, ao, { receive: false });
    onSide(k, plane(0.45, H * 1.3), m.shine, -sideLength(ao) * 0.25, H / 2, ao + 0.01, { receive: false }).rotation.z = -0.5;

    // roof: sign and neon trim on this face
    onSide(k, plane(Math.min(sideLength(cab) * 0.8, 9), 1.25), marquee, 0, H + 0.75, cab + DECAL_GAP, { receive: false }).renderOrder = 2;

    for (const y of [H + 0.02, H + 1.48]) {
      onSide(k, box(sideLength(cab) + 0.05, 0.08, 0.08), m.neonCyan, 0, y, cab + 0.02, { receive: false });
    }
  }

  // chrome posts in the corners
  polygonCorners(N, ao + 0.15).forEach(([x, z], k) => {
    add(box(0.3, H, 0.3), m.chrome, x, H / 2, z).rotation.y = sideAngle(N, k) + Math.PI / N;
  });

  // roof and the light panel under it
  add(prism(N, cab, 1.5), m.roof, 0, H + 0.75, 0, { receive: false });
  add(new THREE.ShapeGeometry(polygonShape(N, ao - 0.1, false)).rotateX(Math.PI / 2), m.ceiling, 0, H - CEILING_GAP, 0, { receive: false });

  for (const [x, color] of [[-ai * 0.6, '#ff4fd8'], [ai * 0.6, '#38f0ff']] as const) {
    const light = new THREE.PointLight(color, 10, 12, 1.5);

    light.position.set(x, H - 0.8, 0);
    group.add(light);
  }

  return { roofMaterials: [m.roof, m.neonCyan, marquee] };
};
