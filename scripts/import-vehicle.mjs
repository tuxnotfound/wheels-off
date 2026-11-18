// Brings a parked vehicle from an image model into the town (ART.md, Vehicles). The image is a
// reference sheet: four orthographic views of one vehicle at one scale, in a two by two grid on a
// plain background (top left its left side, nose left; top right its front; bottom left seen from
// above, nose left; bottom right its rear). This cuts the background away, splits the views at
// the empty bands between them, measures each view's outline in meters and packs the four into
// one texture, then adds or updates the vehicle's manifest entry with those outlines. The game
// shapes the vehicle from where the outlines overlap and paints each surface from the view it
// faces (src/world/paintedVehicle.ts).
//
// Usage: npm run art:vehicle -- <sheet> --id <id> --kind kei-car|kei-truck|van --length <m>
//          [--tolerance <0-255>]
//  --length  nose to tail in meters: sets the scale of all four views
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
    tolerance: { type: 'string', default: '28' },
  },
})
const [src] = positionals
const length = Number(o.length)
if (!src || !o.id || !/^[a-z0-9-]+$/.test(o.id) || !(length > 0) || !['kei-car', 'kei-truck', 'van'].includes(o.kind)) {
  throw new Error('usage: npm run art:vehicle -- <sheet> --id <lowercase-id> --kind kei-car|kei-truck|van --length <meters>')
}
const types = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' }
const type = types[extname(src).toLowerCase()]
if (!type) throw new Error(`a .png, .jpg or .webp image, not ${src}`)
const file = `vehicles/${o.id}.webp`

const browser = await chromium.launch({ channel: 'chromium' })
let out
try {
  const page = await browser.newPage()
  await page.addScriptTag({ content: `window.cutBackground = ${cutBackground}` })
  out = await page.evaluate(
    async ({ dataUrl, tol, length }) => {
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

      // a morphological opening over k samples: drops anything narrower, like door mirrors or an aerial
      const open = (a, k) => {
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

      // front and rear: for each slice up the height, the half width from the view's middle
      const halfWidths = (v) => {
        const cx = (v.x0 + v.x1 + 1) / 2
        const out = []
        for (let j = 0; j < M; j++) {
          // slice j spans j/M to (j+1)/M of the view's height, from the ground up
          const ya = v.y1 - Math.floor(((j + 1) * v.h) / M) + 1
          const yb = v.y1 - Math.floor((j * v.h) / M)
          let hw = 0
          for (let y = ya; y <= Math.max(ya, yb); y++) for (let x = v.x0; x <= v.x1; x++) if (solid(x, y)) hw = Math.max(hw, Math.abs(x + 0.5 - cx) / ppm)
          out.push(hw)
        }
        return out
      }
      const fw = halfWidths(front)
      const rw = halfWidths(rear)

      // top: for each slice along the length, the half width, with the door mirrors opened away
      const cy = (top.y0 + top.y1 + 1) / 2
      const topHw = []
      for (let i = 0; i < N; i++) {
        const xa = top.x0 + Math.floor((i * top.w) / N)
        const xb = top.x0 + Math.floor(((i + 1) * top.w) / N)
        let hw = 0
        for (let x = xa; x < Math.max(xb, xa + 1); x++) for (let y = top.y0; y <= top.y1; y++) if (solid(x, y)) hw = Math.max(hw, Math.abs(y + 0.5 - cy) / ppm)
        topHw.push(hw)
      }
      const topOpen = open(topHw, 9)
      // the model draws the front and rear a little wider or narrower than the top: each is
      // stretched across to the top's width, measured without its door mirrors
      const half = Math.max(...topOpen)
      const kf = half / Math.max(...open(fw, 9))
      const kr = half / Math.max(...open(rw, 9))
      const frontHw = fw.map((v, j) => Math.max(v * kf, rw[j] * kr))

      // the texture: side and top down the left, front and rear on the right, ink around and
      // between them, so a surface at an outline's edge reads as inked
      const PAD = 6
      const AW = Math.max(side.w, top.w) + front.w + rear.w + 4 * PAD
      const AH = Math.max(side.h + top.h, front.h, rear.h) + 3 * PAD
      const a = document.createElement('canvas')
      a.width = AW
      a.height = AH
      const ag = a.getContext('2d')
      // every cut-away pixel in ink, so the views read solid where the shape is wider than a view
      for (let i = 0; i < W * H; i++) {
        if (!bg[i]) continue
        px[i * 4] = INK[0]
        px[i * 4 + 1] = INK[1]
        px[i * 4 + 2] = INK[2]
        px[i * 4 + 3] = 255
      }
      g.putImageData(data, 0, 0)
      ag.fillStyle = `rgb(${INK.join(',')})`
      ag.fillRect(0, 0, AW, AH)
      const place = (v, x, y, kw = 1) => {
        ag.drawImage(c, v.x0, v.y0, v.w, v.h, x, y, v.w, v.h)
        // as UVs, v up from the bottom; its size in meters, kw across
        return { rect: [x / AW, 1 - (y + v.h) / AH, (x + v.w) / AW, 1 - y / AH].map((n) => Math.round(n * 1e5) / 1e5), w: r3((v.w / ppm) * kw), h: r3(v.h / ppm) }
      }
      const views = {
        side: place(side, PAD, PAD),
        top: place(top, PAD, 2 * PAD + side.h),
        front: place(front, 2 * PAD + Math.max(side.w, top.w), PAD, kf),
        rear: place(rear, 3 * PAD + Math.max(side.w, top.w) + front.w, PAD, kr),
      }
      return {
        webp: a.toDataURL('image/webp', 0.9),
        size: [AW, AH],
        ppm,
        stretch: [kf, kr],
        bg: med,
        views,
        dark: [Math.round((PAD / 2 / AW) * 1e5) / 1e5, Math.round((1 - PAD / 2 / AH) * 1e5) / 1e5],
        profile: {
          side: sideLo.map((lo, i) => [r3(lo), r3(Math.max(lo, hiOpen[i]))]),
          front: frontHw.map(r3),
          top: topOpen.map(r3),
        },
        dims: { width: r3(2 * Math.max(...topOpen)), height: r3(Math.max(...hiOpen)) },
      }
    },
    { dataUrl: `data:${type};base64,${readFileSync(src).toString('base64')}`, tol: Number(o.tolerance), length },
  )
} finally {
  await browser.close()
}

if (!out.webp.startsWith('data:image/webp')) throw new Error('this Chromium cannot write WebP')
mkdirSync('public/art/vehicles', { recursive: true })
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
manifest.vehicles ??= []
const at = manifest.vehicles.findIndex((v) => v.id === o.id)
if (at >= 0) manifest.vehicles[at] = entry
else manifest.vehicles.push(entry)
writeManifest(manifest)
console.log(`public/art/${file}: ${out.size.join('x')} px, ${Math.round(bytes.length / 1024)} KB, ${out.ppm.toFixed(0)} px a meter (background ${out.bg.join(',')} cut away)`)
console.log(`front and rear stretched across by ${out.stretch.map((k) => k.toFixed(2)).join(' and ')} to the top view's width`)
console.log(`${at >= 0 ? 'updated' : 'added'} in the manifest: ${o.id}, ${o.kind}, ${length} x ${entry.width} x ${entry.height} m`)
for (const [k, v] of Object.entries(out.views)) console.log(`  ${k}: ${v.w} x ${v.h} m`)
