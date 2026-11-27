import * as THREE from 'three'
import { INK, box, make } from './textures'

// What a painted lot's 3D body wears (world/painted.tsx): its side walls and a pitched roof's tiles,
// drawn here in the facade's palette, so the painted front doesn't stand on a blank box.

/** A color moved toward black (amount > 0) or white (amount < 0). */
function shade(color: string, amount: number): string {
  const c = new THREE.Color(color)
  return `#${c.lerp(new THREE.Color(amount > 0 ? '#000000' : '#ffffff'), Math.abs(amount)).getHexString()}`
}

/** A small seeded random for one wall, so a building's side looks the same every time. */
function seeded(key: string) {
  let s = 7
  for (const ch of key) s = (s * 31 + ch.charCodeAt(0)) % 2147483647
  return () => (s = (s * 16807) % 2147483647) / 2147483647
}

const PX = 48 // pixels per meter
const ATLAS_W = 2048
const PAD = 6 // ink-filled gutter between cells, so mipmaps don't bleed one wall into the next

type Wall = { id: string; depth: number; bodyHeight: number; side: string; roofShape?: string }
type Atlas = { list: readonly Wall[]; tex: THREE.CanvasTexture; cells: Map<string, [number, number, number, number]> }
let atlas: Atlas | null = null

/**
 * Every building's side wall in one texture, so all of a block's side walls are one draw call:
 * each wall in its own cell, at its depth by its wall height. Returns the texture and the cell's
 * UV window (u0, v0, u1, v1; v0 at the bottom). Rebuilt when the manifest's list changes.
 */
export function sideWall(list: readonly Wall[], id: string): { tex: THREE.CanvasTexture; cell: [number, number, number, number] } {
  if (atlas?.list !== list) {
    atlas?.tex.dispose()
    // shelf packing, left to right, a new row when one is full
    const at = new Map<string, [number, number, number, number]>()
    let x = 0
    let y = 0
    let row = 0
    for (const b of list) {
      const w = Math.round(b.depth * PX) + 2 * PAD
      const h = Math.round(b.bodyHeight * PX) + 2 * PAD
      if (x + w > ATLAS_W) [x, y, row] = [0, y + row, 0]
      at.set(b.id, [x + PAD, y + PAD, w - 2 * PAD, h - 2 * PAD])
      x += w
      row = Math.max(row, h)
    }
    const H = y + row
    const c = document.createElement('canvas')
    c.width = ATLAS_W
    c.height = H
    const g = c.getContext('2d')!
    g.fillStyle = INK
    g.fillRect(0, 0, ATLAS_W, H)
    const cells = new Map<string, [number, number, number, number]>()
    for (const b of list) {
      const [cx, cy, w, h] = at.get(b.id)!
      g.save()
      g.translate(cx, cy)
      g.beginPath()
      g.rect(0, 0, w, h)
      g.clip()
      drawSideWall(g, b, w, h)
      g.restore()
      cells.set(b.id, [cx / ATLAS_W, 1 - (cy + h) / H, (cx + w) / ATLAS_W, 1 - cy / H])
    }
    const tex = new THREE.CanvasTexture(c)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 4
    atlas = { list, tex, cells }
  }
  return { tex: atlas.tex, cell: atlas.cells.get(id) ?? [0, 0, 0, 0] }
}

/**
 * One side wall (seen at corners and down the gaps between lots), w by h pixels: the wall color
 * over a darker base, a frosted window a storey, a drain pipe at the back, an AC unit on the
 * ground, a painted shadow under the roof and inked edges. The front corner is on the left.
 */
function drawSideWall(g: CanvasRenderingContext2D, b: Wall, w: number, h: number) {
  const { id, depth, bodyHeight: height, side: color } = b
  const eaves = b.roofShape === 'pitched'
  const rnd = seeded(id)
  const m = (v: number) => v * PX
  const Y = (v: number) => h - v * PX // meters above the ground to canvas y
  g.fillStyle = color
  g.fillRect(0, 0, w, h)
  // the base course
  g.fillStyle = shade(color, 0.25)
  g.fillRect(0, Y(0.35), w, m(0.35))
  g.fillStyle = shade(color, 0.45)
  g.fillRect(0, Y(0.35) - 2, w, 3)
  // a frosted window a storey, away from the front corner
  const storeys = Math.max(1, Math.floor(height / 2.7))
  for (let s = 0; s < storeys; s++) {
    const ww = m(0.7 + rnd() * 0.5)
    const wh = m(s === 0 ? 0.8 : 1.0)
    const x = m(1.6 + rnd() * Math.max(0.2, depth - 3.6))
    const y = Y(s * 2.7 + (s === 0 ? 1.3 : 1.0)) - wh
    box(g, x - 3, y - 3, ww + 6, wh + 6, shade(color, -0.35), 2)
    box(g, x, y, ww, wh, '#4a6464', 2)
    g.fillStyle = '#86a3a0'
    g.beginPath()
    g.moveTo(x + ww * 0.15, y + wh)
    g.lineTo(x + ww * 0.35, y + wh)
    g.lineTo(x + ww * 0.75, y)
    g.lineTo(x + ww * 0.55, y)
    g.fill()
    g.fillStyle = INK
    g.fillRect(x + ww / 2 - 1, y, 2, wh)
    g.fillStyle = shade(color, 0.3)
    g.fillRect(x - 6, y + wh + 3, ww + 12, 4)
  }
  // a drain pipe down the back, with its brackets
  const px = m(depth - 0.5)
  box(g, px, 0, m(0.12), h, '#a3aca8', 2)
  g.fillStyle = INK
  for (let y = 0.8; y < height - 0.3; y += 1.3) g.fillRect(px - 4, Y(y), m(0.12) + 8, 3)
  // an AC unit on the ground near the front
  const ax = m(0.7 + rnd() * 0.6)
  box(g, ax, Y(0.62), m(0.78), m(0.58), '#e6e3d8', 2)
  g.lineWidth = 2
  g.strokeStyle = INK
  g.beginPath()
  g.arc(ax + m(0.28), Y(0.33), m(0.2), 0, Math.PI * 2)
  g.stroke()
  for (let i = 0; i < 4; i++) g.fillRect(ax + m(0.56), Y(0.5) + i * 5, m(0.16), 2)
  // the roof's shadow painted across the top, cool and flat like the facades' own
  g.fillStyle = 'rgba(90, 98, 160, 0.3)'
  g.fillRect(0, 0, w, m(eaves ? 0.5 : 0.2))
  // inked edges: the corners and the top
  g.lineWidth = 5
  g.strokeStyle = INK
  g.strokeRect(2.5, 2.5, w - 5, h + 5)
}

/**
 * Round clay tiles in a roof's color, one tile across and one course down per repeat
 * (geom.roofSlab sets the UVs in tiles): each row lit on one flank and shaded on the other.
 */
export function roofTileTex(color: string): THREE.CanvasTexture {
  return make(
    `tiles:${color}`,
    64,
    64,
    (g) => {
      g.fillStyle = color
      g.fillRect(0, 0, 64, 64)
      g.fillStyle = shade(color, -0.18)
      g.fillRect(8, 0, 14, 64)
      g.fillStyle = shade(color, 0.22)
      g.fillRect(40, 0, 18, 64)
      g.fillStyle = shade(color, 0.5)
      g.fillRect(58, 0, 6, 64)
      // the lower lip of each course
      g.fillStyle = shade(color, 0.3)
      g.fillRect(0, 56, 64, 8)
    },
    true,
  )
}
