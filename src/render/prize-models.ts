// Prize meshes. Plushies come from the asset pack (see assets.ts); the mystery box and bomb are
// built from three.js primitives because the pack has no equivalent. Each mesh is centred on the
// prize's centre of mass so it lines up with its physics body.
import * as THREE from 'three';
import { PRIZE_TYPES } from '../shared/prizes';
import { plushie } from './assets';

// Geometry and materials are shared by every prize of the same kind.
const geometries = new Map<string, THREE.BufferGeometry>();
const materials = new Map<string, THREE.Material>();

const cachedGeometry = <T extends THREE.BufferGeometry>(key: string, make: () => T): T => {
  if (!geometries.has(key)) {
    geometries.set(key, make());
  }

  return geometries.get(key) as T;
};

const cachedMaterial = <T extends THREE.Material>(key: string, make: () => T): T => {
  if (!materials.has(key)) {
    materials.set(key, make());
  }

  return materials.get(key) as T;
};

const toyMaterial = (color: THREE.ColorRepresentation, options: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.45, envMapIntensity: 0.7, ...options });

const unitSphere = () => cachedGeometry('sphere', () => new THREE.SphereGeometry(1, 24, 16));

const part = (
  group: THREE.Group, geometry: THREE.BufferGeometry, material: THREE.Material,
  x = 0, y = 0, z = 0, sx = 1, sy = sx, sz = sx,
): THREE.Mesh => {
  const mesh = new THREE.Mesh(geometry, material);

  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, sz);
  group.add(mesh);

  return mesh;
};

const buildGift = (g: THREE.Group) => {
  const box = cachedMaterial('giftBox', () => toyMaterial('#06d6a0', { roughness: 0.4 }));
  const ribbon = cachedMaterial('giftRibbon', () => toyMaterial('#ffd166', { metalness: 0.6, roughness: 0.3 }));

  part(g, cachedGeometry('giftCube', () => new THREE.BoxGeometry(0.62, 0.56, 0.62)), box);
  part(g, cachedGeometry('giftRibbonX', () => new THREE.BoxGeometry(0.64, 0.58, 0.12)), ribbon);
  part(g, cachedGeometry('giftRibbonZ', () => new THREE.BoxGeometry(0.12, 0.58, 0.64)), ribbon);

  const loop = cachedGeometry('giftBow', () => new THREE.TorusGeometry(0.1, 0.035, 8, 16));

  part(g, loop, ribbon, -0.09, 0.36, 0).rotation.y = Math.PI / 2;
  part(g, loop, ribbon, 0.09, 0.36, 0).rotation.y = Math.PI / 2;
};

const buildBomb = (g: THREE.Group) => {
  const shell = cachedMaterial('bomb', () => toyMaterial('#1b1b24', { metalness: 0.4, roughness: 0.25 }));
  const cap = cachedMaterial('bombCap', () => toyMaterial('#8d99ae', { metalness: 0.8, roughness: 0.3 }));
  const fuse = cachedMaterial('bombFuse', () => toyMaterial('#d4a373', { roughness: 0.9 }));
  const spark = cachedMaterial('bombSpark', () => new THREE.MeshBasicMaterial({ color: '#ffb703' }));

  part(g, unitSphere(), shell, 0, 0, 0, 0.36);
  part(g, cachedGeometry('bombCap', () => new THREE.CylinderGeometry(0.11, 0.12, 0.1, 16)), cap, 0, 0.37, 0);

  const fuseMesh = part(g, cachedGeometry('bombFuse', () => new THREE.TorusGeometry(0.1, 0.022, 6, 12, Math.PI * 0.8)), fuse, 0.09, 0.42, 0);

  fuseMesh.rotation.z = Math.PI * 0.1;
  part(g, unitSphere(), spark, 0.19, 0.46, 0, 0.05);
};

/** Stand-in if the model file failed to load: a coloured shape the size of the prize's physics body. */
const buildPlaceholder = (g: THREE.Group, typeIndex: number) => {
  const shape = PRIZE_TYPES[typeIndex].shape;
  const m = cachedMaterial(`placeholder${typeIndex}`, () => toyMaterial(new THREE.Color().setHSL((typeIndex * 0.13) % 1, 0.6, 0.6)));

  if (shape.kind === 'ball') {
    part(g, unitSphere(), m, 0, 0, 0, shape.r);
  } else {
    part(g, cachedGeometry('unitBox', () => new THREE.BoxGeometry(2, 2, 2)), m, 0, 0, 0, ...shape.half);
  }
};

export const buildPrizeMesh = (typeIndex: number): THREE.Group => {
  const t = PRIZE_TYPES[typeIndex];
  const g = new THREE.Group();

  if (t.model === 'gift') {
    buildGift(g);
  } else if (t.model === 'bomb') {
    buildBomb(g);
  } else {
    const model = plushie(t.model);

    if (model) {
      g.add(model);
    } else {
      buildPlaceholder(g, typeIndex);
    }
  }

  g.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });

  return g;
};
