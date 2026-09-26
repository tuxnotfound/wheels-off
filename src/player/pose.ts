import * as THREE from 'three'
import { input } from './input'
import { sim } from '../game/sim'

// The skate animation as numbers, computed once per frame from the sim. Riders (the VRM
// character or the procedural kid) only solve their legs to reach the feet and copy the
// rest onto their joints.
//
// Positions use the rider frame: origin on the deck top, board along Z (nose at -Z), +X
// the toe side, where a regular-stance kid faces and pushes. Yaws turn about +Y from
// "facing the nose" (0): the stance faces the toe side (about -PI/2).
// Both feet are targets, on the deck or on the road; the pelvis moves and the legs follow.

export const STANCE_YAW = -1.15 // regular stance: chest faces the right of the board
const PUSH_YAW = -0.3 // squared up to the nose while pushing
const BRAKE_YAW = -0.6
export const DECK_TOP = 0.096

/** The mounted rider's legs, in meters: length, ankle over the sole, half hip width, ankle to toes. */
export const riderLeg = { len: 0.62, ankle: 0.06, hipX: 0.08, foot: 0.09 }

// where the feet stand on the deck, and which way their toes point
const FRONT_Z = -0.2
const BACK_Z = 0.19
const FOOT = {
  stanceF: -1.25, // front foot angled a little toward the nose
  stanceB: -1.5, // back foot across the tail
  pushF: -0.2, // front foot pivoted to point down the board
  pushB: -0.1,
  brakeF: -0.75,
  brakeB: -0.35,
}

export type Foot = { pos: THREE.Vector3; yaw: number; toe: number }

export type Pose = {
  carveYaw: number // board yaw off the path while carving
  bodyYaw: number // pelvis: sideways stance <-> squared up; twists with each kick
  pelvis: THREE.Vector3 // midpoint between the hip joints
  front: Foot // kid's left in a regular stance
  back: Foot
  spineYaw: number // upper body turning against the pelvis, so the shoulders stay calmer
  headYaw: number // head turned to look down the street
  torsoLean: number // negative leans forward
  torsoSide: number // + leans toward the kid's left
  armOut: number // 0 = hanging, PI/2 = straight out to the side
  armSwing: number // forward/back swing (left arm; right is mirrored)
  elbowL: number // negative bends
  elbowR: number
  roll: number // whole rider leaning into a carve (+ leans left)
  riderPitch: number
  riderLift: number // rider raised off the deck (kickflip: feet clear the spinning board)
  boardPitch: number // ollie pop, nose up
  boardLean: number // deck tilting over the trucks in a carve
  boardFlip: number // kickflip spin about the board's long axis
  boardLift: number
}

const damp = (a: number, b: number, lambda: number, dt: number) => a + (b - a) * (1 - Math.exp(-lambda * dt))
const clamp = THREE.MathUtils.clamp
const lerp = THREE.MathUtils.lerp
const smooth = (t: number) => t * t * (3 - 2 * t)
const TAU = Math.PI * 2
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z)

/** Cubic Hermite: from p0 (velocity m0, m/s) to p1 (velocity m1) over T seconds, at u in 0..1. */
function hermite(p0: THREE.Vector3, m0: THREE.Vector3, p1: THREE.Vector3, m1: THREE.Vector3, T: number, u: number, out: THREE.Vector3) {
  const u2 = u * u
  const u3 = u2 * u
  return out
    .copy(p0)
    .multiplyScalar(2 * u3 - 3 * u2 + 1)
    .addScaledVector(m0, (u3 - 2 * u2 + u) * T)
    .addScaledVector(p1, -2 * u3 + 3 * u2)
    .addScaledVector(m1, (u3 - u2) * T)
}

/** Blend two foot positions, lifting the foot through the middle so it steps over the deck edge. */
function arcLerp(a: THREE.Vector3, b: THREE.Vector3, s: number, out: THREE.Vector3) {
  const lift = 0.08 * Math.sin(Math.PI * s) * Math.min(1, Math.abs(a.x - b.x) * 8) // before `out` may overwrite `a`
  out.lerpVectors(a, b, s)
  out.y += lift
  return out
}

// back-foot waypoints (set each frame from the rider's leg; y is ankle height)
const DECK_B = V()
const PLANT = V()
const READY = V()
const LIFT_END = V()
const TOE_OFF = V()
const BRAKE = V()
const _m0 = V()
const _m1 = V()
const LIFT_OUT = V() // lift ends, swing and home start: up and forward
const LAND = V() // foot velocity at the plant: down, and back along the board
let toeOff = 0.55 // toe pitch as the foot leaves the road

/**
 * Back foot during a push (rider frame), from the sim's push stage. Returns the toe pitch.
 * Hermite curves join the stages, with the velocity at the plant matching the foot's slide
 * along the board, so the foot lands and sticks instead of snapping into place.
 */
function pushFoot(out: THREE.Vector3): { toe: number; yaw: number } {
  const P = sim.push
  const lock = Math.min(sim.speed, P.stroke.lock)
  const heel = riderLeg.foot * Math.sin(toeOff) * 0.85 // ankle rise when rolled onto the ball of the foot
  const u = P.dur > 0 ? clamp(P.t / P.dur, 0, 1) : 0
  switch (P.stage) {
    case 'reach': {
      if (P.fromDeck) hermite(DECK_B, _m0.set(0.9, 1.6, -0.2), PLANT, LAND, P.dur, u, out)
      else hermite(READY, _m0.set(0.05, -0.3, -0.6), PLANT, LAND, P.dur, u, out)
      const yaw = P.fromDeck ? lerp(FOOT.stanceB, FOOT.pushB, smooth(u)) : FOOT.pushB
      return { toe: lerp(P.fromDeck ? 0 : 0.15, 0, u) - 0.12 * Math.sin(Math.PI * u), yaw }
    }
    case 'contact': {
      // on the road: the foot slides back along the board as the board rolls past it, and
      // rolls onto the ball of the foot as the leg reaches full stretch behind
      const s = clamp(P.sweep / (P.stroke.endZ - P.stroke.plantZ), 0, 1)
      const toe = toeOff * smooth(clamp((s - 0.55) / 0.45, 0, 1))
      out.set(PLANT.x, PLANT.y + riderLeg.foot * Math.sin(toe) * 0.85, P.stroke.plantZ + P.sweep)
      return { toe, yaw: FOOT.pushB }
    }
    case 'lift': {
      TOE_OFF.set(PLANT.x, PLANT.y + heel, P.endZ)
      hermite(TOE_OFF, _m0.set(0, 0.5, lock * (P.power ? 0.45 : 0.6)), LIFT_END, LIFT_OUT, P.dur, u, out)
      return { toe: lerp(toeOff, toeOff + 0.25, u), yaw: FOOT.pushB }
    }
    case 'swing':
      hermite(LIFT_END, LIFT_OUT, READY, _m1.set(0, -0.3, -0.6), P.dur, u, out)
      return { toe: lerp(toeOff + 0.25, 0.15, u), yaw: FOOT.pushB }
    case 'home':
      hermite(LIFT_END, LIFT_OUT, DECK_B, _m1.set(0, -0.4, 0.2), P.dur, u, out)
      return { toe: lerp(toeOff + 0.25, 0, smooth(u)), yaw: lerp(FOOT.pushB, FOOT.stanceB, smooth(u)) }
    default:
      out.copy(DECK_B)
      return { toe: 0, yaw: FOOT.stanceB }
  }
}

/** Where the push is in its rhythm, 0..1 from the plant; drives the pelvis, torso and arms. */
function pushPhase(): number {
  const P = sim.push
  const u = P.dur > 0 ? clamp(P.t / P.dur, 0, 1) : 0
  switch (P.stage) {
    case 'reach':
      return 0.8 + 0.2 * u
    case 'contact':
      return 0.3 * clamp(P.sweep / (P.stroke.endZ - P.stroke.plantZ), 0, 1)
    case 'lift':
      return 0.3 + 0.15 * u
    case 'swing':
    case 'home':
      return 0.45 + 0.35 * u
    default:
      return 0
  }
}

export function createPoseState() {
  return {
    bend: 0.2,
    hipY: 0.5,
    push: 0, // back foot following the push (vs on the deck)
    pushBody: 0, // body squared up for pushing
    power: 0, // power pushing (W held, accelerating): longer, lower, harder
    brake: 0,
    yawBase: STANCE_YAW,
    swing: 0,
    phase: 0,
    roll: 0,
    yaw: 0,
    pitch: 0,
    armOut: 0.95,
    lift: 0,
    stroke: V(), // last back-foot position on the push path (kept if a push is cut short)
    strokeToe: 0,
    strokeYaw: FOOT.stanceB,
    pose: null as Pose | null,
  }
}
export type PoseState = ReturnType<typeof createPoseState>

/** Highest the hip joint can be over a foot at `foot` and still reach it with a slightly bent leg. */
function reachHeight(hipX: number, hipZ: number, foot: THREE.Vector3): number {
  const r = 0.96 * riderLeg.len
  const flat = r * r - (foot.x - hipX) ** 2 - (foot.z - hipZ) ** 2
  return foot.y + Math.sqrt(Math.max(flat, 0.0025))
}

export function stepPose(st: PoseState, dt: number): Pose {
  const t = sim.time
  const sinceJump = t - sim.jumpT
  const sinceLand = t - sim.landT
  const sinceBail = t - sim.bailT
  const bailing = sinceBail < 0.9
  const flipping = sim.flipT > sim.jumpT
  const fp = flipping ? clamp((t - sim.flipT) / sim.flipDur, 0, 1) : 1
  const flipBump = flipping ? Math.sin(fp * Math.PI) : 0
  const rolling = sim.grounded && input.started ? Math.min(sim.speed / 17, 1) : 0
  const P = sim.push
  const pushing = P.stage !== 'idle'

  // power pushes (W held, still accelerating) stride longer and kick higher, from a lower,
  // more forward body, with the arms pumping like a runner's; easy pushes stay relaxed
  st.power = damp(st.power, pushing && P.power ? 1 : 0, 5, dt)
  const pp = smooth(st.power)

  // waypoints for this rider's legs
  const ankle = riderLeg.ankle
  const ground = -DECK_TOP + ankle
  DECK_B.set(0, ankle, BACK_Z)
  PLANT.set(lerp(0.23, 0.25, pp), ground, P.stroke.plantZ)
  READY.set(lerp(0.2, 0.22, pp), ground + lerp(0.14, 0.18, pp), lerp(-0.02, -0.07, pp))
  LIFT_END.set(lerp(0.21, 0.23, pp), ground + lerp(0.19, 0.26, pp), P.endZ + lerp(0.1, 0.12, pp))
  LIFT_OUT.set(-0.05, lerp(1.1, 1.3, pp), lerp(-1.3, -2.0, pp))
  LAND.set(0, lerp(-0.5, -0.8, pp), lerp(1.5, 2.2, pp))
  toeOff = lerp(0.55, 0.75, pp)
  BRAKE.set(0.2, ground, 0.3)

  st.yaw = damp(st.yaw, Math.atan2(sim.latVel, Math.max(sim.speed, 2)) * 0.9, 10, dt)

  // crouch: ride low (knees soaking up the road), tuck in the air (higher through a
  // kickflip), squash on landing
  let bend = input.started ? 0.55 + rolling * 0.12 + Math.sin(t * 19) * 0.012 * rolling + 0.1 * pp : 0.22
  if (!sim.grounded) bend = sinceJump < 0.08 ? 0.3 : 1.0 + flipBump * 0.2
  if (sinceLand < 0.5) bend += 0.55 * Math.exp(-sinceLand * 9)
  if (bailing) bend = 0.8
  st.bend = damp(st.bend, bend, sim.grounded ? 16 : 10, dt)

  // the push: the back foot follows the stage path; the body squares up for it and turns
  // back as the foot comes home
  st.push = damp(st.push, pushing ? 1 : 0, pushing ? 30 : 9, dt)
  st.pushBody = damp(st.pushBody, pushing && P.stage !== 'home' ? 1 : 0, 7, dt)
  st.brake = damp(st.brake, sim.braking ? 1 : 0, sim.braking ? 8 : 6, dt)
  if (pushing) {
    const f = pushFoot(st.stroke)
    st.strokeToe = f.toe
    st.strokeYaw = f.yaw
  }
  if (pushing) st.phase = pushPhase() // held when a push ends or is cut short, so nothing jumps
  const ph = st.phase
  // blend weights eased at both ends: an exponential approach starts at full speed, which
  // makes a foot leave the deck with a jerk
  const pb = smooth(st.pushBody)
  const pw = smooth(st.push)
  const bw = smooth(st.brake)
  const twist = -lerp(0.17, 0.24, pp) * Math.sin(TAU * (ph - 0.1)) * pb
  const drive = P.stage === 'contact' ? Math.sin((Math.PI * ph) / 0.3) * pb : 0

  st.yawBase = damp(st.yawBase, lerp(lerp(STANCE_YAW, PUSH_YAW, pb), BRAKE_YAW, bw), 7, dt)
  const bodyYaw = st.yawBase + twist
  const spineYaw = -twist * 0.75

  // feet
  const pose = (st.pose ??= {
    pelvis: V(),
    front: { pos: V(), yaw: 0, toe: 0 },
    back: { pos: V(), yaw: 0, toe: 0 },
  } as Pose)
  const back = pose.back
  arcLerp(DECK_B, st.stroke, pw, back.pos)
  back.toe = st.strokeToe * pw
  back.yaw = lerp(FOOT.stanceB, st.strokeYaw, pw)
  arcLerp(back.pos, BRAKE, bw, back.pos)
  back.toe = lerp(back.toe, -0.3, bw) // braking: heel on the road, toes up
  back.yaw = lerp(back.yaw, FOOT.brakeB, bw)
  const front = pose.front
  front.pos.set(0, ankle, FRONT_Z)
  front.yaw = lerp(lerp(FOOT.stanceF, FOOT.pushF, pb), FOOT.brakeF, bw)
  front.toe = 0

  // pelvis: between the feet when riding, over the front foot when pushing, easing back a
  // touch through the drive; as low as it must be for both feet to stay reachable
  const px = lerp(0, 0.035, pb) + 0.02 * bw
  const pz = lerp(0, lerp(-0.07, -0.1, pp) + lerp(0.06, 0.08, pp) * Math.sin(Math.PI * clamp(ph / 0.6, 0, 1)), pb)
  const bob = lerp(0.18, 0.24, pp) * Math.cos(TAU * (ph - 0.05)) * pb // sinks to plant, rises through the recovery
  const hx = riderLeg.hipX * Math.cos(bodyYaw)
  const hz = -riderLeg.hipX * Math.sin(bodyYaw)
  const reachF = reachHeight(px - hx, pz - hz, front.pos)
  const reachB = reachHeight(px + hx, pz + hz, back.pos)
  let hipTarget = Math.min(ankle + riderLeg.len * Math.cos(clamp(st.bend + bob + 0.08 * pb + 0.1 * bw, 0, 1.3)), reachF, reachB)
  // sink ahead of where the back foot is going (the end of the drive, the brake spot), so
  // the hips never have to drop in a hurry when it gets there; faded in through the swing
  // and out through the kick-up, so the target itself never steps
  const pu = P.dur > 0 ? smooth(clamp(P.t / P.dur, 0, 1)) : 0
  const ahead = { reach: P.fromDeck ? pu : 1, contact: 1, lift: 1 - pu, swing: pu, home: 0, idle: 0 }[P.stage]
  if (ahead > 0) {
    TOE_OFF.set(PLANT.x, PLANT.y + riderLeg.foot * Math.sin(toeOff) * 0.85, P.stroke.endZ)
    hipTarget = lerp(hipTarget, Math.min(hipTarget, reachHeight(px + hx, pz + hz, TOE_OFF)), ahead)
  }
  if (sim.braking) hipTarget = Math.min(hipTarget, reachHeight(px + hx, pz + hz, BRAKE))
  st.hipY = damp(st.hipY, hipTarget, 14, dt)
  // a foot on the road or the deck holds the hips down to where it can reach; a foot in
  // the air (the kick-up behind) must not drag them, the leg just stretches toward it
  const planted = Math.max(bw, { reach: pu, contact: 1, lift: 0, swing: 0, home: pu, idle: 1 }[P.stage])
  pose.pelvis.set(px, Math.min(st.hipY, reachF + 0.01, lerp(st.hipY, reachB + 0.01, planted)), pz)

  // arms: out for balance, up in the air, swinging against the kick (trailing it a little),
  // flailing on a wipeout
  let out = 0.75 + Math.sin(t * 1.7) * 0.06
  if (!sim.grounded) out = 1.5 + flipBump * 0.15
  if (bailing) out = 1.3 + Math.sin(t * 24) * 0.6
  out = lerp(out, lerp(0.6, 0.48, pp) + 0.1 * Math.cos(TAU * ph), pb)
  out = lerp(out, 0.9, bw)
  st.armOut = damp(st.armOut, out, 12, dt)
  st.swing = damp(st.swing, -lerp(0.62, 0.95, pp) * Math.sin(TAU * (ph - 0.06)) * pb, 14, dt)

  // lean into carves and corners, sway with the kick, wobble on a wipeout
  let roll = -(sim.latVel / 6.5) * 0.28 - sim.turnRate * 0.13 + lerp(0.09, 0.11, pp) * Math.sin(TAU * (ph - 0.1)) * pb
  if (bailing) roll = Math.sin(sinceBail * 18) * 0.5 * (1 - sinceBail / 0.9)
  st.roll = damp(st.roll, clamp(roll, -0.6, 0.6), 10, dt)

  // board: ollie pop (nose up, then level)
  let pitch = 0
  if (!sim.grounded) pitch = sinceJump < 0.12 ? (sinceJump / 0.12) * 0.55 : 0.55 * Math.exp(-(sinceJump - 0.12) * 7)
  st.pitch = damp(st.pitch, pitch, 25, dt)
  st.lift = damp(st.lift, flipBump * 0.26, 30, dt)

  const torsoLean = -0.18 - st.bend * 0.35 - pb * 0.12 - pp * 0.12 - drive * lerp(0.16, 0.22, pp) + bw * 0.12 + Math.sin(t * 2.3) * 0.015 * (1 - pb)
  const flipEase = fp < 0.5 ? 4 * fp * fp * fp : 1 - (-2 * fp + 2) ** 3 / 2
  pose.carveYaw = st.yaw
  pose.bodyYaw = bodyYaw
  pose.spineYaw = spineYaw
  pose.headYaw = -(bodyYaw + spineYaw) * 0.9 + Math.sin(t * 0.41) * 0.07 * (1 - pb)
  pose.torsoLean = torsoLean
  pose.torsoSide = 0.07 * Math.sin(TAU * (ph - 0.1)) * pb
  pose.armOut = st.armOut
  pose.armSwing = st.swing
  pose.elbowL = -0.45 - 0.45 * Math.max(0, st.swing) - 0.15 * pb - 0.35 * pp
  pose.elbowR = -0.45 - 0.45 * Math.max(0, -st.swing) - 0.15 * pb - 0.35 * pp
  pose.roll = st.roll
  pose.riderPitch = bailing ? -0.35 * Math.sin((sinceBail / 0.9) * Math.PI) : 0
  pose.riderLift = st.lift
  pose.boardPitch = st.pitch
  pose.boardLean = st.roll * 0.45
  pose.boardFlip = flipping && fp < 1 ? -2 * Math.PI * flipEase : 0
  pose.boardLift = flipBump * 0.12
  return pose
}

/** A rider-frame vector turned into the pelvis frame (undo the body yaw). */
export function toBody(v: THREE.Vector3, yaw: number, out: THREE.Vector3): THREE.Vector3 {
  const c = Math.cos(yaw)
  const s = Math.sin(yaw)
  return out.set(v.x * c - v.z * s, v.y, v.x * s + v.z * c)
}

export type LegAngles = { abduct: number; thigh: number; knee: number }

/**
 * Two-bone leg IK in a frame facing +Z with the leg hanging along -Y: `v` is hip to
 * ankle, with the leg (and so the knee and toes) turned by `twist` about Y. Apply as thigh
 * Euler (thigh, twist, abduct, 'YZX') and knee x = knee; positive thigh swings the foot
 * back, positive knee folds the shin back.
 */
export function solveLeg(v: THREE.Vector3, twist: number, l1: number, l2: number, out: LegAngles): LegAngles {
  const c = Math.cos(twist)
  const s = Math.sin(twist)
  const x = v.x * c - v.z * s
  const z = v.x * s + v.z * c
  out.abduct = Math.atan2(x, -v.y)
  const py = -Math.hypot(x, v.y)
  const d = clamp(Math.hypot(py, z), Math.abs(l1 - l2) + 1e-3, (l1 + l2) * 0.9995)
  const line = Math.atan2(-z, -py)
  const hipA = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1))
  out.thigh = line - hipA
  out.knee = Math.PI - Math.acos(clamp((l1 * l1 + l2 * l2 - d * d) / (2 * l1 * l2), -1, 1))
  return out
}

const _qa = new THREE.Quaternion()
const _qb = new THREE.Quaternion()
const X = new THREE.Vector3(1, 0, 0)
const Z = new THREE.Vector3(0, 0, 1)
/** Foot rotation (child of the knee) that undoes the leg's swing and abduction, leaving `toe` pitch. */
export function footFlat(a: LegAngles, toe: number, out: THREE.Quaternion): THREE.Quaternion {
  out.setFromAxisAngle(X, -(a.thigh + a.knee))
  out.multiply(_qa.setFromAxisAngle(Z, -a.abduct))
  return out.multiply(_qb.setFromAxisAngle(X, toe))
}
