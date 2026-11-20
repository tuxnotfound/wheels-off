import * as THREE from 'three'
import { CYL, FLAT, PANEL, SMALL_BOX, TRI } from '../look/geom'
import { curvedDepth, toonMat } from '../look/materials'
import { paintedDepth, paintedMat, poleArt, propArt, silhouetteMat } from '../art/art'
import type { PropArt } from '../art/art'
import { CURB } from './worldConfig'

type V3 = [number, number, number]

/** One mesh from shared geometry + shared material. */
export function M({
  g = SMALL_BOX,
  c,
  m,
  p,
  s,
  r,
  d,
}: {
  g?: THREE.BufferGeometry
  c?: string
  m?: THREE.Material | THREE.Material[]
  p: V3
  s: V3
  r?: V3
  d?: THREE.Material // its shadow's, when cut out (painted art)
}) {
  // flat pieces (road, paint, decals) only receive shadows
  const cast = g !== FLAT && g !== PANEL
  return (
    <mesh
      geometry={g}
      material={m ?? toonMat(c!)}
      position={p}
      scale={s}
      rotation={r}
      castShadow={cast}
      receiveShadow
      customDepthMaterial={cast ? (d ?? curvedDepth) : undefined}
    />
  )
}

// Block-local frame: +x is the right of the street, -z is "forward" (u grows).
const at = (s: number, y: number, u: number): V3 => [s, y, -u]

const crossed = new Map<string, THREE.BufferGeometry>()

/**
 * One plane of a crossed card, a unit square from its foot up: across x (its front) or, turned,
 * across z (its side). Two faces back to back, so it shows from behind mirrored, and every
 * normal along x toward nx: both planes take the light as one surface facing the road, not
 * one lit and one in shade.
 */
function crossedPlane(turned: boolean, nx: number): THREE.BufferGeometry {
  const key = `${turned}:${nx}`
  let g = crossed.get(key)
  if (!g) {
    g = new THREE.BufferGeometry()
    const p = turned ? [0, 0, -0.5, 0, 0, 0.5, 0, 1, 0.5, 0, 1, -0.5] : [-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0]
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3))
    g.setAttribute('normal', new THREE.Float32BufferAttribute([nx, 0, 0, nx, 0, 0, nx, 0, 0, nx, 0, 0], 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2))
    g.setIndex([0, 1, 2, 0, 2, 3, 0, 2, 1, 0, 3, 2])
    crossed.set(key, g)
  }
  return g
}

/** A painted piece as two crossed planes, its front across x and its side across z. */
function Crossed({ front, side, p, nx }: { front: { image: string; width: number; height: number }; side: { image: string; width: number; height: number }; p: V3; nx: number }) {
  const plane = (v: typeof front, turned: boolean) => (
    <mesh
      geometry={crossedPlane(turned, nx)}
      material={paintedMat(v.image)}
      scale={turned ? [1, v.height, v.width] : [v.width, v.height, 1]}
      castShadow
      receiveShadow
      customDepthMaterial={paintedDepth(v.image)}
    />
  )
  return (
    <group position={p}>
      {plane(front, false)}
      {plane(side, true)}
    </group>
  )
}

/** The painted pole (ART.md, Utility poles), standing on the sidewalk, lit as if facing the road. */
function PaintedPole({ a, s, transformer }: { a: PropArt; s: number; transformer: boolean }) {
  const nx = -Math.sign(s)
  const t = transformer ? a.transformer : undefined
  return (
    <>
      <Crossed front={a} side={a.side!} p={[0, CURB, 0]} nx={nx} />
      {/* the transformer hangs on the road side of the shaft, the same can seen any way round */}
      {t && <Crossed front={t} side={t} p={[nx * ((a.shaft ?? 0.3) / 2 + t.width * 0.42), CURB + t.y, 0]} nx={nx} />}
    </>
  )
}

export function UtilityPole({ s, u, transformer }: { s: number; u: number; transformer: boolean }) {
  const painted = poleArt()
  if (painted) {
    return (
      <group position={at(s, 0, u)}>
        <PaintedPole a={painted} s={s} transformer={transformer} />
      </group>
    )
  }
  return (
    <group position={at(s, 0, u)}>
      <M g={CYL} c="#9a9d95" p={[0, 4, 0]} s={[0.26, 8, 0.26]} />
      <M c="#7d817a" p={[0, 7.45, 0]} s={[1.6, 0.12, 0.14]} />
      <M c="#7d817a" p={[0, 6.9, 0]} s={[1.0, 0.1, 0.12]} />
      {transformer && <M g={CYL} c="#aab0a8" p={[0.32 * Math.sign(-s), 6.1, 0]} s={[0.5, 0.9, 0.5]} />}
      <M c="#e8b64a" p={[0, 2.2, 0.14]} s={[0.3, 0.9, 0.04]} />
    </group>
  )
}

const SIGN_TOP = 2.75 // the painted plate's top edge, in meters from the road

export function StopSign({ s, u }: { s: number; u: number }) {
  const a = propArt('stop-sign')
  if (a) {
    // the painted plate toward oncoming riders, its plain metal back the other way, on a post
    const plate = (front: boolean) => (
      <mesh
        geometry={PANEL}
        material={front ? paintedMat(a.image, false, a.glow) : silhouetteMat(a.image, '#a9ada6')}
        position={[0, SIGN_TOP - a.height / 2, front ? 0.07 : 0.06]}
        rotation={[0, front ? 0 : Math.PI, 0]}
        scale={[a.width, a.height, 1]}
        castShadow
        receiveShadow
        customDepthMaterial={paintedDepth(a.image)}
      />
    )
    return (
      <group position={at(s, 0, u)}>
        <M g={CYL} c="#b9bdb5" p={[0, (SIGN_TOP - 0.15) / 2, 0]} s={[0.07, SIGN_TOP - 0.15, 0.07]} />
        {plate(true)}
        {plate(false)}
      </group>
    )
  }
  return (
    <group position={at(s, 0, u)}>
      <M g={CYL} c="#b9bdb5" p={[0, 1.2, 0]} s={[0.09, 2.4, 0.09]} />
      <M g={TRI} c="#d9533f" p={[0, 2.35, 0.06]} s={[0.95, 0.9, 0.06]} />
    </group>
  )
}

