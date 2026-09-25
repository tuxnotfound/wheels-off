import { useFrame } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { CYL, SMALL_BOX } from '../look/geom'
import { curvedDepth, toonMat } from '../look/materials'
import { input } from './input'
import { sim } from '../game/sim'

const SHIRT = '#f4f1e8'
const PANTS = '#26282b'
const SKIN = '#f3d3b3'
const HAIR = '#1f2024'
const SHOES = '#6cc7b5'
const BAG = '#c9423a'
const DECK = '#e2b04a'

const LEG = 0.36 // thigh and shin length
const DECK_TOP = 0.16
const STANCE_YAW = -1.15 // regular stance: chest faces the right of the board
const PUSH_YAW = -0.3 // square up to the nose while pushing

const damp = (a: number, b: number, lambda: number, dt: number) => a + (b - a) * (1 - Math.exp(-lambda * dt))

function Part({ g = SMALL_BOX, c, p, s, r }: { g?: THREE.BufferGeometry; c: string; p: [number, number, number]; s: [number, number, number]; r?: [number, number, number] }) {
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

/**
 * The kid on a skateboard, placed in world space from the sim. Sideways stance,
 * pushes to build speed, carves with a lean, tucks on ollies, squashes on landing,
 * and flails on a wipeout. Everything eases, nothing snaps.
 */
export function Skater() {
  const root = useRef<THREE.Group>(null!)
  const board = useRef<THREE.Group>(null!)
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
  const st = useRef({ bend: 0.2, push: 0, pushPhase: 0, roll: 0, yaw: 0, pitch: 0 }).current

  // every part casts a (curved) cel shadow and receives the town's
  useEffect(() => {
    root.current.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = o.receiveShadow = true
        o.customDepthMaterial = curvedDepth
      }
    })
  }, [])

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 1 / 20)
    const t = sim.time
    const sinceJump = t - sim.jumpT
    const sinceLand = t - sim.landT
    const sinceBail = t - sim.bailT
    const bailing = sinceBail < 0.9

    // --- place in the world ---
    const carve = Math.atan2(sim.latVel, Math.max(sim.speed, 2)) * 0.9
    st.yaw = damp(st.yaw, carve, 10, dt)
    root.current.position.set(sim.px, sim.y, sim.pz)
    root.current.rotation.y = -sim.heading - st.yaw

    // --- crouch: ride low, tuck in the air, squash on landing ---
    let bend = input.started ? 0.42 + Math.min(sim.speed / 17, 1) * 0.1 : 0.18
    if (!sim.grounded) bend = sinceJump < 0.08 ? 0.3 : 1.0
    if (sinceLand < 0.5) bend += 0.55 * Math.exp(-sinceLand * 9)
    if (bailing) bend = 0.8
    st.bend = damp(st.bend, bend, sim.grounded ? 16 : 10, dt)

    // --- pushing: square up, kick the back foot along the ground ---
    st.push = damp(st.push, sim.pushing ? 1 : 0, 6, dt)
    if (st.push > 0.01) st.pushPhase += dt * 1.5
    const ph = Math.sin(st.pushPhase * Math.PI * 2)
    body.current.rotation.y = THREE.MathUtils.lerp(STANCE_YAW, PUSH_YAW, st.push)
    head.current.rotation.y = -body.current.rotation.y * 0.85

    const b = st.bend
    const frontBend = b + st.push * 0.25
    hips.current.position.y = 2 * LEG * Math.cos(frontBend) + 0.01 - st.push * 0.04
    if (legF.current) {
      legF.current.thigh.rotation.x = frontBend
      legF.current.shin.rotation.x = -2 * frontBend
      legF.current.foot.rotation.x = frontBend
    }
    if (legB.current) {
      const swing = 0.15 + ph * 0.75
      legB.current.thigh.rotation.x = THREE.MathUtils.lerp(b, swing, st.push)
      legB.current.shin.rotation.x = THREE.MathUtils.lerp(-2 * b, -0.25 - Math.max(0, ph) * 0.7, st.push)
      legB.current.foot.rotation.x = THREE.MathUtils.lerp(b, 0.1, st.push)
    }
    torso.current.rotation.x = -0.18 - b * 0.35 - st.push * 0.15

    // --- arms: out for balance, up in the air, swinging on a push, flailing on a wipeout ---
    let out = 0.95 + Math.sin(t * 1.7) * 0.06
    if (!sim.grounded) out = 1.5
    if (bailing) out = 1.3 + Math.sin(t * 24) * 0.6
    out = THREE.MathUtils.lerp(out, 0.25, st.push)
    armL.current.rotation.z = damp(armL.current.rotation.z, -out, 12, dt)
    armR.current.rotation.z = damp(armR.current.rotation.z, out, 12, dt)
    armL.current.rotation.x = -ph * 0.7 * st.push
    armR.current.rotation.x = ph * 0.7 * st.push
    foreL.current.rotation.x = -0.5
    foreR.current.rotation.x = -0.5

    // --- lean into carves and corners, wobble on a wipeout ---
    let roll = -(sim.latVel / 6.5) * 0.28 - sim.turnRate * 0.13
    if (bailing) roll = Math.sin(sinceBail * 18) * 0.5 * (1 - sinceBail / 0.9)
    st.roll = damp(st.roll, THREE.MathUtils.clamp(roll, -0.6, 0.6), 10, dt)
    rider.current.rotation.z = st.roll
    rider.current.rotation.x = bailing ? -0.35 * Math.sin((sinceBail / 0.9) * Math.PI) : 0

    // --- board: ollie pop (nose up, then level), carve roll ---
    let pitch = 0
    if (!sim.grounded) pitch = sinceJump < 0.12 ? (sinceJump / 0.12) * 0.55 : 0.55 * Math.exp(-(sinceJump - 0.12) * 7)
    st.pitch = damp(st.pitch, pitch, 25, dt)
    board.current.rotation.x = st.pitch
    board.current.rotation.z = st.roll * 0.45
  })

  return (
    <>
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
                <Part key={x} g={CYL} c={SHOES} p={[x, 0.05, z]} s={[0.1, 0.05, 0.1]} r={[0, 0, Math.PI / 2]} />
              ))}
            </group>
          ))}
        </group>
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
      </group>
    </>
  )
}
