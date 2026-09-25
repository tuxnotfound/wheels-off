# Wheels Off: skate slice

A Three.js + react-three-fiber skateboarding game in an anime look: a kid skates through
an endless small Japanese town, carving down streets, taking corners and ollieing over
road junk. The town is painted 2D art (facades, props, obstacles) mapped onto simple 3D
shapes, and the character is a VRM model (VRoid Studio). The art in the repo is generated
placeholder art. **See [ART.md](ART.md) for how to replace it and add a character.**

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
- **`src/art/art.ts`**: the art pipeline. It loads `public/art/manifest.json`, preloads
  every image before the game boots, and provides unlit painted materials (the art carries
  its own shading) plus a shadow-pass material that respects cut-out silhouettes.
- **`src/world/streetGen.ts`**: the town as a deterministic function of street seeds:
  side-streets, lots picked from the building art that fits, walls and trees for the gaps,
  sidewalk props, obstacles, street names.
- **`src/world/Block.tsx`, `painted.tsx`, `parts.tsx`, `ObstacleView.tsx`**: one memoized
  component per street block (keyed `seed:k`). Only new blocks mount and nothing
  re-renders. Each building is its painted front as a cut-out card plus a plain 3D body
  behind it. Props and obstacles are cards or crossed cards. Road, sidewalks, paint, poles
  and wires stay 3D.
- **`src/look/`**: the look.
  - Cel shading: `gradientMap.ts` is a hard two-tone ramp (lit or shade, no gradient).
    Shade gets no direct light, so a cool tinted ambient alone colors it. One sun casts
    shadows, and its shadow frustum follows the view (`Lights` in `GameCanvas.tsx`).
  - `materials.ts` holds the toon materials plus a vertex patch that bends the world into a
    small planet. `curvedDepth` applies the same bend in the shadow pass.
  - `textures.ts` draws the 止まれ road text and overpass sign on canvas.
  - `timeOfDay.ts` is the one palette for the time of day (golden hour): sun direction and
    color, tinted shade, sky, fog, and the color grade. `Sky.tsx` paints the sky from it.
  - `Petals.tsx` is the falling sakura: 900 petals in one draw call, animated entirely in
    the vertex shader and wrapped in a box that follows the camera anchor.
  - `PostFX.tsx` is one full-screen pass for the fisheye lens, the ink lines (from depth
    discontinuities and color steps), the golden-hour grade and the vignette.
- **`src/player/`**: the skater.
  - `pose.ts` turns the sim into one pose per frame (sideways stance, push cycle, carve
    lean, ollie tuck and board pop, landing squash, wipeout wobble).
  - `Skater.tsx` places the board and hands the pose to a rider.
  - `VrmRider.tsx` retargets the pose onto a VRM's humanoid bones and runs its spring
    bones. `ProceduralRider.tsx` is the code-built fallback kid.
- **`scripts/make-placeholders.mjs`**: regenerates the placeholder SVG art and manifest.

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
Open `/?vrm=<file under public/art/>` to try a VRM character without editing the manifest.

## Gotchas worth knowing

- `PostFX` renders from a `useFrame(cb, 1)`. Any priority > 0 **disables r3f's automatic
  rendering**, which is why that callback calls `gl.render` itself. Everything else stays at
  the default priority, where same-priority callbacks run in mount order. That is why
  `SimDriver` is mounted before `World`.
- Long flat meshes must be tessellated or the curvature patch leaves them as straight chords.
  An untessellated road sags below the ground plane and the ground pokes through.
- The canvas is `flat` (no tone mapping): ACES washes out the flat anime palette.
- Riders bind their pose function in a `useLayoutEffect`. React detaches refs during the
  commit, but passive effect cleanups run later, so a frame can land in between and call
  an unmounted rider's apply.
- Every shadow caster needs `customDepthMaterial = curvedDepth`. The stock depth material
  renders the world unbent, and shadows then slide away from their objects with distance.

## Next steps

1. Sound: board roll, pop, landing, ambient town.
2. Grindable curbs and rails, manuals, a trick-and-score loop beyond ollies.
3. Pedestrians and cyclists, day/evening palettes, mobile touch controls.
