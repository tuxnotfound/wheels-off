// Brings a facade from an image model into the town (ART.md, Generating with an image model).
// The image is a front elevation on a plain background. This cuts the background away (a flood
// fill from the borders, so a white wall inside the ink outline stays), trims to the building,
// scales it to 100 px per meter (the placeholders' density, so the GPU holds no more than it did)
// and saves it as WebP with alpha, then adds or updates its entry in the manifest.
// The facade's real width says how big it is; its height follows from the image.
//
// Usage: npm run art:import -- <image> --id <id> --width <m> [--body <m>] [--depth <m>]
//          [--roof-shape flat|gable] [--roof <#hex>] [--side <#hex>] [--tolerance <0-255>]
//  --body   where the wall stops, under a roof, a tank or a sign above it (default: the full
//           height on a flat roof, three quarters of it under a gable)
//  --side   the side wall's color, seen at corners (default: the commonest color at its edges)
// Needs Playwright's Chromium (`npx playwright-core install chromium`), which does the image work.
import { readFileSync, writeFileSync } from 'node:fs'
import { extname } from 'node:path'
import { parseArgs } from 'node:util'
import { chromium } from 'playwright-core'

const { values: o, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    id: { type: 'string' },
    width: { type: 'string' },
    body: { type: 'string' },
    depth: { type: 'string', default: '8' },
    'roof-shape': { type: 'string', default: 'flat' },
    roof: { type: 'string', default: '#6e7a78' },
    side: { type: 'string' },
    tolerance: { type: 'string', default: '28' },
  },
})
const [src] = positionals
const width = Number(o.width)
if (!src || !o.id || !/^[a-z0-9-]+$/.test(o.id) || !(width > 0)) {
  throw new Error('usage: npm run art:import -- <image> --id <lowercase-id> --width <meters> [options]')
}
if (!['flat', 'gable'].includes(o['roof-shape'])) throw new Error('--roof-shape is flat or gable')
const PX_PER_M = 100
const MANIFEST = 'public/art/manifest.json'
const file = `buildings/${o.id}.webp`
const types = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' }
const type = types[extname(src).toLowerCase()]
if (!type) throw new Error(`a .png, .jpg or .webp image, not ${src}`)
const dataUrl = `data:${type};base64,${readFileSync(src).toString('base64')}`

const browser = await chromium.launch({ channel: 'chromium' })
let out
try {
  const page = await browser.newPage()
  out = await page.evaluate(
    async ({ dataUrl, tol, target }) => {
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

      // the background: the median of the border's colors, channel by channel
      const border = []
      for (let x = 0; x < W; x++) border.push(x, x + (H - 1) * W)
      for (let y = 0; y < H; y++) border.push(y * W, W - 1 + y * W)
      const med = [0, 1, 2].map((ch) => {
        const v = border.map((i) => px[i * 4 + ch]).sort((a, b) => a - b)
        return v[v.length >> 1]
      })
      const near = (i) => Math.abs(px[i * 4] - med[0]) + Math.abs(px[i * 4 + 1] - med[1]) + Math.abs(px[i * 4 + 2] - med[2]) <= tol * 3

      // flood fill from the borders: background is what the fill reaches
      const bg = new Uint8Array(W * H)
      const stack = border.filter(near)
      for (const i of stack) bg[i] = 1
      while (stack.length) {
        const i = stack.pop()
        const x = i % W
        for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W]) {
          if (j >= 0 && j < W * H && !bg[j] && near(j)) {
            bg[j] = 1
            stack.push(j)
          }
        }
      }
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
      // turns the corner (light enough not to be ink or glass)
      const counts = new Map()
      const bw = x1 - x0 + 1
      const edges = []
      for (let x = x0 + Math.floor(bw * 0.02); x <= x0 + Math.floor(bw * 0.1); x++) edges.push(x, x1 - (x - x0))
      for (let y = y0; y <= y1; y += 2) {
        for (const x of edges) {
          const i = (y * W + x) * 4
          if (px[i + 3] === 0) continue
          const [r, gg, b] = [px[i], px[i + 1], px[i + 2]]
          if (0.299 * r + 0.587 * gg + 0.114 * b < 110) continue
          const key = ((r >> 3) << 10) | ((gg >> 3) << 5) | (b >> 3)
          counts.set(key, (counts.get(key) ?? 0) + 1)
        }
      }
      let best = 0, bestN = -1
      for (const [k, n] of counts) if (n > bestN) [best, bestN] = [k, n]
      const hex = (v) => (((v & 31) << 3) | 4).toString(16).padStart(2, '0')
      const side = `#${hex(best >> 10)}${hex(best >> 5)}${hex(best)}`

      // trimmed, at the target width
      const tw = target
      const th = Math.round(((y1 - y0 + 1) / (x1 - x0 + 1)) * tw)
      const o = document.createElement('canvas')
      o.width = tw
      o.height = th
      const og = o.getContext('2d')
      og.imageSmoothingQuality = 'high'
      og.drawImage(c, x0, y0, x1 - x0 + 1, y1 - y0 + 1, 0, 0, tw, th)
      return { webp: o.toDataURL('image/webp', 0.88), tw, th, side, bg: med }
    },
    { dataUrl, tol: Number(o.tolerance), target: Math.round(width * PX_PER_M) },
  )
} finally {
  await browser.close()
}

if (!out.webp.startsWith('data:image/webp')) throw new Error('this Chromium cannot write WebP')
writeFileSync(`public/art/${file}`, Buffer.from(out.webp.split(',')[1], 'base64'))
const round = (x) => Math.round(x * 10) / 10
const height = round((out.th / out.tw) * width)
const entry = {
  id: o.id,
  front: file,
  width,
  height,
  bodyHeight: o.body ? Number(o.body) : o['roof-shape'] === 'gable' ? round(height * 0.75) : height,
  depth: Number(o.depth),
  side: o.side ?? out.side,
  roof: o.roof,
  roofShape: o['roof-shape'],
}
const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'))
const at = manifest.buildings.findIndex((b) => b.id === o.id)
if (at >= 0) manifest.buildings[at] = entry
else manifest.buildings.push(entry)
writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`)
const kb = Math.round(Buffer.from(out.webp.split(',')[1], 'base64').length / 1024)
console.log(`public/art/${file}: ${out.tw}x${out.th} px, ${kb} KB (background ${out.bg.join(',')} cut away)`)
console.log(`${at >= 0 ? 'updated' : 'added'} in the manifest:`, entry)
console.log(`see it in the town: npm run dev, then http://localhost:5173/?facade=${o.id}`)
