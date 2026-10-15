import * as THREE from 'three'
import { bakedMat } from '../look/materials'

// Static batching. A block is a hundred-odd small meshes over a few shared geometries (a kei car
// alone is 40 to 70), each one a draw call, and most of them a second one in the shadow pass:
// about 2,000 a frame in a ride, most of the frame's CPU. Once a block has mounted, its parts are
// merged into one mesh per material: every plain toon part into one, its color moved into the
// vertices, and each textured material (a facade, a decal) into its own. The originals stay
// mounted, for React, but hidden, and their matrices stop updating. Anything marked LIVE stays
// as it is, with all it holds: obstacles that get knocked flying, a nobori's swaying flag, the ad
// faces that count their impressions.

/** userData for what the bake leaves alone. */
export const LIVE = { live: true }

type Kind = 'plain' | 'textured' | 'canopy'
type Group = { kind: Kind; parts: { mesh: THREE.Mesh; at: THREE.Matrix4 }[]; mat: THREE.Material; source: THREE.Mesh }

/** A plain toon material: one color, no texture (toonMat, paintMat). */
function plain(m: THREE.Material): m is THREE.MeshToonMaterial {
  const t = m as THREE.MeshToonMaterial
  return t.isMeshToonMaterial === true && !t.map && !t.vertexColors && !t.transparent && t.alphaTest === 0 && !t.userData.rider
}

/** Which merged mesh a part goes into, or null to leave it as it is. */
function groupOf(mesh: THREE.Mesh): { key: string; kind: Kind; mat: THREE.Material } | null {
  const g = mesh.geometry
  // the merge reads attributes as plain arrays
  if (Object.values(g.attributes).some((x) => (x as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute || x.normalized)) return null
  const mats = ([] as THREE.Material[]).concat(mesh.material)
  const shadow = `${mesh.castShadow}:${mesh.receiveShadow}:${mesh.customDepthMaterial?.uuid}`
  if (mats.every(plain) && g.attributes.normal && (mats.length === 1 || g.groups.length)) {
    const m = mats[0]
    const offset = m.polygonOffset ? `${m.polygonOffsetFactor},${m.polygonOffsetUnits}` : ''
    if (mats.some((x) => x.side !== m.side || (x.polygonOffset ? `${x.polygonOffsetFactor},${x.polygonOffsetUnits}` : '') !== offset)) return null
    return { key: `plain:${m.side}:${offset}:${shadow}`, kind: 'plain', mat: bakedMat(m.side, m.polygonOffset ? [m.polygonOffsetFactor, m.polygonOffsetUnits] : null) }
  }
  if (mats.length !== 1) return null
  const m = mats[0] as THREE.MeshToonMaterial
  if (m.userData.canopy) return { key: `canopy:${m.uuid}`, kind: 'canopy', mat: m }
  if (m.isMeshToonMaterial && m.map && g.attributes.normal && g.attributes.uv) return { key: `textured:${m.uuid}:${shadow}`, kind: 'textured', mat: m }
  return null
}

const n3 = new THREE.Matrix3()

/** The index ranges a part draws: its geometry groups' when it has a material per group. */
function ranges(mesh: THREE.Mesh): [number, number][] {
  const g = mesh.geometry
  const n = g.index?.count ?? g.attributes.position.count
  return Array.isArray(mesh.material) ? g.groups.map((x) => [x.start, Math.min(n, x.start + x.count)]) : [[0, n]]
}

/** Points through an affine matrix (column-major elements), into dst from vertex `at` on. */
function place(src: ArrayLike<number>, dst: Float32Array, at: number, count: number, e: number[]) {
  for (let i = 0, j = at * 3; i < count * 3; i += 3, j += 3) {
    const x = src[i]
    const y = src[i + 1]
    const z = src[i + 2]
    dst[j] = e[0] * x + e[4] * y + e[8] * z + e[12]
    dst[j + 1] = e[1] * x + e[5] * y + e[9] * z + e[13]
    dst[j + 2] = e[2] * x + e[6] * y + e[10] * z + e[14]
  }
}

/** Directions through a normal matrix, renormalized. */
function turn(src: ArrayLike<number>, dst: Float32Array, at: number, count: number, n: number[]) {
  for (let i = 0, j = at * 3; i < count * 3; i += 3, j += 3) {
    const x = src[i]
    const y = src[i + 1]
    const z = src[i + 2]
    const a = n[0] * x + n[3] * y + n[6] * z
    const b = n[1] * x + n[4] * y + n[7] * z
    const c = n[2] * x + n[5] * y + n[8] * z
    const l = Math.sqrt(a * a + b * b + c * c) || 1
    dst[j] = a / l
    dst[j + 1] = b / l
    dst[j + 2] = c / l
  }
}

/** The parts' geometries in the root's frame, as one geometry with the kind's attributes. */
function merge(kind: Kind, parts: Group['parts']): THREE.BufferGeometry {
  let verts = 0
  let tris = 0
  for (const { mesh } of parts) {
    verts += mesh.geometry.attributes.position.count
    for (const [a, b] of ranges(mesh)) tris += b - a
  }
  const sizes: Record<string, number> =
    kind === 'canopy' ? { position: 3, corner: 2, size: 1, rot: 1, nrm: 3 } : kind === 'plain' ? { position: 3, normal: 3, color: 3 } : { position: 3, normal: 3, uv: 2 }
  const out: Record<string, Float32Array> = {}
  for (const [name, n] of Object.entries(sizes)) out[name] = new Float32Array(verts * n)
  const index = verts > 65535 ? new Uint32Array(tris) : new Uint16Array(tris)
  let vo = 0
  let io = 0
  for (const { mesh, at } of parts) {
    const g = mesh.geometry
    const a = g.attributes
    const count = a.position.count
    place(a.position.array, out.position, vo, count, at.elements)
    const n = n3.getNormalMatrix(at).elements
    if (kind === 'canopy') {
      // cluster centers move with the tree, their normals turn with it, their size takes its scale
      turn(a.nrm.array, out.nrm, vo, count, n)
      const scale = Math.cbrt(Math.abs(at.determinant()))
      for (let i = 0; i < count; i++) {
        out.size[vo + i] = a.size.array[i] * scale
        out.rot[vo + i] = a.rot.array[i]
      }
      out.corner.set(a.corner.array, vo * 2)
    } else turn(a.normal.array, out.normal, vo, count, n)
    if (kind === 'textured') out.uv.set(a.uv.array, vo * 2)
    if (kind === 'plain') {
      const col = out.color
      const paint = (c: THREE.Color, v: number) => {
        col[v * 3] = c.r
        col[v * 3 + 1] = c.g
        col[v * 3 + 2] = c.b
      }
      const mats = mesh.material
      if (!Array.isArray(mats)) for (let i = 0; i < count; i++) paint((mats as THREE.MeshToonMaterial).color, vo + i)
      else {
        // one color per geometry group (a lot's body: walls on the sides, roof on top)
        const idx = g.index?.array
        for (const grp of g.groups) {
          const c = (mats[grp.materialIndex ?? 0] as THREE.MeshToonMaterial).color
          for (let i = grp.start; i < grp.start + grp.count; i++) paint(c, vo + (idx ? idx[i] : i))
        }
      }
    }
    // a mirrored part winds its triangles the other way round
    const flip = at.determinant() < 0
    const idx = g.index?.array
    for (const [from, to] of ranges(mesh)) {
      for (let i = from; i < to; i += 3) {
        const p = idx ? idx[i] : i
        const q = idx ? idx[i + 1] : i + 1
        const r = idx ? idx[i + 2] : i + 2
        index[io++] = vo + p
        index[io++] = vo + (flip ? r : q)
        index[io++] = vo + (flip ? q : r)
      }
    }
    vo += count
  }
  const geo = new THREE.BufferGeometry()
  for (const [name, arr] of Object.entries(out)) geo.setAttribute(name, new THREE.BufferAttribute(arr, sizes[name]))
  geo.setIndex(new THREE.BufferAttribute(index, 1))
  geo.computeBoundingSphere()
  if (kind === 'canopy') geo.boundingSphere!.radius += 2 // the clusters are billboards around their centers
  return geo
}

/**
 * Merges the static meshes under `root` (its descendants, not root itself) into one mesh per
 * material, added to root. Returns the undo, for when the parts change or root unmounts.
 */
export function bakeStatic(root: THREE.Object3D): () => void {
  const groups = new Map<string, Group>()
  const stilled: THREE.Object3D[] = []
  // each object's matrix in root's frame; true when everything under `o` was taken
  const walk = (o: THREE.Object3D, at: THREE.Matrix4): boolean => {
    let all = true
    for (const child of o.children) {
      if (child.userData.live || !child.visible) {
        all = false
        continue
      }
      child.updateMatrix()
      const m = new THREE.Matrix4().multiplyMatrices(at, child.matrix)
      const mesh = child as THREE.Mesh
      if (mesh.isMesh && !child.children.length) {
        const where = groupOf(mesh)
        if (!where) {
          all = false
          continue
        }
        let grp = groups.get(where.key)
        if (!grp) groups.set(where.key, (grp = { kind: where.kind, parts: [], mat: where.mat, source: mesh }))
        grp.parts.push({ mesh, at: m })
        stilled.push(mesh)
      } else if (child.type === 'Group' || child.type === 'Object3D') {
        if (walk(child, m)) stilled.push(child)
        else all = false
      } else all = false // lines (the wires), and anything else this doesn't know how to merge
    }
    return all
  }
  walk(root, new THREE.Matrix4())

  const made: THREE.Mesh[] = []
  for (const { kind, parts, mat, source } of groups.values()) {
    const mesh = new THREE.Mesh(merge(kind, parts), mat)
    mesh.castShadow = source.castShadow
    mesh.receiveShadow = source.receiveShadow
    mesh.customDepthMaterial = source.customDepthMaterial
    mesh.userData = LIVE
    root.add(mesh)
    made.push(mesh)
  }
  // the parts stay mounted but drawn no more, and their matrices stop updating
  for (const o of stilled) {
    o.visible = false
    o.matrixAutoUpdate = false
    o.matrixWorldAutoUpdate = false
  }
  const undo = () => {
    for (const mesh of made) {
      root.remove(mesh)
      mesh.geometry.dispose()
    }
    for (const o of stilled) {
      o.visible = true
      o.matrixAutoUpdate = true
      o.matrixWorldAutoUpdate = true
    }
    bakes.delete(entry)
  }
  const entry = { root, undo }
  bakes.add(entry)
  return undo
}

// the bakes in place, for the dev-only handle below
const bakes = new Set<{ root: THREE.Object3D; undo: () => void }>()

// dev-only handle for test scripts: __bake.off() undoes every bake, __bake.on() redoes them
if (import.meta.env.DEV) {
  const undone: THREE.Object3D[] = []
  Object.assign(window, {
    __bake: {
      off: () => {
        for (const b of [...bakes]) {
          undone.push(b.root)
          b.undo()
        }
      },
      on: () => {
        for (const root of undone.splice(0)) bakeStatic(root)
      },
      count: () => bakes.size,
    },
  })
}
