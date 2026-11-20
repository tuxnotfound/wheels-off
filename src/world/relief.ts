import * as THREE from 'three'
import { artPixels } from '../art/art'
import type { SolidArt, SolidView } from '../art/art'
import { edgesAt, inside } from './paintedSolid'

// An open vehicle (a scooter, a bicycle) as reliefs of its painted views (ART.md, Vehicles). Built
// like a car, a box sliced where its outlines overlap, the handlebars, the basket and the top box
// each made a slab their own width through that whole slice, painted the same on every face, and
// through the gaps in one face another showed: a second basket, a second top box, a smear across
// each step. Here each view is a sheet facing its own way, every square of it set back to where,
// looking that way, it first meets the shape: the handlebars stand at the handlebars and the
// basket's side out at its side. Only the sheets facing the camera are drawn (the left or the
// right, the front or the rear, the top), so no view shows through another, and what shows
// through the frame and the spokes is the street.
//
// The shape is the car's, from the outlines' extents (paintedSolid.ts): carved from the outlines
// themselves, every few centimeters where the views were drawn apart left a step, and each step
// a sliver of the street between two pieces, which the ink pass outlines. Only the top is
// carved, for its height: the extents' top over the handlebars is the mirrors', and the
// headlight and the basket's rim floated up there. Where the two disagree, the top view is
// left out.

const GRAIN = 0.01 // m, the outlines' grid, and how finely the top's height is searched
const CELL = 3 // grains to a sheet's square, each square at its own depth
const GROW = 2 // grains each outline grows, so views drawn a little apart still meet
const JUMP = 0.03 // m between neighboring squares beyond which the sheet tears: an edge
const ISLAND = 8 // squares: a patch torn off with fewer is joined to what it touches
const AGREE = 0.04 // m: how far the carved top may be from the shape's to be drawn

/** A view's outline on a grid of GRAIN: where any of its pixels is opaque. */
type Grid = { nx: number; ny: number; on: Uint8Array }

function outline(px: ImageData, view: SolidView): Grid {
  const [u0, v0, u1, v1] = view.rect
  const nx = Math.ceil(view.w / GRAIN)
  const ny = Math.ceil(view.h / GRAIN)
  const on = new Uint8Array(nx * ny)
  const { width: W, height: H, data } = px
  const col = (a: number) => Math.round((u0 + Math.min(a / view.w, 1) * (u1 - u0)) * W)
  const row = (b: number) => Math.round((1 - v0 - Math.min(b / view.h, 1) * (v1 - v0)) * H)
  for (let j = 0; j < ny; j++) {
    const [y0, y1] = [row((j + 1) * GRAIN), row(j * GRAIN)]
    for (let i = 0; i < nx; i++) {
      const [x0, x1] = [col(i * GRAIN), col((i + 1) * GRAIN)]
      search: for (let y = y0; y < Math.max(y1, y0 + 1); y++) {
        for (let x = x0; x < Math.max(x1, x0 + 1); x++) {
          if (data[(y * W + x) * 4 + 3] >= 128) {
            on[j * nx + i] = 1
            break search
          }
        }
      }
    }
  }
  return { nx, ny, on }
}

/** The outline grown by n grains each way. */
function grown({ nx, ny, on }: Grid, n: number): Grid {
  const across = new Uint8Array(nx * ny)
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      for (let k = Math.max(i - n, 0); k <= Math.min(i + n, nx - 1); k++) if (on[j * nx + k]) across[j * nx + i] = 1
    }
  }
  const out = new Uint8Array(nx * ny)
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      for (let k = Math.max(j - n, 0); k <= Math.min(j + n, ny - 1); k++) if (across[k * nx + i]) out[j * nx + i] = 1
    }
  }
  return { nx, ny, on: out }
}

/** Whether the outline covers the point a meters across the view from its left, b up from its foot. */
function has(g: Grid, a: number, b: number): boolean {
  const i = Math.floor(a / GRAIN)
  const j = Math.floor(b / GRAIN)
  return i >= 0 && j >= 0 && i < g.nx && j < g.ny && g.on[j * g.nx + i] === 1
}

/** The first step from `from` to `to` (GRAIN apart) where ok holds, or null. */
function first(from: number, to: number, ok: (t: number) => boolean): number | null {
  const n = Math.max(Math.ceil(Math.abs(to - from) / GRAIN), 1)
  for (let k = 0; k <= n; k++) {
    const t = from + ((to - from) * k) / n
    if (ok(t)) return t
  }
  return null
}

/** One view as a sheet: which way it faces, and where a point of it (a across, b up, in meters) is. */
type Sheet = {
  view: SolidView
  n: [number, number, number]
  /** where along n the shape is first met, looking at the view's point a, b (NaN: left out) */
  depth: (a: number, b: number) => number
  at: (a: number, b: number, d: number) => [number, number, number]
}

/**
 * Patches of a sheet torn off from the squares around them (more than JUMP apart) but smaller than
 * ISLAND squares, set at the depth of the patch they touch most: a few squares where the views
 * disagree, not a part of their own, and each torn edge would be inked.
 */
function snapIslands(depth: Float32Array, cx: number, cy: number) {
  for (let pass = 0; pass < 3; pass++) {
    const label = new Int32Array(cx * cy).fill(-1)
    const sizes: number[] = []
    for (let start = 0; start < cx * cy; start++) {
      if (Number.isNaN(depth[start]) || label[start] >= 0) continue
      const id = sizes.length
      const stack = [start]
      label[start] = id
      let size = 0
      while (stack.length) {
        const q = stack.pop()!
        size++
        const [i, j] = [q % cx, Math.floor(q / cx)]
        for (const [ii, jj] of [
          [i - 1, j],
          [i + 1, j],
          [i, j - 1],
          [i, j + 1],
        ]) {
          if (ii < 0 || jj < 0 || ii >= cx || jj >= cy) continue
          const r = jj * cx + ii
          if (label[r] >= 0 || Number.isNaN(depth[r]) || Math.abs(depth[r] - depth[q]) > JUMP) continue
          label[r] = id
          stack.push(r)
        }
      }
      sizes.push(size)
    }
    // for each small patch, its neighbors' depths across its edge, by patch
    let moved = false
    const touch = new Map<number, Map<number, number[]>>()
    for (let q = 0; q < cx * cy; q++) {
      const a = label[q]
      if (a < 0 || sizes[a] >= ISLAND) continue
      const [i, j] = [q % cx, Math.floor(q / cx)]
      for (const [ii, jj] of [
        [i - 1, j],
        [i + 1, j],
        [i, j - 1],
        [i, j + 1],
      ]) {
        if (ii < 0 || jj < 0 || ii >= cx || jj >= cy) continue
        const b = label[jj * cx + ii]
        if (b < 0 || b === a) continue
        const m = touch.get(a) ?? new Map<number, number[]>()
        touch.set(a, m)
        m.set(b, [...(m.get(b) ?? []), depth[jj * cx + ii]])
      }
    }
    for (const [a, m] of touch) {
      // the patch it shares the most edge with, the bigger one on a tie
      const [, ds] = [...m].sort(([b1, d1], [b2, d2]) => d2.length - d1.length || sizes[b2] - sizes[b1])[0]
      const d = ds.reduce((x, y) => x + y, 0) / ds.length
      for (let q = 0; q < cx * cy; q++) if (label[q] === a) depth[q] = d
      moved = true
    }
    if (!moved) return
  }
}

const geos = new Map<string, THREE.BufferGeometry>()

/** The open vehicle's sheets as one mesh: its nose toward -z, its right toward +x, the ground at y = 0. Cached per id. */
export function reliefGeometry(v: SolidArt): THREE.BufferGeometry {
  const hit = geos.get(v.id)
  if (hit) return hit
  const { side, front, rear, top } = v.views
  const px = artPixels(v.atlas)
  const own = { side: outline(px, side), front: outline(px, front), rear: outline(px, rear), top: outline(px, top) }
  const S = grown(own.side, GROW)
  const F = grown(own.front, GROW)
  const R = grown(own.rear, GROW)
  const T = grown(own.top, GROW)
  const inSide = (z: number, y: number) => has(S, z + side.w / 2, y)
  const inEnd = (x: number, y: number) => has(F, front.w / 2 - x, y) || has(R, x + rear.w / 2, y)
  const inTop = (z: number, x: number) => has(T, z + top.w / 2, x + top.h / 2)
  const X = Math.max(front.w, rear.w, top.h) / 2
  const Z = Math.max(side.w, top.w) / 2
  const Y = Math.max(side.h, front.h, rear.h) + GROW * GRAIN

  // a side, where the shape is first met across, or at its edge there
  const across = (dir: number) => (a: number, b: number) => {
    const [z, y] = [a - side.w / 2, b]
    return first(dir * X, -dir * X, (x) => inside(v, x, y, z)) ?? edgesAt(v, y, z)[dir < 0 ? 0 : 1]
  }
  // an end, where the shape is first met along, or failing that whatever the side view has at that height
  const along = (dir: number, x: (a: number) => number) => (a: number, b: number) =>
    first(dir * Z, -dir * Z, (z) => inside(v, x(a), b, z)) ?? first(dir * Z, -dir * Z, (z) => inSide(z, b)) ?? 0
  // the top, where all three outlines are first met coming down, if the shape is about as high there
  const down = (a: number, b: number) => {
    const [z, x] = [a - top.w / 2, b - top.h / 2]
    const carved = first(Y, 0, (y) => inSide(z, y) && inEnd(x, y) && inTop(z, x))
    const shape = first(Y, 0, (y) => inside(v, x, y, z))
    return carved !== null && shape !== null && Math.abs(carved - shape) <= AGREE ? carved : NaN
  }
  const sheets: [Sheet, Grid][] = [
    [{ view: side, n: [-1, 0, 0], depth: across(-1), at: (a, b, d) => [d, b, a - side.w / 2] }, own.side],
    [{ view: side, n: [1, 0, 0], depth: across(1), at: (a, b, d) => [d, b, a - side.w / 2] }, own.side],
    [{ view: front, n: [0, 0, -1], depth: along(-1, (a) => front.w / 2 - a), at: (a, b, d) => [front.w / 2 - a, b, d] }, own.front],
    [{ view: rear, n: [0, 0, 1], depth: along(1, (a) => a - rear.w / 2), at: (a, b, d) => [a - rear.w / 2, b, d] }, own.rear],
    [{ view: top, n: [0, 1, 0], depth: down, at: (a, b, d) => [b - top.h / 2, d, a - top.w / 2] }, own.top],
  ]

  const pos: number[] = []
  const nrm: number[] = []
  const uv: number[] = []
  const index: number[] = []
  for (const [sheet, g] of sheets) {
    const { view, n } = sheet
    const cx = Math.ceil(g.nx / CELL)
    const cy = Math.ceil(g.ny / CELL)
    // each square's depth: the median of its opaque grains' (NaN, a grain left out)
    const depth = new Float32Array(cx * cy).fill(NaN)
    for (let j = 0; j < cy; j++) {
      for (let i = 0; i < cx; i++) {
        const ds: number[] = []
        for (let gj = j * CELL; gj < Math.min((j + 1) * CELL, g.ny); gj++) {
          for (let gi = i * CELL; gi < Math.min((i + 1) * CELL, g.nx); gi++) {
            if (!g.on[gj * g.nx + gi]) continue
            const d = sheet.depth((gi + 0.5) * GRAIN, (gj + 0.5) * GRAIN)
            if (!Number.isNaN(d)) ds.push(d)
          }
        }
        if (!ds.length) continue
        depth[j * cx + i] = ds.sort((a, b) => a - b)[ds.length >> 1]
      }
    }
    snapIslands(depth, cx, cy)
    // a corner of a square sits at the mean depth of the squares around it on the same surface,
    // so a curved panel bends instead of breaking into steps
    const corner = (i: number, j: number, d: number) => {
      let sum = 0
      let k = 0
      for (const [di, dj] of [
        [-1, -1],
        [0, -1],
        [-1, 0],
        [0, 0],
      ]) {
        const [ii, jj] = [i + di, j + dj]
        if (ii < 0 || jj < 0 || ii >= cx || jj >= cy) continue
        const e = depth[jj * cx + ii]
        if (!Number.isNaN(e) && Math.abs(e - d) <= JUMP) [sum, k] = [sum + e, k + 1]
      }
      return sum / k
    }
    const [u0, v0, u1, v1] = view.rect
    for (let j = 0; j < cy; j++) {
      for (let i = 0; i < cx; i++) {
        const d = depth[j * cx + i]
        if (Number.isNaN(d)) continue
        const base = pos.length / 3
        for (const [ci, cj] of [
          [i, j],
          [i + 1, j],
          [i + 1, j + 1],
          [i, j + 1],
        ]) {
          const a = Math.min(ci * CELL * GRAIN, view.w)
          const b = Math.min(cj * CELL * GRAIN, view.h)
          pos.push(...sheet.at(a, b, corner(ci, cj, d)))
          nrm.push(...n)
          uv.push(u0 + (a / view.w) * (u1 - u0), v0 + (b / view.h) * (v1 - v0))
        }
        // wound to face n
        const p = (k: number) => new THREE.Vector3().fromArray(pos, (base + k) * 3)
        const facing = p(1).sub(p(0)).cross(p(2).sub(p(0))).dot(new THREE.Vector3(...n)) > 0
        if (facing) index.push(base, base + 1, base + 2, base, base + 2, base + 3)
        else index.push(base, base + 2, base + 1, base, base + 3, base + 2)
      }
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  geo.setIndex(index)
  geos.set(v.id, geo)
  return geo
}
