import { useFrame } from '@react-three/fiber'
import { useCallback, useRef } from 'react'
import type * as THREE from 'three'
import { characterUrl } from '../art/art'
import { sim } from '../game/sim'
import { Board } from './Board'
import type { ApplyBoard } from './Board'
import { createPoseState, stepPose } from './pose'
import type { Pose } from './pose'
import { ProceduralRider } from './ProceduralRider'
import { VrmRider } from './VrmRider'

export type ApplyPose = (p: Pose, dt: number) => void
/** A rider registers how it applies the per-frame pose; the skater drives it. */
export type RiderProps = { bind: (apply: ApplyPose | null) => void }

/**
 * The kid on a skateboard, placed in world space from the sim. The pose (stance,
 * push, carve lean, ollie tuck, landing squash, wipeout, kickflip) is computed once per
 * frame and handed to the board and to whichever rider is mounted: a VRM character or
 * the procedural fallback. Everything eases, nothing snaps.
 */
export function Skater() {
  const root = useRef<THREE.Group>(null!)
  const st = useRef(createPoseState()).current
  // dev-only handle for test scripts (animation probes)
  if (import.meta.env.DEV) Object.assign(window, { __pose: st })
  const rider = useRef<ApplyPose | null>(null)
  const board = useRef<ApplyBoard | null>(null)
  const bindRider = useCallback((fn: ApplyPose | null) => {
    rider.current = fn
  }, [])
  const bindBoard = useCallback((fn: ApplyBoard | null) => {
    board.current = fn
  }, [])
  const url = useRef(characterUrl()).current

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 1 / 20)
    const p = stepPose(st, dt)
    root.current.position.set(sim.px, sim.y, sim.pz)
    root.current.rotation.y = -sim.heading - p.carveYaw
    board.current?.(p, dt)
    rider.current?.(p, dt)
  })

  return (
    <group ref={root}>
      <Board bind={bindBoard} />
      {url ? <VrmRider url={url} bind={bindRider} /> : <ProceduralRider bind={bindRider} />}
    </group>
  )
}
