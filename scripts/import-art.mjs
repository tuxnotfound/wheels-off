// Brings a facade or a prop from an image model into the town (ART.md, Generating with an image
// model). The image is a front view on a plain background. This cuts the background away (a flood
// fill from the borders, so a white wall inside the ink outline stays), trims to the subject,
// scales it (a facade to 100 px per meter, the placeholders' density; a prop, seen up close on the
// sidewalk, to 400) and saves it as WebP with alpha, then adds or updates its manifest entry.
// The real width says how big it is; its height follows from the image.
//
// Usage: npm run art:import -- <image> --id <id> --width <m> [--body <m>] [--depth <m>]
//          [--roof-shape flat|gable|pitched] [--awning <m>,<m>] [--roof <#hex>] [--side <#hex>]
//          [--tolerance <0-255>]
//        npm run art:import -- <image> --id <id> --width <m> --prop card|cross|box|wall
//          [--depth <m>] [--color <#hex>] [--base <m>] [--glow] [--tolerance <0-255>]
//  --prop   a prop instead of a facade, shown as that mode (ART.md, Props and obstacles)
//  --depth  a facade's body, back from the street (default 8); a box prop's depth; a wall's thickness
//  --color  a box's or a wall's color, on its sides and top (default: the commonest at its edges)
//  --glow   keeps its painted color in shade (foliage)
//  --base   a box on a post: where the box starts, in meters from the ground
//  --body   where the wall stops, under a roof, a tank or a sign above it; under a pitched roof,
//           the eaves, where the painted roof is cut off for a 3D one (default: the full height on
//           a flat roof, three quarters of it under a gable, four fifths under a pitched roof)
//  --awning the awning's lower edge and where it meets the wall, in meters from the ground: that
//           band leans out from the wall in 3D
//  --side   the side wall's color, seen at corners (default: the commonest color at its edges)
//  --roof   the roof's color (default: under a pitched roof, the painted tiles' median color just
//           above --body; otherwise #6e7a78)
// Needs Playwright's Chromium (`npx playwright-core install chromium`), which does the image work.
import { readFileSync, writeFileSync } from 'node:fs'
import { extname } from 'node:path'
import { parseArgs } from 'node:util'
import { chromium } from 'playwright-core'
import { cutBackground } from './cut-background.mjs'
import { readManifest, writeManifest } from './manifest.mjs'

const { values: o, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    id: { type: 'string' },
    width: { type: 'string' },
    body: { type: 'string' },
    depth: { type: 'string' },
    prop: { type: 'string' },
    color: { type: 'string' },
    base: { type: 'string' },
    glow: { type: 'boolean' },
    'roof-shape': { type: 'string', default: 'flat' },
    awning: { type: 'string' },
    roof: { type: 'string' },
    side: { type: 'string' },
    tolerance: { type: 'string', default: '28' },
  },
})
const [src] = positionals
const width = Number(o.width)
if (!src || !o.id || !/^[a-z0-9-]+$/.test(o.id) || !(width > 0)) {
  throw new Error('usage: npm run art:import -- <image> --id <lowercase-id> --width <meters> [options]')
}
if (!['flat', 'gable', 'pitched'].includes(o['roof-shape'])) throw new Error('--roof-shape is flat, gable or pitched')
const prop = o.prop
if (prop && !['card', 'cross', 'box', 'wall'].includes(prop)) throw new Error('--prop is card, cross, box or wall')
const awning = o.awning?.split(',').map(Number)
if (awning && !(awning.length === 2 && awning[0] >= 0 && awning[1] > awning[0])) throw new Error('--awning is <lower edge>,<top> in meters, as 2.45,3.68')
const PX_PER_M = prop ? 400 : 100
const file = `${prop ? 'props' : 'buildings'}/${o.id}.webp`
const types = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' }
const type = types[extname(src).toLowerCase()]
if (!type) throw new Error(`a .png, .jpg or .webp image, not ${src}`)
const dataUrl = `data:${type};base64,${readFileSync(src).toString('base64')}`

const browser = await chromium.launch({ channel: 'chromium' })
let out
try {
  const page = await browser.newPage()
  await page.addScriptTag({ content: `window.cutBackground = ${cutBackground}` })
  out = await page.evaluate(
    async ({ dataUrl, tol, target, widthM, body, minLuma }) => {
      const img = new Image()
      img.src = dataUrl
      await img.decode()
      const W = img.naturalWidth
      const H = img.naturalHeight
      const c = document.createElement('canvas')
      c.width = W
      c.height = H
      const g = c.getContext('2d', { willReadFrequently: true })
      g.drawImage(img, 0, 0)
      const data = g.getImageData(0, 0, W, H)
      const px = data.data

      const { bg, med } = window.cutBackground(px, W, H, tol)

      // the building's bounds
      let x0 = W, y0 = H, x1 = -1, y1 = -1
      for (let i = 0; i < W * H; i++) {
        if (bg[i]) {
          px[i * 4 + 3] = 0
          continue
        }
        const x = i % W
        const y = (i / W) | 0
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
      }
      if (x1 < 0) throw new Error('the whole image matched the background: try a lower --tolerance')
      // bleed the edge colors out under the cut-away background, so filtering the texture
      // never mixes the old white into the outline
      for (let pass = 0; pass < 4; pass++) {
        const grown = []
        for (let i = 0; i < W * H; i++) {
          if (!bg[i]) continue
          const x = i % W
          for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W]) {
            if (j >= 0 && j < W * H && bg[j] !== 1) {
              grown.push(i, j)
              break
            }
          }
        }
        for (let k = 0; k < grown.length; k += 2) {
          const [i, j] = [grown[k], grown[k + 1]]
          px[i * 4] = px[j * 4]
          px[i * 4 + 1] = px[j * 4 + 1]
          px[i * 4 + 2] = px[j * 4 + 2]
          bg[i] = 2 // colored now, still transparent
        }
      }
      g.putImageData(data, 0, 0)

      // the side wall's color: the commonest one near the facade's outer edges, where the wall
      // turns the corner (light enough not to be ink or glass; for a prop, only not ink, as a blue
      // vending machine is darker than any wall)
      const counts = new Map()
      const bw = x1 - x0 + 1
      const edges = []
      for (let x = x0 + Math.floor(bw * 0.02); x <= x0 + Math.floor(bw * 0.1); x++) edges.push(x, x1 - (x - x0))
      for (let y = y0; y <= y1; y += 2) {
        for (const x of edges) {
          const i = (y * W + x) * 4
          if (px[i + 3] === 0) continue
          const [r, gg, b] = [px[i], px[i + 1], px[i + 2]]
          if (0.299 * r + 0.587 * gg + 0.114 * b < minLuma) continue
          const key = ((r >> 3) << 10) | ((gg >> 3) << 5) | (b >> 3)
          counts.set(key, (counts.get(key) ?? 0) + 1)
        }
      }
      let best = 0, bestN = -1
      for (const [k, n] of counts) if (n > bestN) [best, bestN] = [k, n]
      const hex = (v) => (((v & 31) << 3) | 4).toString(16).padStart(2, '0')
      const side = `#${hex(best >> 10)}${hex(best >> 5)}${hex(best)}`

      // the painted roof's color: the median of the tiles a quarter to three quarters of a meter
      // above the eaves (taken when the 3D roof will stand over them)
      let roof = null
      if (body) {
        const ppm = (x1 - x0 + 1) / widthM
        const rs = [[], [], []]
        for (let y = Math.round(y1 - (body + 0.75) * ppm); y <= Math.round(y1 - (body + 0.25) * ppm); y++) {
          for (let x = x0; x <= x1; x++) {
            const i = y * W + x
            if (y < y0 || bg[i]) continue
            for (let ch = 0; ch < 3; ch++) rs[ch].push(px[i * 4 + ch])
          }
        }
        if (rs[0].length) roof = `#${rs.map((v) => v.sort((a, b) => a - b)[v.length >> 1].toString(16).padStart(2, '0')).join('')}`
      }

      // trimmed, at the target width
      const tw = target
      const th = Math.round(((y1 - y0 + 1) / (x1 - x0 + 1)) * tw)
      const o = document.createElement('canvas')
      o.width = tw
      o.height = th
      const og = o.getContext('2d')
      og.imageSmoothingQuality = 'high'
      og.drawImage(c, x0, y0, x1 - x0 + 1, y1 - y0 + 1, 0, 0, tw, th)
      return { webp: o.toDataURL('image/webp', 0.88), tw, th, side, roof, bg: med }
    },
    {
      dataUrl,
      tol: Number(o.tolerance),
      target: Math.round(width * PX_PER_M),
      widthM: width,
      body: !prop && o['roof-shape'] === 'pitched' && o.body ? Number(o.body) : null,
      minLuma: prop ? 60 : 110,
    },
  )
} finally {
  await browser.close()
}

if (!out.webp.startsWith('data:image/webp')) throw new Error('this Chromium cannot write WebP')
writeFileSync(`public/art/${file}`, Buffer.from(out.webp.split(',')[1], 'base64'))
const round = (x) => Math.round(x * 10) / 10
// a prop to the centimeter: at a meter tall, a tenth would stretch it by a twentieth
const height = prop ? Math.round((out.th / out.tw) * width * 100) / 100 : round((out.th / out.tw) * width)
const depth = o.depth ? Number(o.depth) : undefined
const building = () => ({
  id: o.id,
  front: file,
  width,
  height,
  bodyHeight: o.body ? Number(o.body) : { flat: height, gable: round(height * 0.75), pitched: round(height * 0.8) }[o['roof-shape']],
  depth: depth ?? 8,
  side: o.side ?? out.side,
  roof: o.roof ?? out.roof ?? '#6e7a78',
  roofShape: o['roof-shape'],
  ...(awning && { awning }),
})
const propEntry = () => ({
  id: o.id,
  image: file,
  width,
  height,
  mode: prop,
  ...(o.glow && { glow: true }),
  ...(depth && { depth }),
  ...(o.base && { base: Number(o.base) }),
  ...((prop === 'box' || prop === 'wall') && { color: o.color ?? out.side }),
})
const entry = prop ? propEntry() : building()
const manifest = readManifest()
const list = manifest[prop ? 'props' : 'buildings']
const at = list.findIndex((b) => b.id === o.id)
if (at >= 0) list[at] = entry
else list.push(entry)
writeManifest(manifest)
const kb = Math.round(Buffer.from(out.webp.split(',')[1], 'base64').length / 1024)
console.log(`public/art/${file}: ${out.tw}x${out.th} px, ${kb} KB (background ${out.bg.join(',')} cut away)`)
console.log(`${at >= 0 ? 'updated' : 'added'} in the manifest:`, entry)
console.log(`see it in the town: npm run dev, then http://localhost:5173/?${prop ? 'prop' : 'facade'}=${o.id}`)
