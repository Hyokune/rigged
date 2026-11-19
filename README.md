# RIGGED

A one-button 3D claw machine party game for 1–8 players. Made for a mini game jam with the theme **"One button"**.

Every player has a claw that wanders around a shared claw machine on its own. Your **one button** drops it. If it catches something, it carries the prize to a chute, unless the prize slips out on the way (the machine is rigged).

| Prize | Points | Notes |
|---|---|---|
| 🐥🐷🐱🐶🐰 Common plushies | 10 | Easy to grab |
| 🐻🐼🐨🦊🐧 Uncommon plushies | 25 | |
| 🦁🐘🐊🦈 Rare plushies | 50 | Slippery |
| 🦄 Unicorn | 100 | Jackpot: hard to grab, very slippery |
| 🎁 Mystery Box | 5–75 | Random value |
| 💣 Bomb | **−40** | The claw *loves* holding onto these |

The claws speed up during the last 15 seconds (**FRENZY**). A prize that slips and happens to land in a chute still counts for whoever dropped it.

## How to play

1. One person clicks **Host a game** and shares the 4-letter room code (or the **Copy invite link** URL).
2. Everyone else opens the same page on their own laptop or phone and joins with the code.
3. The host can also **add players on the same keyboard**, each with their own key. This works offline, as a single-screen fallback.
4. Host picks a round length and hits **Start**. Press <kbd>Space</kbd>, <kbd>Enter</kbd> or the **GRAB** button to drop your claw.
5. Drag on the machine to look around (tilt up for a top-down view: the roof fades out). Double-click / double-tap to reset the view.
6. Every 15 seconds the game pauses until everyone has picked an **upgrade** from three cards. A cursor spins over them, and your button stops it on whichever one is lit. Most cards boost your own claw; rare **sabotage** cards rig everyone else's, and once in a blue moon the legendary **Mega Claw** turns up: a giant claw that grabs up to three prizes at once. Hover over a card, or over your upgrades under the timer, to see what it does.

Players who join mid-round watch the current round and play from the next one.

## Development

Requires Node 20+.

```sh
npm install
npm run dev          # http://localhost:8080 with hot reload
npm run typecheck    # TypeScript 7 strict-mode check
npm run lint         # ESLint: recommended checks + house style (see eslint.config.js)
npm run lint:fix     # fix whatever can be fixed automatically
npm run build        # type check + production build into dist/
npm run preview      # serve the production build
```

To test multiplayer on one machine, open two browser windows: host in one, join in the other.

**Code style** (enforced by `npm run lint`): every `if`/`for`/`while` has braces, one statement per line, blank lines between logical steps, arrow functions for standalone functions, kebab-case file names.

Two TypeScript versions are installed on purpose. TypeScript 7 (the fast native compiler, installed as `typescript-7`) does the type-checking for `typecheck` and `build`. TypeScript 6 stays installed as `typescript` only because ESLint's TypeScript support (`typescript-eslint`) can't use TypeScript 7 yet. Once it can, remove the 6.0 copy and rename the alias.

### 3D models

The plushies come from the **Claw Machine Free** asset pack ([itHappy Studios](https://ithappystudios.com/free/claw-machine-free/)). The original `.glb` files are in `assets/`.

The pack puts the same 500 KB texture inside every model, so `npm run pack-models` merges the plushies in `assets/` into one file, `public/models/arcade.glb`, with shared textures stored once (8.3 MB down to 1.1 MB). The pack's Toy Claw cabinet and colour sets aren't used, so they're skipped (see `SKIP` in the script). Re-run it after adding or changing anything in `assets/`. Models are looked up by node name (e.g. `Bear_01`). See `model` in [src/shared/prizes.ts](src/shared/prizes.ts).

The mystery box, bomb, claws and the big machine are built from three.js primitives in code.

## How it works

- **Three.js** renders everything. **Vite** bundles the TypeScript.
- **Rapier** (WebAssembly physics) simulates the prizes as rigid bodies that tumble and stack. A grabbed prize hangs from a ball joint at the spot the fingers caught it, with a spring that holds it roughly at the angle it was caught. Grab one off-centre and it tips over part of the way. Each claw head swings on its cable as a damped pendulum: it sways when the carriage starts and stops, leans away from an off-centre load, and twists on lopsided grabs. Bigger swings make prizes more likely to slip. The grip odds themselves are still dice rolls (it's *rigged*), and tunable in [src/shared/prizes.ts](src/shared/prizes.ts) and the constants at the top of [src/sim/grip.ts](src/sim/grip.ts) and [src/sim/sim.ts](src/sim/sim.ts).
- **PeerJS** (WebRTC) handles networking. The host's browser runs the authoritative simulation ([src/sim/](src/sim/)) and sends snapshots to every client about 20 times per second. Clients only send "I pressed the button". PeerJS's free public broker is only used to introduce players to each other; game traffic goes directly between browsers.
- The machine is a polygon with one side per player: a square for 1–4 players, then pentagon, hexagon, heptagon and octagon. Each side has its own chute (your claw carries prizes to yours), and each player's camera starts facing their own side. See `machineLayout` in [src/shared/layout.ts](src/shared/layout.ts).

### Known limitations (prototype)

- **The host should keep their tab in the foreground.** Browsers slow down timers in background tabs, which makes the game stutter for everyone.
- Some strict corporate networks block WebRTC. If joining fails, play on one screen with **Add player on this keyboard**.
- If the host leaves, the room closes.
