// The authoritative game. Only the host runs a real game; every client also runs one for the
// attract-mode demo behind the menus. Physics details live in the neighbouring files.
import { PRIZE_TYPES, rollPoints } from '../shared/prizes';
import { machineLayout, nearestChute, type Layout } from '../shared/layout';
import { rand, round2, round3 } from '../shared/math';
import type { ClawState, GameEvent, Phase, PlayerStats, PrizeState, Snapshot } from '../shared/protocol';
import { GROUPS, STEP, buildMachineColliders, createWorld, type World } from './physics';
import { clawTip, createClaw, pickTarget, roam, updatePose, updateSwing, type Claw } from './claw';
import { attach, detach, gripSpring, slideGripAnchor } from './grip';
import { nudgeTowardChute, spawnPrize, type Prize } from './prize';

export { initPhysics } from './physics';

const FRENZY_AT = 15; // seconds left when claws speed up
const GRAB_REACH = 0.8;
const SPAWN_INTERVAL = 0.45;
/** A failed grip roll still lifts the toy, then drops it after this many seconds (random in range). */
const FUMBLE_AFTER: [number, number] = [0.2, 0.45];

export interface SimOptions {
  duration?: number;
  countdown?: number;
  /** Attract mode: no timer, never ends. */
  demo?: boolean;
}

export class Sim {
  readonly n: number;
  readonly layout: Layout;
  readonly demo: boolean;
  readonly duration: number;
  phase: Phase;
  timer: number;
  frenzy = false;
  /** Things that happened since the caller last drained this (sounds, popups). */
  events: GameEvent[] = [];
  readonly stats: PlayerStats[];
  private readonly world: World;
  private readonly claws: Claw[];
  private prizes: Prize[] = [];
  private clock = 0;
  private acc = 0;
  private lastTick = 99;
  private nextId = 1;
  private spawnClock = 0;
  private readonly targetCount: number;

  constructor(n: number, { duration = 90, countdown = 3, demo = false }: SimOptions = {}) {
    this.n = n;
    this.layout = machineLayout(n);
    this.demo = demo;
    this.duration = duration;
    this.phase = demo ? 'play' : 'count';
    this.timer = countdown;
    this.stats = Array.from({ length: n }, () => ({ score: 0, grabs: 0, slips: 0, bombs: 0, prizes: 0 }));
    this.targetCount = Math.round(14 + n * 4);
    this.world = createWorld();
    buildMachineColliders(this.world, this.layout);
    this.claws = Array.from({ length: n }, (_, i) => createClaw(this.world, this.layout, i, n));

    for (let i = 0; i < this.targetCount; i++) {
      this.addPrize(true);
    }

    for (let i = 0; i < 180; i++) {
      this.world.step(); // let the pile settle before anyone sees it
    }
  }

  /** Frees the physics engine's memory. The Sim can't be used afterwards. */
  dispose() {
    this.world.free();
  }

  /** Player i pressed their button. Returns true if the claw started dropping. */
  press(i: number): boolean {
    const c = this.claws[i];

    if (!c || this.phase !== 'play' || c.phase !== 'roam') {
      return false;
    }

    c.phase = 'drop';
    c.t = 0;
    this.emit({ k: 'drop', c: i });

    return true;
  }

  /** Advance by dt seconds (any size; the physics runs in fixed 1/60 s steps). */
  step(dt: number) {
    this.acc = Math.min(this.acc + dt, 0.5);

    while (this.acc >= STEP) {
      this.acc -= STEP;
      this.fixedStep(STEP);
    }
  }

  snapshot(): Snapshot {
    return {
      t: 's',
      ph: this.phase,
      tm: this.demo ? 0 : this.phase === 'count' ? this.duration : Math.max(0, Math.ceil(this.timer)),
      fz: this.frenzy ? 1 : 0,
      c: this.claws.map((c): ClawState => [
        round2(c.x), round2(c.z), round2(c.y), round2(c.open), c.phase === 'roam' ? 0 : 1,
        round3(c.swingX), round3(c.swingZ), round3(c.yaw),
      ]),
      p: this.prizes.map((p): PrizeState => {
        const t = p.body.translation(), q = p.body.rotation();

        return [p.id, p.type, round2(t.x), round2(t.y), round2(t.z), round3(q.x), round3(q.y), round3(q.z), round3(q.w)];
      }),
      sc: this.stats.map((s) => s.score),
    };
  }

  private emit(e: GameEvent) {
    this.events.push(e);
  }

  private prizeById(id: number) {
    return this.prizes.find((p) => p.id === id);
  }

  private addPrize(initial: boolean) {
    this.prizes.push(spawnPrize(this.world, this.layout, this.nextId++, initial));
  }

  private fixedStep(dt: number) {
    this.clock += dt;

    if (!this.demo) {
      this.updateTimer(dt);
    }

    this.claws.forEach((c, i) => {
      this.updateClaw(c, i, dt);

      const held = this.prizeById(c.held);

      updateSwing(c, held ? held.body.translation() : null, dt, c.phase === 'drop' || c.phase === 'close');
      updatePose(c, this.layout);
      slideGripAnchor(c, dt);

      if (c.joint && held) {
        gripSpring(c, held, dt);
      }
    });

    for (const p of this.prizes) {
      nudgeTowardChute(p, this.layout, dt);
    }

    this.world.step();
    this.removeFallenPrizes();
    this.spawnClock += dt;

    if (this.prizes.length < this.targetCount && this.spawnClock > SPAWN_INTERVAL) {
      this.spawnClock = 0;
      this.addPrize(false);
    }
  }

  private updateTimer(dt: number) {
    if (this.phase === 'count') {
      this.timer -= dt;

      const tick = Math.ceil(this.timer);

      if (tick !== this.lastTick && tick > 0) {
        this.lastTick = tick;
        this.emit({ k: 'tick', n: tick });
      }

      if (this.timer <= 0) {
        this.phase = 'play';
        this.timer = this.duration;
        this.emit({ k: 'go' });
      }
    } else if (this.phase === 'play') {
      this.timer -= dt;

      if (!this.frenzy && this.timer <= FRENZY_AT) {
        this.frenzy = true;
        this.emit({ k: 'frenzy' });
      }

      if (this.timer <= 0) {
        this.timer = 0;
        this.phase = 'over';
        this.frenzy = false;
        this.emit({ k: 'end' });
      }
    }
  }

  /** The claw's state machine: roam → drop → close → lift → carry → release → roam. */
  private updateClaw(c: Claw, i: number, dt: number) {
    const L = this.layout;

    switch (c.phase) {
      case 'roam':
        roam(c, this.claws, L, dt, this.frenzy ? 1.7 : 1);
        break;

      case 'drop': {
        c.vx = c.vz = 0; // the carriage stops dead, so the claw sways a little on the way down

        const stopAt = this.contactHeight(c);

        c.y -= 5.5 * dt;

        if (c.y <= stopAt) {
          c.y = stopAt;
          c.phase = 'close';
          c.t = 0;
        }

        break;
      }

      case 'close':
        c.t += dt;
        c.open = Math.max(0, 1 - c.t / 0.3);

        if (c.t >= 0.3) {
          this.tryGrab(c, i);
          c.phase = 'lift';
          c.t = 0;
        }

        break;

      case 'lift':
        c.y += (c.held >= 0 ? 2.6 : 3.6) * dt;

        if (c.fumbleAt && this.clock >= c.fumbleAt) {
          this.fumble(c, i);
        } else if (c.held >= 0 && !c.fumbleAt) {
          this.maybeSlip(c, i, dt, 0.5);
        }

        if (c.y >= L.topY) {
          c.y = L.topY;

          if (c.held >= 0) {
            c.chute = nearestChute(L, c.x);
            c.phase = 'carry';
          } else {
            c.phase = 'roam';
            pickTarget(c, L);
          }
        }

        break;

      case 'carry': {
        const ch = c.chute ?? nearestChute(L, c.x);
        const dx = ch.x - c.x, dz = ch.z - c.z, d = Math.hypot(dx, dz);
        const speed = 2.8 * (this.frenzy ? 1.5 : 1);

        if (d <= speed * dt) {
          c.x = ch.x;
          c.z = ch.z;
          c.vx = c.vz = 0;
          this.release(c, i);
          c.phase = 'release';
          c.t = 0;
        } else {
          c.vx = (dx / d) * speed;
          c.vz = (dz / d) * speed;
          c.x += c.vx * dt;
          c.z += c.vz * dt;
          this.maybeSlip(c, i, dt, 0.8);
        }

        break;
      }

      case 'release':
        c.t += dt;
        c.open = Math.min(1, c.t / 0.2);

        if (c.t > 0.45) {
          c.phase = 'roam';
          pickTarget(c, L);
        }

        break;
    }
  }

  /** How far the claw can descend before it bumps into the pile. */
  private contactHeight(c: Claw) {
    const [tx, , tz] = clawTip(c);
    let h = 0.3;

    for (const p of this.prizes) {
      if (p.heldBy >= 0) {
        continue;
      }

      const t = p.body.translation();
      const hd = Math.hypot(t.x - tx, t.z - tz);

      if (hd < PRIZE_TYPES[p.type].r * 0.8 + 0.25) {
        h = Math.max(h, t.y - 0.1 + hd * 0.3);
      }
    }

    return h;
  }

  /** The fingers have closed: find the nearest prize and roll the (rigged) dice on holding it. */
  private tryGrab(c: Claw, i: number) {
    const tip = clawTip(c);
    let best: Prize | null = null, bestScore = Infinity, bestOffset = 0;

    for (const p of this.prizes) {
      if (p.heldBy >= 0) {
        continue;
      }

      const t = p.body.translation();
      const offset = Math.hypot(t.x - tip[0], t.z - tip[2]);

      if (offset > GRAB_REACH) {
        continue;
      }

      const dy = Math.abs(t.y - (tip[1] + 0.15));

      if (dy > PRIZE_TYPES[p.type].r + 0.3) {
        continue;
      }

      const score = offset + dy * 0.6;

      if (score < bestScore) {
        bestScore = score;
        best = p;
        bestOffset = offset;
      }
    }

    if (!best) {
      this.emit({ k: 'grab', c: i, ok: 0 });

      return;
    }

    const chance = PRIZE_TYPES[best.type].grip * (1 - (0.5 * bestOffset) / GRAB_REACH); // off-centre grabs are weaker

    attach(this.world, c, i, best);

    if (Math.random() < chance) {
      if (this.stats[i]) {
        this.stats[i].grabs++;
      }

      this.emit({ k: 'grab', c: i, ok: 1, type: best.type });
    } else {
      // The dice said no, but show it: the claw lifts the toy a little, then it slides out of the fingers.
      c.fumbleAt = this.clock + rand(FUMBLE_AFTER[0], FUMBLE_AFTER[1]);
    }
  }

  /** A fumbled grab (see tryGrab) lets go of the toy early in the lift. */
  private fumble(c: Claw, i: number) {
    this.release(c, i);
    c.wYaw += rand(-2, 2);
    this.emit({ k: 'grab', c: i, ok: 0 });
  }

  /** While carrying, roll each step for the prize slipping out. Swinging shakes prizes loose. */
  private maybeSlip(c: Claw, i: number, dt: number, phaseFactor: number) {
    const p = this.prizeById(c.held);

    if (!p) {
      return;
    }

    const sway = 1 + 2.5 * (Math.abs(c.swingX) + Math.abs(c.swingZ));

    if (Math.random() >= PRIZE_TYPES[p.type].slip * phaseFactor * sway * dt) {
      return;
    }

    this.release(c, i);
    c.wYaw += rand(-3, 3);

    if (this.stats[i]) {
      this.stats[i].slips++;
    }

    this.emit({ k: 'slip', c: i });

    if (c.phase === 'carry') {
      c.phase = 'release';
      c.t = 0;
    }
  }

  private release(c: Claw, i: number) {
    c.fumbleAt = 0;
    detach(this.world, c, this.prizeById(c.held), i, this.clock);
  }

  /** Score prizes that dropped down a chute; clean up any that escaped the machine. */
  private removeFallenPrizes() {
    const L = this.layout;

    for (let k = this.prizes.length - 1; k >= 0; k--) {
      const p = this.prizes[k];

      if (p.regroupAt && this.clock >= p.regroupAt) {
        p.regroupAt = 0;
        p.collider.setCollisionGroups(GROUPS.prize);
      }

      const t = p.body.translation();
      const inChute = t.y < -1.2 && t.z > L.dividerZ;
      const lost = t.y < -6 || Math.abs(t.x) > L.width || Math.abs(t.z) > L.depth;

      if (!inChute && !lost) {
        continue;
      }

      if (p.heldBy >= 0) {
        this.release(this.claws[p.heldBy], p.heldBy);
      }

      const x = t.x; // read before the body is freed

      this.world.removeRigidBody(p.body);
      this.prizes.splice(k, 1);

      if (inChute) {
        this.scorePrize(p, x);
      }
    }
  }

  private scorePrize(p: Prize, x: number) {
    const i = p.lastHolder;

    if (i < 0 || this.phase !== 'play') {
      return;
    }

    const t = PRIZE_TYPES[p.type];
    const pts = rollPoints(t);
    const s = this.stats[i];

    s.score += pts;
    s.prizes++;

    if (t.model === 'bomb') {
      s.bombs++;
    }

    const ch = nearestChute(this.layout, x);

    this.emit({ k: 'score', c: i, pts, type: p.type, x: round2(ch.x), z: round2(ch.z) });
  }
}
