import * as THREE from 'three';

/** A MeshStandardMaterial with this project's defaults. */
export const standard = (color: THREE.ColorRepresentation, options: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.5, envMapIntensity: 0.5, ...options });

/** Materials shared by every machine build (created once, never disposed). */
export const createMachineMaterials = () => ({
  cabinet: standard('#6a1fd1', { roughness: 0.35, metalness: 0.15 }),
  /** Same look as the cabinet, but fades out when you tilt the camera up to look down into the machine. */
  roof: standard('#6a1fd1', { roughness: 0.35, metalness: 0.15, transparent: true }),
  floor: standard('#3b1a70', { roughness: 1 }),
  shelf: standard('#c8ccd8', { metalness: 0.85, roughness: 0.35, envMapIntensity: 1 }),
  chrome: standard('#e8ebf2', { metalness: 1, roughness: 0.15, envMapIntensity: 1 }),
  hole: new THREE.MeshBasicMaterial({ color: '#050208' }),
  neonPink: new THREE.MeshBasicMaterial({ color: '#ff4fd8' }),
  neonCyan: new THREE.MeshBasicMaterial({ color: '#38f0ff', transparent: true }), // roof trim, fades with the roof
  neonYellow: new THREE.MeshBasicMaterial({ color: '#ffe14d' }),
  ceiling: new THREE.MeshBasicMaterial({ color: '#fff4e6' }),
  acrylic: new THREE.MeshPhysicalMaterial({ color: '#d8f3ff', transparent: true, opacity: 0.22, roughness: 0.05, depthWrite: false }),
  glass: new THREE.MeshPhysicalMaterial({ color: '#cfefff', transparent: true, opacity: 0.06, roughness: 0.02, depthWrite: false, side: THREE.DoubleSide }),
  shine: new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.07, depthWrite: false }),
});

export type MachineMaterials = ReturnType<typeof createMachineMaterials>;
