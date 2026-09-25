# Advertising in Wheels Off

The town has built-in ad space that fits the setting: rooftop billboards, banners strung
over the street, posters on block walls, nobori flags outside shops, and the sides of
delivery vans. Which creative fills each slot comes from one file,
`public/art/ads.json`, so a campaign goes live by adding images and editing that file.
No code changes are needed.

The current campaign is placeholder art from `scripts/make-ads.mjs`. **Every brand in it is
fictional**, plus house ads (the game's own skate shop, a festival, a sale) and a
"広告募集中 / YOUR AD HERE" creative in every format that marks the space as for sale.

## Formats

| format      | size (m)    | aspect | where it appears                                   | counted within |
|-------------|-------------|--------|----------------------------------------------------|----------------|
| `billboard` | 9.6 x 3.2   | 3:1    | on tall flat roofs, angled toward oncoming riders  | 70 m           |
| `banner`    | 6.4 x 1.0   | 32:5   | strung over the road between two posts (both faces) | 45 m           |
| `poster`    | 1.0 x 1.4   | 5:7    | pasted on block walls, facing the road             | 18 m           |
| `nobori`    | 0.6 x 1.8   | 1:3    | shop flags at the sidewalk edge, 2 or 3 per shop (both faces) | 18 m |
| `van`       | 2.5 x 1.0   | 5:2    | both sides of parked delivery vans                 | 25 m           |

Sizes live in `AD_SIZE` in `src/ads/ads.ts`. Creatives must match the aspect ratio: they
are shown at the format's size, so a wrong ratio stretches them.

**Image spec:** PNG or SVG, about 180 px per meter (a billboard is 1728 x 576). Keep text
large: posters and flags are read at speed from a few meters away, billboards from 30 m
or more. Transparent pixels are cut away, so shaped edges work. Don't bake in lighting.
Ads glow slightly in the scene so they stay readable in shade.

## Adding a creative

1. Put the image in `public/art/ads/`.
2. Add an entry to `public/art/ads.json`:

```json
{
  "id": "billboard-acme-spring",
  "advertiser": "Acme",
  "format": "billboard",
  "image": "ads/billboard-acme-spring.png",
  "weight": 2,
  "url": "https://example.com"
}
```

`weight` is the creative's share of its format's slots. A creative with weight 2 fills
about twice as many slots as one with weight 1. Slot picks are deterministic per street
block, so a given corner keeps the same ad while you ride past it.

## Where ads appear

`src/world/streetGen.ts` decides placement per block, avoiding everything else on the
sidewalk:

- Billboards go on flat-roofed buildings at least 9 m tall, on about 45% of them.
- A street banner hangs on roughly 30% of blocks on streets 6 m or wider, never under a
  footbridge.
- Nobori stand outside about 70% of shops, konbini and shokudō.
- Posters go on about 60% of block-wall stretches, one per 3.2 m tile, up to two.
- Vans are a quarter of the parked vehicles, each carrying one creative on both sides.

The fixtures (frames, posts, flag poles) are in `src/ads/fixtures.tsx`. The ad face
itself is `src/ads/AdSlot.tsx`.

## Measuring: impressions

A slot counts **one impression per appearance** once it has been readable for a full
second. Readable means inside the frame, within its format's distance above, and facing
the camera. Anything turned more than about 75° away doesn't count; the two-sided
formats count from both faces. This makes it a conservative, viewable-impression
measure.

Each impression is dispatched as a DOM event:

```js
window.addEventListener('wheelsoff:ad-impression', (e) => {
  // e.detail = { creative, advertiser, format, slot, at }
  // forward to your analytics / ad server here
})
```

Session totals per creative are in `adStats` (`src/ads/ads.ts`), and in dev they are also
on `window.__ads`. Nothing is sent anywhere yet. Wiring the event to an analytics
endpoint is the step before selling space.

In a 40-second automated test ride, 117 impressions were counted across 18 creatives.
Treat that as a sanity check, not an audience number.
