import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { TRIAL_FINISH, TRIAL_START, ghostAt } from '../../shared/trial'
import type { Ghost } from '../../shared/trial'
import { input } from '../player/input'
import { useMode } from '../game/mode'
import { START } from '../game/sim'
import { ghosts, trialClock } from '../game/trial'
import { patchCurve } from '../look/materials'
import { DIR } from './worldConfig'

// The time trial in the world (src/game/trial.ts): the start line and the checkered finish across
// the start street, and the ghosts riding the course with you: your best this week in teal, the
// week's fastest in gold. A ghost is a see-through kid on a board, unlit and cheap to draw. Both
// bend down with the world's curve (patchCurve), or far off they would float over the road.

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

function GhostRider({ ghost, color }: { ghost: () => Ghost | null; color: string }) {
  const ref = useRef<THREE.Group>(null!)
  const mat = useMemo(() => curved({ color, transparent: true, opacity: 0.6, depthWrite: false }), [color])
  useEffect(() => () => mat.dispose(), [mat])
  useFrame(() => {
    const g = ghost()
    ref.current.visible = g !== null
    if (!g) return
    const p = ghostAt(g, trialClock())
    ref.current.position.set(START.ox + f[0] * p.u + r[0] * p.lat, p.y, START.oz + f[1] * p.u + r[1] * p.lat)
  })
  return (
    <group ref={ref} rotation-y={YAW} visible={false}>
      <mesh material={mat} position={[0, 0.09, 0]}>
        <boxGeometry args={[0.24, 0.05, 0.82]} />
      </mesh>
      <mesh material={mat} position={[0, 0.66, 0]}>
        <capsuleGeometry args={[0.2, 0.5, 4, 10]} />
      </mesh>
      <mesh material={mat} position={[0, 1.22, 0]}>
        <sphereGeometry args={[0.24, 14, 10]} />
      </mesh>
    </group>
  )
}

const pbGhost = () => ghosts().pb
// the week's fastest, unless it is your own best (the same run twice would ride as one)
const leaderGhost = () => {
  const { pb, leader } = ghosts()
  return leader && pb && leader.u.length === pb.u.length && leader.u.every((v, i) => v === pb.u[i]) ? null : leader
}

export function TrialView() {
  const trial = useMode((s) => s.mode === 'trial')
  if (!trial || !input.started) return null
  return (
    <>
      <Line u={TRIAL_START} finish={false} />
      <Line u={TRIAL_FINISH} finish />
      <GhostRider ghost={pbGhost} color="#2fa596" />
      <GhostRider ghost={leaderGhost} color="#f0b429" />
    </>
  )
}
