import * as THREE from 'three'
import { celRamp } from '../look/gradientMap'
import { patchCurve } from '../look/materials'
import { roadMarksTex } from '../look/textures'
import { h } from './streetGen'
import type { BlockPlan } from './streetGen'
import { BLOCK } from './worldConfig'

// What a used street shows on its asphalt: manhole covers (with the town's sakura emblem), patches
// of newer tarmac, cracks, and drain grates in the concrete gutter along each curb. All four come
// from one texture (textures.ts, roadMarksTex), so a block's marks bake into a single mesh with
// one draw call (bake.ts). They lie over the road paint, as patches and covers do on real roads.

export type MarkKind = 'manhole' | 'patch' | 'crack' | 'grate'
export type RoadMark = { kind: MarkKind; s: number; u: number; w: number; l: number; rot: number }

/** The concrete gutter along each curb: its width, and its color. The grates sit in it. */
export const GUTTER = 0.26
export const GUTTER_COLOR = '#a2aca9'

// each kind's cell in the 2x2 texture, as drawn on the canvas: [column, row] from the top left
const CELL: Record<MarkKind, [number, number]> = { manhole: [0, 0], patch: [1, 0], crack: [0, 1], grate: [1, 1] }

const geos = new Map<MarkKind, THREE.BufferGeometry>()

/** A flat unit square on the road, its UVs on the kind's cell (a texel in from the edges). */
function markGeo(kind: MarkKind): THREE.BufferGeometry {
  let g = geos.get(kind)
  if (!g) {
    g = new THREE.PlaneGeometry(1, 1, 2, 2).rotateX(-Math.PI / 2)
    const [col, row] = CELL[kind]
    const inset = 2 / 512
    const uv = g.attributes.uv
    for (let i = 0; i < uv.count; i++) {
      const x = col * 0.5 + inset + uv.getX(i) * (0.5 - 2 * inset)
      const y = (1 - row) * 0.5 + inset + uv.getY(i) * (0.5 - 2 * inset) // the canvas's top is v = 1
      uv.setXY(i, x, y)
    }
    geos.set(kind, g)
  }
  return g
}

let mat: THREE.MeshToonMaterial | null = null

/** Lit like the road, cut out by alpha, and pulled toward the camera over the road and its paint. */
function markMat(): THREE.MeshToonMaterial {
  if (!mat) {
    mat = new THREE.MeshToonMaterial({ map: roadMarksTex(), gradientMap: celRamp(), alphaTest: 0.5 })
    mat.polygonOffset = true
    mat.polygonOffsetFactor = -1.5
    mat.polygonOffsetUnits = -5
    mat.onBeforeCompile = patchCurve
    mat.customProgramCacheKey = () => 'toon-curve'
  }
  return mat
}

/** A block's marks, from its hash: the same every time the block is laid out. */
export function roadMarks(seed: number, k: number, width: number, plan: BlockPlan): RoadMark[] {
  const half = width / 2
  const r = (salt: number) => h(seed, k, salt)
  const out: RoadMark[] = []
  // clear of the intersection behind and of the crossing's stripes ahead
  const from = plan.roadFrom + 1.5
  const to = (plan.crosswalk ? BLOCK - plan.crosswalk - 3.4 : BLOCK) - 1.5
  const along = (salt: number) => from + r(salt) * (to - from)
  const across = (salt: number, margin: number) => (r(salt) * 2 - 1) * Math.max(0, half - margin)
  if (to - from > 4) {
    // a manhole on most blocks, two on some
    const manholes = r(900) < 0.3 ? 0 : r(901) < 0.7 ? 1 : 2
    for (let i = 0; i < manholes; i++) out.push({ kind: 'manhole', s: across(902 + i, 1.1), u: along(905 + i), w: 0.8, l: 0.8, rot: r(908 + i) * 6.28 })
    const patches = r(910) < 0.45 ? 0 : r(911) < 0.75 ? 1 : 2
    for (let i = 0; i < patches; i++) {
      const w = 1.2 + r(912 + i) * 1.4
      const l = 1.6 + r(915 + i) * 2.4
      out.push({ kind: 'patch', s: across(918 + i, w / 2 + 0.4), u: along(921 + i), w, l, rot: (r(924 + i) - 0.5) * 0.08 })
    }
    const cracks = r(930) < 0.4 ? 0 : r(931) < 0.6 ? 1 : 2
    for (let i = 0; i < cracks; i++) {
      const size = 1.4 + r(932 + i)
      out.push({ kind: 'crack', s: across(935 + i, 0.9), u: along(938 + i), w: size, l: size, rot: r(941 + i) * 6.28 })
    }
  }
  // a drain grate in the gutter every 9 to 13 m, where the curb runs
  for (const { side, walk } of plan.sides) {
    let i = 0
    for (let u = walk.a + 1.2 + r(950 + side) * 4; u < walk.b - 1.2; u += 9 + r(952 + side * 7 + i++) * 4) {
      out.push({ kind: 'grate', s: side * (half - GUTTER / 2), u, w: GUTTER - 0.04, l: 0.75, rot: 0 })
    }
  }
  return out
}

/** One mark on the road, in the block's frame (+x the street's right, -z ahead). */
export function RoadMarkView({ m }: { m: RoadMark }) {
  return <mesh geometry={markGeo(m.kind)} material={markMat()} position={[m.s, 0, -m.u]} rotation-y={m.rot} scale={[m.w, 1, m.l]} receiveShadow />
}
