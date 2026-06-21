import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useRef } from 'react'
import * as THREE from 'three'
import { Road } from '../world/Road'
import { Runner } from '../player/Runner'

const SKY = '#bcd9cf'

/** Simple damped third-person camera trailing behind + above the runner. */
function FollowCam({ targetRef }: { targetRef: React.RefObject<THREE.Group | null> }) {
  const camera = useThree((s) => s.camera)
  const look = useRef(new THREE.Vector3(0, 1.2, -6))
  useFrame((_, dt) => {
    const t = targetRef.current
    if (!t) return
    const d = Math.min(dt, 1 / 30)
    camera.position.x = THREE.MathUtils.damp(camera.position.x, t.position.x * 0.5, 4, d)
    camera.position.y = THREE.MathUtils.damp(camera.position.y, 3.2, 4, d)
    camera.position.z = THREE.MathUtils.damp(camera.position.z, t.position.z + 7, 6, d)
    look.current.x = THREE.MathUtils.damp(look.current.x, t.position.x, 5, d)
    look.current.y = THREE.MathUtils.damp(look.current.y, 1.2, 5, d)
    look.current.z = THREE.MathUtils.damp(look.current.z, t.position.z - 6, 5, d)
    camera.lookAt(look.current)
    // NOTE: no useFrame priority here — a priority > 0 disables r3f's auto-render.
    // Same-priority callbacks run in mount order, so this still runs after <Runner/>.
  })
  return null
}

export default function GameCanvas() {
  const runnerRef = useRef<THREE.Group>(null)
  return (
    <Canvas
      className="game-canvas"
      camera={{ fov: 70, near: 0.1, far: 400, position: [0, 3.2, 7] }}
      dpr={[1, 2]}
    >
      <color attach="background" args={[SKY]} />
      <fog attach="fog" args={[SKY, 45, 150]} />
      <hemisphereLight args={[0xffffff, 0x6b7d76, 1.0]} />
      <directionalLight position={[6, 12, 4]} intensity={1.2} />
      <Road targetRef={runnerRef} />
      <Runner ref={runnerRef} />
      <FollowCam targetRef={runnerRef} />
    </Canvas>
  )
}
