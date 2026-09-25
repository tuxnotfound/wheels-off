import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import type * as THREE from 'three'
import { BLOB, CONE, CYL } from '../look/geom'
import { decalMat } from '../look/materials'
import { hazardTex } from '../look/textures'
import { sim } from '../game/sim'
import { M } from './parts'
import type { Obstacle } from './streetGen'
import { BLOCK } from './worldConfig'

function Cone({ x = 0 }: { x?: number }) {
  return (
    <group position={[x, 0, 0]}>
      <M c="#3b3f3e" p={[0, 0.03, 0]} s={[0.5, 0.06, 0.5]} />
      <M g={CONE} c="#f07b3f" p={[0, 0.4, 0]} s={[0.42, 0.72, 0.42]} />
      <M g={CYL} c="#f4f3ea" p={[0, 0.44, 0]} s={[0.25, 0.1, 0.25]} />
    </group>
  )
}

function Body({ ob }: { ob: Obstacle }) {
  switch (ob.kind) {
    case 'cone':
      return <Cone />
    case 'cones':
      return (
        <>
          <Cone x={-1.05} />
          <Cone />
          <Cone x={1.05} />
          <M m={decalMat('hazard', hazardTex())} p={[0, 0.62, 0]} s={[2.3, 0.1, 0.08]} />
        </>
      )
    case 'barrier':
      return (
        <>
          <M m={decalMat('hazard', hazardTex())} p={[0, 0.76, 0]} s={[2.4, 0.3, 0.08]} />
          {[-1, 1].map((x) =>
            [-1, 1].map((z) => (
              <M key={`${x}${z}`} c="#e9ece6" p={[x, 0.44, z * 0.13]} s={[0.08, 0.9, 0.08]} r={[z * 0.3, 0, 0]} />
            )),
          )}
        </>
      )
    case 'boxes':
      return (
        <>
          <M c="#c9a36f" p={[0, 0.23, 0]} s={[0.95, 0.46, 0.8]} />
          <M c="#d8b680" p={[0.1, 0.6, 0.05]} s={[0.65, 0.28, 0.55]} r={[0, 0.35, 0]} />
        </>
      )
    case 'bags':
      return (
        <>
          <M g={BLOB} c="#6f9fc4" p={[-0.3, 0.26, 0]} s={[0.62, 0.52, 0.62]} />
          <M g={BLOB} c="#86b3d1" p={[0.3, 0.24, 0.1]} s={[0.56, 0.48, 0.56]} />
          <M g={BLOB} c="#6f9fc4" p={[0, 0.36, -0.2]} s={[0.5, 0.44, 0.5]} />
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
