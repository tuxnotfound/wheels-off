# Art spec: painted town + VRM character

The town is built from painted 2D images mapped onto simple 3D shapes. Every image is
listed in `public/art/manifest.json` with its real-world size in meters. The street
generator lays lots out from whatever the manifest contains, so adding a facade just
means adding an entry.

Ten facades in `public/art/buildings/` are painted, by gpt-image-2 (the table at the end of
Generating with an image model). Three are still generated placeholders (`apt-pink-4f`,
`house-grey`, `office-5f`), and so is everything in `public/art/props/`
(`node scripts/make-placeholders.mjs`). The placeholder script rewrites the whole manifest, so
don't run it again; a new facade goes in with `npm run art:import`.

## Style target

Anime background art, the look of the reference shots:
- Flat cel colors, **no gradients**, painted shadow shapes (under eaves, balconies, awnings)
  in a cool blue/lavender multiply.
- Dark teal-grey ink lines (`#2b3634`) with slightly uneven weight. Heavier on silhouettes,
  lighter on interior detail.
- Muted palette: cream, off-white, sage, teal, dusty pink, beige, concrete grey; dark teal
  glass with a pale diagonal glint. Accent reds, yellows and blues only on signs, vending
  machines and post boxes.
- Lots of small clutter: AC units, drain pipes, meters, laundry, signs in Japanese.

## Buildings: front elevations

- **Framing:** straight-on front elevation, **no perspective**, ground line on the bottom
  edge of the image, nothing cropped.
- **Background:** transparent PNG. Anything transparent is cut away, so roof lines, water
  tanks and signs above the wall can have any silhouette.
- **Resolution:** about 100 to 150 px per meter (a 9.6 m wide facade is roughly
  1000 to 1400 px wide).
- **Manifest entry:**

```json
{
  "id": "apt-cream-3f",
  "front": "buildings/apt-cream-3f.png",
  "width": 9.6,          // meters along the street (the image width)
  "height": 12.5,        // meters, full image height incl. roof/tank
  "bodyHeight": 9,       // meters, where the wall stops (the 3D body is built to this)
  "depth": 9,            // meters back from the street
  "side": "#efe9d8",     // side wall color (seen at corners)
  "roof": "#6e7a78",     // roof color
  "roofShape": "flat",   // "gable" when the painted front shows a gable end, "pitched" below
  "awning": [2.45, 3.68] // optional: its lower edge and where it meets the wall, in meters
}
```

The 3D body behind the front is a box to `bodyHeight`. Its side walls, seen at corners and
down the gaps between lots, are drawn in code from the `side` color (a window a storey, a drain
pipe, an AC unit, inked edges; `src/look/buildingTex.ts`), all in one texture. Two parts of a
painted front stand out in 3D, so it doesn't read as a picture glued to a box:
- **`"pitched"` roof:** a tiled roof with its ridge along the street, overhanging the walls. The
  painted roof is cut off at `bodyHeight`, which is where the eaves meet the wall.
- **`awning`:** that band of the image leans out from the wall, its lower edge 0.9 m out.

Widths between 5 and 10 m work best (a block's frontage is about 20 to 28 m).

## Lighting on painted art

Painted art is lit by the scene through the same hard two-tone cel ramp as the 3D parts,
so the golden-hour sun warms the facades that face it and cast shadows land on them.
Paint it in neutral daylight colors and let the scene do the sunset. Mark painted foliage
(bushes, planters) `"glow": true`: it glows slightly with its own color, so it only
dims in shade instead of turning purple.

## Props and obstacles

Same rules: transparent PNG, drawn straight-on, ground line at the bottom.

| mode    | use for                               | how it's shown                     |
|---------|---------------------------------------|------------------------------------|
| `card`  | plant pots, anything viewed mostly face-on | one upright plane facing the street |
| `cross` | trees, post box                        | two crossed planes (reads from any angle) |
| `box`   | vending machines                      | solid box with the image on the front (`depth`, `color`) |
| `wall`  | the block-wall tile (3.2 m)           | repeated along empty frontage       |
| `decal` | fallen petals (`petals-ground`)       | flat on the pavement or road, seen from above |

Trees are not painted cards: flat cards looked like cut-outs and turned into a line
edge-on. They are 3D (`src/world/Tree3D.tsx`): a toon-shaded trunk and branches under a
canopy of camera-facing blossom clusters. Each cluster is drawn from dozens of tiny
flowers and lit as a whole from the sun, so the canopy splits pale and warm against rose
shade. Sakura and green palettes, three shapes, and they are rare on purpose: an
occasional tree at the back of a sidewalk, and some gardens behind block walls.

Obstacles are **not** painted cards. They get jumped over and knocked flying, and flat
cards looked like cardboard cut-outs tumbling. They are solid toon-shaded 3D shapes with
hand-drawn textures, built in `src/world/ObstacleView.tsx` (cone, cone row, barricade,
cardboard boxes, bin bags). Their sizes match the hitboxes in `src/world/streetGen.ts`
(`OBST_SIZE`).

Cards seen edge-on from the street turn into thin scribbles (a bicycle card looked like a
spider). Anything that stands along the street and is thin from the side needs a `box`
or a real model instead.

## Generating with an image model

The style prompt for every facade (append the subject):

> anime background art, flat cel shading, clean dark teal ink outlines of even weight,
> muted pastel palette (cream, sage, teal, dusty pink), painted blue shadow shapes, Japanese
> small town, neutral daylight colors with no sunset light, straight-on orthographic front
> elevation, no perspective and no vanishing point, the whole building visible and centered
> with a margin around it, its base a straight level line, no ground and no cast shadow on
> the ground, sign boards left blank, isolated on a solid flat magenta background

Why each part matters:
- **Orthographic, no perspective:** the image is mapped onto a flat front. Any perspective
  bends the street. Reject an image with a visible side wall or a vanishing point.
- **Ink outline and a solid magenta background:** the importer cuts the background away by
  flooding it from the image's borders, and the outline is where the flood stops. Magenta
  is in no building, so a white wall stays.
- **Neutral daylight:** the game lights every facade itself (Lighting on painted art, above).
  A painted sunset would be lit twice.
- **Blank signs:** generated lettering is usually garbled. The town's own signs carry the
  Japanese.

Then bring it in:

```bash
npm run art:import -- ~/Downloads/ramen.png --id shop-ramen-2 --width 6.4 --body 5.75 --roof-shape pitched --awning 2.45,3.68
npm run art:import -- ~/Downloads/house.png --id house-blue --width 7.2 --roof-shape gable --roof '#5e6f8a'
```

The importer (`scripts/import-art.mjs`) cuts the background, trims to the building, scales
to 100 px per meter and saves `public/art/buildings/<id>.webp`. Then it adds the manifest
entry, its height taken from the image. Check `bodyHeight` when a flat roof carries a tank or
a sign: pass `--body` with the wall's height. Reusing an existing id replaces that building
everywhere. A painted tiled roof wants `--roof-shape pitched` and `--body` at the eaves; an
awning wants `--awning` with its lower edge and its top. Read both off the image at 100 px per
meter, from the bottom. Look at it in the town with `npm run dev` and `?facade=<id>`, which stands it on
about half the lots it fits. `npm run shots -- <label> '?facade=<id>'` shoots the same ride
with it.

The first ten, by gpt-image-2 (quality high, one image each), picked over Gemini 3 Pro Image,
which drew four of ten at an angle or with a side wall showing. Each subject followed the style
prompt above; the import flags are the ones it went in with:

| id | subject | import flags |
|---|---|---|
| `shop-ramen-2` | a small ramen shop, striped awning, noren curtain in the doorway, blank sign board | `--width 6.4 --body 5.75 --roof-shape pitched --awning 2.45,3.68` |
| `house-sage-2` | a two-storey wooden house about 7 m wide, sage green siding, its gable end facing the viewer, a small porch light, a sliding front door | `--width 7.2 --body 6.0 --roof-shape gable --roof '#5d7480'` |
| `house-cream-2` | a two-storey house about 7 m wide, cream rendered walls, a grey tiled roof with its eaves facing the viewer, a small balcony with laundry hanging, a front door with a little canopy | `--width 7.2 --body 6.2 --roof-shape pitched` |
| `apt-cream-3f-2` | a three-storey apartment block about 10 m wide with a flat roof, cream walls, solid balcony parapets on each floor, AC units, a drain pipe | `--width 9.6` |
| `apt-teal-4f-2` | a four-storey apartment building about 10 m wide with a flat roof and a water tank on top, teal-grey tiled walls, balconies with railings, an entrance with mailboxes | `--width 8 --body 12.45` |
| `shop-kissa-2` | an old two-storey coffee shop (kissaten) about 6.5 m wide, brick lower wall, an arched window, a hanging blank sign, a tiled roof with its eaves facing the viewer | `--width 6.4 --body 5.5 --roof-shape pitched` |
| `konbini-2` | a one-storey convenience store front about 10 m wide with a flat roof, a blue and yellow stripe band, a glass front with shelves inside, blank sign band | `--width 10 --body 4.72` |
| `shop-flowers-2` | a two-storey flower shop about 6.5 m wide, buckets of flowers on stands out front, a green awning, a tiled roof with its eaves facing the viewer | `--width 6.4 --body 5.2 --roof-shape pitched --awning 2.05,2.78` |
| `shop-books-2` | a small two-storey used bookshop about 6.5 m wide, sliding glass doors, wooden shelves of books visible inside, a cart of books out front, a tiled roof with its eaves facing the viewer | `--width 6.4 --body 5.85 --roof-shape pitched --awning 2.8,3.32` |
| `shokudo-2` | an old two-storey diner (shokudo) about 7 m wide, a wooden front, a noren curtain, a display case of plastic food samples, a tiled roof with its eaves facing the viewer | `--width 7.2 --body 6.45 --roof-shape pitched --awning 3.35,3.85` |

The width is the facade's real width in meters (Buildings, above): pick it so a door comes out
about 2.2 m tall. The apartment block asked for 10 m went in at 8, or it stood 16.8 m tall. A
lower tiled roof over the ground floor (the bookshop, the diner) goes in as the `--awning`, so it
leans out too.

## Character: VRM

The default `public/art/character.vrm` is pixiv's VRM sample model
(`VRM1_Constraint_Twist_Sample`, © pixiv Inc.). Its embedded licence is the VRM Public
License 1.0 with redistribution, modification and corporate commercial use allowed and
no credit required. It is a stand-in until the game has its own kid:

1. Make the kid in [VRoid Studio](https://vroid.com/en/studio) (free): short black bob,
   white shirt, wide black culottes, teal sneakers, and a red messenger bag if you can
   add accessories.
2. Export as **VRM** (0.x or 1.0 both work) to `public/art/character.vrm`.
3. Set `"character": "character.vrm"` in the manifest.

To try a model without editing the manifest, put it under `public/art/` and open
`/?vrm=<file>.vrm`. The loader scales any model to the kid's height and drives its
humanoid bones with the skate animation. Hair and cloth spring bones swing on their own.
It also restyles every model the same way (constants at the top of
`src/player/VrmRider.tsx`): chibi proportions (head 1.9x, body 0.8x, chubbier arms and
legs), long hair strands shortened to the shoulder blades, a knit beanie with
headphones fitted over the hair's crown, relaxed straight navy pants built from the leg
skin in place of shorts (a straight tube round each leg bone below the seat, over dark
socks; a model without a `Bottoms` material keeps what it wears), and the top as an
oversized dark green tee: hung from the pelvis and cut straight at the hips, with roomy
straight sleeves to the elbows built from the arm skin.
The face is reshaped for a calm look: smaller near-black almond eyes under heavy lids,
a bolder lash line, warmer skin and a rounder jaw. So a VRoid export can keep normal
proportions, long hair and its own face.
If the file is missing or broken, the game falls back to the procedural kid and logs a
warning.

`public/art/_dev/` is gitignored, for local test models.
