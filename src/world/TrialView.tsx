import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { TRIAL_START, ghostAt } from '../../shared/trial'
import type { Ghost } from '../../shared/trial'
import { input } from '../player/input'
import { legs } from '../game/course'
import { useMode } from '../game/mode'
import { START, sim } from '../game/sim'
import type { Street } from '../game/sim'
import { ghosts, trialClock, useTrial } from '../game/trial'
import { patchCurve } from '../look/materials'
import { skater } from '../player/Skater'
import { bakeSilhouette } from './silhouette'
import { DIR } from './worldConfig'

// The time trial in the world (src/game/trial.ts): the start line across the start street, the
// checkered finish across the course's last street (course.ts), and the ghosts riding the course
// with you, wherever it turns: your best this week in teal, the
// week's fastest in gold. A ghost is the kid's own silhouette (silhouette.ts): the character on
// the board as it stands on the start line, taken once, two seconds into the first countdown,
// and drawn see-through in one flat layer: a depth-only pass first, so only the nearest surface
// takes the color. A ghost hides through the countdown (it would stand right on the kid), then
// never hides: whole while it is ahead, faint once level with the kid or behind, where it would
// sit between the camera and the kid and tint them. Both bend down with the world's curve
// (patchCurve), or far off they would float over the road.

const OPACITY = 0.55 // a ghost ahead
const FAINT = 0.15 // level with the kid, or behind (the depth pass keeps it to one layer, even on the kid)
const AHEAD = [0.5, 2] // meters ahead of the kid over which a ghost goes from faint to whole

/** A point on a street, u along it, in world space. */
function at(street: Street, u: number, y = 0): THREE.Vector3 {
  const f = DIR[street.dir]
  return new THREE.Vector3(street.ox + f[0] * u, y, street.oz + f[1] * u)
}

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

const lastLeg = legs[legs.length - 1]

function Line({ street, u, finish }: { street: Street; u: number; finish: boolean }) {
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
  const geo = useMemo(() => new THREE.PlaneGeometry(street.width, finish ? 1.2 : 0.35).rotateX(-Math.PI / 2), [street, finish])
  // made here, not by r3f, so freed here when the trial ends
  useEffect(
    () => () => {
      geo.dispose()
      mat.map?.dispose()
      mat.dispose()
    },
    [geo, mat],
  )
  return <mesh geometry={geo} material={mat} position={at(street, u, 0.02)} rotation-y={-(street.dir * Math.PI) / 2} />
}

// the kid's silhouette, kept for the session: the character doesn't change
let shape: THREE.BufferGeometry | null = null
const depthOnly = curved({ colorWrite: false })

function GhostRider({ ghost, color, shape }: { ghost: () => Ghost | null; color: string; shape: THREE.BufferGeometry }) {
  const ref = useRef<THREE.Group>(null!)
  const heading = useRef(0)
  const mat = useMemo(() => curved({ color, transparent: true, opacity: OPACITY, depthWrite: false }), [color])
  useEffect(() => () => mat.dispose(), [mat])
  useFrame(() => {
    const g = ghost()
    const running = useTrial.getState().phase !== 'countdown'
    ref.current.visible = g !== null && running
    if (!g || !running) return
    const p = ghostAt(g, trialClock())
    if (p.heading !== null) heading.current = p.heading
    // how far ahead of the kid, along the way the kid faces
    const ahead = (p.x - sim.px) * Math.sin(sim.heading) - (p.z - sim.pz) * Math.cos(sim.heading)
    mat.opacity = FAINT + (OPACITY - FAINT) * THREE.MathUtils.smoothstep(ahead, AHEAD[0], AHEAD[1])
    ref.current.position.set(p.x, p.y, p.z)
    ref.current.rotation.y = -heading.current
  })
  return (
    <group ref={ref} visible={false}>
      <mesh geometry={shape} material={depthOnly} renderOrder={10} dispose={null} />
      <mesh geometry={shape} material={mat} renderOrder={11} dispose={null} />
    </group>
  )
}

const pbGhost = () => ghosts().pb
// the week's fastest, unless it is your own best (the same run twice would ride as one)
const leaderGhost = () => {
  const { pb, leader } = ghosts()
  return leader && pb && leader.x.length === pb.x.length && leader.x.every((v, i) => v === pb.x[i]) ? null : leader
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
      <Line street={START} u={TRIAL_START} finish={false} />
      <Line street={lastLeg.street} u={lastLeg.toU} finish />
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
