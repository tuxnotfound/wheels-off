import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { TRIAL_FINISH, TRIAL_START, ghostAt } from '../../shared/trial'
import type { Ghost } from '../../shared/trial'
import { input } from '../player/input'
import { useMode } from '../game/mode'
import { START, sim } from '../game/sim'
import { ghosts, trialClock, useTrial } from '../game/trial'
import { patchCurve } from '../look/materials'
import { skater } from '../player/Skater'
import { bakeSilhouette } from './silhouette'
import { DIR } from './worldConfig'

// The time trial in the world (src/game/trial.ts): the start line and the checkered finish across
// the start street, and the ghosts riding the course with you: your best this week in teal, the
// week's fastest in gold. A ghost is the kid's own silhouette (silhouette.ts): the character on
// the board as it stands on the start line, taken once, two seconds into the first countdown,
// and drawn see-through in one flat layer: a depth-only pass first, so only the nearest surface
// takes the color. A ghost fades out within a few meters of the kid, so on the start line and
// side by side it never tints them. Both bend down with the world's curve (patchCurve), or far
// off they would float over the road.

const OPACITY = 0.55
const FADE_NEAR = 1.2 // meters from the kid where a ghost is gone
const FADE_FAR = 3.5 // and where it is whole

const f = DIR[START.dir]
const r = DIR[(START.dir + 1) % 4]
const YAW = -(START.dir * Math.PI) / 2

/** A point on the start street, u along it and lat across it, in world space. */
const at = (u: number, lat: number, y = 0) => new THREE.Vector3(START.ox + f[0] * u + r[0] * lat, y, START.oz + f[1] * u + r[1] * lat)

/** An unlit material that follows the world's curve. */
function curved(params: THREE.MeshBasicMaterialParameters): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial(params)
  m.onBeforeCompile = patchCurve
  m.customProgramCacheKey = () => 'basic-curve'
  return m
}

function checkers(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 16
  c.height = 2
  const g = c.getContext('2d')!
  for (let x = 0; x < 16; x++)
    for (let y = 0; y < 2; y++) {
      g.fillStyle = (x + y) % 2 ? '#23312e' : '#fdfaf2'
      g.fillRect(x, y, 1, 1)
    }
  const t = new THREE.CanvasTexture(c)
  t.magFilter = THREE.NearestFilter
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

function Line({ u, finish }: { u: number; finish: boolean }) {
  const mat = useMemo(
    () =>
      curved({
        color: finish ? '#ffffff' : '#fdfaf2',
        map: finish ? checkers() : null,
        polygonOffset: true,
        polygonOffsetFactor: -2,
      }),
    [finish],
  )
  const geo = useMemo(() => new THREE.PlaneGeometry(START.width, finish ? 1.2 : 0.35).rotateX(-Math.PI / 2), [finish])
  // made here, not by r3f, so freed here when the trial ends
  useEffect(
    () => () => {
      geo.dispose()
      mat.map?.dispose()
      mat.dispose()
    },
    [geo, mat],
  )
  return <mesh geometry={geo} material={mat} position={at(u, 0, 0.02)} rotation-y={YAW} />
}

// the kid's silhouette, kept for the session: the character doesn't change
let shape: THREE.BufferGeometry | null = null
const depthOnly = curved({ colorWrite: false })

function GhostRider({ ghost, color, shape }: { ghost: () => Ghost | null; color: string; shape: THREE.BufferGeometry }) {
  const ref = useRef<THREE.Group>(null!)
  const mat = useMemo(() => curved({ color, transparent: true, opacity: OPACITY, depthWrite: false }), [color])
  useEffect(() => () => mat.dispose(), [mat])
  useFrame(() => {
    const g = ghost()
    const p = g && ghostAt(g, trialClock())
    const fade = p ? THREE.MathUtils.smoothstep(Math.hypot(p.u - sim.u, p.lat - sim.lat), FADE_NEAR, FADE_FAR) : 0
    ref.current.visible = fade > 0.01
    if (!p || fade <= 0.01) return
    mat.opacity = OPACITY * fade
    ref.current.position.set(START.ox + f[0] * p.u + r[0] * p.lat, p.y, START.oz + f[1] * p.u + r[1] * p.lat)
  })
  return (
    <group ref={ref} rotation-y={YAW} visible={false}>
      <mesh geometry={shape} material={depthOnly} renderOrder={10} dispose={null} />
      <mesh geometry={shape} material={mat} renderOrder={11} dispose={null} />
    </group>
  )
}

const pbGhost = () => ghosts().pb
// the week's fastest, unless it is your own best (the same run twice would ride as one)
const leaderGhost = () => {
  const { pb, leader } = ghosts()
  return leader && pb && leader.u.length === pb.u.length && leader.u.every((v, i) => v === pb.u[i]) ? null : leader
}

/** Takes the kid's silhouette once they have stood still on the start line for a while. */
function useSilhouette(): THREE.BufferGeometry | null {
  const [got, setGot] = useState(shape)
  useFrame(() => {
    if (shape || !skater.root) return
    const { phase, count } = useTrial.getState()
    if (phase !== 'countdown' || count > 1) return
    shape = bakeSilhouette(skater.root)
    if (shape) setGot(shape)
  })
  return got
}

function Course() {
  const silhouette = useSilhouette()
  return (
    <>
      <Line u={TRIAL_START} finish={false} />
      <Line u={TRIAL_FINISH} finish />
      {silhouette && <GhostRider ghost={pbGhost} color="#2fa596" shape={silhouette} />}
      {silhouette && <GhostRider ghost={leaderGhost} color="#f0b429" shape={silhouette} />}
    </>
  )
}

export function TrialView() {
  const trial = useMode((s) => s.mode === 'trial')
  if (!trial || !input.started) return null
  return <Course />
}
