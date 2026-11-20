// Brings a parked vehicle, or a pile of bin bags or boxes in the road, from an image model into the
// town (ART.md, Vehicles). The image is a reference sheet: four orthographic views of one vehicle
// (or obstacle) at one scale, in a two by two grid on a
// plain background (top left its left side, nose left; top right its front; bottom left seen from
// above, nose left; bottom right its rear). This cuts the background away, splits the views at
// the empty bands between them, measures each view's outline in meters and packs the four into
// one texture, then adds or updates its entry in the manifest's vehicles (or obstacles) with those
// outlines. The game shapes it from where the outlines overlap and paints each surface from the
// view it faces (src/world/paintedVehicle.ts).
//
// Usage: npm run art:vehicle -- <sheet> --id <id> --kind kei-car|kei-truck|van|scooter|bicycle|bags|boxes
//          --length <m> [--width <m>] [--tolerance <0-255>]
//  --kind    a vehicle's, or an obstacle's (bags, boxes). A scooter or a bicycle is open: what's
//            behind shows through its frame and its spokes, so its views keep their background
//            cut away, their own outlines, and every mirror and handlebar end. An obstacle's sheet shows its long front
//            where a vehicle's shows its left side, and its ends where a vehicle's shows its front
//            and rear: the game turns it a quarter turn, so that front faces oncoming riders
//  --length  nose to tail in meters (an obstacle's front, end to end): sets the scale of all four views
//  --width   the body's width without its mirrors, or an obstacle's front to back (default: as the
//            top view has it). The model
//            draws the front, rear and top a little wider or narrower than each other, so each is
//            stretched across to this
// Needs Playwright's Chromium (`npx playwright-core install chromium`), which does the image work.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { extname } from 'node:path'
import { parseArgs } from 'node:util'
import { chromium } from 'playwright-core'
import { cutBackground } from './cut-background.mjs'
import { readManifest, writeManifest } from './manifest.mjs'

const { values: o, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    id: { type: 'string' },
    kind: { type: 'string' },
    length: { type: 'string' },
    width: { type: 'string' },
    tolerance: { type: 'string', default: '28' },
  },
})
const [src] = positionals
const length = Number(o.length)
const LIST = { 'kei-car': 'vehicles', 'kei-truck': 'vehicles', van: 'vehicles', scooter: 'vehicles', bicycle: 'vehicles', bags: 'obstacles', boxes: 'obstacles' }
const open = o.kind === 'scooter' || o.kind === 'bicycle'
if (!src || !o.id || !/^[a-z0-9-]+$/.test(o.id) || !(length > 0) || !LIST[o.kind]) {
  throw new Error(`usage: npm run art:vehicle -- <sheet> --id <lowercase-id> --kind ${Object.keys(LIST).join('|')} --length <meters>`)
}
const types = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' }
const type = types[extname(src).toLowerCase()]
if (!type) throw new Error(`a .png, .jpg or .webp image, not ${src}`)
const list = LIST[o.kind]
const file = `${list}/${o.id}.webp`

const browser = await chromium.launch({ channel: 'chromium' })
let out
try {
  const page = await browser.newPage()
  await page.addScriptTag({ content: `window.cutBackground = ${cutBackground}` })
  out = await page.evaluate(
    async ({ dataUrl, tol, length, width, see }) => {
      const N = 96 // samples along the length
      const M = 64 // samples up the height
      const INK = [43, 54, 52] // #2b3634, what fills the views around their outlines
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
      const solid = (x, y) => !bg[y * W + x]
      if (see) {
        // an open vehicle's background shows between its spokes and through its basket in
        // pockets too small, or too shaded, for the cut to reach: nothing on it is the
        // background's color, so all of that goes. What's left at its edges, ink or paint blended
        // into the background, is inked, so no pink fringe lines a spoke
        const off = (i) => Math.abs(px[i * 4] - med[0]) + Math.abs(px[i * 4 + 1] - med[1]) + Math.abs(px[i * 4 + 2] - med[2])
        for (let i = 0; i < W * H; i++) if (off(i) <= tol * 3) bg[i] = 1
        for (let i = 0; i < W * H; i++) {
          if (bg[i] || off(i) >= 160) continue
          const x = i % W
          const y = (i / W) | 0
          let edge = false
          for (let dy = -2; dy <= 2 && !edge; dy++) for (let dx = -2; dx <= 2 && !edge; dx++) edge = x + dx >= 0 && x + dx < W && y + dy >= 0 && y + dy < H && bg[i + dy * W + dx] === 1
          if (edge) [px[i * 4], px[i * 4 + 1], px[i * 4 + 2]] = INK
        }
      }

      // the empty bands between the views: the longest run of empty columns (and rows) that
      // touches neither edge of the sheet
      const gap = (n, filled) => {
        let best = null
        let run = null
        for (let i = 0; i < n; i++) {
          if (!filled(i)) {
            run = run ?? [i, i]
            run[1] = i
          } else {
            if (run && run[0] > 0 && (!best || run[1] - run[0] > best[1] - best[0])) best = run
            run = null
          }
        }
        if (!best) throw new Error('no empty band splits the views: are they apart on the sheet?')
        return Math.round((best[0] + best[1]) / 2)
      }
      const colCount = (x, ya, yb) => {
        let k = 0
        for (let y = ya; y < yb; y++) k += solid(x, y) ? 1 : 0
        return k
      }
      const rowCount = (y, xa, xb) => {
        let k = 0
        for (let x = xa; x < xb; x++) k += solid(x, y) ? 1 : 0
        return k
      }
      const gx = gap(W, (x) => colCount(x, 0, H) >= 2)
      const gy = gap(H, (y) => rowCount(y, 0, W) >= 2)

      // each view's bounds within its quarter, ignoring stray pixels
      const bounds = (xa, xb, ya, yb) => {
        let x0 = xb, x1 = xa - 1, y0 = yb, y1 = ya - 1
        for (let x = xa; x < xb; x++) if (colCount(x, ya, yb) >= 2) [x0, x1] = [Math.min(x0, x), Math.max(x1, x)]
        for (let y = ya; y < yb; y++) if (rowCount(y, xa, xb) >= 2) [y0, y1] = [Math.min(y0, y), Math.max(y1, y)]
        if (x1 < x0) throw new Error('a quarter of the sheet is empty')
        return { x0, x1, y0, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 }
      }
      const side = bounds(0, gx, 0, gy)
      const front = bounds(gx, W, 0, gy)
      const top = bounds(0, gx, gy, H)
      const rear = bounds(gx, W, gy, H)
      const ppm = side.w / length // pixels per meter, the same in every view
      const r3 = (v) => Math.round(v * 1000) / 1000

      // a morphological opening over k samples: drops anything narrower, like door mirrors or an aerial.
      // Not on an open vehicle, whose handlebar and mirrors are where it's narrow
      const open = (a, k) => {
        if (see) return a
        const h = k >> 1
        const ero = a.map((_, i) => Math.min(...a.slice(Math.max(0, i - h), i + h + 1)))
        return ero.map((_, i) => Math.max(...ero.slice(Math.max(0, i - h), i + h + 1)))
      }

      // side: for each slice along the length, the lowest and highest solid point, in meters
      const sideLo = []
      const sideHi = []
      for (let i = 0; i < N; i++) {
        const xa = side.x0 + Math.floor((i * side.w) / N)
        const xb = side.x0 + Math.floor(((i + 1) * side.w) / N)
        let lo = Infinity, hi = -Infinity
        for (let x = xa; x < Math.max(xb, xa + 1); x++) {
          for (let y = side.y0; y <= side.y1; y++) {
            if (!solid(x, y)) continue
            const m = (side.y1 + 1 - y) / ppm
            lo = Math.min(lo, m - 1 / ppm)
            hi = Math.max(hi, m)
          }
        }
        sideLo.push(lo === Infinity ? 0 : Math.max(0, lo))
        sideHi.push(hi === -Infinity ? 0 : hi)
      }
      const hiOpen = open(sideHi, 7)

      // front, rear and top: for each slice, its left and right edges in meters across the
      // vehicle, +x to its right: on the front's left, the rear's right and the top's top edge.
      // Kept apart, not as a half width, so a lopsided pile of bin bags keeps its shape.
      const edges = (v, n, across) => {
        const out = []
        for (let j = 0; j < n; j++) {
          let lo = Infinity, hi = -Infinity
          for (const [x, y] of across(v, j, n)) {
            if (!solid(x, y)) continue
            const m = v.toX(x, y)
            lo = Math.min(lo, m)
            hi = Math.max(hi, m)
          }
          out.push(lo === Infinity ? [0, 0] : [lo, hi])
        }
        return out
      }
      // slice j up a view's height, from the ground, every pixel in it
      function* row(v, j, n) {
        const ya = v.y1 - Math.floor(((j + 1) * v.h) / n) + 1
        const yb = v.y1 - Math.floor((j * v.h) / n)
        for (let y = ya; y <= Math.max(ya, yb); y++) for (let x = v.x0; x <= v.x1; x++) yield [x, y]
      }
      // slice i along a view's length, nose first
      function* col(v, i, n) {
        const xa = v.x0 + Math.floor((i * v.w) / n)
        const xb = v.x0 + Math.floor(((i + 1) * v.w) / n)
        for (let x = xa; x < Math.max(xb, xa + 1); x++) for (let y = v.y0; y <= v.y1; y++) yield [x, y]
      }
      const mid = (v) => [(v.x0 + v.x1 + 1) / 2, (v.y0 + v.y1 + 1) / 2]
      front.toX = (x) => (mid(front)[0] - x - 0.5) / ppm
      rear.toX = (x) => (x + 0.5 - mid(rear)[0]) / ppm
      top.toX = (x, y) => (mid(top)[1] - y - 0.5) / ppm
      const fe = edges(front, M, row)
      const re = edges(rear, M, row)
      const te = edges(top, N, col)
      // the mirrors opened away from each side of the top
      const tLo = open(te.map((e) => -e[0]), 9).map((v) => -v)
      const tHi = open(te.map((e) => e[1]), 9)
      // the model draws the front, rear and top a little wider or narrower than each other: each
      // is stretched across to the body's width, measured without its door mirrors (a van's stand
      // 40 cm tall, so the front's and rear's opening spans 17 of 64 slices)
      const across = (lo, hi) => Math.max(...hi) - Math.min(...lo)
      const body = width ?? across(tLo, tHi)
      const kt = body / across(tLo, tHi)
      // an open vehicle's views are only stretched to a --width given: no part of it is the body's
      const unstretched = see && !width
      const kf = unstretched ? 1 : body / across(open(fe.map((e) => -e[0]), 17).map((v) => -v), open(fe.map((e) => e[1]), 17))
      const kr = unstretched ? 1 : body / across(open(re.map((e) => -e[0]), 17).map((v) => -v), open(re.map((e) => e[1]), 17))
      const frontEdges = fe.map((e, j) => [Math.min(e[0] * kf, re[j][0] * kr), Math.max(e[1] * kf, re[j][1] * kr)])
      const topEdges = tLo.map((lo, i) => [lo * kt, tHi[i] * kt])

      // the texture: side and top down the left, front and rear on the right, ink around and
      // between them, so a surface at an outline's edge reads as inked
      const PAD = 6
      const AW = Math.max(side.w, top.w) + front.w + rear.w + 4 * PAD
      const AH = Math.max(side.h + top.h, front.h, rear.h) + 3 * PAD
      const a = document.createElement('canvas')
      a.width = AW
      a.height = AH
      const ag = a.getContext('2d')
      // each view's outer ink outline, and the pixels half background around it, painted over in
      // the color just inside. Where the body curves away near a corner, a view lands on it at a
      // grazing angle and its outline would stretch into a stripe across a door or a fender; the
      // game's ink pass draws the shape's own silhouette. A dark bumper or tire reaching the edge
      // has no light color inside it, so it keeps its edge.
      const EDGE = 6 // pixels in from the background
      const near = (i) => {
        const x = i % W
        return [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W].filter((j) => j >= 0 && j < W * H)
      }
      const depth = new Uint8Array(W * H).fill(255)
      let ring = []
      for (let i = 0; i < W * H; i++) if (bg[i]) (depth[i] = 0), ring.push(i)
      for (let d = 1; d <= EDGE; d++) {
        const next = []
        for (const i of ring) for (const j of near(i)) if (depth[j] === 255) (depth[j] = d), next.push(j)
        ring = next
      }
      const luma = (i) => 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2]
      const toBg = (i) => Math.abs(px[i * 4] - med[0]) + Math.abs(px[i * 4 + 1] - med[1]) + Math.abs(px[i * 4 + 2] - med[2])
      // ink is dark and grey: a red tail lamp is as dark, but no ink, and the outline beside it
      // takes its red. Ink takes a color from inside that isn't ink; a half-background pixel takes
      // any color inside, a tire's too
      const ink = (i) => luma(i) < 100 && Math.max(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]) - Math.min(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]) < 50
      const fixed = new Uint8Array(W * H)
      // an open vehicle keeps its outlines: its flat sides never turn a corner, and its cut-away
      // background leaves the outline at the silhouette's edge
      for (let d = see ? 0 : EDGE; d >= 1; d--) {
        for (let i = 0; i < W * H; i++) {
          const halo = toBg(i) < 160
          if (depth[i] !== d || (!halo && !ink(i))) continue
          const from = near(i).find((j) => depth[j] > d && (fixed[j] || (toBg(j) >= 160 && (halo || !ink(j)))))
          if (from === undefined) continue
          for (let ch = 0; ch < 3; ch++) px[i * 4 + ch] = px[from * 4 + ch]
          fixed[i] = 1
        }
      }
      // the colors bled four pixels out over the background, so the texture's filtering at an
      // outline never pulls in the ink beyond; every other cut-away pixel in ink, so the views read
      // solid where the shape is wider than a view
      const color = new Uint8Array(W * H)
      for (let i = 0; i < W * H; i++) color[i] = bg[i] ? 0 : 1
      for (let pass = 0; pass < 4; pass++) {
        const grown = []
        for (let i = 0; i < W * H; i++) {
          if (color[i]) continue
          const from = near(i).find((j) => color[j])
          if (from !== undefined) grown.push(i, from)
        }
        for (let k = 0; k < grown.length; k += 2) {
          for (let ch = 0; ch < 3; ch++) px[grown[k] * 4 + ch] = px[grown[k + 1] * 4 + ch]
          color[grown[k]] = 1
        }
      }
      for (let i = 0; i < W * H; i++) {
        // an open vehicle's background stays see-through, its colors bled under it
        px[i * 4 + 3] = see && bg[i] ? 0 : 255
        if (color[i] || see) continue
        px[i * 4] = INK[0]
        px[i * 4 + 1] = INK[1]
        px[i * 4 + 2] = INK[2]
      }
      g.putImageData(data, 0, 0)
      ag.fillStyle = `rgb(${INK.join(',')})`
      // an open vehicle's texture is see-through around its views too, but for the underside's ink
      if (see) ag.fillRect(0, 0, PAD, PAD)
      else ag.fillRect(0, 0, AW, AH)
      const place = (v, x, y, kw = 1, kh = 1) => {
        ag.drawImage(c, v.x0, v.y0, v.w, v.h, x, y, v.w, v.h)
        // as UVs, v up from the bottom; its size in meters, stretched by kw and kh
        return { rect: [x / AW, 1 - (y + v.h) / AH, (x + v.w) / AW, 1 - y / AH].map((n) => Math.round(n * 1e5) / 1e5), w: r3((v.w / ppm) * kw), h: r3((v.h / ppm) * kh) }
      }
      const views = {
        side: place(side, PAD, PAD),
        top: place(top, PAD, 2 * PAD + side.h, 1, kt),
        front: place(front, 2 * PAD + Math.max(side.w, top.w), PAD, kf),
        rear: place(rear, 3 * PAD + Math.max(side.w, top.w) + front.w, PAD, kr),
      }
      return {
        webp: a.toDataURL('image/webp', 0.9),
        size: [AW, AH],
        ppm,
        stretch: [kf, kr, kt],
        bg: med,
        views,
        dark: [Math.round((PAD / 2 / AW) * 1e5) / 1e5, Math.round((1 - PAD / 2 / AH) * 1e5) / 1e5],
        profile: {
          side: sideLo.map((lo, i) => [r3(lo), r3(Math.max(lo, hiOpen[i]))]),
          front: frontEdges.map((e) => e.map(r3)),
          top: topEdges.map((e) => e.map(r3)),
        },
        dims: { width: r3(body), height: r3(Math.max(...hiOpen)) },
      }
    },
    { dataUrl: `data:${type};base64,${readFileSync(src).toString('base64')}`, tol: Number(o.tolerance), length, width: o.width ? Number(o.width) : null, see: open },
  )
} finally {
  await browser.close()
}

if (!out.webp.startsWith('data:image/webp')) throw new Error('this Chromium cannot write WebP')
mkdirSync(`public/art/${list}`, { recursive: true })
const bytes = Buffer.from(out.webp.split(',')[1], 'base64')
writeFileSync(`public/art/${file}`, bytes)
const entry = {
  id: o.id,
  kind: o.kind,
  atlas: file,
  length,
  width: out.dims.width,
  height: out.dims.height,
  views: out.views,
  dark: out.dark,
  profile: out.profile,
}
const manifest = readManifest()
manifest[list] ??= []
const at = manifest[list].findIndex((v) => v.id === o.id)
if (at >= 0) manifest[list][at] = entry
else manifest[list].push(entry)
writeManifest(manifest)
console.log(`public/art/${file}: ${out.size.join('x')} px, ${Math.round(bytes.length / 1024)} KB, ${out.ppm.toFixed(0)} px a meter (background ${out.bg.join(',')} cut away)`)
console.log(`front, rear and top stretched across by ${out.stretch.map((k) => k.toFixed(2)).join(', ')} to ${o.width ? 'its width' : "the top view's width"}`)
console.log(`${at >= 0 ? 'updated' : 'added'} in the manifest's ${list}: ${o.id}, ${o.kind}, ${length} x ${entry.width} x ${entry.height} m`)
for (const [k, v] of Object.entries(out.views)) console.log(`  ${k}: ${v.w} x ${v.h} m`)
