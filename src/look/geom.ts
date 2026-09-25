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
/** Thin ring of diameter 1 in the XY plane (bicycle wheels). */
export const RING = new THREE.TorusGeometry(0.47, 0.045, 6, 24)
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

/** Downward-pointing triangle plate, thickness along Z (Japanese stop sign). */
export const TRI = new THREE.CylinderGeometry(0.5, 0.5, 1, 3).rotateX(Math.PI / 2)
