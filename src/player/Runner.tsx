import { useFrame } from '@react-three/fiber'
import { forwardRef, useImperativeHandle, useRef } from 'react'
import * as THREE from 'three'
import { Outlines } from '@react-three/drei'
import { ToonMaterial } from '../look/ToonMaterial'
import { useKeyboard } from './useKeyboard'

const INK = '#1a1a1a'

/**
 * Toon-shaded placeholder kid that auto-runs forward (-Z) down the endless road.
 * W/S speed up / slow down, A/D strafe within the road. Exposes its root group
 * ref so the camera (and road recycler) can read its position.
 */
export const Runner = forwardRef<THREE.Group>(function Runner(_props, ref) {
  const group = useRef<THREE.Group>(null!)
  const torso = useRef<THREE.Group>(null!)
  const hipL = useRef<THREE.Group>(null!)
  const hipR = useRef<THREE.Group>(null!)
  useImperativeHandle(ref, () => group.current)

  const keys = useKeyboard()
  const t = useRef(0)

  useFrame((_, dt) => {
    const d = Math.min(dt, 1 / 30)
    const speed = 7 + keys.current.z * 3 // always >0 => endless forward run
    group.current.position.z -= speed * d
    group.current.position.x = THREE.MathUtils.clamp(
      group.current.position.x + keys.current.x * 5 * d,
      -3,
      3,
    )
    group.current.position.y = 0.8
    group.current.rotation.y = THREE.MathUtils.lerp(group.current.rotation.y, -keys.current.x * 0.35, 0.15)

    // run cycle
    t.current += d * 11
    const swing = Math.sin(t.current)
    torso.current.position.y = Math.abs(swing) * 0.08
    torso.current.rotation.x = 0.16
    hipL.current.rotation.x = swing * 0.9
    hipR.current.rotation.x = -swing * 0.9
  })

  return (
    <group ref={group} position={[0, 0.8, 0]}>
      <group ref={torso}>
        <mesh position={[0, 0.15, 0]}>
          <capsuleGeometry args={[0.34, 0.6, 8, 16]} />
          <ToonMaterial color="#e9e4d8" />
          <Outlines thickness={4} color={INK} screenspace={false} />
        </mesh>
        <mesh position={[0, 0.82, 0]}>
          <sphereGeometry args={[0.27, 24, 16]} />
          <ToonMaterial color="#f2d2ad" />
          <Outlines thickness={4} color={INK} screenspace={false} />
        </mesh>
        {/* red "Hi!" backpack nod to the reference */}
        <mesh position={[0, 0.18, 0.26]}>
          <boxGeometry args={[0.42, 0.5, 0.22]} />
          <ToonMaterial color="#c0492f" />
          <Outlines thickness={3} color={INK} screenspace={false} />
        </mesh>
      </group>

      {/* legs pivot from the hips */}
      <group ref={hipL} position={[-0.16, -0.1, 0]}>
        <mesh position={[0, -0.32, 0]}>
          <capsuleGeometry args={[0.12, 0.45, 6, 12]} />
          <ToonMaterial color="#2f3a44" />
          <Outlines thickness={3} color={INK} screenspace={false} />
        </mesh>
      </group>
      <group ref={hipR} position={[0.16, -0.1, 0]}>
        <mesh position={[0, -0.32, 0]}>
          <capsuleGeometry args={[0.12, 0.45, 6, 12]} />
          <ToonMaterial color="#2f3a44" />
          <Outlines thickness={3} color={INK} screenspace={false} />
        </mesh>
      </group>
    </group>
  )
})
