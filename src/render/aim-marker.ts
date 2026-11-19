// A glowing ring under your own claw, on top of whatever it would land on — so you can time the drop.
import * as THREE from 'three';

/** Rays start this high, so they hit the pile but not toys being carried overhead. */
const RAY_START_Y = 2.6;
const DOWN = new THREE.Vector3(0, -1, 0);
const raycaster = new THREE.Raycaster();
const origin = new THREE.Vector3();

export interface AimMarker {
  group: THREE.Group;
  ring: THREE.Mesh;
  dot: THREE.Mesh;
}

export const createAimMarker = (color: string): AimMarker => {
  const material = new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0.9, depthTest: false, depthWrite: false, side: THREE.DoubleSide,
  });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.4, 40).rotateX(-Math.PI / 2), material);
  const dot = new THREE.Mesh(new THREE.CircleGeometry(0.07, 16).rotateX(-Math.PI / 2), material);
  const group = new THREE.Group();

  ring.renderOrder = dot.renderOrder = 10; // drawn on top of everything, so it's never hidden inside a toy
  group.add(ring, dot);
  group.visible = false;

  return { group, ring, dot };
};

/** Put the marker on the first thing straight below (x, z): a toy in `pile`, or the floor. */
export const placeAimMarker = (marker: AimMarker, x: number, z: number, pile: THREE.Object3D, time: number) => {
  origin.set(x, RAY_START_Y, z);
  raycaster.set(origin, DOWN);

  const hit = raycaster.intersectObject(pile, true)[0];
  const y = hit ? hit.point.y : 0;

  marker.group.position.set(x, y + 0.03, z);
  marker.ring.scale.setScalar(1 + Math.sin(time * 6) * 0.08); // gentle pulse
  marker.group.visible = true;
};
