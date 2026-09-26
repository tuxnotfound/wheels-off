import { useLayoutEffect, useRef } from 'react'
import * as THREE from 'three'
import { CYL, SMALL_BOX } from '../look/geom'
import { curvedDepth, riderMat } from '../look/materials'
import { DECK_TOP, STANCE_YAW, footFlat, riderLeg, solveLeg, toBody } from './pose'
import type { Foot, LegAngles, Pose } from './pose'
import type { RiderProps } from './Skater'

const SHIRT = '#f4f1e8'
const SKIN = '#f3d3b3'
const HAIR = '#1f2024'
const SHOES = '#6cc7b5'
const BAG = '#c9423a'
export const BEANIE = '#d4513f'
export const BEANIE_CUFF = '#b8402f'
export const BEANIE_TAG = '#f4ecd8'
export const PHONES = '#f1ede4'
export const PANTS = '#34405e'
export const PANTS_SHADE = '#222a3f'
export const PHONES_CAP = '#5ec4b3'

const LEG = 0.36 // thigh and shin length
const HIP_X = 0.13

const ik: LegAngles = { abduct: 0, thigh: 0, knee: 0 }
const v = new THREE.Vector3()
const hip = new THREE.Vector3()
const q = new THREE.Quaternion()
const e = new THREE.Euler()

/**
 * One leg reaching its foot target. The IK solver works facing +Z; this kid faces -Z,
 * a half turn about Y, which flips the X and Z rotations (and vectors).
 */
function reachFoot(leg: LegRefs, foot: Foot, p: Pose, side: number, pelvis: THREE.Vector3) {
  hip.set(pelvis.x + side * HIP_X, pelvis.y, pelvis.z)
  toBody(foot.pos, p.bodyYaw, v).sub(hip)
  v.set(-v.x, v.y, -v.z)
  const twist = foot.yaw - p.bodyYaw
  solveLeg(v, twist, LEG, LEG, ik)
  leg.thigh.quaternion.setFromEuler(e.set(-ik.thigh, twist, -ik.abduct, 'YZX'))
  leg.shin.quaternion.setFromEuler(e.set(-ik.knee, 0, 0, 'XYZ'))
  footFlat(ik, foot.toe, q)
  leg.foot.quaternion.set(-q.x, q.y, -q.z, q.w)
}

function Part({ g = SMALL_BOX, c, p, s, r }: { g?: THREE.BufferGeometry; c: string; p: [number, number, number]; s: [number, number, number]; r?: [number, number, number] }) {
  return <mesh geometry={g} material={riderMat(c)} position={p} scale={s} rotation={r} />
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
      <mesh position={[0, -0.24, 0]} material={riderMat(PANTS)}>
        <cylinderGeometry args={[0.12, 0.17, 0.5, 14]} />
      </mesh>
      <group position={[0, -LEG, 0]} ref={(g) => { if (g) { refs.current.shin = g; done() } }}>
        <mesh position={[0, -0.2, 0]} material={riderMat(SKIN)}>
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
      <mesh position={[0, -0.13, 0]} material={riderMat(SHIRT)}>
        <capsuleGeometry args={[0.068, 0.18, 4, 10]} />
      </mesh>
      <group ref={fore} position={[0, -0.28, 0]}>
        <mesh position={[0, -0.12, 0]} material={riderMat(SHIRT)}>
          <capsuleGeometry args={[0.058, 0.16, 4, 10]} />
        </mesh>
        <mesh position={[0, -0.27, 0]} material={riderMat(SKIN)}>
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
    Object.assign(riderLeg, { len: 2 * LEG, ankle: 0, hipX: HIP_X, foot: 0.13 })
    const pelvis = new THREE.Vector3()
    bind((p: Pose) => {
      rider.current.position.y = DECK_TOP + p.riderLift
      body.current.rotation.y = p.bodyYaw
      head.current.rotation.set(-p.torsoLean * 0.65, p.headYaw, -p.torsoSide * 0.7)
      toBody(p.pelvis, p.bodyYaw, pelvis)
      hips.current.position.copy(pelvis)
      if (legF.current) reachFoot(legF.current, p.front, p, -1, pelvis)
      if (legB.current) reachFoot(legB.current, p.back, p, 1, pelvis)
      torso.current.rotation.set(p.torsoLean, p.spineYaw, p.torsoSide)
      armL.current.rotation.set(p.armSwing, 0, -p.armOut)
      armR.current.rotation.set(-p.armSwing, 0, p.armOut)
      foreL.current.rotation.x = p.elbowL
      foreR.current.rotation.x = p.elbowR
      rider.current.rotation.set(p.riderPitch, 0, p.roll)
    })
    return () => bind(null)
  }, [bind])

  return (
    <group ref={rider} position={[0, DECK_TOP, 0]}>
      <group ref={body} rotation-y={STANCE_YAW}>
        <group ref={hips}>
          <Leg x={-HIP_X} set={(r) => (legF.current = r)} />
          <Leg x={HIP_X} set={(r) => (legB.current = r)} />
          <group ref={torso}>
            <mesh position={[0, 0.02, 0]} material={riderMat(PANTS)}>
              <cylinderGeometry args={[0.2, 0.21, 0.16, 16]} />
            </mesh>
            <mesh position={[0, 0.3, 0]} material={riderMat(SHIRT)}>
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
              <mesh material={riderMat(SKIN)}>
                <sphereGeometry args={[0.165, 20, 16]} />
              </mesh>
              {/* black bob: a cap plus a skirt open at the face */}
              <mesh position={[0, 0.015, 0.01]} material={riderMat(HAIR)}>
                <sphereGeometry args={[0.182, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55]} />
              </mesh>
              <mesh position={[0, -0.06, 0.01]} material={riderMat(HAIR, true)}>
                <cylinderGeometry args={[0.18, 0.2, 0.2, 18, 1, true, Math.PI * -0.72, Math.PI * 1.44]} />
              </mesh>
              <Part c={HAIR} p={[0, 0.09, -0.15]} s={[0.28, 0.07, 0.06]} r={[0.35, 0, 0]} />
              {/* beanie, rim above the bangs, tipped back */}
              <group position={[0, 0.06, 0.01]} rotation-x={0.28}>
                <mesh material={riderMat(BEANIE)} scale={[0.2, 0.17, 0.2]}>
                  <sphereGeometry args={[1, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
                </mesh>
                <mesh material={riderMat(BEANIE_CUFF)} position-y={0.015} scale={[0.207, 0.06, 0.207]}>
                  <cylinderGeometry args={[1, 1.02, 1, 24]} />
                </mesh>
                {/* headphones over the beanie */}
                <mesh material={riderMat(PHONES)} position-y={-0.01} scale={[1, 1.19, 1]}>
                  <torusGeometry args={[0.222, 0.011, 8, 32, Math.PI]} />
                </mesh>
                {[-1, 1].map((s) => (
                  <group key={s} position={[s * 0.215, -0.05, 0]} rotation-z={Math.PI / 2}>
                    <mesh material={riderMat(PHONES)}>
                      <cylinderGeometry args={[0.06, 0.06, 0.045, 20]} />
                    </mesh>
                    <mesh material={riderMat(PHONES_CAP)} position-y={-s * 0.028}>
                      <cylinderGeometry args={[0.045, 0.045, 0.015, 20]} />
                    </mesh>
                  </group>
                ))}
              </group>
            </group>
          </group>
        </group>
      </group>
    </group>
  )
}
