import * as THREE from 'three'
import type { SolidArt, SolidView } from '../art/art'

// A vehicle or an obstacle from four painted views (ART.md, Vehicles): its shape is where the
// side, front and top outlines overlap, and each surface is painted from the view it faces.

const NZ = 48 // slices nose to tail
const NY = 24 // and up the height; across, the shape is straight, so one is enough

/** A profile's pair at t (0 to 1 over its span): samples are bands, read at their middles. */
function at(a: [number, number][], t: number): [number, number] {
  const f = Math.min(Math.max(t * a.length - 0.5, 0), a.length - 1)
  const i = Math.floor(f)
  const k = f - i
  const [p, q] = [a[i], a[Math.min(i + 1, a.length - 1)]]
  return [p[0] * (1 - k) + q[0] * k, p[1] * (1 - k) + q[1] * k]
}

/** Its left and right edges (x) at height y and at z along it (its nose at -length / 2). */
export function edgesAt(v: SolidArt, y: number, z: number): [number, number] {
  const { front, top } = v.views
  const [f0, f1] = at(v.profile.front, y / front.h)
  const [t0, t1] = at(v.profile.top, (z + top.w / 2) / top.w)
  const [lo, hi] = [Math.max(f0, t0), Math.min(f1, t1)]
  return lo <= hi ? [lo, hi] : [(lo + hi) / 2, (lo + hi) / 2]
}

const geos = new Map<string, THREE.BufferGeometry>()

/**
 * The solid's shape: a box cut in slices, each slice's corners moved onto the outlines. Its
 * nose toward -z, its right toward +x, the ground at y = 0. Cached per id.
 */
export function solidGeometry(v: SolidArt): THREE.BufferGeometry {
  const hit = geos.get(v.id)
  if (hit) return hit
  const { side, front, rear, top } = v.views
  const box = new THREE.BoxGeometry(1, 1, 1, 1, NY, NZ)
  const pos = box.attributes.position
  for (let i = 0; i < pos.count; i++) {
    const z = pos.getZ(i) * side.w
    const t = pos.getZ(i) + 0.5
    const [y0, y1] = at(v.profile.side, t)
    const y = y0 + (pos.getY(i) + 0.5) * (y1 - y0)
    const [x0, x1] = edgesAt(v, y, z)
    pos.setXYZ(i, x0 + (pos.getX(i) + 0.5) * (x1 - x0), y, z)
  }
  box.computeVertexNormals() // smooth across each face of the box, sharp between them
  const g = box.toNonIndexed()
  box.dispose()

  // each triangle painted from the view its face looks along
  const p = g.attributes.position
  const uv = new Float32Array(p.count * 2)
  const [a, b, c, ab, ac, n] = [0, 0, 0, 0, 0, 0].map(() => new THREE.Vector3())
  const put = (i: number, view: SolidView, u: number, w: number) => {
    const [u0, v0, u1, v1] = view.rect
    uv[i * 2] = u0 + Math.min(Math.max(u, 0), 1) * (u1 - u0)
    uv[i * 2 + 1] = v0 + Math.min(Math.max(w, 0), 1) * (v1 - v0)
  }
  for (let f = 0; f < p.count; f += 3) {
    a.fromBufferAttribute(p, f)
    b.fromBufferAttribute(p, f + 1)
    c.fromBufferAttribute(p, f + 2)
    n.crossVectors(ab.subVectors(b, a), ac.subVectors(c, a))
    const [nx, ny, nz] = [Math.abs(n.x), Math.abs(n.y), Math.abs(n.z)]
    for (let k = f; k < f + 3; k++) {
      const x = p.getX(k)
      const y = p.getY(k)
      const z = p.getZ(k)
      if (ny >= nx && ny >= nz && n.y < 0) {
        uv[k * 2] = v.dark[0]
        uv[k * 2 + 1] = v.dark[1]
      } else if (ny >= nx && ny >= nz) {
        // seen from above, nose left: the vehicle's right is at the top of the view
        put(k, top, (z + top.w / 2) / top.w, (x + top.h / 2) / top.h)
      } else if (nx >= nz) {
        put(k, side, (z + side.w / 2) / side.w, y / side.h)
      } else if (n.z < 0) {
        // facing its front, the vehicle's right is on the view's left
        put(k, front, (front.w / 2 - x) / front.w, y / front.h)
      } else {
        put(k, rear, (x + rear.w / 2) / rear.w, y / rear.h)
      }
    }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  geos.set(v.id, g)
  return g
}
