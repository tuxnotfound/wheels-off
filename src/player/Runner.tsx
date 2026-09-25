import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import * as THREE from 'three'
import { Outlines } from '@react-three/drei'
import { ToonMaterial } from '../look/ToonMaterial'
import { useKeyboard } from './useKeyboard'
import { navShared } from './navShared'

const INK = '#1a1a1a'

/**
 * The kid: stationary at the world origin, facing -Z. The world moves/turns
 * beneath it. Plays a run cycle and leans into turns (navShared.bank).
 */
export function Runner() {
  const torso = useRef<THREE.Group>(null!)
  const lean = useRef<THREE.Group>(null!)
  const hipL = useRef<THREE.Group>(null!)
  const hipR = useRef<THREE.Group>(null!)
  const keys = useKeyboard()
  const t = useRef(0)

  useFrame((_, dt) => {
    const d = Math.min(dt, 1 / 30)
    lean.current.rotation.z = THREE.MathUtils.lerp(lean.current.rotation.z, navShared.bank, 0.18)
    lean.current.rotation.y = THREE.MathUtils.lerp(lean.current.rotation.y, -navShared.bank * 0.6, 0.18)

    t.current += d * (10 + keys.current.z * 3)
    const swing = Math.sin(t.current)
    torso.current.position.y = Math.abs(swing) * 0.08
    torso.current.rotation.x = 0.16
    hipL.current.rotation.x = swing * 0.9
    hipR.current.rotation.x = -swing * 0.9
  })

  return (
    <group position={[0, 0.8, 0]}>
      <group ref={lean}>
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
          <mesh position={[0, 0.18, 0.26]}>
            <boxGeometry args={[0.42, 0.5, 0.22]} />
            <ToonMaterial color="#c0492f" />
            <Outlines thickness={3} color={INK} screenspace={false} />
          </mesh>
        </group>
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
    </group>
  )
}
