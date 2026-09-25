import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import type * as THREE from 'three'
import { propArt } from '../art/art'
import { Card } from './painted'
import { sim } from '../game/sim'
import type { Obstacle } from './streetGen'
import { BLOCK } from './worldConfig'

/** Painted obstacle: crossed cards read from any angle, flat ones face the rider. */
function Body({ ob }: { ob: Obstacle }) {
  const a = propArt(`ob-${ob.kind}`)
  if (!a) return null
  return <Card path={a.image} w={a.width} h={a.height} p={[0, 0, 0]} cross={a.mode === 'cross'} double />
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
