# Art spec: painted town + VRM character

The town is built from painted 2D images mapped onto simple 3D shapes. Every image is
listed in `public/art/manifest.json` with its real-world size in meters. The street
generator lays lots out from whatever the manifest contains, so adding a facade just
means adding an entry.

Every facade in `public/art/buildings/` and every sidewalk prop and the block wall in
`public/art/props/` are painted, by gpt-image-2 (the tables at the end of Generating with an image
model). The fallen petals and the unused bicycle card are still generated placeholders
(`node scripts/make-placeholders.mjs`). The placeholder script rewrites the whole manifest, so
don't run it again; new art goes in with `npm run art:import`.

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

Same rules: transparent PNG, drawn straight-on, ground line at the bottom. Props are seen up
close on the sidewalk, so they go in at 400 px per meter, four times a facade's density.

| mode    | use for                               | how it's shown                     |
|---------|---------------------------------------|------------------------------------|
| `card`  | anything seen mostly face-on          | one upright plane facing the street |
| `cross` | plant pots (`pot-*`)                  | two crossed planes (reads from any angle) |
| `box`   | vending machines, post box            | solid box with the image on the front (`depth`, `color`; `base` stands it on a post) |
| `wall`  | the block-wall tile (`wall-block`), the footbridge's span (`bridge-span`) | repeated along empty frontage (or across the footbridge's faces), the end tiles cut short, the wall `depth` thick in its `color` |
| `decal` | fallen petals (`petals-ground`)       | flat on the pavement or road, seen from above |

A `plants` spot on the sidewalk is two to four different `pot-*` props side by side. One card
of a whole row of pots turned into a sliver seen down the street.

Trees are not painted cards: flat cards looked like cut-outs and turned into a line
edge-on. They are 3D (`src/world/Tree3D.tsx`): a toon-shaded trunk and branches under a
canopy of camera-facing blossom clusters. Each cluster is drawn from dozens of tiny
flowers and lit as a whole from the sun, so the canopy splits pale and warm against rose
shade. Sakura and green palettes, three shapes, and they are rare on purpose: an
occasional tree at the back of a sidewalk, and some gardens behind block walls.

Obstacles are **not** painted cards. They get jumped over and knocked flying, and flat
cards looked like cardboard cut-outs tumbling. The bin bags and the cardboard boxes are painted
solids, shaped from four views like the vehicles (Vehicles, below). The cone, the cone row and the
barricade are toon-shaded 3D shapes with hand-drawn textures in `src/world/ObstacleView.tsx`: a
cone's views would shape a square cone, and the barricade's A-frame legs would fill in solid. Their
sizes match the hitboxes in `src/world/streetGen.ts` (`OBST_SIZE`).

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

The thirteen, by gpt-image-2 (quality high, one image each), picked over Gemini 3 Pro Image,
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
| `apt-pink-4f-2` | a four-storey apartment building about 8 m wide with a flat roof, dusty pink tiled walls, balconies with railings and some laundry, AC units, a drain pipe, an entrance with a small canopy and mailboxes | `--width 8 --body 12.95` |
| `house-grey-2` | a two-storey house about 7 m wide, light grey siding, its gable end facing the viewer, a small balcony, a front door under a little canopy, a potted plant by the door | `--width 5.4 --body 5.25 --roof-shape gable --roof '#4f6a76'` |
| `office-5f-2` | a five-storey small office building about 8 m wide with a flat roof, concrete walls with horizontal bands of windows, blinds in some windows, a ground-floor entrance with glass doors, a vertical sign column left blank | `--width 8 --body 13.1` |

The width is the facade's real width in meters (Buildings, above): pick it so a door comes out
about 2.2 m tall. The apartment block asked for 10 m went in at 8, or it stood 16.8 m tall; the grey house asked
for 7 m went in at 5.4, or its door stood 2.9 m. A
lower tiled roof over the ground floor (the bookshop, the diner) goes in as the `--awning`, so it
leans out too.

### Props

Props take the same prompt with the subject changed: "Japanese small town street furniture",
"straight-on orthographic front view, no perspective and no vanishing point, no side or top
visible, the whole object visible and centered", and "any lettering left blank". Bring one in
with `--prop <mode>`, and for a box its `--depth` (and `--base` on a post):

```bash
npm run art:import -- ~/Downloads/vending.png --id vending-blue --width 1.0 --prop box --depth 0.8
npm run art:import -- ~/Downloads/pot.png --id pot-1 --width 0.5 --prop cross --glow
```

The box's color, on its sides and top, is taken from the image's edges unless `--color` sets it.
The block wall is a `wall` 3.2 m wide whose `--depth` is its thickness. Its pierced blocks show
the dark face of the box behind them, as the shadow inside the holes.

| id | subject | import flags |
|---|---|---|
| `vending-blue` | a Japanese drink vending machine, about 1 m wide and 1.85 m tall, a flat top, a blue body, a glass display of three rows of small drink cans and bottles with a little button under each, a coin slot and a note slot on the right, a dark pick-up flap across the bottom, a blank panel above the display | `--width 1.0 --prop box --depth 0.8` |
| `vending-red` | the same with a red body and a blank white panel | `--width 1.0 --prop box --depth 0.8` |
| `postbox` | a modern Japanese red post box, a rectangular pillar about 0.5 m wide and 1.35 m tall on a short dark stand, a flat top, two letter slots side by side with small blank white plates above them, a small blank collection-times plate below | `--width 0.55 --prop box --depth 0.4 --base 0.31` |
| `bridge-span` | a straight-on front elevation of one 4 m long section of a Japanese pedestrian footbridge span: along the bottom a steel girder about 0.8 m deep painted pale mint green with a thin darker lip and a row of bolts, above it a pedestrian railing about 1.2 m tall of slim vertical bars between a flat top rail and a bottom rail in the same mint green, both ends cut off straight and vertical at a railing post, open background showing between the bars, nothing behind it | `--width 4 --prop wall` |
| `wall-block` | a straight section of a Japanese concrete block garden wall, 3.2 m long and 1.8 m tall, grey concrete blocks in neat courses with thin mortar lines, one row of decorative pierced breeze blocks near the top, a flat concrete cap along the top, a few faint weather stains, both ends cut off straight and vertical, nothing behind it | `--width 3.2 --prop wall --depth 0.15` |
| `pot-1` | a single potted plant: a leafy green shrub in a terracotta pot, about 0.5 m wide and 0.8 m tall, nothing beside it | `--width 0.6 --prop cross --glow` |
| `pot-2` | a single potted plant: a spiky striped spider plant in a round blue glazed pot, about 0.45 m wide and 0.5 m tall, nothing beside it | `--width 0.65 --prop cross --glow` |
| `pot-3` | a single potted plant: a leafy bush with a few white flowers in a tall blue glazed pot, about 0.5 m wide and 0.9 m tall, nothing beside it | `--width 0.6 --prop cross --glow` |
| `pot-4` | a single potted plant: yellow flowers over round leaves in a small terracotta pot, about 0.4 m wide and 0.45 m tall, nothing beside it | `--width 0.45 --prop cross --glow` |

A pot's width is picked so the pot itself comes out 30 to 38 cm across; the plant spreads wider.

The footbridge (`src/world/Footbridge.tsx`) wears `bridge-span` on both faces of its deck, centered
and cut short at each end, its bars cut out so they cast striped shadows. The deck box, its
pillars and its stairs are code in the tile's `color`; the stairs are real steps. The girder came
out 0.41 m deep, not 0.8, and the walkway (`FOOTBRIDGE.walk` in `streetGen.ts`) stands on top of
it. In dev, `?footbridge` puts one over every block.
## Vehicles

The parked kei cars, kei trucks and vans are painted too, each from one image: a reference sheet
of four views of the vehicle at one scale, in a two by two grid. `npm run art:vehicle` splits the
sheet at the empty bands between the views and measures each view's outline. It packs the four
into one texture, `public/art/vehicles/<id>.webp`, and puts the outlines in the manifest's
`vehicles` list.

The game shapes the vehicle from where the side, front and top outlines overlap
(`src/world/paintedSolid.ts`). It is a box cut in slices nose to tail, each slice as tall as
the side view there and as wide as the narrower of the front and top views at each height. Each
surface is painted from the view it faces, and the underside is ink. Door mirrors and an aerial
are too thin to shape, so the importer drops them from the outlines and they stay painted on the
views. The model draws the front, rear and top up to 25% wider or narrower than each other, so
the importer stretches each across to the body's real width, `--width`.

The bin bags and the cardboard boxes (`--kind bags` or `boxes`) come the same way, into the
manifest's `obstacles`. An obstacle's long front faces the rider, so its sheet asks for that front
top left, where a vehicle's left side goes, its two ends on the right and the top view under the
front; the game turns it a quarter turn. `--length` is then its front end to end, and `--width` its
depth. Asked for its front only as "its long side", the model drew the long side in every view.
In dev, `?obstacle=<kind>` makes every obstacle that kind.

A kind with painted vehicles (`kei-car`, `kei-truck`, `van`) shows one of them, picked per spot.
A kind with none keeps its code model (`src/world/vehicles.tsx`). The scooter and the bicycle stay
code models: a bicycle is mostly holes, which outlines can't shape. In dev, `?vehicle=<id>` parks
that vehicle on both sides of every block.

The sheet's prompt (append the subject):

> anime background art, flat cel shading, clean dark teal ink outlines of even weight, muted
> pastel palette, painted blue shadow shapes, neutral daylight colors with no sunset light. An
> orthographic vehicle reference sheet of one vehicle: four separate views of the same vehicle
> at exactly the same scale, laid out in a two by two grid with wide empty gaps between them so
> no view touches another. Top left: its left side, nose pointing left. Top right: its front.
> Bottom left: seen from directly above, nose pointing left. Bottom right: its rear. Every view
> perfectly straight-on with no perspective, no vanishing point and no three-quarter angle, the
> side and top views the same length and lined up, the front and rear views the same height as
> the side view. No labels, no text, no arrows, no ground and no cast shadow, number plates
> blank, isolated on a solid flat magenta background

```bash
npm run art:vehicle -- ~/Downloads/kei.png --id kei-car-mint --kind kei-car --length 3.4 --width 1.48
```

`--length` is nose to tail in meters and sets the scale of all four views. `--width` is the body's
width without its mirrors: 1.48 m for any kei vehicle, the legal limit.

| id | subject | import flags |
|---|---|---|
| `kei-car-mint` | a tall boxy Japanese kei hatchback, 3.4 m long, 1.48 m wide and 1.7 m tall, a short sloping bonnet, a tall glasshouse with dark teal glass, pale mint green paint with a white roof, round headlamps, small black door mirrors, yellow number plates | `--kind kei-car --length 3.4 --width 1.48` |
| `kei-car-cream` | a boxy Japanese kei wagon, 3.4 m long, 1.48 m wide and 1.7 m tall, a flat upright front with square headlamps, a tall upright glasshouse with dark teal glass, cream paint, black bumpers, small black door mirrors, yellow number plates | `--kind kei-car --length 3.4 --width 1.48` |
| `kei-car-blue` | a rounded Japanese kei hatchback, 3.4 m long, 1.48 m wide and 1.55 m tall, dusty blue paint, a short rounded bonnet, oval headlamps, dark teal glass, small door mirrors in the body color, yellow number plates | `--kind kei-car --length 3.4 --width 1.48` |
| `kei-truck-white` | a Japanese kei truck, 3.4 m long, 1.48 m wide and 1.8 m tall, white, a flat-nosed cab over the front wheels with a tall windscreen, an open flat bed behind the cab with low drop sides and a guard frame behind the cab, the bed empty, round headlamps, small black door mirrors, yellow number plates | `--kind kei-truck --length 3.4 --width 1.48` |
| `van-white` | a Japanese cab-over delivery van, 4.7 m long, 1.7 m wide and 1.98 m tall, white, a flat upright front with the windscreen right above the front wheels and almost no bonnet, a tall boxy body with plain flat sides and no windows behind the front doors, dark teal glass, grey bumpers, small black door mirrors, white number plates | `--kind van --length 4.7 --width 1.69` |

| `bags-white` | a pile of three tied Japanese household rubbish bags left out for collection, semi-transparent white and pale blue plastic with crumpled paper showing through, each knotted at the top, in a row along its front, about 1.2 m long, 0.8 m from front to back and 0.55 m tall | `--kind bags --length 1.2 --width 0.45` |
| `boxes-brown` | a stack of three brown cardboard boxes with packing tape: a big box on the ground, a smaller box on top of it set a little back, and a small box on the ground beside them, about 1.1 m long, 0.9 m from front to back and 0.72 m tall | `--kind boxes --length 1.1 --width 0.6` |

The two obstacles took the sheet's prompt with "vehicle" changed to "object" and its views named
as above. The bags came out 0.3 m deep and went in at 0.45; stretched to their hitbox's 0.8 they
would bloat.

The truck's open bed comes out filled to its rails, its painted floor on top: from the riding
height it reads as a bed. A van carries its two ad slots on its flat sides, as the code van did.
Ask for a cab-over van in words: asked for a delivery van, the model drew a long-nosed European one.
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
