# Wheels Off: skate slice

A Three.js + react-three-fiber skateboarding game in an anime look: a kid skates through
an endless small Japanese town, carving down streets, taking corners and ollieing over
road junk. The town is painted 2D art (facades, props, obstacles) mapped onto simple 3D
shapes, and the character is a VRM model (VRoid Studio). The art in the repo is generated
placeholder art. **See [ART.md](ART.md) for how to replace it and add a character.**

## Landing page

The game opens on a landing page over the attract ride: the kid cruises the town on their own,
carving and throwing ollies and kickflips, with the camera drifting around the front of them.
It shows the title, the two modes, the keys, and the hi-scores going round on a marquee. Any key
rolls off in arcade (**F** in free roam), or click a mode; the page clears away as the camera
swings round behind the kid into the chase. **R** opens the hi-scores from there, **M** the music.
Keys that leave or move around the page (Cmd, Ctrl, Alt, Shift, Tab, Esc) never start the ride.
On a phone or tablet (a touch screen with no mouse), the modes, the keys and the hi-scores
button give way to a "mobile version soon" card; the attract ride and the music still play.

## Controls

- **W / ↑** push (speed up), **S / ↓** brake
- **A / D** (or ←/→) carve across the lane. Hold toward a side street as you reach an
  intersection to turn into it (arrows at the bottom show which turns exist).
- **Space** ollie. Clearing obstacles builds a combo, and hitting one is a wipeout that ends
  the run: score and combo go back to 0.
- **P** pause: the pause card, with how to play and the top of each leaderboard
  (P or Esc to play on). **R** high scores: both leaderboards in full, from anywhere (R to
  go back, Esc to ride). A run that makes a leaderboard asks for a name at the wipeout: Enter
  signs it, Esc signs it as John Doe.
- **M** music on or off (remembered in this browser). Before the first key press or click the
  browser keeps it silent, so M then starts it rather than turning it off.
- **F** free roam: the same endless town with no obstacles and no scores. F on the landing page
  rolls off in free roam; F on the pause screen rolls on in the other mode. Leaving arcade for
  free roam ends the run, as a wipeout does. F mid-ride does nothing.

## How it's built

- **`src/game/sim.ts`**: the skate sim as plain mutable state, stepped once per frame with
  no React. It rides street centerlines plus a lateral carve. Turns follow a true
  quarter-circle arc through the intersection, so position and heading never snap. The arc
  swings wide enough to clear the curb. It also handles ollie physics (buffered jump),
  obstacle clear/hit, and scoring.
- **`src/game/GameCanvas.tsx`**: canvas, lights, and a camera anchor that trails the skater's
  position and heading on damped springs. The world is moved and rotated so the anchor sits
  at the origin, and the chase camera widens with speed and rolls into carves. Before anyone
  takes over, the camera holds the landing shot: low in front of the kid, drifting from side to
  side, kept over the road, and on a wide screen aimed so the kid rides right of the title. It
  renders three blocks behind (`BEHIND_LANDING`) instead of one, since it looks back down the
  street. Taking over swings it round the kid, on the side of the street with more room, into
  the chase in 1.5 s.
- **`src/game/autopilot.ts`**: the attract ride behind the landing page. It drives the same
  input as the keyboard: straight down the first street (no carving near an intersection, so it
  never turns), a carve every few seconds, and an ollie or a kickflip every 3.5 to 7.5 s. The
  ride counts no ad impressions and pops no toasts.
- **`src/game/records.ts`**: personal records, kept in `localStorage` across sessions: the
  best run score, and the longest unbroken time at full speed, above 58 km/h (the sim
  counts the live streak). The HUD shows each record, with a trophy, under its live value.
  While a run is beating a record, the record follows the live value in red, with a pulsing
  flame by the live value. A run lasts until a wipeout, and that is when its records are
  set: the trophies pop and a "NEW RECORD!" banner with the values drops in at the top. A
  first run, with no record yet, beats nothing. Open `/?reset-records` to start over (it
  clears the records, this browser's copy of the leaderboards, the remembered name and the
  music setting).
- **`src/game/leaderboard.ts`**: the arcade high score tables, top 10 by run score
  ("trickster") and by time at full speed ("speedster"), shared by every player through the
  API below. The browser keeps the last copy it saw (`localStorage`), so the game opens on it
  and plays on without the API, signing runs into that copy. A browser that has never reached
  the API starts from the default table: TUX on top of both (200 points, 1:32.0), then
  made-up locals. Each table's top entry is the world record (WR), shown under the PR in the
  HUD with a crown; a run beating it shows as YOU with a blue flame. The boards are fetched
  at load, at each wipeout and when a card opens, at most once a minute.
- **`worker/`, `migrations/`, `shared/`**: the API, a Cloudflare Worker on D1 (SQLite), run
  only for `/api/*`. GET `/api/leaderboard` returns both top 10s; POST signs a run
  (`{ name, score, streak }`) and returns them. A run is one row in `runs`, and each board is
  the top 10 rows by one column. Scores come from the client, so the API only turns away the
  absurd (over 1,000,000 points or an hour at full speed), names that break the rules, and
  more than 60 runs an hour from one address. `shared/leaderboard.ts` holds the name rules
  both sides apply: letters, digits, spaces and `.-_!?'`, up to 12, with a word filter. The
  name entry asks for another name when the filter turns one away.
- **`src/game/mode.ts`**: the mode, arcade or free roam. In free roam the sim skips obstacles,
  scores nothing and counts no full speed time, and the HUD shows the speed alone. The attract
  ride runs under the same rules, whichever mode the player then picks. Blocks laid
  out during free roam keep no obstacles for good, so back in arcade none drops in right in
  front of the rider: they return with the blocks that rise over the horizon.
- **`src/game/arcadeStore.ts`, `Arcade.tsx`**: the landing page, then the cards over the ride,
  all in the title card's look, with scores and names in arcade type (Press Start 2P). The
  pause card (P) shows the top of each leaderboard; the hi-scores card (R) shows both in full,
  with your PRs. The HUD
  panels are labelled with the board they feed (TRICKSTER, SPEEDSTER). Pause and the name entry hold the sim still and take the
  keyboard from it (`input.blocked`). A run that makes a table gets the name entry instead
  of the PR banner; a world record gets a burst (rays, flash, stars) behind it.
- **`src/audio/`**: the music, with no audio files. `lofi.ts` composes lo-fi hip hop live in
  Web Audio: each tune picks a key, a tempo and a loop of four jazz chords, played on an FM
  electric piano over a boom-bap beat and a bass that follows the kick. A tune runs 32 bars
  (keys-only intro, melody in the second half, a breakdown without drums), then the next one
  starts in another key. A tape (pitch wobble, soft saturation) and vinyl crackle give the lo-fi
  sound. `music.ts` starts it on the first key press or click (browsers allow sound only after
  one), turns it off and on with M, muffles it under the landing page and the cards, and
  stops it while the tab is hidden.
- **`src/art/art.ts`**: the art pipeline. It loads `public/art/manifest.json`, preloads
  every image before the game boots, and provides unlit painted materials (the art carries
  its own shading) plus a shadow-pass material that respects cut-out silhouettes.
- **`src/world/streetGen.ts`**: the town as a deterministic function of street seeds:
  side-streets, lots picked from the building art that fits, walls and trees for the gaps,
  sidewalk props, obstacles, street names.
- **`src/ads/`**: advertising. Slots (rooftop billboards, over-street banners, wall posters,
  nobori flags, van sides) are filled from `public/art/ads.json`, and impressions are
  counted and dispatched as `wheelsoff:ad-impression` events. **See [ADS.md](ADS.md).**
- **`src/world/vehicles.tsx`**: parked kei trucks, kei cars, delivery vans (with ad sides),
  scooters and bicycles. Rounded toon bodies, detailed down to yellow kei plates.
- **`src/world/Tree3D.tsx`**: 3D sakura (and green) trees, with toon-shaded branches under
  a canopy of camera-facing, sun-lit blossom clusters. Three shared shapes, so any number of
  trees costs three geometries.
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
    discontinuities and color steps), the golden-hour grade and the vignette. The scene is
    rendered supersampled (up to 1.75x, within a pixel budget that drops on slow frames)
    and filtered down here, and ink weight tapers with distance so far objects stay clean.
- **`src/player/`**: the skater.
  - `pose.ts` turns the sim into one pose per frame (including an occasional kick while
    coasting with no keys held) (sideways stance, push cycle, carve
    lean, ollie tuck and board pop, landing squash, wipeout wobble).
  - `Skater.tsx` places the board and hands the pose to a rider.
  - `VrmRider.tsx` retargets the pose onto a VRM's humanoid bones and runs its spring
    bones. `ProceduralRider.tsx` is the code-built fallback kid.
- **`scripts/make-placeholders.mjs`**: regenerates the placeholder SVG art and manifest.
  **`scripts/make-ads.mjs`** regenerates the placeholder ad campaign (all brands fictional).

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

The leaderboard API runs next to it under wrangler, which Vite proxies `/api` to. Without
it the game plays on its own copy of the boards (and Vite logs a proxy error per fetch).

```bash
cp .dev.vars.example .dev.vars   # once: the local IP_SALT
npm run db:migrate               # once, and after each new migration: a local D1 in .wrangler/
npm run build && npm run api     # the API on 8788 (it also serves dist)
```

In dev, `window.__sim` exposes the live sim state for poking at from the console.
Open `/?vrm=<file under public/art/>` to try a VRM character without editing the manifest.

## Deploy

The game runs on a Cloudflare Worker, `wheels-off` (`wrangler.toml`): the built game in `dist`
as static assets, and `worker/` for `/api/*` only. Workers Builds deploys it from GitHub on
each push to `main`, with `npm run build` as the build command and `npx wrangler deploy` as
the deploy command (both in the Worker's build settings in the dashboard). It is live at
https://wheels-off.pinguim-informal.workers.dev. playwheelsoff.com goes in `wrangler.toml` as
a route with `custom_domain = true` when it launches.

The leaderboard database, once:

1. `npx wrangler login`
2. `npx wrangler d1 create wheels-off --location weur`, then its id in `wrangler.toml` in
   place of the zeros. A push before that fails the build.
3. `npx wrangler d1 migrations apply wheels-off --remote`: the `runs` table and the default
   table. Run it again after each new migration, before the push that needs it.
4. `openssl rand -hex 32 | npx wrangler secret put IP_SALT`. Without it the API signs runs
   with no rate limit and logs a warning.

Builds of other branches upload preview versions bound to the same database, so a run played
on a preview signs onto the real boards.

### Leaderboards: moderation

Hide a run, and it drops off both boards; the next run in line moves up.

```bash
npx wrangler d1 execute wheels-off --remote --command "SELECT id, name, score, streak, created_at FROM runs WHERE seeded = 0 ORDER BY id DESC LIMIT 20"
npx wrangler d1 execute wheels-off --remote --command "UPDATE runs SET hidden = 1 WHERE id = 42"
```

`UPDATE runs SET hidden = 1 WHERE seeded = 1` retires the default table once real runs fill
the boards.

### Later: accounts and billboard sales

Both go in the same API and database: a new migration per table (users, ad bookings) and a
route in `worker/index.ts` with its own module beside it. A run takes a nullable `user_id` then, so the anonymous
runs before accounts stay on the boards. Ads come from one URL already (`loadAds` in
`src/ads/ads.ts`, `/art/ads.json` today), so a `/api/ads` serving the sold creatives in the
same shape is a one-line swap in the game.

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

1. Sound effects: board roll, pop, landing, ambient town.
2. Grindable curbs and rails, manuals, a trick-and-score loop beyond ollies.
3. Pedestrians and cyclists, day/evening palettes, mobile touch controls.
