# Wheels Off: skate slice

A zero-asset Three.js + react-three-fiber skateboarding game in a hand-drawn anime look:
a kid skates through an endless small Japanese town, carving down streets, taking corners
and ollieing over road junk. No models, textures or HDRIs. Everything is procedural, and
it runs on `npm run dev`.

## Controls

- **W / ↑** push (speed up), **S / ↓** brake
- **A / D** (or ←/→) carve across the lane. Hold toward a side street as you reach an
  intersection to turn into it (arrows at the bottom show which turns exist).
- **Space** ollie. Clearing obstacles builds a combo, and hitting one is a wipeout that resets it.

## How it's built

- **`src/game/sim.ts`**: the skate sim as plain mutable state, stepped once per frame with
  no React. It rides street centerlines plus a lateral carve. Turns follow a true
  quarter-circle arc through the intersection, so position and heading never snap. The arc
  swings wide enough to clear the curb. It also handles ollie physics (buffered jump),
  obstacle clear/hit, and scoring.
- **`src/game/GameCanvas.tsx`**: canvas, lights, and a camera anchor that trails the skater's
  position and heading on damped springs. The world is moved and rotated so the anchor sits
  at the origin, and the chase camera widens with speed and rolls into carves.
- **`src/world/streetGen.ts`**: the town as a deterministic function of street seeds:
  side-streets, lots (houses, apartments, shops, offices, block walls), props, obstacles,
  street names.
- **`src/world/Block.tsx`, `parts.tsx`, `ObstacleView.tsx`**: one memoized component per
  street block (keyed `seed:k`). Only new blocks mount and nothing re-renders, and every
  mesh shares unit geometries and cached materials.
- **`src/look/`**: the look.
  - `materials.ts` holds the toon materials plus a vertex patch that bends the world into a
    small planet. Facade UVs come from the scaled object position, so one unit box tiles
    windows at a fixed world size.
  - `textures.ts` draws the facades, signs, 止まれ road text and vending machines on canvas.
  - `Sky.tsx` is the painted sky.
  - `PostFX.tsx` is one full-screen pass for the fisheye lens, the ink lines (from depth
    discontinuities and color steps) and the vignette.
- **`src/player/Skater.tsx`**: the procedural kid. Sideways stance, push cycle, carve lean,
  ollie tuck and board pop, landing squash, wipeout wobble, blob shadow.

## Run

Vite 8 needs Node `^20.19` or `>=22.12`; `.nvmrc` pins Node 22 (your global Node is untouched).

```bash
nvm use 22          # one-time: nvm install 22
npm install
npm run dev -- --port 5180   # (5173 may be taken by another project)
```

```bash
npm run typecheck   # tsc -b --noEmit
npm run build       # tsc -b && vite build
```

In dev, `window.__sim` exposes the live sim state for poking at from the console.

## Gotchas worth knowing

- `PostFX` renders from a `useFrame(cb, 1)`. Any priority > 0 **disables r3f's automatic
  rendering**, which is why that callback calls `gl.render` itself. Everything else stays at
  the default priority, where same-priority callbacks run in mount order. That is why
  `SimDriver` is mounted before `World`.
- Long flat meshes must be tessellated or the curvature patch leaves them as straight chords.
  An untessellated road sags below the ground plane and the ground pokes through.
- The canvas is `flat` (no tone mapping): ACES washes out the flat anime palette.

## Next steps

1. Sound: board roll, pop, landing, ambient town.
2. Grindable curbs and rails, manuals, a trick-and-score loop beyond ollies.
3. Pedestrians and cyclists, day/evening palettes, mobile touch controls.
