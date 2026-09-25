import { useLayoutEffect, useRef } from 'react'
import type * as THREE from 'three'
import { CYL, SMALL_BOX } from '../look/geom'
import { curvedDepth, toonMat } from '../look/materials'
import { STANCE_YAW } from './pose'
import type { Pose } from './pose'
import type { RiderProps } from './Skater'

const SHIRT = '#f4f1e8'
const PANTS = '#26282b'
const SKIN = '#f3d3b3'
const HAIR = '#1f2024'
const SHOES = '#6cc7b5'
const BAG = '#c9423a'

const LEG = 0.36 // thigh and shin length
const DECK_TOP = 0.16

export function Part({ g = SMALL_BOX, c, p, s, r }: { g?: THREE.BufferGeometry; c: string; p: [number, number, number]; s: [number, number, number]; r?: [number, number, number] }) {
  return <mesh geometry={g} material={toonMat(c)} position={p} scale={s} rotation={r} />
}

type LegRefs = { thigh: THREE.Group; shin: THREE.Group; foot: THREE.Group }

function Leg({ x, set }: { x: number; set: (r: LegRefs) => void }) {
  const refs = useRef<Partial<LegRefs>>({})
  const done = () => {
    const r = refs.current
    if (r.thigh && r.shin && r.foot) set(r as LegRefs)
  }
  return (
    <group position={[x, 0, 0]} ref={(g) => { if (g) { refs.current.thigh = g; done() } }}>
      {/* wide culottes */}
      <mesh position={[0, -0.24, 0]} material={toonMat(PANTS)}>
        <cylinderGeometry args={[0.12, 0.17, 0.5, 14]} />
      </mesh>
      <group position={[0, -LEG, 0]} ref={(g) => { if (g) { refs.current.shin = g; done() } }}>
        <mesh position={[0, -0.2, 0]} material={toonMat(SKIN)}>
          <capsuleGeometry args={[0.048, 0.24, 4, 10]} />
        </mesh>
        <Part g={CYL} c={SHIRT} p={[0, -0.3, 0]} s={[0.12, 0.06, 0.12]} />
        <group position={[0, -LEG, 0]} ref={(g) => { if (g) { refs.current.foot = g; done() } }}>
          <Part c={SHOES} p={[0, 0.035, -0.05]} s={[0.12, 0.08, 0.26]} />
          <Part c="#f4f3ea" p={[0, 0.005, -0.05]} s={[0.125, 0.025, 0.265]} />
        </group>
      </group>
    </group>
  )
}

function Arm({ side, arm, fore }: { side: number; arm: React.RefObject<THREE.Group>; fore: React.RefObject<THREE.Group> }) {
  return (
    <group ref={arm} position={[side * 0.22, 0.46, 0]}>
      <mesh position={[0, -0.13, 0]} material={toonMat(SHIRT)}>
        <capsuleGeometry args={[0.068, 0.18, 4, 10]} />
      </mesh>
      <group ref={fore} position={[0, -0.28, 0]}>
        <mesh position={[0, -0.12, 0]} material={toonMat(SHIRT)}>
          <capsuleGeometry args={[0.058, 0.16, 4, 10]} />
        </mesh>
        <mesh position={[0, -0.27, 0]} material={toonMat(SKIN)}>
          <sphereGeometry args={[0.058, 12, 10]} />
        </mesh>
      </group>
    </group>
  )
}

/** The code-built kid: the fallback rider when no VRM character is configured. */
export function ProceduralRider({ bind }: RiderProps) {
  const rider = useRef<THREE.Group>(null!)
  const body = useRef<THREE.Group>(null!)
  const hips = useRef<THREE.Group>(null!)
  const torso = useRef<THREE.Group>(null!)
  const head = useRef<THREE.Group>(null!)
  const armL = useRef<THREE.Group>(null!)
  const armR = useRef<THREE.Group>(null!)
  const foreL = useRef<THREE.Group>(null!)
  const foreR = useRef<THREE.Group>(null!)
  const legF = useRef<LegRefs | null>(null) // front leg (kid's left)
  const legB = useRef<LegRefs | null>(null) // back leg (kid's right)

  // layout effect: bind/unbind in the same commit that attaches/detaches the refs,
  // so no frame can call this rider's apply after it unmounts
  useLayoutEffect(() => {
    rider.current.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = o.receiveShadow = true
        o.customDepthMaterial = curvedDepth
      }
    })
    bind((p: Pose) => {
      body.current.rotation.y = p.bodyYaw
      head.current.rotation.y = p.headYaw
      hips.current.position.y = 2 * LEG * Math.cos(p.frontBend) + 0.01 - p.hipDrop
      if (legF.current) {
        legF.current.thigh.rotation.x = p.frontBend
        legF.current.shin.rotation.x = -2 * p.frontBend
        legF.current.foot.rotation.x = p.frontBend
      }
      if (legB.current) {
        legB.current.thigh.rotation.x = p.backThigh
        legB.current.shin.rotation.x = p.backShin
        legB.current.foot.rotation.x = p.backFoot
      }
      torso.current.rotation.x = p.torsoLean
      armL.current.rotation.set(p.armSwing, 0, -p.armOut)
      armR.current.rotation.set(-p.armSwing, 0, p.armOut)
      foreL.current.rotation.x = p.elbow
      foreR.current.rotation.x = p.elbow
      rider.current.rotation.set(p.riderPitch, 0, p.roll)
    })
    return () => bind(null)
  }, [bind])

  return (
    <group ref={rider} position={[0, DECK_TOP, 0]}>
      <group ref={body} rotation-y={STANCE_YAW}>
        <group ref={hips}>
          <Leg x={-0.13} set={(r) => (legF.current = r)} />
          <Leg x={0.13} set={(r) => (legB.current = r)} />
          <group ref={torso}>
            <mesh position={[0, 0.02, 0]} material={toonMat(PANTS)}>
              <cylinderGeometry args={[0.2, 0.21, 0.16, 16]} />
            </mesh>
            <mesh position={[0, 0.3, 0]} material={toonMat(SHIRT)}>
              <capsuleGeometry args={[0.19, 0.26, 6, 16]} />
            </mesh>
            {/* messenger bag on the back, strap across the chest */}
            <Part c={BAG} p={[-0.06, 0.16, 0.22]} s={[0.3, 0.26, 0.1]} r={[0.1, 0, 0.1]} />
            <Part c="#f4f3ea" p={[-0.06, 0.19, 0.275]} s={[0.12, 0.08, 0.01]} r={[0.1, 0, 0.1]} />
            <Part c="#7d2b25" p={[0, 0.33, -0.19]} s={[0.05, 0.62, 0.03]} r={[0, 0, 0.62]} />
            <Part c="#7d2b25" p={[0, 0.33, 0.19]} s={[0.05, 0.62, 0.03]} r={[0, 0, -0.62]} />
            <Arm side={-1} arm={armL} fore={foreL} />
            <Arm side={1} arm={armR} fore={foreR} />
            <group ref={head} position={[0, 0.74, 0]}>
              <mesh material={toonMat(SKIN)}>
                <sphereGeometry args={[0.165, 20, 16]} />
              </mesh>
              {/* black bob: a cap plus a skirt open at the face */}
              <mesh position={[0, 0.015, 0.01]} material={toonMat(HAIR)}>
                <sphereGeometry args={[0.182, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55]} />
              </mesh>
              <mesh position={[0, -0.06, 0.01]} material={toonMat(HAIR, true)}>
                <cylinderGeometry args={[0.18, 0.2, 0.2, 18, 1, true, Math.PI * -0.72, Math.PI * 1.44]} />
              </mesh>
              <Part c={HAIR} p={[0, 0.09, -0.15]} s={[0.28, 0.07, 0.06]} r={[0.35, 0, 0]} />
            </group>
          </group>
        </group>
      </group>
    </group>
  )
}
