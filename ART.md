# Art spec: painted town + VRM character

The town is built from painted 2D images mapped onto simple 3D shapes. Every image is
listed in `public/art/manifest.json` with its real-world size in meters. The street
generator lays lots out from whatever the manifest contains, so adding a facade just
means adding an entry.

The files in `public/art/buildings/` and `public/art/props/` are generated placeholders
(`node scripts/make-placeholders.mjs`). Replace them one at a time: drop in a PNG with
the same framing, point the manifest entry at it, and reload.

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
  "roofShape": "flat"    // or "gable" when the painted front shows a gable end
}
```

Widths between 5 and 10 m work best (a block's frontage is about 20 to 28 m).

## Lighting on painted art

Painted art is lit by the scene through the same hard two-tone cel ramp as the 3D parts,
so the golden-hour sun warms the facades that face it and cast shadows land on them.
Paint it in neutral daylight colors and let the scene do the sunset. Mark painted foliage
(bushes, planters) `"foliage": true`: it glows slightly with its own color, so it only
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

The style prompt for every piece (append the subject):

> anime background art, flat cel shading, clean dark teal ink outlines, muted pastel
> palette (cream, sage, teal, dusty pink), painted blue shadow shapes, Japanese small town,
> straight-on orthographic front elevation, no perspective, isolated on a plain white
> background, full object visible

Subjects that fit the manifest: *"three-storey apartment block with solid balcony
parapets, AC units and a drain pipe"*, *"two-storey wooden house with a gable roof
facing the viewer"*, *"small ramen shop with a striped awning and a red sign reading
ラーメン"*, *"convenience store front with a blue and yellow stripe band"*, *"blue drink
vending machine"*, *"orange traffic cone"*.

Then remove the background (to transparency), crop to the object, and measure its
real-world width for the manifest. Generated text on signs is usually garbled, so paint
over it or keep signs blank.

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
If the file is missing or broken, the game falls back to the procedural kid and logs a
warning.

`public/art/_dev/` is gitignored, for local test models.
