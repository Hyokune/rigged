// The claw's 3D model (hub, three prongs, carriage, cable) and how to pose it from network state.
import * as THREE from 'three';
import { clawPose } from '../shared/claw-pose';
import type { Layout } from '../shared/layout';
import type { ClawState } from '../shared/protocol';
import { standard } from './materials';

const DOWN = new THREE.Vector3(0, -1, 0);
const scratchDir = new THREE.Vector3();

export interface ClawModel {
  /** hub + prongs, positioned at the hub centre */
  head: THREE.Group;
  carriage: THREE.Mesh;
  cable: THREE.Mesh;
  /** one per prong; rotates outward to open */
  prongs: THREE.Group[];
  /** smoothed copy of the latest ClawState */
  current: number[] | null;
  target: ClawState | null;
  /** current hub centre in world space */
  hub: THREE.Vector3;
  /** floating name tag, if this round has player names */
  label: HTMLElement | null;
}

/** Builds a claw in the player's colour and adds it to `parent`. */
export const createClawModel = (parent: THREE.Object3D, color: string, chrome: THREE.Material): ClawModel => {
  const accent = standard(color, { emissive: color, emissiveIntensity: 0.55, roughness: 0.35, metalness: 0.2 });
  const head = new THREE.Group();

  const mesh = (geometry: THREE.BufferGeometry, material: THREE.Material, into: THREE.Object3D, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geometry, material);

    m.position.set(x, y, z);
    m.castShadow = true;
    into.add(m);

    return m;
  };

  mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.34, 20), chrome, head); // hub
  mesh(new THREE.TorusGeometry(0.29, 0.05, 10, 28), accent, head).rotation.x = Math.PI / 2; // coloured band
  mesh(new THREE.CylinderGeometry(0.12, 0.2, 0.18, 16), accent, head, 0, 0.25, 0); // cap

  const upper = new THREE.BoxGeometry(0.07, 0.5, 0.07);
  const lower = new THREE.BoxGeometry(0.06, 0.32, 0.06);
  const knuckle = new THREE.SphereGeometry(0.06, 12, 8);
  const tip = new THREE.BoxGeometry(0.1, 0.06, 0.12);
  const prongs = [0, 1, 2].map((k) => {
    const around = new THREE.Group();

    around.rotation.y = (k * Math.PI * 2) / 3;
    around.position.y = -0.15;
    head.add(around);

    const arm = new THREE.Group();

    arm.position.z = 0.2;
    around.add(arm);
    mesh(upper, chrome, arm, 0, -0.25, 0);
    mesh(knuckle, accent, arm, 0, -0.5, 0);

    const finger = new THREE.Group(); // fixed inward bend

    finger.position.y = -0.5;
    finger.rotation.x = 0.75;
    arm.add(finger);
    mesh(lower, chrome, finger, 0, -0.16, 0);
    mesh(tip, accent, finger, 0, -0.32, 0);

    return arm;
  });

  const carriage = mesh(new THREE.BoxGeometry(0.8, 0.22, 0.8), accent, parent);
  const cable = mesh(new THREE.CylinderGeometry(0.025, 0.025, 1, 8), chrome, parent);

  parent.add(head);

  return { head, carriage, cable, prongs, current: null, target: null, hub: new THREE.Vector3(), label: null };
};

/** Ease the claw toward its latest state (k = 0..1 smoothing factor) and pose its meshes. */
export const updateClawModel = (c: ClawModel, L: Layout, k: number) => {
  if (!c.current || !c.target) {
    return;
  }

  for (let j = 0; j < c.current.length; j++) {
    c.current[j] += (c.target[j] - c.current[j]) * k;
  }

  const [x, z, tipY, open, , swingX, swingZ, yaw] = c.current;
  const pose = clawPose(L.height, x, z, tipY, swingX, swingZ, yaw);

  c.hub.set(...pose.hub);
  c.head.position.copy(c.hub);
  c.head.quaternion.set(...pose.quat);
  c.carriage.position.set(x, L.height - 0.24, z);

  // The cable runs from the pivot down to the top of the hub, along the swing direction.
  const cableLen = Math.max(0.01, pose.len - 0.34);

  scratchDir.set(...pose.dir);
  c.cable.position.set(...pose.pivot).addScaledVector(scratchDir, cableLen / 2);
  c.cable.quaternion.setFromUnitVectors(DOWN, scratchDir);
  c.cable.scale.y = cableLen;

  const angle = 0.02 + open * 0.58;

  for (const prong of c.prongs) {
    prong.rotation.x = -angle;
  }
};
