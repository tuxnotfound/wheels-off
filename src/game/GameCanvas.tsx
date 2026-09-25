import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { startTransition, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { BlockView } from '../world/Block'
import type { BlockDesc } from '../world/Block'
import { Skater } from '../player/Skater'
import { input, installInput } from '../player/input'
import { Sky } from '../look/Sky'
import { PostFX } from '../look/PostFX'
import { Petals } from '../look/Petals'
import { toonMat } from '../look/materials'
import { FOG, LIGHT, SUN_DIR } from '../look/timeOfDay'
import { hasBranch, streetName } from '../world/streetGen'
import { AHEAD, BEHIND, BLOCK, BRANCH_DEPTH, DIR } from '../world/worldConfig'
import { childStreet, sim, stepSim, upcomingTurn } from './sim'
import type { Street } from './sim'
import { useHud } from './hudStore'

const damp = (a: number, b: number, lambda: number, dt: number) => a + (b - a) * (1 - Math.exp(-lambda * dt))
function wrap(a: number): number {
  while (a > Math.PI) a -= 2 * Math.PI
  while (a < -Math.PI) a += 2 * Math.PI
  return a
}

/** Smoothed camera anchor in world space: trails the skater's position and heading. */
const anchor = { x: sim.px, z: sim.pz, yaw: sim.heading }

function desc(s: Street, k: number): BlockDesc {
  const f = DIR[s.dir]
  return {
    key: `${s.seed}:${k}`,
    seed: s.seed,
    k,
    ix: s.ox + f[0] * k * BLOCK,
    iz: s.oz + f[1] * k * BLOCK,
    dir: s.dir,
    width: s.width,
    u0: s.u0,
  }
}

/** Blocks of a street plus short stubs of its side-streets. */
function addStreet(out: Map<string, BlockDesc>, s: Street, k0: number, k1: number, near: number, skip?: { k: number; side: number }) {
  for (let k = Math.max(k0, s.minK); k <= k1; k++) {
    const d = desc(s, k)
    out.set(d.key, d)
  }
  for (let i = Math.max(k0 + 1, 1); i <= k1; i++) {
    for (const side of [-1, 1]) {
      if (skip && skip.k === i && skip.side === side) continue
      if (!hasBranch(s.seed, i, side)) continue
      const c = childStreet(s, i, side)
      const depth = i <= near ? BRANCH_DEPTH : 1
      for (let j = 0; j < depth; j++) {
        const d = desc(c, j)
        out.set(d.key, d)
      }
    }
  }
}

function buildBlocks(): BlockDesc[] {
  const out = new Map<string, BlockDesc>()
  const kc = Math.floor(sim.u / BLOCK)
  addStreet(out, sim.street, kc - BEHIND, kc + AHEAD, kc + 2)
  if (sim.prev) {
    const { street, fromK, side } = sim.prev
    addStreet(out, street, fromK - 1, fromK + 1, -1, { k: fromK, side })
  }
  return [...out.values()]
}

function signature(): string {
  return `${sim.street.seed}:${Math.floor(sim.u / BLOCK)}:${sim.prev ? `${sim.prev.street.seed}:${sim.prev.fromK}` : ''}`
}

/** Steps the simulation first each frame, then mirrors what the HUD needs. */
function SimDriver() {
  const last = useRef({ t: 0 }).current
  useFrame((_, dt) => {
    stepSim(dt)
    const hud = useHud.getState()
    const patch: Partial<ReturnType<typeof useHud.getState>> = {}
    for (const ev of sim.events) {
      if (ev.kind === 'street') patch.street = { id: sim.time, ...streetName(sim.street.seed) }
      else patch.toast = { id: sim.time, text: ev.text, kind: ev.kind }
    }
    sim.events.length = 0
    if (input.started && !hud.started) {
      patch.started = true
      patch.street = { id: sim.time, ...streetName(sim.street.seed) }
    }
    if (sim.score !== hud.score) patch.score = sim.score
    if (sim.combo !== hud.combo) patch.combo = sim.combo
    const turns = upcomingTurn()
    if (JSON.stringify(turns) !== JSON.stringify(hud.turns)) patch.turns = turns
    if (sim.time - last.t > 0.2) {
      last.t = sim.time
      const kmh = Math.round(sim.speed * 3.6)
      if (kmh !== hud.speed) patch.speed = kmh
    }
    if (Object.keys(patch).length) useHud.setState(patch)
  })
  return null
}

/** Everything in world space, moved so the camera anchor sits at the origin. */
function World() {
  const group = useRef<THREE.Group>(null!)
  const sky = useRef<THREE.Group>(null!)
  const ground = useRef<THREE.Mesh>(null!)
  const sig = useRef(signature())
  const [blocks, setBlocks] = useState<BlockDesc[]>(buildBlocks)
  const groundGeo = useMemo(() => new THREE.PlaneGeometry(300, 300, 60, 60).rotateX(-Math.PI / 2), [])

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 1 / 20)
    anchor.x = damp(anchor.x, sim.px, 7, dt)
    anchor.z = damp(anchor.z, sim.pz, 7, dt)
    anchor.yaw += wrap(sim.heading - anchor.yaw) * (1 - Math.exp(-4.5 * dt))
    const c = Math.cos(anchor.yaw)
    const s = Math.sin(anchor.yaw)
    group.current.rotation.y = anchor.yaw
    group.current.position.set(-(anchor.x * c + anchor.z * s), 0, -(-anchor.x * s + anchor.z * c))
    sky.current.rotation.y = anchor.yaw
    ground.current.position.set(anchor.x, -0.2, anchor.z)

    const next = signature()
    if (next !== sig.current) {
      sig.current = next
      startTransition(() => setBlocks(buildBlocks()))
    }
  })

  return (
    <>
      <group ref={sky}>
        <Sky />
      </group>
      <group ref={group}>
        <mesh ref={ground} geometry={groundGeo} material={toonMat('#b9c4b8')} receiveShadow />
        {blocks.map(({ key, ...b }) => (
          <BlockView key={key} {...b} />
        ))}
        <Skater />
        <Petals anchor={anchor} />
      </group>
    </>
  )
}

const SHADOW_CENTER = new THREE.Vector3(0, 0, -16) // ahead of the camera, in view space

/**
 * Cel lighting: one hard-edged sun that casts shadows, plus a cool tinted ambient
 * that alone colors everything in shade (lit/shade is a two-tone split, no gradient).
 * The shadow frustum stays over what the camera sees; the sun turns with the world.
 */
function Lights() {
  const sun = useRef<THREE.DirectionalLight>(null!)
  const target = useMemo(() => new THREE.Object3D(), [])
  useEffect(() => {
    const l = sun.current
    l.target = target
    const cam = l.shadow.camera
    cam.left = cam.bottom = -42
    cam.right = cam.top = 42
    cam.near = 1
    cam.far = 220
    cam.updateProjectionMatrix()
  }, [target])
  useFrame(() => {
    const c = Math.cos(anchor.yaw)
    const s = Math.sin(anchor.yaw)
    target.position.copy(SHADOW_CENTER)
    target.updateMatrixWorld()
    sun.current.position.set(SUN_DIR.x * c + SUN_DIR.z * s, SUN_DIR.y, -SUN_DIR.x * s + SUN_DIR.z * c).multiplyScalar(90).add(SHADOW_CENTER)
  })
  return (
    <>
      <primitive object={target} />
      <ambientLight color={LIGHT.ambient} intensity={LIGHT.ambientIntensity} />
      <directionalLight
        ref={sun}
        intensity={LIGHT.sunIntensity}
        color={LIGHT.sun}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.05}
      />
    </>
  )
}

/** Chase camera in the anchor's frame: widens with speed, rises on ollies, rolls into carves. */
function CameraRig() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const st = useRef({ fov: 74, y: 0, roll: 0 }).current
  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 1 / 20)
    st.fov = damp(st.fov, 72 + Math.max(0, sim.speed - 8) * 0.9, 2.5, dt)
    st.y = damp(st.y, sim.y, 5, dt)
    st.roll = damp(st.roll, -sim.latVel * 0.012 - sim.turnRate * 0.03, 4, dt)
    const shake = Math.max(0, 1 - (sim.time - sim.bailT) / 0.4) * 0.06
    camera.position.set(Math.sin(sim.time * 60) * shake, 3.0 + st.y * 0.4, 7.6)
    camera.lookAt(0, 1.1 + st.y * 0.3, -7)
    camera.rotateZ(st.roll)
    if (Math.abs(camera.fov - st.fov) > 0.01) {
      camera.fov = st.fov
      camera.updateProjectionMatrix()
    }
  })
  return null
}

export default function GameCanvas() {
  useEffect(installInput, [])
  return (
    <Canvas
      className="game-canvas"
      flat
      shadows="percentage"
      gl={{ antialias: false }}
      camera={{ fov: 74, near: 0.3, far: 420, position: [0, 3.0, 7.6] }}
      dpr={[1, 1.75]}
    >
      <fog attach="fog" args={[FOG.color, FOG.near, FOG.far]} />
      <Lights />
      <SimDriver />
      <World />
      <CameraRig />
      <PostFX />
    </Canvas>
  )
}
