// The three.js scene. Draws whatever state it's handed (the host's sim or network snapshots),
// smoothing between updates.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { COLORS } from '../shared/constants';
import type { Layout } from '../shared/layout';
import type { ClawState, PrizeState, RoundPlayer } from '../shared/protocol';
import { CameraRig } from './camera';
import { createAimMarker, placeAimMarker, type AimMarker } from './aim-marker';
import { createClawModel, updateClawModel, type ClawModel } from './claw-model';
import { buildMachine } from './machine';
import { createMachineMaterials, standard, type MachineMaterials } from './materials';
import { Overlay } from './overlay';
import { buildPrizeMesh } from './prize-models';

/** How quickly drawn objects catch up with the latest state (per second). */
const SMOOTHING = 14;
/** Camera tilt (radians above level) where the roof starts fading, and where it's almost gone. */
const ROOF_FADE_START = 0.4;
const ROOF_FADE_END = 0.75;
const ROOF_MIN_OPACITY = 0.12;

interface PrizeModel {
  mesh: THREE.Group;
  target: THREE.Vector3;
  targetQuat: THREE.Quaternion;
}

export class View {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly rig = new CameraRig();
  private readonly overlay: Overlay;
  private readonly sun = new THREE.DirectionalLight('#fff3e0', 2.2);
  private readonly mats: MachineMaterials = createMachineMaterials();
  private readonly sharedMats = new Set<THREE.Material>(Object.values(this.mats));
  /** The big machine and claws: rebuilt (and disposed) for every new layout. */
  private readonly machine = new THREE.Group();
  private readonly prizeGroup = new THREE.Group();
  private claws: ClawModel[] = [];
  private readonly prizes = new Map<number, PrizeModel>();
  private layout: Layout | null = null;
  private you = -1;
  private roofMaterials: THREE.Material[] = [];
  /** Ring showing where your claw would land (null when you have no claw, e.g. menus or spectating). */
  private aim: AimMarker | null = null;
  private time = 0;

  constructor(canvas: HTMLCanvasElement, labelsEl: HTMLElement, popupsEl: HTMLElement) {
    this.overlay = new Overlay(labelsEl, popupsEl);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.setupScene();
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  /** Slowly sway the camera (menus). */
  set orbit(on: boolean) {
    this.rig.orbit = on;
  }

  /** Turn the camera around the machine by a drag of (dx, dy) pixels. */
  dragCamera(dx: number, dy: number) {
    this.rig.drag(dx, dy);
  }

  /** Back to the default front view. */
  resetCamera() {
    this.rig.resetView();
  }

  /**
   * Build the scene for a machine layout.
   * @param players names/colours for name tags, or null for the attract-mode demo
   * @param you index of the local player (-1 if none)
   */
  build(layout: Layout, players: RoundPlayer[] | null, you = -1) {
    this.clear();
    this.layout = layout;
    this.you = you;
    this.rig.reset();
    this.roofMaterials = buildMachine(this.machine, layout, this.mats).roofMaterials;
    this.claws = Array.from({ length: layout.n }, (_, i) => {
      const color = players ? players[i].color : COLORS[i % COLORS.length];
      const claw = createClawModel(this.machine, color, this.mats.chrome);

      if (players) {
        claw.label = this.overlay.addLabel(players[i].name, color, i === you);
      }

      return claw;
    });
    this.aim = players && you >= 0 && you < layout.n ? createAimMarker(players[you].color) : null;

    if (this.aim) {
      this.machine.add(this.aim.group); // disposed with the machine in clear()
    }

    this.aimSun(layout);
    this.rig.frame(layout, you >= 0);
  }

  setClaws(list: ClawState[], instant: boolean) {
    list.slice(0, this.claws.length).forEach((state, i) => {
      const c = this.claws[i];

      c.target = state;

      if (!c.current || instant) {
        c.current = state.slice();
      }
    });
  }

  setPrizes(list: PrizeState[], instant: boolean) {
    const seen = new Set<number>();

    for (const [id, type, x, y, z, qx, qy, qz, qw] of list) {
      seen.add(id);

      let prize = this.prizes.get(id);
      const isNew = !prize;

      if (!prize) {
        prize = { mesh: buildPrizeMesh(type), target: new THREE.Vector3(), targetQuat: new THREE.Quaternion() };
        this.prizeGroup.add(prize.mesh);
        this.prizes.set(id, prize);
      }

      prize.target.set(x, y, z);
      prize.targetQuat.set(qx, qy, qz, qw).normalize(); // components are rounded for the network

      if (instant || isNew) {
        prize.mesh.position.copy(prize.target);
        prize.mesh.quaternion.copy(prize.targetQuat);
      }
    }

    for (const [id, prize] of this.prizes) {
      if (seen.has(id)) {
        continue;
      }

      this.prizeGroup.remove(prize.mesh);
      this.prizes.delete(id);
    }
  }

  /** Centre of claw i's hub (for popups). */
  clawPos(i: number) {
    const h = this.claws[i]?.hub;

    return h ? { x: h.x, y: h.y, z: h.z } : { x: 0, y: 3, z: 0 };
  }

  /** Shake the camera (bombs). */
  kick(amount: number) {
    this.rig.kick(amount);
  }

  popup(x: number, y: number, z: number, text: string, color: string, cls = '') {
    this.overlay.popup({ x, y, z }, text, color, this.rig.camera, cls);
  }

  /** Advance animations and draw a frame. */
  update(dt: number) {
    const L = this.layout;

    if (!L) {
      return;
    }

    const k = 1 - Math.exp(-dt * SMOOTHING);

    for (const c of this.claws) {
      updateClawModel(c, L, k);

      if (c.label) {
        this.overlay.placeLabel(c.label, c.hub, this.rig.camera);
      }
    }

    for (const p of this.prizes.values()) {
      p.mesh.position.lerp(p.target, k);
      p.mesh.quaternion.slerp(p.targetQuat, k);
    }

    this.time += dt;
    this.updateAim();
    this.rig.followX = this.claws[this.you]?.current?.[0] ?? null;
    this.rig.update(dt);
    this.fadeRoof();
    this.renderer.render(this.scene, this.rig.camera);
  }

  private setupScene() {
    const s = this.scene;

    s.background = new THREE.Color('#150b26');
    s.fog = new THREE.Fog('#150b26', 40, 110);
    s.environment = new THREE.PMREMGenerator(this.renderer).fromScene(new RoomEnvironment(), 0.04).texture;

    s.add(new THREE.HemisphereLight('#d6c8ff', '#2a1640', 0.9));
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.02;
    s.add(this.sun, this.sun.target);

    const fill = new THREE.DirectionalLight('#b8e0ff', 0.6);

    fill.position.set(-6, 4, 12);
    s.add(fill);

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), standard('#1d1033', { roughness: 0.95 }));

    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -3;
    floor.receiveShadow = true;
    s.add(floor, this.machine, this.prizeGroup);
  }

  /** Show the aim ring under your claw while it's roaming; hide it once you've pressed. */
  private updateAim() {
    if (!this.aim) {
      return;
    }

    const mine = this.claws[this.you];
    const roaming = mine?.current && mine.target?.[4] === 0;

    if (!roaming) {
      this.aim.group.visible = false;

      return;
    }

    placeAimMarker(this.aim, mine.current![0], mine.current![1], this.prizeGroup, this.time);
  }

  /** The more the camera looks down from above, the more see-through the machine's roof gets. */
  private fadeRoof() {
    const fade = THREE.MathUtils.smoothstep(this.rig.currentElevation, ROOF_FADE_START, ROOF_FADE_END);
    const opacity = 1 - fade * (1 - ROOF_MIN_OPACITY);

    for (const m of this.roofMaterials) {
      m.opacity = opacity;
      m.depthWrite = opacity > 0.99; // a see-through roof mustn't hide what's behind it
    }
  }

  /** Fit the sun's shadow camera around the machine. */
  private aimSun(L: Layout) {
    const ext = Math.max(L.width, L.depth) / 2 + 3;
    const sc = this.sun.shadow.camera;

    Object.assign(sc, { left: -ext, right: ext, top: ext, bottom: -ext, near: 1, far: 60 });
    sc.updateProjectionMatrix();
    this.sun.position.set(L.width * 0.12, 24, 9);
  }

  private resize() {
    const w = innerWidth, h = innerHeight;

    this.renderer.setSize(w, h, false);
    this.overlay.setSize(w, h);
    this.rig.setAspect(w / h);

    if (this.layout) {
      this.rig.frame(this.layout, this.you >= 0);
    }
  }

  /** Remove (and free the GPU memory of) everything built for the previous layout. */
  private clear() {
    this.machine.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) {
        return;
      }

      o.geometry.dispose();

      const materials: THREE.Material[] = Array.isArray(o.material) ? o.material : [o.material];

      for (const m of materials) {
        if (this.sharedMats.has(m)) {
          continue;
        }

        if ('map' in m && m.map instanceof THREE.Texture) {
          m.map.dispose();
        }

        m.dispose();
      }
    });
    this.machine.clear();
    this.prizeGroup.clear();
    this.prizes.clear();
    this.claws = [];
    this.overlay.clear();
  }
}
