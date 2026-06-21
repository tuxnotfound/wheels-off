# Wheels Off — endless-road concept test

A zero-asset Three.js + react-three-fiber concept test in the style of *Wheels Off*:
a cel-shaded kid runs down an endless, recycling road while a damped third-person
camera trails behind. No models, textures, or HDRIs required — runs on `npm run dev`.

## What's here

- **`src/game/GameCanvas.tsx`** — the `<Canvas>`: gradient sky (`<color>` + fog), lights,
  the road, the runner, and the damped `FollowCam`.
- **`src/world/Road.tsx`** — endless road: a pool of segments recycled ahead of the runner
  as it advances (buildings + sidewalks flow past).
- **`src/player/Runner.tsx`** — toon-shaded capsule kid that auto-runs forward with a simple
  run cycle; exposes its group ref for the camera + road.
- **`src/look/ToonMaterial.tsx` / `gradientMap.ts`** — cel shading: `meshToonMaterial` + a
  procedural banded gradient map. Ink outlines via drei `<Outlines>`.

## Controls

- Auto-runs forward continuously.
- **A / D** (or ←/→): strafe across the road.
- **W / S** (or ↑/↓): speed up / slow down.

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

## Gotcha worth knowing

A `useFrame(cb, priority)` with **priority > 0 disables r3f's automatic rendering** (it expects
you to call `gl.render` yourself). Using it just to order the camera after the player silently
blanks the whole canvas. Keep camera/movement callbacks at the default priority; same-priority
`useFrame`s already run in mount order.

## Next steps

1. Swap the capsule for a rigged GLTF toon character with a real run animation.
2. Stronger cel look (more directional contrast / outline weight), curves + slopes in the road.
3. Then: real hand-painted assets, audio, and the wider world.
