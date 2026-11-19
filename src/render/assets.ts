// Loads the packed asset-pack models (public/models/arcade.glb, built by `npm run pack-models`).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { PLUSH_SCALE } from '../shared/prizes';

const MODEL_URL = `${import.meta.env.BASE_URL}models/arcade.glb`;

let nodes: Map<string, THREE.Object3D> | null = null;
let loading: Promise<boolean> | null = null;

/**
 * The pack's Blender export adds KHR_materials_ior/specular to almost every material, which makes three.js
 * use the costly MeshPhysicalMaterial for a barely visible difference. Swap in the standard material.
 */
const simplify = (m: THREE.Material, cache: Map<THREE.Material, THREE.Material>): THREE.Material => {
  if (!(m instanceof THREE.MeshPhysicalMaterial)) {
    return m;
  }

  const cached = cache.get(m);

  if (cached) {
    return cached;
  }

  const standard = new THREE.MeshStandardMaterial({
    name: m.name,
    color: m.color, map: m.map,
    roughness: m.roughness, roughnessMap: m.roughnessMap,
    metalness: m.metalness, metalnessMap: m.metalnessMap,
    normalMap: m.normalMap, normalScale: m.normalScale,
    emissive: m.emissive, emissiveMap: m.emissiveMap, emissiveIntensity: m.emissiveIntensity,
    aoMap: m.aoMap,
    transparent: m.transparent, opacity: m.opacity, alphaTest: m.alphaTest, alphaMap: m.alphaMap,
    side: m.side, depthWrite: m.depthWrite,
  });

  cache.set(m, standard);
  m.dispose();

  return standard;
};

/** Resolves true once models are ready, or false if they failed (the game falls back to simple shapes). */
export const loadModels = (): Promise<boolean> => {
  loading ??= new GLTFLoader()
    .loadAsync(MODEL_URL)
    .then((gltf) => {
      const loaded = new Map(gltf.scene.children.map((o) => [o.name, o]));
      const simplified = new Map<THREE.Material, THREE.Material>();

      loaded.forEach((root) => root.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) {
          return;
        }

        o.castShadow = true;
        o.receiveShadow = true;
        o.material = Array.isArray(o.material)
          ? o.material.map((m) => simplify(m, simplified))
          : simplify(o.material, simplified);
      }));
      nodes = loaded;

      return true;
    })
    .catch((err) => {
      console.error('Could not load models', err);

      return false;
    });

  return loading;
};

/**
 * A plushie, scaled and centred on the origin so it lines up with its physics box (see PrizeType.shape).
 * Returns null if models aren't loaded or the name is unknown.
 */
export const plushie = (name: string): THREE.Object3D | null => {
  const src = nodes?.get(name);

  if (!src) {
    return null;
  }

  const model = src.clone(); // shares geometry and materials with the original

  model.position.set(0, 0, 0);
  model.scale.setScalar(PLUSH_SCALE);
  model.updateMatrixWorld(true);

  const center = new THREE.Box3().setFromObject(model).getCenter(new THREE.Vector3());

  model.position.copy(center).negate();

  const holder = new THREE.Group();

  holder.add(model);

  return holder;
};
