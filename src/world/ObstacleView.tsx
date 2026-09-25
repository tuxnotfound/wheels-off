import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import type * as THREE from 'three'
import { CONE, CYL, SPHERE } from '../look/geom'
import { decalMat } from '../look/materials'
import { cardboardTex, hazardTex } from '../look/textures'
import { M } from './parts'
import { sim } from '../game/sim'
import type { Obstacle } from './streetGen'
import { BLOCK } from './worldConfig'

const INK_DARK = '#2f3332'
const WHITE = '#f1f1ea'

/** Traffic cone: rubber base, tapering body, two reflective bands. */
function Cone({ x = 0 }: { x?: number }) {
  return (
    <group position={[x, 0, 0]}>
      <M c={INK_DARK} p={[0, 0.03, 0]} s={[0.5, 0.06, 0.5]} />
      <M g={CONE} c="#f07b3f" p={[0, 0.42, 0]} s={[0.4, 0.72, 0.4]} />
      <M g={CYL} c={WHITE} p={[0, 0.3, 0]} s={[0.28, 0.08, 0.28]} />
      <M g={CYL} c={WHITE} p={[0, 0.5, 0]} s={[0.17, 0.07, 0.17]} />
    </group>
  )
}

/** Solid, toon-shaded obstacles: they get jumped over and knocked flying, so they need volume. */
function Body({ ob }: { ob: Obstacle }) {
  const hazard = decalMat('hazard', hazardTex())
  const cardboard = decalMat('cardboard', cardboardTex())
  switch (ob.kind) {
    case 'cone':
      return <Cone />
    case 'cones':
      return (
        <>
          <Cone x={-1.05} />
          <Cone />
          <Cone x={1.05} />
          <M m={hazard} p={[-0.52, 0.64, 0]} s={[0.95, 0.1, 0.05]} />
          <M m={hazard} p={[0.52, 0.64, 0]} s={[0.95, 0.1, 0.05]} />
        </>
      )
    case 'barrier':
      return (
        <>
          <M m={hazard} p={[0, 0.74, 0]} s={[2.4, 0.32, 0.06]} />
          {[-1, 1].map((x) => (
            <group key={x} position={[x, 0, 0]}>
              <M c={WHITE} p={[0, 0.45, 0.13]} s={[0.07, 0.95, 0.07]} r={[0.28, 0, 0]} />
              <M c={WHITE} p={[0, 0.45, -0.13]} s={[0.07, 0.95, 0.07]} r={[-0.28, 0, 0]} />
              <M c="#d9533f" p={[0, 0.03, 0]} s={[0.1, 0.06, 0.62]} />
            </group>
          ))}
          <M g={CYL} c={INK_DARK} p={[1, 0.95, 0]} s={[0.08, 0.1, 0.08]} />
          <M g={SPHERE} c="#f2c230" p={[1, 1.05, 0]} s={[0.16, 0.16, 0.16]} />
        </>
      )
    case 'boxes':
      return (
        <>
          <M m={cardboard} p={[0, 0.23, 0]} s={[0.95, 0.46, 0.8]} />
          <M m={cardboard} p={[0.08, 0.61, 0.04]} s={[0.62, 0.3, 0.52]} r={[0, 0.35, 0]} />
          <M m={cardboard} p={[-0.62, 0.16, 0.22]} s={[0.36, 0.32, 0.36]} r={[0, -0.4, 0]} />
        </>
      )
    case 'bags':
      return (
        <>
          {[
            [-0.32, 0.27, 0.05, 0.62, '#7fb0d6'],
            [0.3, 0.25, 0.12, 0.58, '#9cc3de'],
            [0.02, 0.3, -0.22, 0.56, '#e9ece6'],
          ].map(([x, y, z, d, c], i) => (
            <group key={i} position={[x as number, 0, z as number]}>
              {/* lumpy bag: a squashed body, a shoulder bulge, and the tied tuft on top */}
              <M g={SPHERE} c={c as string} p={[0, y as number, 0]} s={[d as number, (d as number) * 0.85, (d as number) * 0.9]} r={[0.15, i, 0.1]} />
              <M g={SPHERE} c={c as string} p={[0.08, (y as number) * 1.45, 0.03]} s={[(d as number) * 0.55, (d as number) * 0.45, (d as number) * 0.55]} />
              <M g={CONE} c={c as string} p={[0.05, (y as number) * 2 + 0.06, 0]} s={[0.16, 0.2, 0.16]} />
              <M g={CONE} c={c as string} p={[0.14, (y as number) * 2 + 0.04, 0]} s={[0.07, 0.14, 0.07]} r={[0, 0, -0.9]} />
            </group>
          ))}
        </>
      )
  }
}

/** A jumpable obstacle in block-local coords. When hit it tumbles away down the road. */
export function ObstacleView({ ob, k }: { ob: Obstacle; k: number }) {
  const ref = useRef<THREE.Group>(null!)
  const z0 = -(ob.u - k * BLOCK)
  useFrame(() => {
    const t = sim.hits.get(ob.id)
    const g = ref.current
    if (t === undefined) {
      if (!g.visible || g.position.z !== z0) {
        g.visible = true
        g.position.set(ob.s, 0, z0)
        g.rotation.set(0, 0, 0)
      }
      return
    }
    const tt = sim.time - t
    const y = 3.2 * tt - 9 * tt * tt
    g.visible = y > -0.6
    const dir = ob.s >= 0 ? 1 : -1
    g.position.set(ob.s + dir * tt * 2.2, Math.max(y, -1), z0 - tt * 7)
    g.rotation.set(-tt * 7, 0, dir * tt * 4)
  })
  return (
    <group ref={ref} position={[ob.s, 0, z0]}>
      <Body ob={ob} />
    </group>
  )
}
