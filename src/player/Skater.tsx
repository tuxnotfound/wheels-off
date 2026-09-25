import { useFrame } from '@react-three/fiber'
import { useCallback, useEffect, useRef } from 'react'
import type * as THREE from 'three'
import { CYL } from '../look/geom'
import { curvedDepth } from '../look/materials'
import { characterUrl } from '../art/art'
import { sim } from '../game/sim'
import { createPoseState, stepPose } from './pose'
import type { Pose } from './pose'
import { Part, ProceduralRider } from './ProceduralRider'
import { VrmRider } from './VrmRider'

const DECK = '#e2b04a'
const WHEELS = '#6cc7b5'

export type ApplyPose = (p: Pose, dt: number) => void
/** A rider registers how it applies the per-frame pose; the skater drives it. */
export type RiderProps = { bind: (apply: ApplyPose | null) => void }

/**
 * The kid on a skateboard, placed in world space from the sim. The pose (stance,
 * push, carve lean, ollie tuck, landing squash, wipeout) is computed once per
 * frame and handed to whichever rider is mounted: a VRM character or the
 * procedural fallback. Everything eases, nothing snaps.
 */
export function Skater() {
  const root = useRef<THREE.Group>(null!)
  const board = useRef<THREE.Group>(null!)
  const st = useRef(createPoseState()).current
  const apply = useRef<ApplyPose | null>(null)
  const bind = useCallback((fn: ApplyPose | null) => {
    apply.current = fn
  }, [])
  const url = useRef(characterUrl()).current

  useEffect(() => {
    board.current.traverse((o) => {
      o.castShadow = true
      o.customDepthMaterial = curvedDepth
    })
  }, [])

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 1 / 20)
    const p = stepPose(st, dt)
    root.current.position.set(sim.px, sim.y, sim.pz)
    root.current.rotation.y = -sim.heading - p.carveYaw
    board.current.rotation.set(p.boardPitch, 0, p.boardRoll)
    apply.current?.(p, dt)
  })

  return (
    <group ref={root}>
      <group ref={board}>
        <Part c={DECK} p={[0, 0.135, 0]} s={[0.25, 0.035, 0.84]} />
        <Part c="#34403e" p={[0, 0.154, 0]} s={[0.235, 0.008, 0.78]} />
        <Part c={DECK} p={[0, 0.16, -0.46]} s={[0.25, 0.035, 0.14]} r={[0.35, 0, 0]} />
        <Part c={DECK} p={[0, 0.16, 0.46]} s={[0.25, 0.035, 0.14]} r={[-0.35, 0, 0]} />
        {[-0.28, 0.28].map((z) => (
          <group key={z}>
            <Part c="#9ea3a0" p={[0, 0.09, z]} s={[0.2, 0.05, 0.06]} />
            {[-0.11, 0.11].map((x) => (
              <Part key={x} g={CYL} c={WHEELS} p={[x, 0.05, z]} s={[0.1, 0.05, 0.1]} r={[0, 0, Math.PI / 2]} />
            ))}
          </group>
        ))}
      </group>
      {url ? <VrmRider url={url} bind={bind} /> : <ProceduralRider bind={bind} />}
    </group>
  )
}
