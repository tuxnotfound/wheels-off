import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'

// Shared unit geometries. Meshes scale them instead of allocating their own, so
// blocks can mount and unmount without creating or leaking GPU buffers.

/** Unit box, tessellated so long pieces (sidewalks, walls, buildings) follow the curve. */
export const BOX = new THREE.BoxGeometry(1, 1, 1, 3, 1, 12)
/** Unit box for small props. */
export const SMALL_BOX = new THREE.BoxGeometry(1, 1, 1)
/** Unit box with softened edges (vehicle bodies). Radius scales with the mesh. */
export const RBOX = new RoundedBoxGeometry(1, 1, 1, 3, 0.1)
/** Unit cylinder (radius 0.5, height 1), centered. */
export const CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 14)
/** Unit cone (radius 0.5, height 1), centered. */
export const CONE = new THREE.ConeGeometry(0.5, 1, 20)
/** Smooth unit sphere (diameter 1). */
export const SPHERE = new THREE.SphereGeometry(0.5, 18, 12)
/** Flat unit square on the XZ plane, tessellated along Z (road surface, paint). */
export const FLAT = new THREE.PlaneGeometry(1, 1, 6, 16).rotateX(-Math.PI / 2)
/** Flat unit square facing +Z (signs, decals). */
export const PANEL = new THREE.PlaneGeometry(1, 1)

/** Gable roof: triangular prism in a [-0.5,0.5]^3 box, base at y=-0.5, ridge along Z. */
export const PRISM = (() => {
  const g = new THREE.CylinderGeometry(0.5, 0.5, 1, 3, 1).rotateX(-Math.PI / 2)
  g.computeBoundingBox()
  const b = g.boundingBox!
  g.translate(0, -b.min.y, 0)
  g.scale(1 / (b.max.x - b.min.x), 1 / (b.max.y - b.min.y), 1)
  g.translate(0, -0.5, 0)
  const flat = g.toNonIndexed()
  flat.computeVertexNormals()
  return flat
})()

// Two cut-to-size geometries, cached by their numbers: a manifest holds a few dozen buildings,
// so these stay a handful too, created once, never per block.
const windows = new Map<string, THREE.BufferGeometry>()
const slabs = new Map<string, THREE.BufferGeometry>()

/**
 * PANEL showing only the window u0 to u1, v0 to v1 of its texture (v0 its bottom): a facade cut
 * in pieces, or one cell of an atlas.
 */
export function panelWindow(u0: number, v0: number, u1: number, v1: number): THREE.BufferGeometry {
  const key = [u0, v0, u1, v1].map((x) => x.toFixed(4)).join(':')
  let g = windows.get(key)
  if (!g) {
    g = new THREE.PlaneGeometry(1, 1)
    const uv = g.attributes.uv
    for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0))
    windows.set(key, g)
  }
  return g
}

/** Size of one roof tile in meters: across the slope, and one course down it. */
const TILE = [0.3, 0.26]

/**
 * One slope of a pitched roof in meters, not scaled: `run` down the slope on X, `thick` on Y,
 * `along` the street on Z (tessellated along it, to follow the curve). UVs count tiles, so a
 * repeating tile texture keeps its size on any roof, rows running down the slope.
 */
export function roofSlab(run: number, thick: number, along: number): THREE.BufferGeometry {
  const key = `${run.toFixed(2)}:${thick}:${along.toFixed(2)}`
  let g = slabs.get(key)
  if (!g) {
    g = new THREE.BoxGeometry(run, thick, along, 1, 1, Math.max(2, Math.ceil(along / 1.5)))
    const p = g.attributes.position
    const n = g.attributes.normal
    const uv = g.attributes.uv
    for (let i = 0; i < p.count; i++) {
      const across = Math.abs(n.getZ(i)) > 0.5 ? p.getX(i) : p.getZ(i)
      const down = Math.abs(n.getY(i)) > 0.5 ? p.getX(i) : p.getY(i)
      uv.setXY(i, across / TILE[0], down / TILE[1])
    }
    slabs.set(key, g)
  }
  return g
}

/** Downward-pointing triangle plate, thickness along Z (Japanese stop sign). */
export const TRI = new THREE.CylinderGeometry(0.5, 0.5, 1, 3).rotateX(Math.PI / 2)
