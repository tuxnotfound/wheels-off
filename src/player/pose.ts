import * as THREE from 'three'
import { input } from './input'
import { sim } from '../game/sim'

// The skate animation as numbers, computed once per frame from the sim. Riders
// (the procedural kid, or a VRM model) only map these onto their own joints.
// Angles use the rider's body frame: facing -Z, +X to the kid's right.

export const STANCE_YAW = -1.15 // regular stance: chest faces the right of the board
const PUSH_YAW = -0.3 // square up to the nose while pushing

export type Pose = {
  carveYaw: number // board yaw off the path while carving
  bodyYaw: number // sideways stance <-> squared up for a push
  headYaw: number // head turned to look down the street
  frontBend: number // front leg: thigh +a, knee -2a, foot +a keeps the foot flat
  backThigh: number
  backShin: number
  backFoot: number
  hipDrop: number // extra drop of the hips while pushing (meters, kid scale)
  torsoLean: number // negative leans forward
  armOut: number // 0 = hanging, PI/2 = straight out to the side
  armSwing: number // forward/back swing (left arm; right is mirrored)
  elbow: number
  roll: number // whole rider leaning into a carve (+ leans left)
  riderPitch: number
  boardPitch: number // ollie pop, nose up
  boardRoll: number
}

const damp = (a: number, b: number, lambda: number, dt: number) => a + (b - a) * (1 - Math.exp(-lambda * dt))

export function createPoseState() {
  return { bend: 0.2, push: 0, pushPhase: 0, roll: 0, yaw: 0, pitch: 0, armOut: 0.95 }
}
export type PoseState = ReturnType<typeof createPoseState>

export function stepPose(st: PoseState, dt: number): Pose {
  const t = sim.time
  const sinceJump = t - sim.jumpT
  const sinceLand = t - sim.landT
  const sinceBail = t - sim.bailT
  const bailing = sinceBail < 0.9

  st.yaw = damp(st.yaw, Math.atan2(sim.latVel, Math.max(sim.speed, 2)) * 0.9, 10, dt)

  // crouch: ride low, tuck in the air, squash on landing
  let bend = input.started ? 0.42 + Math.min(sim.speed / 17, 1) * 0.1 : 0.18
  if (!sim.grounded) bend = sinceJump < 0.08 ? 0.3 : 1.0
  if (sinceLand < 0.5) bend += 0.55 * Math.exp(-sinceLand * 9)
  if (bailing) bend = 0.8
  st.bend = damp(st.bend, bend, sim.grounded ? 16 : 10, dt)

  // pushing: square up, kick the back foot along the ground
  st.push = damp(st.push, sim.pushing ? 1 : 0, 6, dt)
  if (st.push > 0.01) st.pushPhase += dt * 1.5
  const ph = Math.sin(st.pushPhase * Math.PI * 2)
  const b = st.bend
  const bodyYaw = THREE.MathUtils.lerp(STANCE_YAW, PUSH_YAW, st.push)

  // arms: out for balance, up in the air, swinging on a push, flailing on a wipeout
  let out = 0.95 + Math.sin(t * 1.7) * 0.06
  if (!sim.grounded) out = 1.5
  if (bailing) out = 1.3 + Math.sin(t * 24) * 0.6
  out = THREE.MathUtils.lerp(out, 0.25, st.push)
  st.armOut = damp(st.armOut, out, 12, dt)

  // lean into carves and corners, wobble on a wipeout
  let roll = -(sim.latVel / 6.5) * 0.28 - sim.turnRate * 0.13
  if (bailing) roll = Math.sin(sinceBail * 18) * 0.5 * (1 - sinceBail / 0.9)
  st.roll = damp(st.roll, THREE.MathUtils.clamp(roll, -0.6, 0.6), 10, dt)

  // board: ollie pop (nose up, then level)
  let pitch = 0
  if (!sim.grounded) pitch = sinceJump < 0.12 ? (sinceJump / 0.12) * 0.55 : 0.55 * Math.exp(-(sinceJump - 0.12) * 7)
  st.pitch = damp(st.pitch, pitch, 25, dt)

  return {
    carveYaw: st.yaw,
    bodyYaw,
    headYaw: -bodyYaw * 0.85,
    frontBend: b + st.push * 0.25,
    backThigh: THREE.MathUtils.lerp(b, 0.15 + ph * 0.75, st.push),
    backShin: THREE.MathUtils.lerp(-2 * b, -0.25 - Math.max(0, ph) * 0.7, st.push),
    backFoot: THREE.MathUtils.lerp(b, 0.1, st.push),
    hipDrop: st.push * 0.04,
    torsoLean: -0.18 - b * 0.35 - st.push * 0.15,
    armOut: st.armOut,
    armSwing: -ph * 0.7 * st.push,
    elbow: -0.5,
    roll: st.roll,
    riderPitch: bailing ? -0.35 * Math.sin((sinceBail / 0.9) * Math.PI) : 0,
    boardPitch: st.pitch,
    boardRoll: st.roll * 0.45,
  }
}
