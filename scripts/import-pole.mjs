// A utility pole for art:import --prop pole (ART.md, Utility poles): the image is a sheet of pieces
// standing in a row, the pole from the front (its crossarms across), the same pole from its side,
// and maybe a third, the transformer some poles carry. The game stands the two views as crossed
// planes and hangs the wires where this finds the insulators on the front view's crossarms.
import { readFileSync, writeFileSync } from 'node:fs'
import { extname } from 'node:path'
import { chromium } from 'playwright-core'
import { cutBackground } from './cut-background.mjs'

/** Cuts the sheet into its pieces and returns the manifest entry; writes props/<id>*.webp. */
export async function importPole({ src, id, height, tol, wires }) {
  const types = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' }
  const type = types[extname(src).toLowerCase()]
  if (!type) throw new Error(`a .png, .jpg or .webp image, not ${src}`)
  const browser = await chromium.launch({ channel: 'chromium' })
  let out
  try {
    const page = await browser.newPage()
    await page.addScriptTag({ content: `window.cutBackground = ${cutBackground}` })
    out = await page.evaluate(
      async ({ dataUrl, tol, height }) => {
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
        // the background see-through, its edge colors bled under it (as art:import does)
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
            for (let ch = 0; ch < 3; ch++) px[grown[k] * 4 + ch] = px[grown[k + 1] * 4 + ch]
            bg[grown[k]] = 2
          }
        }
        for (let i = 0; i < W * H; i++) if (bg[i]) px[i * 4 + 3] = 0
        g.putImageData(data, 0, 0)

        // the pieces: runs of columns with something in them, apart by more than a hundredth of the sheet
        const filled = []
        for (let x = 0; x < W; x++) {
          let k = 0
          for (let y = 0; y < H; y++) k += solid(x, y) ? 1 : 0
          filled.push(k >= 2)
        }
        const runs = []
        for (let x = 0; x < W; x++) {
          if (!filled[x]) continue
          const last = runs[runs.length - 1]
          if (last && x - last[1] <= W / 100) last[1] = x
          else runs.push([x, x])
        }
        const pieces = runs
          .map(([x0, x1]) => {
            let y0 = H, y1 = -1
            for (let y = 0; y < H; y++) for (let x = x0; x <= x1; x++) if (solid(x, y)) [y0, y1] = [Math.min(y0, y), Math.max(y1, y)]
            return { x0, x1, y0, y1 }
          })
          .filter((p) => p.y1 - p.y0 > H / 20) // not a stray speck
        if (pieces.length < 2) throw new Error(`found ${pieces.length} piece(s), not the front and the side: are they apart on the sheet?`)
        const ppm = (pieces[0].y1 - pieces[0].y0 + 1) / height

        // a row's solid runs, in pixels
        const segs = (p, y) => {
          const out = []
          for (let x = p.x0; x <= p.x1; x++) {
            if (!solid(x, y)) continue
            const last = out[out.length - 1]
            if (last && x - last[1] <= 1) last[1] = x
            else out.push([x, x])
          }
          return out
        }
        // a view's shaft: the middle of what's solid, its median over the lowest third, above the
        // foot; its width, the run through that middle halfway up, clear of the guard at its foot
        const m = (a) => a.sort((u, v) => u - v)[a.length >> 1]
        const shaft = (p) => {
          const mids = []
          for (let y = p.y1 - Math.round((p.y1 - p.y0) * 0.33); y < p.y1 - 4; y++) {
            const s = segs(p, y)
            if (s.length) mids.push((s[0][0] + s[s.length - 1][1] + 1) / 2)
          }
          const x = m(mids)
          const widths = []
          for (let y = p.y1 - Math.round((p.y1 - p.y0) * 0.6); y < p.y1 - Math.round((p.y1 - p.y0) * 0.4); y++) {
            const run = segs(p, y).find(([a, b]) => a <= x && x <= b + 1)
            if (run) widths.push(run[1] + 1 - run[0])
          }
          return { x, w: m(widths) }
        }
        // a piece cropped about x (its shaft) so the shaft is at the middle, as WebP
        const crop = (p, x) => {
          const half = Math.ceil(Math.max(x - p.x0, p.x1 + 1 - x))
          const o = document.createElement('canvas')
          o.width = 2 * half
          o.height = p.y1 - p.y0 + 1
          // only the piece's own columns, so a neighbor close by never creeps in at the wider side
          const pw = p.x1 - p.x0 + 1
          o.getContext('2d').drawImage(c, p.x0, p.y0, pw, o.height, p.x0 - (Math.round(x) - half), 0, pw, o.height)
          return { webp: o.toDataURL('image/webp', 0.9), w: o.width / ppm, h: o.height / ppm, px: [o.width, o.height] }
        }
        const r3 = (v) => Math.round(v * 1000) / 1000
        const [front, side, extra] = pieces
        const fs = shaft(front)
        const ss = shaft(side)

        // the wires' anchors on the front view. A crossarm is a band of rows with one run far
        // wider than the shaft (its bar); the insulators stand on it, short runs just above. Each
        // run there that ends within half a meter going up is an insulator (the shaft goes on up,
        // past a lower crossarm), its anchor a few centimeters under its top
        const bands = []
        for (let y = front.y0; y <= front.y1; y++) {
          const wide = segs(front, y).some(([a, b]) => b + 1 - a > 2.5 * fs.w)
          const last = bands[bands.length - 1]
          if (wide && last && y - last[1] <= 3) last[1] = y
          else if (wide) bands.push([y, y])
        }
        const arms = bands.filter(([a, b]) => b - a >= 3)
        const anchors = []
        for (const [a] of arms) {
          const y = a - Math.max(3, Math.round(0.06 * ppm))
          if (y < front.y0) continue
          for (const [x0, x1] of segs(front, y)) {
            const cx = Math.round((x0 + x1) / 2)
            let top = y
            while (top > front.y0 && solid(cx, top - 1)) top--
            if (y - top > 0.5 * ppm) continue // the shaft
            anchors.push([r3((cx + 0.5 - fs.x) / ppm), r3((front.y1 + 1 - top) / ppm - 0.05)])
          }
        }
        const lowest = arms.length ? (front.y1 + 1 - arms[arms.length - 1][1]) / ppm : height * 0.7
        const t = extra ? crop(extra, (extra.x0 + extra.x1 + 1) / 2) : null
        return {
          bg: med,
          ppm,
          shaft: r3(fs.w / ppm),
          front: crop(front, fs.x),
          side: crop(side, ss.x),
          transformer: t && { ...t, y: r3(lowest - 0.45 - t.h) },
          anchors,
          arms: arms.map(([a, b]) => [r3((front.y1 + 1 - b) / ppm), r3((front.y1 + 1 - a) / ppm)]),
        }
      },
      { dataUrl: `data:${type};base64,${readFileSync(src).toString('base64')}`, tol, height },
    )
  } finally {
    await browser.close()
  }
  const save = (name, v) => {
    if (!v.webp.startsWith('data:image/webp')) throw new Error('this Chromium cannot write WebP')
    const bytes = Buffer.from(v.webp.split(',')[1], 'base64')
    writeFileSync(`public/art/props/${name}.webp`, bytes)
    console.log(`public/art/props/${name}.webp: ${v.px.join('x')} px, ${Math.round(bytes.length / 1024)} KB, ${v.w.toFixed(2)} x ${v.h.toFixed(2)} m`)
    return `props/${name}.webp`
  }
  const r2 = (v) => Math.round(v * 100) / 100
  console.log(`${out.ppm.toFixed(0)} px a meter (background ${out.bg.join(',')} cut away); shaft ${out.shaft} m; crossarms at ${out.arms.map((a) => a.join('-')).join(', ')} m`)
  const entry = {
    id,
    image: save(id, out.front),
    width: r2(out.front.w),
    height: r2(out.front.h),
    mode: 'pole',
    side: { image: save(`${id}-side`, out.side), width: r2(out.side.w), height: r2(out.side.h) },
    shaft: out.shaft,
    wires: wires ?? out.anchors,
    ...(out.transformer && {
      transformer: { image: save(`${id}-transformer`, out.transformer), width: r2(out.transformer.w), height: r2(out.transformer.h), y: out.transformer.y },
    }),
  }
  if (!entry.wires.length) throw new Error('found no insulators on the crossarms: give the anchors with --wires x,y;x,y')
  return entry
}
