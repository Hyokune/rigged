// HTML laid over the 3D scene: name tags that follow the claws, and score popups.
import * as THREE from 'three';

const scratch = new THREE.Vector3();
const POPUP_LIFETIME_MS = 1500;

export class Overlay {
  constructor(private readonly labelsEl: HTMLElement, private readonly popupsEl: HTMLElement) {}

  private width = 1;
  private height = 1;

  setSize(width: number, height: number) {
    this.width = width;
    this.height = height;
  }

  clear() {
    this.labelsEl.innerHTML = '';
    this.popupsEl.innerHTML = '';
  }

  /** A name tag in the player's colour. Your own reads "YOU"; `faded` tones down other players' tags. */
  addLabel(text: string, color: string, isYou: boolean, faded = false) {
    const el = document.createElement('div');

    el.className = 'tag' + (isYou ? ' you' : '') + (faded ? ' faded' : '');
    el.style.setProperty('--c', color);
    el.textContent = isYou ? 'YOU' : text;
    this.labelsEl.append(el);

    return el;
  }

  /** Pin a label just above a world position. */
  placeLabel(el: HTMLElement, world: THREE.Vector3, camera: THREE.Camera) {
    const [x, y] = this.toScreen(scratch.set(world.x, world.y + 0.55, world.z), camera);

    el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
  }

  /** Floating text (e.g. "+25 🐼") that rises and fades at a world position. */
  popup(world: { x: number; y: number; z: number }, text: string, color: string, camera: THREE.Camera, cls = '') {
    const [x, y] = this.toScreen(scratch.set(world.x, world.y, world.z), camera);
    const el = document.createElement('div');

    el.className = 'pop ' + cls;
    el.textContent = text;
    el.style.color = color;
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    this.popupsEl.append(el);
    setTimeout(() => el.remove(), POPUP_LIFETIME_MS);
  }

  private toScreen(v: THREE.Vector3, camera: THREE.Camera): [number, number] {
    v.project(camera);

    return [((v.x + 1) / 2) * this.width, ((1 - v.y) / 2) * this.height];
  }
}
