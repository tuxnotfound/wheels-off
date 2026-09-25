import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { CityPath } from '../world/CityPath'
import type { SceneDesc, StreetDesc } from '../world/CityPath'
import { Runner } from '../player/Runner'
import { useKeyboard } from '../player/useKeyboard'
import { navShared } from '../player/navShared'
import { branchLeft, branchRight, childSeed, widthForSeed } from '../world/streetGen'
import { AHEAD, BASE_SPEED, BEHIND, BLOCK, BRANCH_DEPTH, DIR, TURN_RATE } from '../world/worldConfig'

const SKY = '#bcd9cf'
const HALF_PI = Math.PI / 2
function wrap(a: number): number {
  while (a > Math.PI) a -= 2 * Math.PI
  while (a < -Math.PI) a += 2 * Math.PI
  return a
}

type Seg = { seed: number; ox: number; oz: number; dir: number; width: number; minK: number }
type Prev = Seg & { fromK: number; takenLeft: boolean }

function pushStreet(out: StreetDesc[], s: Seg, kMin: number, kMax: number) {
  out.push({ key: `s${s.seed}`, seed: s.seed, ox: s.ox, oz: s.oz, dir: s.dir, width: s.width, kMin, kMax })
}
function pushBranches(out: StreetDesc[], s: Seg, kFrom: number, kTo: number, skipK: number, skipLeft: boolean) {
  const sd = DIR[s.dir]
  for (let k = Math.max(1, kFrom); k <= kTo; k++) {
    const ix = s.ox + sd[0] * k * BLOCK
    const iz = s.oz + sd[1] * k * BLOCK
    for (const left of [true, false]) {
      if (skipK === k && skipLeft === left) continue
      if (!(left ? branchLeft(s.seed, k) : branchRight(s.seed, k))) continue
      const seed = childSeed(s.seed, k, left)
      out.push({ key: `s${seed}`, seed, ox: ix, oz: iz, dir: (s.dir + (left ? 3 : 1)) % 4, width: widthForSeed(seed), kMin: 0, kMax: BRANCH_DEPTH })
    }
  }
}

/** The whole visible world, rebuilt each block: current street + its side-streets,
 *  plus the street you just came from + its side-streets. Bounded (~a dozen streets),
 *  so nothing accumulates. Keyed by seed, so the street you turned off keeps its
 *  identity and doesn't remount. */
function buildScene(cur: Seg, prev: Prev | null, kc: number, px: number, pz: number): SceneDesc {
  const out: StreetDesc[] = []
  const cMin = Math.max(cur.minK, kc - BEHIND)
  const cMax = kc + AHEAD
  pushStreet(out, cur, cMin, cMax)
  pushBranches(out, cur, cMin, cMax, -999, false)
  if (prev) {
    pushStreet(out, prev, prev.fromK - BEHIND, prev.fromK + AHEAD)
    pushBranches(out, prev, prev.fromK - BEHIND, prev.fromK + AHEAD, prev.fromK, prev.takenLeft)
  }
  return { streets: out, gx: px, gz: pz }
}

function StaticCam() {
  const camera = useThree((s) => s.camera)
  useFrame(() => {
    camera.position.set(0, 3.0, 7)
    camera.lookAt(0, 0.6, -6)
  })
  return null
}

function World() {
  const group = useRef<THREE.Group>(null!)
  const keys = useKeyboard()
  const nav = useRef({
    cur: { seed: 1, ox: 0, oz: 0, dir: 0, width: widthForSeed(1), minK: -(BEHIND + 1) } as Seg,
    u: 0,
    prev: null as Prev | null,
    vAngle: 0,
    pending: 0,
    lastKc: -999,
  }).current
  const [scene, setScene] = useState<SceneDesc>(() => buildScene(nav.cur, null, 0, 0, 0))

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return
      const k = e.key.toLowerCase()
      if (k === 'a' || k === 'arrowleft') nav.pending = -1
      else if (k === 'd' || k === 'arrowright') nav.pending = 1
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [nav])

  useFrame((_, dt) => {
    const d = Math.min(dt, 1 / 30)
    const prevU = nav.u
    nav.u += (BASE_SPEED + keys.current.z * 3) * d

    const cur = nav.cur
    const turning = Math.abs(wrap(cur.dir * HALF_PI - nav.vAngle)) > 0.02
    let turned = false
    const kNow = Math.floor(nav.u / BLOCK)
    if (!turning && kNow > Math.floor(prevU / BLOCK) && nav.pending !== 0) {
      const k = kNow
      const left = nav.pending < 0
      if (left ? branchLeft(cur.seed, k) : branchRight(cur.seed, k)) {
        const vd = DIR[cur.dir]
        nav.prev = { ...cur, fromK: k, takenLeft: left }
        nav.cur = {
          seed: childSeed(cur.seed, k, left),
          ox: cur.ox + vd[0] * k * BLOCK,
          oz: cur.oz + vd[1] * k * BLOCK,
          dir: (cur.dir + (left ? 3 : 1)) % 4,
          width: widthForSeed(childSeed(cur.seed, k, left)),
          minK: 0,
        }
        nav.u = 0
        nav.pending = 0
        turned = true
      }
    }

    // drop the previous street once it's well behind (hidden by the curve)
    if (nav.prev && nav.u > AHEAD * BLOCK) nav.prev = null

    // cheap every frame: kid pos + fluid-curve sweep + camera transform
    const c = nav.cur
    const vd = DIR[c.dir]
    const px = c.ox + vd[0] * nav.u
    const pz = c.oz + vd[1] * nav.u
    const diff = wrap(c.dir * HALF_PI - nav.vAngle)
    const step = TURN_RATE * d
    nav.vAngle = Math.abs(diff) <= step ? c.dir * HALF_PI : nav.vAngle + Math.sign(diff) * step
    navShared.bank = THREE.MathUtils.clamp((diff / HALF_PI) * 0.5, -0.5, 0.5)
    const cc = Math.cos(nav.vAngle)
    const ss = Math.sin(nav.vAngle)
    group.current.rotation.y = nav.vAngle
    group.current.position.set(-(px * cc + pz * ss), 0, -(-px * ss + pz * cc))

    // rebuild the (bounded) scene only when the block changes or on a turn
    const kc = Math.floor(nav.u / BLOCK)
    if (kc === nav.lastKc && !turned) return
    nav.lastKc = kc
    setScene(buildScene(nav.cur, nav.prev, kc, px, pz))
  })

  return (
    <group ref={group}>
      <CityPath scene={scene} />
    </group>
  )
}

export default function GameCanvas() {
  return (
    <Canvas
      className="game-canvas"
      camera={{ fov: 70, near: 0.1, far: 400, position: [0, 3, 7] }}
      dpr={[1, 1.5]}
    >
      <color attach="background" args={[SKY]} />
      <fog attach="fog" args={[SKY, 45, 140]} />
      <ambientLight intensity={0.55} />
      <hemisphereLight args={[0xffffff, 0x6b7d76, 0.7]} />
      <directionalLight position={[6, 12, 4]} intensity={1.0} />
      <World />
      <Runner />
      <StaticCam />
    </Canvas>
  )
}
