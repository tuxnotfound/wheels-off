import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { startTransition, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { BlockView } from '../world/Block'
import type { BlockDesc } from '../world/Block'
import { Skater } from '../player/Skater'
import { input, installInput } from '../player/input'
import { Sky } from '../look/Sky'
import { PostFX, canvasDpr, useResolution } from '../look/PostFX'
import { Petals } from '../look/Petals'
import { setTreeSun } from '../world/Tree3D'
import { toonMat } from '../look/materials'
import { FOG, LIGHT, SUN_DIR } from '../look/timeOfDay'
import { branchOpen, streetName } from '../world/streetGen'
import { AHEAD, BEHIND, BEHIND_LANDING, BLOCK, BRANCH_DEPTH, DIR } from '../world/worldConfig'
import { childStreet, sim, stepSim, upcomingTurn } from './sim'
import type { Street } from './sim'
import { useHud } from './hudStore'
import { beatRecords, beating, endRun, records } from './records'
import { rankFor, refreshBoards, worldRecord } from './leaderboard'
import { askForName, isPaused, showResult } from './arcadeStore'
import type { PendingRun, Ranks } from './arcadeStore'
import { freeRoam, onCourse, useMode } from './mode'
import { trialAfterStep, trialTick } from './trial'
import { autopilot } from './autopilot'
import { pacer } from './pacer'
import { tickAds } from '../ads/ads'
import { playRode, playRunEnded, playStarted } from './plays'
import { trackpadTick } from './TouchControls'
import { TrialView } from '../world/TrialView'

const damp = (a: number, b: number, lambda: number, dt: number) => a + (b - a) * (1 - Math.exp(-lambda * dt))
const tenths = (s: number) => Math.floor(s * 10) / 10
const differs = <T extends object>(a: T, b: T) => Object.entries(a).some(([k, v]) => b[k as keyof T] !== v)
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
      if (!branchOpen(s.seed, i, side, onCourse())) continue
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
  addStreet(out, sim.street, kc - (input.started ? BEHIND : BEHIND_LANDING), kc + AHEAD, kc + 2)
  if (sim.prev) {
    const { street, fromK, side } = sim.prev
    addStreet(out, street, fromK - 1, fromK + 1, -1, { k: fromK, side })
  }
  return [...out.values()]
}

function signature(): string {
  // the time trial's course closes side streets, so going on or off it lays the blocks out again
  return `${sim.street.seed}:${Math.floor(sim.u / BLOCK)}:${sim.prev ? `${sim.prev.street.seed}:${sim.prev.fromK}` : ''}:${onCourse() ? 'course' : ''}`
}

const WIPEOUT_HOLD = 1.5 // seconds of the wipeout played before the run's records are announced

/** What a finished run announces, and when: its name entry, or else its PR banner. */
type Announce = { at: number; entry: PendingRun | null; record: { score: number | null; streak: number | null } | null }

/** Steps the simulation first each frame, then mirrors what the HUD needs. */
function SimDriver() {
  const last = useRef({ t: 0, arcade: false, resets: 0, announce: null as Announce | null }).current
  useFrame(({ camera }, dt) => {
    if (isPaused()) return // the pause screen, a name being typed or a result: the world holds still
    if (!input.started) autopilot()
    else trackpadTick() // on a touch screen, the thumb's line and pedal (TouchControls.tsx)
    const mode = useMode.getState().mode
    if (input.started && mode === 'trial') {
      // the time trial holds the kid on the start line until GO, then times the run
      if (trialTick(dt)) {
        stepSim(dt)
        const run = trialAfterStep()
        if (run) {
          showResult(run)
          playRunEnded()
        }
      }
    } else stepSim(dt)
    // the attract ride behind the landing page counts no ad impressions and pops no toasts
    if (input.started) {
      tickAds(camera, Math.min(dt, 1 / 20))
      playRode(dt)
    } else sim.events.length = 0
    // only arcade scores; leaving it for free roam or the time trial ends the run, as a wipeout does
    const arcade = !freeRoam() && mode === 'arcade'
    const quit = !arcade && last.arcade
    const back = arcade && !last.arcade
    last.arcade = arcade
    const hud = useHud.getState()
    const patch: Partial<ReturnType<typeof useHud.getState>> = {}
    let wipeout = false
    for (const ev of sim.events) {
      if (ev.kind === 'street') patch.street = { id: sim.time, ...streetName(sim.street.seed) }
      else patch.toast = { id: sim.time, text: ev.text, kind: ev.kind, points: arcade ? ev.points : undefined }
      if (ev.kind === 'hit') wipeout = true
    }
    sim.events.length = 0
    if (input.started && !hud.started) {
      playStarted()
      patch.started = true
      patch.street = { id: sim.time, ...streetName(sim.street.seed) }
    }
    if (quit || back) {
      sim.score = 0
      sim.combo = 0
    }
    if (sim.score !== hud.score) patch.score = sim.score
    if (sim.combo !== hud.combo) patch.combo = sim.combo
    if (arcade) beatRecords(sim.score, sim.streak, sim.time)
    if ((arcade && wipeout) || quit) {
      // game over for this run: a run that makes a leaderboard signs it, else a new PR gets its
      // banner, once the wipeout has played (leaving for another mode has none to play)
      const end = endRun()
      playRunEnded()
      refreshBoards() // so the next run is up against the boards as they stand now
      const ranks: Ranks = {
        week: { score: rankFor('week', 'score', end.score), speed: rankFor('week', 'speed', end.streak) },
        all: { score: rankFor('all', 'score', end.score), speed: rankFor('all', 'speed', end.streak) },
      }
      const at = sim.time + (wipeout ? WIPEOUT_HOLD : 0)
      const places = Object.values(ranks).some((r) => r.score !== null || r.speed !== null)
      if (places) last.announce = { at, entry: { id: at, ...end, ranks }, record: null }
      else if (end.prScore || end.prStreak) {
        const record = { score: end.prScore ? records.score : null, streak: end.prStreak ? tenths(records.streak) : null }
        last.announce = { at, entry: null, record }
      }
    }
    const due = last.announce
    if (due && sim.time >= due.at) {
      last.announce = null
      if (due.entry) askForName(due.entry)
      else if (due.record) patch.record = { id: due.at, ...due.record }
    }
    const streak = tenths(sim.streak)
    if (streak !== hud.streak) patch.streak = streak
    const best = {
      score: records.score,
      streak: tenths(records.streak),
      beatingScore: beating.score,
      beatingStreak: beating.streak,
    }
    if (differs(best, hud.best)) patch.best = best
    const topScore = worldRecord('score')
    const topSpeed = worldRecord('speed')
    const wr = {
      score: topScore?.value ?? 0,
      scoreName: topScore?.name ?? '',
      streak: tenths(topSpeed?.value ?? 0),
      streakName: topSpeed?.name ?? '',
      beatingScore: topScore !== null && sim.score > topScore.value,
      beatingStreak: topSpeed !== null && sim.streak > topSpeed.value,
    }
    if (differs(wr, hud.wr)) patch.wr = wr
    const turns = upcomingTurn()
    if (JSON.stringify(turns) !== JSON.stringify(hud.turns)) patch.turns = turns
    // every 0.2 s, and at once when the kid is put back on the start line (the clock holds there)
    if (sim.time - last.t > 0.2 || sim.resets !== last.resets) {
      last.t = sim.time
      last.resets = sim.resets
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
  const resets = useRef(sim.resets)
  const [blocks, setBlocks] = useState<BlockDesc[]>(buildBlocks)
  const groundGeo = useMemo(() => new THREE.PlaneGeometry(300, 300, 60, 60).rotateX(-Math.PI / 2), [])

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 1 / 20)
    if (sim.resets !== resets.current) {
      // the kid was put back on the start line: the camera and the blocks jump with them
      resets.current = sim.resets
      anchor.x = sim.px
      anchor.z = sim.pz
      anchor.yaw = sim.heading
      sig.current = signature()
      setBlocks(buildBlocks())
    }
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
        <TrialView />
        <Petals anchor={anchor} />
      </group>
    </>
  )
}

const SHADOW_CENTER = new THREE.Vector3(0, 0, -16) // ahead of the camera, in view space
const sunDir = new THREE.Vector3()

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
    sunDir.set(SUN_DIR.x * c + SUN_DIR.z * s, SUN_DIR.y, -SUN_DIR.x * s + SUN_DIR.z * c)
    setTreeSun(sunDir)
    sun.current.position.copy(sunDir).multiplyScalar(90).add(SHADOW_CENTER)
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

// The landing shot, before anyone takes over: the camera drifts around the front of the kid
// as they cruise, close and low, framing them right of the title on a wide screen, and on a
// tall one aiming low so they ride between the title and the buttons. Taking over swings it up
// and round behind them into the chase.
const LANDING = { r: 5.4, h: 1.15, fov: 52, drift: 0.6, off: 1.9, aim: 0.95, aimTall: 0.4 }
// the chase: behind (d) and above (h) the kid, aimed at y down the street, fov the base field of
// view (vertical, as three.js counts it). A tall screen (a phone held upright) needs a wider view
// to show the street, and aims lower, so the kid rides higher, above the touch pad.
const CHASE = { d: 7.6, h: 3.0, y: 1.1, fov: 72 }
const CHASE_TALL = { d: 8.4, h: 3.6, y: 0.2, fov: 92 }
const SWING_TIME = 1.5 // seconds

const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const ease = (t: number) => t * t * (3 - 2 * t)

/** Chase camera in the anchor's frame: widens with speed, rises on ollies, rolls into carves. */
function CameraRig() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const wide = useThree((s) => s.size.width > s.size.height * 1.2)
  const tall = useThree((s) => s.size.height > s.size.width)
  const st = useRef({ fov: 74, y: 0, roll: 0, landing: 1, way: 0 }).current
  // dev-only handle for test scripts (ad readability probes)
  if (import.meta.env.DEV) Object.assign(window, { __camera: camera })
  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 1 / 20)
    const C = tall ? CHASE_TALL : CHASE
    st.fov = damp(st.fov, C.fov + Math.max(0, sim.speed - 8) * 0.9, 2.5, dt)
    st.y = damp(st.y, sim.y, 5, dt)
    st.roll = damp(st.roll, -sim.latVel * 0.012 - sim.turnRate * 0.03, 4, dt)
    if (input.started) st.landing = Math.max(0, st.landing - dt / SWING_TIME)
    // the swing goes round the side of the street with more room, chosen once as it starts
    if (input.started && !st.way) st.way = sim.lat < 0 ? 1 : -1
    const shake = Math.max(0, 1 - (sim.time - sim.bailT) / 0.4) * 0.06
    // 1 on the landing shot, 0 in the chase
    const b = ease(st.landing)
    let fov = st.fov
    if (b === 0) {
      camera.position.set(Math.sin(sim.time * 60) * shake, C.h + st.y * 0.4, C.d)
      camera.lookAt(0, C.y + st.y * 0.3, -7)
    } else {
      // the swing orbits the kid, so the camera never passes through them: angle, distance and
      // height blend from the landing shot to the chase, rising and closing in on the way round
      const c = Math.cos(anchor.yaw)
      const s = Math.sin(anchor.yaw)
      const dx = sim.px - anchor.x
      const dz = sim.pz - anchor.z
      const rx = dx * c + dz * s
      const rz = -dx * s + dz * c
      const chaseAngle = Math.atan2(-rx, C.d - rz)
      const chaseR = Math.hypot(rx, C.d - rz)
      const angle = Math.PI + LANDING.drift * Math.sin(sim.time * 0.13)
      const turn = wrap(angle - chaseAngle)
      const a = chaseAngle + (Math.sign(turn) === st.way ? turn : turn + st.way * 2 * Math.PI) * b
      const crane = Math.sin(Math.PI * b)
      const r = lerp(chaseR, LANDING.r, b) - 1.6 * crane
      const h = lerp(C.h + st.y * 0.4, LANDING.h, b) + 1.4 * crane
      // held softly over the road: past the curb it would pass through poles and facades
      const lim = sim.street.width / 2 - 0.3
      const side = lim * Math.tanh((sim.lat + Math.sin(a) * r) / lim)
      camera.position.set(rx + side - sim.lat, h, rz + Math.cos(a) * r)
      // aim to the kid's left on a wide screen, so they ride on the right, clear of the title;
      // the swing keeps them in sight until the camera is round their side, then looks ahead
      const off = (wide ? LANDING.off : 0) * ease(Math.max(0, (b - 0.6) / 0.4))
      const lx = rx - Math.cos(angle) * off
      const lz = rz + Math.sin(angle) * off
      const keep = ease(Math.min(1, b / 0.45))
      const aim = (wide ? LANDING.aim : LANDING.aimTall) + st.y * 0.5
      camera.lookAt(lerp(0, lx, keep), lerp(C.y + st.y * 0.3, aim, keep), lerp(-7, lz, keep))
      fov = lerp(st.fov, LANDING.fov, b)
    }
    camera.rotateZ(st.roll * (1 - b))
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov
      camera.updateProjectionMatrix()
    }
  })
  return null
}

/**
 * Drives the frames (the canvas runs frameloop="never"): one every display refresh up to 144 Hz,
 * and every other one on a 240 Hz screen (pacer.ts at 120), which the GPU couldn't hold anyway.
 * A 60 cap made the ride feel less fluid on a 120 Hz screen.
 * While the game is paused (the pause screen, the records, a name being typed, a result) nothing
 * is drawn and the last frame stays on screen, unless the canvas is resized, which clears it.
 */
function FrameLoop() {
  const advance = useThree((s) => s.advance)
  const canvas = useThree((s) => s.gl.domElement)
  // dev-only handle for test scripts: draws a frame at a given time (seconds)
  if (import.meta.env.DEV) Object.assign(window, { __advance: advance })
  useEffect(() => {
    const due = pacer(120)
    let drawn = ''
    let raf = requestAnimationFrame(function loop(t) {
      raf = requestAnimationFrame(loop)
      const size = `${canvas.width}x${canvas.height}`
      if (!due(t) || (isPaused() && size === drawn)) return
      drawn = size
      advance(t / 1000)
    })
    return () => cancelAnimationFrame(raf)
  }, [advance, canvas])
  return null
}

export default function GameCanvas() {
  useEffect(installInput, [])
  const dpr = useResolution(canvasDpr)
  return (
    <Canvas
      frameloop="never"
      className="game-canvas"
      flat
      shadows="percentage"
      gl={{ antialias: false }}
      camera={{ fov: 74, near: 0.3, far: 420, position: [0, 3.0, 7.6] }}
      dpr={dpr}
    >
      <fog attach="fog" args={[FOG.color, FOG.near, FOG.far]} />
      <Lights />
      <SimDriver />
      <World />
      <CameraRig />
      <PostFX />
      <FrameLoop />
    </Canvas>
  )
}
