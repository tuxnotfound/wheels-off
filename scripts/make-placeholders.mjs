// Generates hand-drawn-style placeholder art (SVG) + public/art/manifest.json.
// Real painted art replaces these files one by one; see ART.md for the spec.
// Usage: node scripts/make-placeholders.mjs   (no dependencies)
import { mkdirSync, writeFileSync } from 'node:fs'

const OUT = new URL('../public/art/', import.meta.url)
const PX = 100 // pixels per meter in the placeholder images
const INK = '#2b3634'
const SHADE = 'rgba(52,72,110,0.28)' // painted shadow shapes

// ---------- seeded jitter so output is stable ----------
let seed = 1
const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
const j = (a) => (rnd() * 2 - 1) * a

// ---------- sketchy primitives ----------
function stroke(pts, w = 3) {
  // two slightly different passes: the doubled, uneven weight of a hand-inked line
  const pass = (jit, sw, op) => {
    const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${(x + j(jit)).toFixed(1)},${(y + j(jit)).toFixed(1)}`).join('')
    return `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" opacity="${op}"/>`
  }
  return pass(1.2, w, 0.95) + pass(1.8, w * 0.55, 0.6)
}
function seg(x1, y1, x2, y2, w) {
  const n = Math.max(2, Math.round(Math.hypot(x2 - x1, y2 - y1) / 60))
  return stroke(Array.from({ length: n + 1 }, (_, i) => [x1 + ((x2 - x1) * i) / n, y1 + ((y2 - y1) * i) / n]), w)
}
function poly(pts, fill, w = 3, ink = true) {
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${(x + j(0.8)).toFixed(1)},${(y + j(0.8)).toFixed(1)}`).join('') + 'Z'
  let s = `<path d="${d}" fill="${fill}"/>`
  if (ink) for (let i = 0; i < pts.length; i++) s += seg(...pts[i], ...pts[(i + 1) % pts.length], w)
  return s
}
const rect = (x, y, w, h, fill, lw = 3, ink = true) => poly([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], fill, lw, ink)
const shade = (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${SHADE}"/>`
const text = (x, y, s, size, fill, vertical = false) =>
  vertical
    ? [...s].map((ch, i) => `<text x="${x}" y="${y + i * size * 1.05}" font-size="${size}" fill="${fill}" text-anchor="middle" dominant-baseline="hanging" font-family="Hiragino Sans, Hiragino Kaku Gothic ProN, Noto Sans JP, sans-serif" font-weight="900">${ch}</text>`).join('')
    : `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" text-anchor="middle" dominant-baseline="middle" font-family="Hiragino Sans, Hiragino Kaku Gothic ProN, Noto Sans JP, sans-serif" font-weight="900">${s}</text>`

function svg(wm, hm, body) {
  const W = Math.round(wm * PX)
  const H = Math.round(hm * PX)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${body(W, H)}</svg>`
}

// ---------- facade pieces ----------
function window_(x, y, w, h, glass = '#44605d', frame = '#e4e6de') {
  let s = rect(x, y, w, h, frame, 3)
  s += rect(x + 6, y + 6, w - 12, h - 12, glass, 2)
  s += seg(x + w / 2, y + 6, x + w / 2, y + h - 6, 2.5)
  s += `<path d="M${x + 14},${y + h - 16} L${x + w / 2 - 10},${y + 14} L${x + w / 2 - 2},${y + 14} L${x + 22},${y + h - 16}Z" fill="rgba(210,235,230,0.45)"/>`
  return s
}
function acUnit(x, y) {
  return rect(x, y, 70, 48, '#eceee8', 2.5) + `<circle cx="${x + 26}" cy="${y + 24}" r="15" fill="none" stroke="${INK}" stroke-width="2"/>` + shade(x, y + 40, 70, 8)
}
function pipe(x, y1, y2) {
  return rect(x, y1, 10, y2 - y1, '#c9ccc4', 2)
}

// ---------- building facades (front elevations) ----------
const buildings = []
function building(id, wm, hm, bodyH, depth, side, roof, draw, roofShape = 'flat') {
  writeFileSync(new URL(`buildings/${id}.svg`, OUT), svg(wm, hm, draw))
  buildings.push({ id, front: `buildings/${id}.svg`, width: wm, height: hm, bodyHeight: bodyH, depth, side, roof, roofShape })
}

function apartment(id, floors, wall, balcony) {
  const wm = 9.6
  const fh = 3
  const bodyH = floors * fh
  const tank = floors >= 4
  const hm = bodyH + 0.5 + (tank ? 2.4 : 0)
  building(id, wm, hm, bodyH, 9, wall, '#6e7a78', (W, H) => {
    const top = H - bodyH * PX
    let s = ''
    if (tank) {
      s += rect(W * 0.62, top - 230, 150, 150, '#9cc79a', 3) + rect(W * 0.62 - 10, top - 240, 170, 22, '#7da87b', 3)
      s += rect(W * 0.64, top - 80, 12, 80, '#8e928c', 2) + rect(W * 0.62 + 128, top - 80, 12, 80, '#8e928c', 2)
    }
    s += rect(0, top - 50, W, 50, '#d9dbd3', 3) // parapet
    s += rect(0, top, W, H - top, wall, 4)
    for (let f = 0; f < floors; f++) {
      const y = top + f * fh * PX
      for (let b = 0; b < 3; b++) s += window_(40 + b * 310, y + 40, 200, 150)
      if (f < floors - 1) {
        // solid balcony parapet with the painted shadow under it
        s += rect(10, y + 205, W - 20, 90, balcony, 3) + shade(10, y + 295, W - 20, 22)
        s += seg(10, y + 230, W - 10, y + 230, 1.5)
      }
      if (f % 2 === 0) s += acUnit(W - 110, y + 150)
    }
    s += pipe(W - 30, top, H)
    s += rect(W * 0.4, H - 230, 150, 230, '#5b6f6c', 3) // entrance
    s += shade(0, top, 30, H - top)
    return s
  })
}

function house(id, wall, roof) {
  const wm = 7.2
  const bodyH = 6
  const roofH = 2.2
  building(id, wm, bodyH + roofH, bodyH, 8, wall, roof, (W, H) => {
    const top = H - bodyH * PX
    let s = poly([[-20, top + 10], [W / 2, top - roofH * PX + 10], [W + 20, top + 10]], roof, 4)
    for (let x = 40; x < W; x += 60) s += seg(x, top + 5, W / 2 + (x - W / 2) * 0.25, top - roofH * PX + 60, 1.2)
    s += rect(0, top, W, H - top, wall, 4) + shade(0, top, W, 26)
    for (let y = top + 40; y < H; y += 34) s += seg(6, y, W - 6, y, 1)
    s += window_(80, top + 70, 190, 150, '#566f6b') + window_(W - 280, top + 70, 190, 150, '#566f6b')
    s += window_(W - 300, top + 350, 220, 150, '#566f6b')
    s += rect(90, H - 250, 140, 250, '#8a6f5a', 3) + rect(60, H - 280, 200, 26, '#e9ece6', 3) + shade(60, H - 254, 200, 14)
    s += acUnit(W - 150, top + 250)
    return s
  }, 'gable')
}

function shop(id, wall, awning, sign, word) {
  const wm = 6.4
  const bodyH = 6.6
  building(id, wm, bodyH, bodyH, 8, wall, '#6e5f5a', (W, H) => {
    let s = rect(0, 0, W, H, wall, 4)
    s += window_(60, 60, 220, 160) + window_(W - 280, 60, 220, 160)
    s += rect(40, 300, W - 80, 110, sign, 3) + text(W / 2, 357, word, 72, sign === '#f3efe2' ? INK : '#fbf8ee')
    // striped awning
    const ay = 420
    s += poly([[10, ay], [W - 10, ay], [W + 10, ay + 70], [-10, ay + 70]], awning, 3)
    for (let x = 60; x < W; x += 100) s += `<path d="M${x},${ay} L${x + 30},${ay} L${x + 34},${ay + 70} L${x + 2},${ay + 70}Z" fill="#fbf8ee" opacity="0.85"/>`
    s += shade(0, ay + 70, W, 30)
    // glass shop front
    s += rect(30, ay + 100, W - 60, H - ay - 100, '#46605d', 3)
    s += seg(W / 2, ay + 100, W / 2, H, 3)
    s += `<path d="M60,${H - 20} L140,${ay + 120} L175,${ay + 120} L95,${H - 20}Z" fill="rgba(210,235,230,0.35)"/>`
    s += rect(W - 150, H - 90, 110, 70, '#e8b64a', 2)
    return s
  })
}

function konbini(id, stripe, word) {
  const wm = 9.6
  const bodyH = 4.6
  building(id, wm, bodyH, bodyH, 10, '#f1f1ea', '#9aa39f', (W, H) => {
    let s = rect(0, 0, W, H, '#f1f1ea', 4)
    s += rect(0, 40, W, 40, stripe, 2) + rect(0, 90, W, 20, '#e8b64a', 2)
    s += rect(W * 0.3, 130, W * 0.4, 70, '#fbf8ee', 3) + text(W / 2, 167, word, 52, stripe)
    s += shade(0, 210, W, 24)
    s += rect(30, 230, W - 60, H - 230, '#3f5856', 3)
    for (let x = 30 + 180; x < W - 30; x += 180) s += seg(x, 230, x, H, 3)
    for (let i = 0; i < 5; i++) s += rect(60 + i * 170, 300, 110, 50, ['#d9533f', '#4b7fbf', '#e8b64a', '#5aa6a0', '#f3efe2'][i], 2)
    return s
  })
}

function office(id, floors, wall) {
  const wm = 8
  const bodyH = floors * 3
  building(id, wm, bodyH + 0.4, bodyH, 10, wall, '#7a8a86', (W, H) => {
    const top = H - bodyH * PX
    let s = rect(0, top - 40, W, 40, '#cfd2c9', 3) + rect(0, top, W, H - top, wall, 4)
    for (let f = 0; f < floors; f++) {
      const y = top + f * 300 + 70
      s += rect(20, y, W - 40, 150, '#3f5a58', 3)
      for (let x = 20 + 190; x < W - 20; x += 190) s += seg(x, y, x, y + 150, 2.5)
      s += `<path d="M40,${y + 140} L90,${y + 10} L120,${y + 10} L70,${y + 140}Z" fill="rgba(210,235,230,0.3)"/>`
      s += shade(20, y + 150, W - 40, 16)
    }
    s += rect(W * 0.1, 30 + top, 70, H - top - 400, '#e58da0', 3) + text(W * 0.1 + 35, top + 60, 'ホテル', 52, '#fbf8ee', true)
    return s
  })
}

function oldWood(id) {
  const wm = 6.4
  const bodyH = 5.4
  building(id, wm, bodyH + 1.4, bodyH, 8, '#8a6f5a', '#4f5a5c', (W, H) => {
    const top = H - bodyH * PX
    let s = poly([[-30, top + 20], [30, top - 120], [W - 30, top - 120], [W + 30, top + 20]], '#4f5a5c', 4)
    for (let x = 0; x < W; x += 40) s += seg(x, top - 110, x - 10, top + 15, 1.2)
    s += rect(0, top, W, H - top, '#8a6f5a', 4)
    for (let x = 20; x < W; x += 28) s += seg(x, top + 10, x, top + 250, 1.2)
    s += rect(60, top + 40, W - 120, 160, '#e9e2cf', 3)
    for (let x = 60; x < W - 60; x += 60) s += seg(x, top + 40, x, top + 200, 1.5)
    s += poly([[-20, top + 290], [W + 20, top + 290], [W, top + 230], [0, top + 230]], '#4f5a5c', 3) + shade(0, top + 290, W, 24)
    s += rect(80, top + 330, W - 160, H - top - 330, '#3b3432', 3)
    s += rect(W / 2 - 150, top + 320, 300, 140, '#2f4f6b', 3) + text(W / 2, top + 390, '食堂', 64, '#fbf8ee')
    s += seg(W / 2, top + 320, W / 2, top + 460, 2)
    return s
  })
}

// ---------- props & obstacles (cut-out cards) ----------
const props = []
function prop(id, wm, hm, mode, draw, extra = {}) {
  writeFileSync(new URL(`props/${id}.svg`, OUT), svg(wm, hm, draw))
  props.push({ id, image: `props/${id}.svg`, width: wm, height: hm, mode, ...extra })
}

function main() {
  mkdirSync(new URL('buildings/', OUT), { recursive: true })
  mkdirSync(new URL('props/', OUT), { recursive: true })

  apartment('apt-cream-3f', 3, '#efe9d8', '#f7f5ee')
  apartment('apt-pink-4f', 4, '#e7b9a8', '#f4ece6')
  apartment('apt-teal-5f', 5, '#9fcac0', '#eef3ef')
  house('house-sage', '#b5cfbd', '#5e7b7a')
  house('house-cream', '#f1e6cf', '#9b5a4a')
  house('house-grey', '#cfd2c9', '#4f6664')
  shop('shop-ramen', '#ece7d8', '#d9533f', '#d9533f', 'ラーメン')
  shop('shop-kissa', '#d8c7a6', '#5aa6a0', '#f3efe2', '喫茶')
  shop('shop-books', '#f3efe6', '#4b7fbf', '#4b7fbf', '本屋')
  shop('shop-flowers', '#e8bfb0', '#5aa6a0', '#e58da0', '花屋')
  konbini('konbini-blue', '#4b7fbf', 'コンビニ')
  office('office-5f', 5, '#cdd3cc')
  oldWood('shokudo-wood')

  // block wall tile (3.2m) with a painted hedge line peeking over
  prop('wall-block', 3.2, 2.2, 'wall', (W, H) => {
    let s = `<path d="M0,${H * 0.3} Q${W * 0.25},${-20} ${W * 0.5},${H * 0.25} T${W},${H * 0.3} L${W},${H * 0.35} L0,${H * 0.35}Z" fill="#7fae6e"/>`
    s += rect(0, H * 0.3, W, H * 0.7, '#d5d8cf', 4)
    for (let y = H * 0.3 + 38; y < H; y += 38) s += seg(4, y, W - 4, y, 1.2)
    for (let x = 80; x < W; x += 160) s += seg(x, H * 0.3, x, H, 1.2)
    return s + shade(0, H * 0.3, W, 18)
  })
  prop('tree', 3.2, 4.6, 'cross', (W, H) => {
    let s = rect(W / 2 - 14, H * 0.45, 28, H * 0.55, '#8a6f5a', 3)
    for (const [cx, cy, r, c] of [[W * 0.5, H * 0.3, 120, '#7fae6e'], [W * 0.3, H * 0.4, 90, '#6a9c5e'], [W * 0.7, H * 0.38, 95, '#93bf7c'], [W * 0.5, H * 0.15, 80, '#93bf7c']])
      s += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${c}" stroke="${INK}" stroke-width="3.5"/>`
    return s
  }, { foliage: true })
  // sakura in full bloom: dark trunk and branches, clustered pink canopy with painted
  // shade on the undersides and pale highlights on top
  prop('sakura', 6.2, 6.6, 'cross', (W, H) => {
    // gently leaning trunk that forks into branches under a wide dome of blossom
    let s = poly([[W / 2 - 26, H], [W / 2 + 24, H], [W / 2 + 8, H * 0.62], [W / 2 + 22, H * 0.5], [W / 2 - 4, H * 0.5], [W / 2 - 16, H * 0.62]], '#5b4640', 3.5)
    s += `<path d="M${W / 2 + 6},${H} L${W / 2 + 4},${H * 0.64}" stroke="#7a5f55" stroke-width="10" fill="none"/>`
    for (const [x2, y2] of [[W * 0.16, H * 0.42], [W * 0.84, H * 0.4], [W * 0.5, H * 0.2], [W * 0.3, H * 0.3], [W * 0.7, H * 0.28]])
      s += stroke([[W / 2 + 6, H * 0.52], [(W / 2 + x2) / 2 + j(14), (H * 0.52 + y2) / 2 - 10], [x2, y2]], 10)
    const puffs = []
    for (let i = 0; i < 46; i++) {
      const a = rnd() * Math.PI
      const rho = Math.pow(rnd(), 0.55)
      const r = 50 + rnd() * 42
      let x = W / 2 + Math.cos(a) * rho * (W / 2 - 60)
      let y = H * 0.4 - Math.sin(a) * rho * H * 0.27
      x = Math.min(W - r - 6, Math.max(r + 6, x))
      y = Math.max(r + 6, y)
      puffs.push([x, y, r])
    }
    // a scalloped underside so the canopy doesn't end in a straight line
    for (let i = 0; i < 9; i++) puffs.push([W * (0.12 + i * 0.095), H * 0.44 + j(12), 42 + rnd() * 16])
    puffs.sort((p, q) => p[1] - q[1])
    for (const [cx, cy, r] of puffs) s += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}" fill="#f4b6c8" stroke="${INK}" stroke-width="3"/>`
    for (const [cx, cy, r] of puffs) s += `<circle cx="${cx.toFixed(1)}" cy="${(cy + r * 0.32).toFixed(1)}" r="${(r * 0.74).toFixed(1)}" fill="#e38fac"/>`
    for (const [cx, cy, r] of puffs) s += `<circle cx="${(cx - r * 0.08).toFixed(1)}" cy="${(cy - r * 0.14).toFixed(1)}" r="${(r * 0.72).toFixed(1)}" fill="#f7c3d2"/>`
    for (const [cx, cy, r] of puffs.slice(0, 16)) s += `<circle cx="${(cx - r * 0.22).toFixed(1)}" cy="${(cy - r * 0.32).toFixed(1)}" r="${(r * 0.3).toFixed(1)}" fill="#fde6ec"/>`
    return s
  }, { foliage: true })
  // fallen petals, seen from above (a ground decal)
  prop('petals-ground', 3, 3, 'decal', (W, H) => {
    let s = ''
    for (let i = 0; i < 70; i++) {
      const r = Math.pow(rnd(), 0.7) * W * 0.48
      const a = rnd() * Math.PI * 2
      const x = W / 2 + Math.cos(a) * r
      const y = H / 2 + Math.sin(a) * r
      s += `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="${8 + rnd() * 5}" ry="${5 + rnd() * 3}" fill="${rnd() < 0.3 ? '#fde6ec' : '#f4b6c8'}" transform="rotate(${(rnd() * 180).toFixed(0)} ${x.toFixed(1)} ${y.toFixed(1)})"/>`
    }
    return s
  })
  prop('vending-blue', 0.95, 1.85, 'box', (W, H) => {
    let s = rect(2, 2, W - 4, H - 4, '#3f7fc4', 4) + rect(14, 20, W - 28, H * 0.5, '#f5f7f2', 3)
    for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) s += rect(22 + c * 16, 32 + r * 28, 11, 20, ['#d9533f', '#e8b64a', '#5aa6a0', '#f3efe2'][(r + c) % 4], 1.5)
    return s + rect(24, H * 0.62, W - 48, 26, '#2f3a38', 2) + rect(18, H - 50, W - 36, 30, '#2f3a38', 2)
  }, { depth: 0.8, color: '#3f7fc4' })
  prop('vending-red', 0.95, 1.85, 'box', (W, H) => {
    let s = rect(2, 2, W - 4, H - 4, '#d24a3c', 4) + rect(14, 20, W - 28, H * 0.5, '#f5f7f2', 3)
    for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) s += rect(22 + c * 16, 32 + r * 28, 11, 20, ['#4b7fbf', '#e8b64a', '#8a5a44', '#f3efe2'][(r + c) % 4], 1.5)
    return s + rect(24, H * 0.62, W - 48, 26, '#2f3a38', 2) + rect(18, H - 50, W - 36, 30, '#2f3a38', 2)
  }, { depth: 0.8, color: '#d24a3c' })
  prop('postbox', 0.6, 1.4, 'cross', (W, H) => rect(8, 30, W - 16, H - 60, '#d24a3c', 4) + `<path d="M8,32 Q${W / 2},-8 ${W - 8},32Z" fill="#d24a3c" stroke="${INK}" stroke-width="4"/>` + rect(16, 70, W - 32, 8, INK, 1) + rect(W / 2 - 6, H - 30, 12, 30, '#555', 2))
  prop('bicycle', 1.7, 1.0, 'card', (W, H) => `<circle cx="38" cy="${H - 38}" r="32" fill="none" stroke="${INK}" stroke-width="5"/><circle cx="${W - 38}" cy="${H - 38}" r="32" fill="none" stroke="${INK}" stroke-width="5"/>` + stroke([[38, H - 38], [70, 40], [W - 60, 40], [W - 38, H - 38]], 5) + stroke([[70, 40], [W / 2, H - 38], [W - 60, 40]], 4) + rect(60, 22, 36, 12, '#d9533f', 2) + rect(W - 72, 26, 30, 8, INK, 1))
  prop('plants', 1.4, 0.9, 'card', (W, H) => {
    let s = ''
    for (let i = 0; i < 3; i++) {
      const x = 12 + i * 44
      s += `<circle cx="${x + 18}" cy="${H - 58}" r="${22 + (i % 2) * 6}" fill="${['#7fae6e', '#93bf7c', '#6a9c5e'][i]}" stroke="${INK}" stroke-width="3"/>`
      s += rect(x + 4, H - 38, 30, 36, '#c7875f', 2.5)
    }
    return s
  })

  const manifest = {
    note: 'Generated by scripts/make-placeholders.mjs. Swap any file for a painted PNG with the same framing (see ART.md) and update the path.',
    character: 'character.vrm', // pixiv's VRM sample (VRM Public License 1.0, redistribution allowed); see ART.md
    buildings,
    props,
  }
  writeFileSync(new URL('manifest.json', OUT), JSON.stringify(manifest, null, 2) + '\n')
  console.log(`wrote ${buildings.length} buildings, ${props.length} props`)
}

main()
