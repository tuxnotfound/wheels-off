import { memo } from 'react'
import type { ReactNode } from 'react'
import { toonMat } from '../look/materials'
import { BLOCK, DIR, MAX_ROAD } from './worldConfig'
import { building } from './streetGen'

const ROAD = '#6d8378'
const GRASS = '#7da06f'
const FOOT = BLOCK - MAX_ROAD - 2

export type StreetDesc = {
  key: string
  seed: number
  ox: number
  oz: number
  dir: number
  width: number
  kMin: number
  kMax: number
}
export type SceneDesc = { streets: StreetDesc[]; gx: number; gz: number }

/** One street: a single road plane over [kMin,kMax) + lining buildings, all using
 *  shared materials. A flat sibling in the scene (keyed by its path) so it keeps
 *  React identity when its role changes — no remount on a turn. */
const FlatStreet = memo(function FlatStreet({ seed, ox, oz, dir, width, kMin, kMax }: Omit<StreetDesc, 'key'>) {
  const n = kMax - kMin
  if (n <= 0) return null
  const vd = DIR[dir]
  const even = dir % 2 === 0
  const vL = DIR[(dir + 3) % 4]
  const vR = DIR[(dir + 1) % 4]

  const midU = ((kMin + kMax) / 2) * BLOCK
  const len = n * BLOCK
  const segs = Math.max(1, Math.min(48, n * 3))
  const els: ReactNode[] = [
    <mesh
      key="road"
      position={[ox + vd[0] * midU, 0.02, oz + vd[1] * midU]}
      rotation-x={-Math.PI / 2}
      material={toonMat(ROAD)}
    >
      <planeGeometry args={even ? [width, len, 1, segs] : [len, width, segs, 1]} />
    </mesh>,
  ]

  for (let k = kMin; k < kMax; k++) {
    const cu = (k + 0.5) * BLOCK
    const cx = ox + vd[0] * cu
    const cz = oz + vd[1] * cu
    for (const left of [true, false]) {
      const b = building(seed, k, left)
      const v = left ? vL : vR
      const bW = FOOT * b.w
      const bD = FOOT * b.d
      const off = width / 2 + 1.5 + bD / 2
      els.push(
        <mesh
          key={`b${k}${left ? 'L' : 'R'}`}
          position={[cx + v[0] * off, b.h / 2, cz + v[1] * off]}
          material={toonMat(b.color)}
        >
          <boxGeometry args={even ? [bD, b.h, bW] : [bW, b.h, bD]} />
        </mesh>,
      )
    }
  }
  return <>{els}</>
})

export function CityPath({ scene }: { scene: SceneDesc }) {
  const span = 12 * BLOCK
  return (
    <group>
      <mesh
        position={[scene.gx, -0.06, scene.gz]}
        rotation-x={-Math.PI / 2}
        material={toonMat(GRASS)}
      >
        <planeGeometry args={[span, span, 40, 40]} />
      </mesh>
      {scene.streets.map(({ key, ...rest }) => (
        <group key={key}>
          <FlatStreet {...rest} />
        </group>
      ))}
    </group>
  )
}
