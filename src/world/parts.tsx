import type * as THREE from 'three'
import { CYL, FLAT, PANEL, SMALL_BOX, TRI } from '../look/geom'
import { curvedDepth, toonMat } from '../look/materials'

type V3 = [number, number, number]

/** One mesh from shared geometry + shared material. */
export function M({
  g = SMALL_BOX,
  c,
  m,
  p,
  s,
  r,
}: {
  g?: THREE.BufferGeometry
  c?: string
  m?: THREE.Material | THREE.Material[]
  p: V3
  s: V3
  r?: V3
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
      customDepthMaterial={cast ? curvedDepth : undefined}
    />
  )
}

// Block-local frame: +x is the right of the street, -z is "forward" (u grows).
const at = (s: number, y: number, u: number): V3 => [s, y, -u]

export function UtilityPole({ s, u, transformer }: { s: number; u: number; transformer: boolean }) {
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

export function StopSign({ s, u }: { s: number; u: number }) {
  return (
    <group position={at(s, 0, u)}>
      <M g={CYL} c="#b9bdb5" p={[0, 1.2, 0]} s={[0.09, 2.4, 0.09]} />
      <M g={TRI} c="#d9533f" p={[0, 2.35, 0.06]} s={[0.95, 0.9, 0.06]} />
    </group>
  )
}

