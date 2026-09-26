import { useLayoutEffect, useRef } from 'react'
import * as THREE from 'three'
import { celRamp } from '../look/gradientMap'
import { curvedDepth, patchCurve, riderMat } from '../look/materials'
import { sim } from '../game/sim'
import { DECK_TOP } from './pose'
import type { Pose } from './pose'

const DECK = '#e2b04a'
const DECK_BOTTOM = '#d4513f' // shows off a kickflip
const GRIP = '#34403e'
const METAL = '#b9bdb8'
const WHEEL = '#6cc7b5'
const HUB = '#ece8df'

const DECK_W = 0.22
const DECK_L = 0.84
const DECK_T = 0.016
const GRIP_T = 0.002
const DECK_Y = DECK_TOP - GRIP_T - DECK_T / 2 // deck center
const WHEEL_R = 0.034
const WHEEL_W = 0.042
const TRACK = 0.106 // wheel centers, each side
const TRUCK_Z = 0.27
const PIVOT_Y = DECK_Y - DECK_T / 2 - 0.012 // the deck tilts over the trucks here
const KICK_Z = 0.3 // nose and tail kick up past here
const KICK_R = 0.12
const KICK_ANGLE = 0.42
const CONCAVE = 0.004
const STEER = 0.55 // truck turn per radian of deck lean

function kick(az: number): number {
  const t = az - KICK_Z
  if (t <= 0) return 0
  const tc = KICK_R * Math.sin(KICK_ANGLE)
  if (t < tc) return (t * t) / (2 * KICK_R)
  return KICK_R * (1 - Math.cos(KICK_ANGLE)) + (t - tc) * Math.tan(KICK_ANGLE)
}

/** Popsicle deck: a box bent into round ends, kicked nose and tail, and a little concave. */
function deckGeometry(w: number, t: number, l: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, t, l, 8, 1, 64)
  const p = g.attributes.position
  const r = w / 2
  const flat = l / 2 - r
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i)
    const z = p.getZ(i)
    const az = Math.abs(z)
    if (az > flat) x *= Math.sqrt(Math.max(0, 1 - ((az - flat) / r) ** 2))
    p.setXYZ(i, x, p.getY(i) + kick(az) + CONCAVE * (x / (DECK_W / 2)) ** 2, z)
  }
  g.computeVertexNormals()
  return g
}

/** Rounded urethane wheel, axle along X, with a hole for the hub. */
function wheelGeometry(): THREE.BufferGeometry {
  const r = WHEEL_R
  const h = WHEEL_W / 2
  const e = 0.01
  const inner = 0.011
  const pts = [new THREE.Vector2(inner, -h)]
  for (let i = 0; i <= 4; i++) {
    const a = (i / 4) * (Math.PI / 2)
    pts.push(new THREE.Vector2(r - e + Math.sin(a) * e, -h + e - Math.cos(a) * e))
  }
  for (let i = 0; i <= 4; i++) {
    const a = (i / 4) * (Math.PI / 2)
    pts.push(new THREE.Vector2(r - e + Math.cos(a) * e, h - e + Math.sin(a) * e))
  }
  pts.push(new THREE.Vector2(inner, h))
  return new THREE.LatheGeometry(pts, 24).rotateZ(Math.PI / 2)
}

const deckGeo = deckGeometry(DECK_W, DECK_T, DECK_L)
const gripGeo = deckGeometry(DECK_W - 0.014, GRIP_T, DECK_L - 0.016)
const wheelGeo = wheelGeometry()
const hubGeo = new THREE.CylinderGeometry(0.0115, 0.0115, WHEEL_W + 0.002, 12).rotateZ(Math.PI / 2)
const axleGeo = new THREE.CylinderGeometry(0.008, 0.008, TRACK * 2, 8).rotateZ(Math.PI / 2)
const markGeo = new THREE.PlaneGeometry(0.012, 0.018)
const blurGeo = new THREE.RingGeometry(WHEEL_R * 0.45, WHEEL_R * 0.88, 24)

// Wheel decals: a mark that shows the spin at walking pace, fading into a blur ring at
// speed (a mark spinning 30+ turns a second would only strobe).
function decalMat(color: string): THREE.MeshToonMaterial {
  const m = new THREE.MeshToonMaterial({ color, gradientMap: celRamp(), transparent: true, depthWrite: false, side: THREE.DoubleSide })
  m.onBeforeCompile = patchCurve
  m.customProgramCacheKey = () => 'toon-curve'
  return m
}
const markMat = decalMat('#fff7e6')
const blurMat = decalMat('#e2f7f1')

export type ApplyBoard = (p: Pose, dt: number) => void

/** The skateboard. The skater drives it each frame through `bind`, like a rider. */
export function Board({ bind }: { bind: (apply: ApplyBoard | null) => void }) {
  const root = useRef<THREE.Group>(null!)
  const flip = useRef<THREE.Group>(null!)
  const deck = useRef<THREE.Group>(null!)
  const trucks = useRef<THREE.Group[]>([])
  const wheels = useRef<THREE.Group[]>([])

  useLayoutEffect(() => {
    root.current.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && !((o as THREE.Mesh).material as THREE.Material).transparent) {
        o.castShadow = true
        o.customDepthMaterial = curvedDepth
      }
    })
    let spin = 0
    bind((p, dt) => {
      const speed = sim.speed
      root.current.rotation.set(p.boardPitch, 0, 0)
      flip.current.position.y = DECK_Y + p.boardLift
      flip.current.rotation.z = p.boardFlip
      deck.current.rotation.z = p.boardLean
      trucks.current[0].rotation.y = p.boardLean * STEER // nose truck turns into the lean
      trucks.current[1].rotation.y = -p.boardLean * STEER
      spin = (spin - (speed / WHEEL_R) * dt) % (Math.PI * 2)
      for (const w of wheels.current) w.rotation.x = spin
      markMat.opacity = 1 - THREE.MathUtils.smoothstep(speed, 2.5, 5.5)
      blurMat.opacity = 0.75 * THREE.MathUtils.smoothstep(speed, 2, 5)
    })
    return () => bind(null)
  }, [bind])

  return (
    <group ref={root}>
      <group ref={flip}>
        <group position-y={-DECK_Y}>
          <group ref={deck} position-y={PIVOT_Y}>
            <group position-y={-PIVOT_Y}>
              <mesh
                geometry={deckGeo}
                position-y={DECK_Y}
                material={[riderMat(DECK), riderMat(DECK), riderMat(DECK), riderMat(DECK_BOTTOM), riderMat(DECK), riderMat(DECK)]}
              />
              <mesh geometry={gripGeo} position-y={DECK_Y + DECK_T / 2 + GRIP_T / 2} material={riderMat(GRIP)} />
              {[-TRUCK_Z, TRUCK_Z].map((z) => (
                <mesh key={z} material={riderMat(METAL)} position={[0, DECK_Y - DECK_T / 2 - 0.006, z]} scale={[0.056, 0.012, 0.076]}>
                  <boxGeometry />
                </mesh>
              ))}
            </group>
          </group>
          {[-TRUCK_Z, TRUCK_Z].map((z, i) => (
            <group key={z} position={[0, WHEEL_R, z]} ref={(g) => { if (g) trucks.current[i] = g }}>
              <mesh material={riderMat(METAL)} position-y={0.016} scale={[0.08, PIVOT_Y - WHEEL_R - 0.004, 0.034]}>
                <boxGeometry />
              </mesh>
              <mesh geometry={axleGeo} material={riderMat(METAL)} />
              {[-1, 1].map((s, j) => (
                <group key={s} position-x={s * TRACK} ref={(g) => { if (g) wheels.current[i * 2 + j] = g }}>
                  <mesh geometry={wheelGeo} material={riderMat(WHEEL)} />
                  <mesh geometry={hubGeo} material={riderMat(HUB)} />
                  <mesh geometry={markGeo} material={markMat} position={[s * (WHEEL_W / 2 + 0.0012), WHEEL_R * 0.62, 0]} rotation-y={(s * Math.PI) / 2} />
                  <mesh geometry={blurGeo} material={blurMat} position-x={s * (WHEEL_W / 2 + 0.0016)} rotation-y={(s * Math.PI) / 2} />
                </group>
              ))}
            </group>
          ))}
        </group>
      </group>
    </group>
  )
}
