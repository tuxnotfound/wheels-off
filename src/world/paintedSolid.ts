import * as THREE from 'three'
import { paintedMat } from '../art/art'
import type { SolidArt, SolidView } from '../art/art'
import { patchCurve } from '../look/materials'

// A vehicle or an obstacle from four painted views (ART.md, Vehicles): its shape is where the
// side, front and top outlines overlap, and each surface is painted from the view it faces.

const NZ = 48 // slices nose to tail
const NY = 24 // and up the height; across, the shape is straight, so one is enough
const SHARP = 10 // how quickly a view's weight falls off as a surface turns away from it
// A vehicle's last 20 cm of each side, at the nose and the tail, take the end view: its edge carries
// round the corner. The model draws a wraparound lamp on the side and on the rear inconsistently
// (one car had a strip of rear glass behind its side lamp), and two lamps met at the corner, not
// one. Not an obstacle's: on a box, the end's edge carried over its front left a dark band.
const END_REACH = 0.2
const END_RAMP = 0.04
// An open vehicle (a scooter, a bicycle) steps up and down along its length (a saddle, a basket,
// handlebars), and every step faces an end: painted from that end's view, each step showed a
// second basket. A step takes the end's view only where nothing of the vehicle stands between it
// and that end, as the view shows it; behind something, it takes the side view carried across,
// as a frame or a seat seen end-on looks.

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

  // every point painted from all three views it can be seen in (the side, the end it faces, the
  // top), weighted by how squarely it faces each: a rounded corner fades from one view into the
  // next. Chosen per triangle, the views flipped back and forth over a corner (a tail lamp painted
  // twice, a pillar in teeth, a stripe across a fender where a view landed at a grazing angle).
  // The underside takes ink in the top's place.
  const p = box.attributes.position
  const nrm = box.attributes.normal
  const reach = v.kind === 'kei-car' || v.kind === 'kei-truck' || v.kind === 'van' ? END_REACH : 0
  const open = v.kind === 'scooter' || v.kind === 'bicycle'
  const filled = (x: number, y: number, z: number) => {
    const [y0, y1] = at(v.profile.side, z / side.w + 0.5)
    if (y < y0 || y > y1) return false
    const [x0, x1] = edgesAt(v, y, z)
    return x >= x0 && x <= x1
  }
  // nothing of it from a slice and a half on, toward the end at dir (-1 the nose)
  const clear = (x: number, y: number, z: number, dir: number) => {
    const dz = side.w / NZ
    for (let zz = z + dir * 1.5 * dz; Math.abs(zz) < side.w / 2; zz += (dir * dz) / 2) if (filled(x, y, zz)) return false
    return true
  }
  const uvSide = new Float32Array(p.count * 2)
  const uvEnd = new Float32Array(p.count * 2)
  const uvTop = new Float32Array(p.count * 2)
  const weights = new Float32Array(p.count * 3)
  const put = (out: Float32Array, i: number, view: SolidView, u: number, w: number) => {
    const [u0, v0, u1, v1] = view.rect
    out[i * 2] = u0 + Math.min(Math.max(u, 0), 1) * (u1 - u0)
    out[i * 2 + 1] = v0 + Math.min(Math.max(w, 0), 1) * (v1 - v0)
  }
  for (let i = 0; i < p.count; i++) {
    const [x, y, z] = [p.getX(i), p.getY(i), p.getZ(i)]
    const [nx, ny, nz] = [nrm.getX(i), nrm.getY(i), nrm.getZ(i)]
    put(uvSide, i, side, (z + side.w / 2) / side.w, y / side.h)
    // facing its front, the solid's right is on the view's left. The end it faces, or on a side,
    // the end it is near
    if (Math.abs(nz) > 0.3 ? nz < 0 : z < 0) put(uvEnd, i, front, (front.w / 2 - x) / front.w, y / front.h)
    else put(uvEnd, i, rear, (x + rear.w / 2) / rear.w, y / rear.h)
    if (ny < 0) [uvTop[i * 2], uvTop[i * 2 + 1]] = v.dark
    // seen from above, nose left: the solid's right is at the top of the view
    else put(uvTop, i, top, (z + top.w / 2) / top.w, (x + top.h / 2) / top.h)
    // the side's weight handed to the end view near the nose and the tail
    const fromEnd = side.w / 2 - Math.abs(z)
    if (open) {
      const end = Math.abs(nz) > 0.3 && clear(x, y, z, Math.sign(nz)) ? Math.abs(nz) ** SHARP : 0
      const up = Math.abs(ny) ** SHARP
      weights.set([1 - end - up, end, up], i * 3)
      continue
    }
    const keep = reach ? THREE.MathUtils.smoothstep(fromEnd, reach - END_RAMP, reach) : 1
    weights[i * 3] = Math.abs(nx) ** SHARP * keep
    weights[i * 3 + 1] = Math.abs(nz) ** SHARP + Math.abs(nx) ** SHARP * (1 - keep)
    weights[i * 3 + 2] = Math.abs(ny) ** SHARP
  }
  box.setAttribute('uv', new THREE.BufferAttribute(uvSide, 2))
  box.setAttribute('uvEnd', new THREE.BufferAttribute(uvEnd, 2))
  box.setAttribute('uvTop', new THREE.BufferAttribute(uvTop, 2))
  box.setAttribute('viewW', new THREE.BufferAttribute(weights, 3))
  geos.set(v.id, box)
  return box
}

const mats = new Map<string, THREE.MeshToonMaterial>()

/**
 * A painted solid's material: the painted art's (toon, curved like the world), sampling its
 * texture three times, at the side, end and top views, mixed by the weights. Left out of the
 * block's batching (bake.ts), which keeps only one set of UVs.
 */
export function solidMat(path: string): THREE.MeshToonMaterial {
  let m = mats.get(path)
  if (!m) {
    m = paintedMat(path).clone()
    m.userData.solid = true
    m.onBeforeCompile = (sh) => {
      patchCurve(sh)
      const decl = 'varying vec2 vUvEnd;\nvarying vec2 vUvTop;\nvarying vec3 vViewW;'
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>\nattribute vec2 uvEnd;\nattribute vec2 uvTop;\nattribute vec3 viewW;\n${decl}`)
        .replace('#include <uv_vertex>', '#include <uv_vertex>\nvUvEnd = uvEnd;\nvUvTop = uvTop;\nvViewW = viewW;')
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\n${decl}`).replace(
        '#include <map_fragment>',
        `vec3 sw = vViewW / max(vViewW.x + vViewW.y + vViewW.z, 1e-4);
        diffuseColor *= texture2D(map, vMapUv) * sw.x + texture2D(map, vUvEnd) * sw.y + texture2D(map, vUvTop) * sw.z;`,
      )
    }
    m.customProgramCacheKey = () => 'toon-curve-solid'
    mats.set(path, m)
  }
  return m
}
