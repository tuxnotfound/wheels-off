import { input } from '../player/input'
import { blockObstacles, childSeed, hasBranch, laneLimit, widthForSeed } from '../world/streetGen'
import { BLOCK, DIR, TURN_R } from '../world/worldConfig'

// The skate simulation: plain mutable state stepped once per frame, no React.
// The skater rides street centerlines offset by a lateral carve; turning at an
// intersection follows a true quarter-circle arc, so position and heading stay
// continuous through every corner.

export type Street = {
  seed: number
  ox: number // world origin (intersection 0)
  oz: number
  dir: number
  width: number
  minK: number
  u0: number // where this street's road starts (parent half-width), 0 for none
}

export function childStreet(s: Street, k: number, side: number): Street {
  const f = DIR[s.dir]
  const seed = childSeed(s.seed, k, side)
  return {
    seed,
    ox: s.ox + f[0] * k * BLOCK,
    oz: s.oz + f[1] * k * BLOCK,
    dir: (s.dir + side + 4) % 4,
    width: widthForSeed(seed),
    minK: 0,
    u0: s.width / 2,
  }
}

const CRUISE = 10
const MAX_SPEED = 17
const MIN_SPEED = 3
const LAT_SPEED = 6.5
const JUMP_V = 7.6
const GRAVITY = 25
const BOARD_HALF = 0.45
const BODY_HALF = 0.3
const BAIL_TIME = 0.9

// A push is a sequence of stages. The back foot leaves the deck and reaches for the road
// (reach), plants and drives back (contact), kicks up behind (lift), then either swings
// forward for another push (swing, then reach again) or comes home onto the tail (home).
// On the road the foot is locked to the ground: it slides back along the board at the
// board's speed, up to the stroke's lock speed, so it reads as a push and not a drag. The
// contact ends when the foot has swept from plantZ to endZ (board frame, meters), so it is
// long from a standstill and a quick kick at speed. Speed is only gained while the foot is
// down. Holding W below full speed makes power pushes: a longer stroke at a quicker beat.
export type PushStage = 'idle' | 'reach' | 'contact' | 'lift' | 'swing' | 'home'
export const STROKES = {
  easy: { plantZ: -0.14, endZ: 0.32, lock: 5.5, reach: 0.17, lift: 0.13, swing: 0.27 },
  power: { plantZ: -0.19, endZ: 0.37, lock: 7, reach: 0.13, lift: 0.11, swing: 0.2 },
}
const REACH_FROM_DECK = 0.26
const HOME_TIME = 0.28
const PUSH_GAIN = 0.36 // about 30% of the way to the target speed per push
const ROLL_FRICTION = 0.3
// At full speed, W holds it: the kid stops power pushing and only tops up now and then,
// like cruising, with less rolling loss so a push every few seconds is enough.
const HOLD_FRICTION = 0.12
const HOLD_BAND = 2.5 // drop this far under full speed and the power pushes come back
// braking drags the back foot: strong at speed, gentle near the end, and it reaches 0
const BRAKE_K = 0.6
const BRAKE_MIN = 1.3
// kickflip: a second jump press in the air, only if the board can come round before landing
const FLIP_TIME = 0.38
const FLIP_MIN_AIR = 0.26

// Coasting tops the speed up with a single stroke every few seconds, at uneven gaps so
// the rhythm never reads as a metronome.
const idleGap = () => 2.6 + Math.random() * 3.0

const damp = (a: number, b: number, lambda: number, dt: number) => a + (b - a) * (1 - Math.exp(-lambda * dt))

const START: Street = { seed: 1, ox: 0, oz: 0, dir: 0, width: widthForSeed(1), minK: -1, u0: 0 }

export const sim = {
  time: 0,
  street: START,
  u: 6,
  lat: 0,
  latVel: 0,
  speed: 0,
  arc: null as null | { to: Street; side: number; k: number; phi: number },
  prev: null as null | { street: Street; fromK: number; side: number },
  // vertical
  y: 0,
  vy: 0,
  grounded: true,
  jumpT: -10, // time of last ollie
  landT: -10, // time of last landing
  bailT: -10, // time of last hit
  flipT: -10, // time the kickflip of the current (or last) jump started
  flipDur: FLIP_TIME,
  airScored: false, // an obstacle was cleared during this jump
  // world-space outputs
  px: 0,
  pz: 0,
  heading: 0,
  turnRate: 0, // signed yaw rate along the path (rad/s), for leaning
  stroking: false, // a push is in progress (any stage but idle)
  push: {
    stage: 'idle' as PushStage,
    t: 0, // seconds into the stage
    dur: 0, // stage length (not contact: that ends by distance)
    fromDeck: true, // this reach started from the deck, not from a swing
    power: false, // a power push (W held, still accelerating)
    stroke: STROKES.easy,
    sweep: 0, // meters the planted foot has slid back along the board
    rate: 0, // speed gain rate during this contact
    endZ: 0, // where the contact ended
  },
  topSpeed: false, // W held at full speed: only occasional pushes
  braking: false,
  nextIdleT: 2.5, // time the next coasting stroke is due
  // scoring
  score: 0,
  combo: 0,
  distance: 0,
  hits: new Map<string, number>(), // obstacle id -> time it was hit
  cleared: new Set<string>(),
  events: [] as { kind: 'clear' | 'hit' | 'street'; text: string }[],
}

function turnIntent(): number {
  if (input.x !== 0) return input.x
  if (input.steerBuffer > 0) return input.steerSide
  return 0
}

/** Smallest arc radius that clears the inside sidewalk corner of an intersection. */
function innerRadius(fromWidth: number, toWidth: number): number {
  return Math.hypot(TURN_R - toWidth / 2, TURN_R - fromWidth / 2) + 0.8
}

/** The turn about to be taken: intent held toward a real side-street within ~0.8s. */
function approachingTurn(): { side: number; to: Street } | null {
  const side = turnIntent()
  if (!side) return null
  const k = Math.floor((sim.u + TURN_R) / BLOCK) + 1
  const dist = k * BLOCK - TURN_R - sim.u
  if (dist > Math.max(sim.speed, 4) * 0.8 || !hasBranch(sim.street.seed, k, side)) return null
  return { side, to: childStreet(sim.street, k, side) }
}

function place() {
  const s = sim.street
  const f = DIR[s.dir]
  const r = DIR[(s.dir + 1) % 4]
  const hDir = (s.dir * Math.PI) / 2
  if (sim.arc) {
    const { side, k, phi } = sim.arc
    const t: [number, number] = [r[0] * side, r[1] * side]
    const rho = TURN_R - side * sim.lat
    const ix = s.ox + f[0] * k * BLOCK
    const iz = s.oz + f[1] * k * BLOCK
    const cx = ix - f[0] * TURN_R + t[0] * TURN_R
    const cz = iz - f[1] * TURN_R + t[1] * TURN_R
    const c = Math.cos(phi)
    const sn = Math.sin(phi)
    sim.px = cx + (-t[0] * c + f[0] * sn) * rho
    sim.pz = cz + (-t[1] * c + f[1] * sn) * rho
    sim.heading = hDir + side * phi
    sim.turnRate = (side * sim.speed) / rho
  } else {
    sim.px = s.ox + f[0] * sim.u + r[0] * sim.lat
    sim.pz = s.oz + f[1] * sim.u + r[1] * sim.lat
    sim.heading = hDir
    sim.turnRate = 0
  }
}

/** The next intersection's turn options, when it is close enough to matter. */
export function upcomingTurn(): { left: boolean; right: boolean } | null {
  if (sim.arc || sim.speed < 1) return null
  const k = Math.floor((sim.u + TURN_R) / BLOCK) + 1
  const dist = k * BLOCK - TURN_R - sim.u
  if (dist / Math.max(sim.speed, 1) > 1.4) return null
  const left = hasBranch(sim.street.seed, k, -1)
  const right = hasBranch(sim.street.seed, k, 1)
  return left || right ? { left, right } : null
}

export function stepSim(dtRaw: number) {
  const dt = Math.min(dtRaw, 1 / 20)
  sim.time += dt
  input.jumpBuffer = Math.max(0, input.jumpBuffer - dt)
  input.flipBuffer = Math.max(0, input.flipBuffer - dt)
  input.steerBuffer = Math.max(0, input.steerBuffer - dt)
  const bailing = sim.time - sim.bailT < BAIL_TIME

  // --- speed: stroke, brake, or roll ---
  if (input.started) {
    sim.braking = input.z < 0 && sim.grounded && !bailing
    if (input.z <= 0) sim.topSpeed = false
    else if (sim.speed >= MAX_SPEED - 0.3) sim.topSpeed = true
    else if (sim.speed < MAX_SPEED - HOLD_BAND) sim.topSpeed = false
    const powering = input.z > 0 && !sim.topSpeed
    const cruising = sim.grounded && !bailing && !sim.braking && !powering
    if (!cruising) sim.nextIdleT = sim.time + idleGap()
    const idle = cruising && sim.time >= sim.nextIdleT
    if (idle) sim.nextIdleT = sim.time + idleGap()
    const want = sim.grounded && !bailing && input.z >= 0 && (powering || sim.speed < CRUISE - 1.5 || idle)

    const P = sim.push
    const stage = (next: PushStage, dur = 0) => {
      P.stage = next
      P.t = 0
      P.dur = dur
    }
    if (!sim.grounded || bailing || sim.braking) {
      if (P.stage !== 'idle') stage('idle') // aborted: the pose eases the foot back onto the deck
    } else {
      P.t += dt
      const len = P.stroke.endZ - P.stroke.plantZ
      if (P.stage === 'idle' && want) {
        P.power = powering
        P.stroke = powering ? STROKES.power : STROKES.easy
        stage('reach', REACH_FROM_DECK)
        P.fromDeck = true
      } else if (P.stage === 'reach' && P.t >= P.dur) {
        stage('contact')
        P.sweep = 0
        // spread the push over how long the foot will be down at this speed
        const contact = len / Math.min(Math.max(sim.speed, 1.5), P.stroke.lock)
        P.rate = PUSH_GAIN / Math.min(Math.max(contact, 0.08), 0.4)
      } else if (P.stage === 'contact') {
        P.sweep += Math.min(sim.speed, P.stroke.lock) * dt
        if (P.sweep >= len || P.t > 0.6) {
          P.endZ = P.stroke.plantZ + Math.min(P.sweep, len)
          stage('lift', P.stroke.lift)
        }
      } else if (P.stage === 'lift' && P.t >= P.dur) {
        stage(want ? 'swing' : 'home', want ? P.stroke.swing : HOME_TIME)
      } else if (P.stage === 'swing' && P.t >= P.dur) {
        if (want) {
          P.power = powering
          P.stroke = powering ? STROKES.power : STROKES.easy
          stage('reach', P.stroke.reach)
          P.fromDeck = false
        } else stage('home', HOME_TIME)
      } else if (P.stage === 'home' && P.t >= P.dur) stage('idle')
    }
    sim.stroking = P.stage !== 'idle'
    const contact = P.stage === 'contact'

    if (sim.braking) sim.speed = Math.max(0, sim.speed - (sim.speed * BRAKE_K + BRAKE_MIN) * dt)
    else if (bailing) sim.speed = damp(sim.speed, MIN_SPEED, 0.5, dt)
    else if (contact) {
      // aim a little past the target so the last pushes don't crawl up to it
      const target = input.z > 0 ? MAX_SPEED + 1 : CRUISE + 0.8
      sim.speed = Math.min(MAX_SPEED, Math.max(sim.speed, damp(sim.speed, target, sim.push.rate, dt)))
    } else if (sim.grounded) {
      if (sim.speed > CRUISE && input.z === 0) sim.speed = damp(sim.speed, CRUISE, 0.5, dt)
      sim.speed = Math.max(0, sim.speed - (sim.topSpeed ? HOLD_FRICTION : ROLL_FRICTION) * dt)
    }
  }

  // --- lateral carve, softly held inside the lane ---
  const lim = sim.arc ? Math.min(laneLimit(sim.street.width), laneLimit(sim.arc.to.width)) : laneLimit(sim.street.width)
  const steer = bailing ? 0 : input.x * (sim.grounded ? 1 : 0.55)
  sim.latVel = damp(sim.latVel, steer * LAT_SPEED * Math.min(1, sim.speed / 4), 9, dt)
  sim.lat += sim.latVel * dt
  if (Math.abs(sim.lat) > lim) {
    sim.lat = damp(sim.lat, Math.sign(sim.lat) * lim, 14, dt)
    if (Math.sign(sim.latVel) === Math.sign(sim.lat)) sim.latVel *= 0.5
  }
  // swing wide through a corner (and on the approach to one) so the arc never clips the curb
  const corner = sim.arc ? { side: sim.arc.side, to: sim.arc.to } : approachingTurn()
  if (corner) {
    const inner = TURN_R - innerRadius(sim.street.width, corner.to.width)
    if (corner.side * sim.lat > inner) {
      if (Math.sign(sim.latVel) === corner.side) sim.latVel = 0
      sim.lat = damp(sim.lat, corner.side * inner, 8, dt)
    }
  }

  // --- ollie ---
  if (input.jumpBuffer > 0 && sim.grounded && !bailing && input.started) {
    input.jumpBuffer = 0
    sim.vy = JUMP_V
    sim.grounded = false
    sim.jumpT = sim.time
    sim.airScored = false
  }
  if (input.flipBuffer > 0 && !sim.grounded && !bailing && sim.flipT < sim.jumpT) {
    const airLeft = (sim.vy + Math.sqrt(sim.vy * sim.vy + 2 * GRAVITY * sim.y)) / GRAVITY
    if (airLeft > FLIP_MIN_AIR) {
      input.flipBuffer = 0
      sim.flipT = sim.time
      sim.flipDur = Math.min(FLIP_TIME, airLeft - 0.06)
    }
  }
  if (!sim.grounded) {
    sim.vy -= GRAVITY * dt
    sim.y += sim.vy * dt
    if (sim.y <= 0) {
      sim.y = 0
      sim.vy = 0
      sim.grounded = true
      sim.landT = sim.time
      // a flip over nothing still counts, a little
      if (sim.flipT > sim.jumpT && !sim.airScored && !bailing) {
        sim.score += 2
        sim.events.push({ kind: 'clear', text: 'KICKFLIP!' })
      }
    }
  }

  // --- advance along the path ---
  let dist = sim.speed * dt
  sim.distance += dist
  if (sim.arc) {
    const rho = TURN_R - sim.arc.side * sim.lat
    sim.arc.phi += dist / rho
    const over = sim.arc.phi - Math.PI / 2
    if (over >= 0) {
      const { to, side, k } = sim.arc
      sim.prev = { street: sim.street, fromK: k, side }
      sim.street = to
      sim.u = TURN_R + over * rho
      sim.arc = null
      sim.events.push({ kind: 'street', text: '' })
    }
    dist = 0
  }
  if (!sim.arc && dist > 0) {
    const uPrev = sim.u
    sim.u += dist
    const kPrev = Math.floor((uPrev + TURN_R) / BLOCK)
    const kT = Math.floor((sim.u + TURN_R) / BLOCK)
    const side = turnIntent()
    if (kT > kPrev && side !== 0 && hasBranch(sim.street.seed, kT, side)) {
      input.steerBuffer = 0
      const rho = TURN_R - side * sim.lat
      sim.arc = { to: childStreet(sim.street, kT, side), side, k: kT, phi: (sim.u - (kT * BLOCK - TURN_R)) / rho }
      sim.u = kT * BLOCK - TURN_R
    } else {
      collide(uPrev)
    }
  }

  // forget the street we turned off once it is well behind (hidden by the curve)
  if (sim.prev && !sim.arc && sim.u > 2 * BLOCK) sim.prev = null
  place()
}

function collide(uPrev: number) {
  const s = sim.street
  const kb = Math.floor(sim.u / BLOCK)
  for (const ob of blockObstacles(s.seed, kb, s.width)) {
    if (sim.hits.has(ob.id) || sim.cleared.has(ob.id)) continue
    const latHit = Math.abs(sim.lat - ob.s) < ob.w / 2 + BODY_HALF
    if (!latHit) continue
    const overlap = Math.abs(sim.u - ob.u) < ob.d / 2 + BOARD_HALF
    if (overlap && sim.y < ob.h - 0.02) {
      sim.hits.set(ob.id, sim.time)
      sim.bailT = sim.time
      sim.speed *= 0.35
      sim.combo = 0
      sim.events.push({ kind: 'hit', text: 'WIPEOUT!' })
      return
    }
    if (uPrev < ob.u && sim.u >= ob.u && sim.y >= ob.h - 0.02) {
      const flip = !sim.grounded && sim.flipT > sim.jumpT
      const trick = flip ? 'KICKFLIP' : 'OLLIE'
      sim.cleared.add(ob.id)
      sim.airScored = true
      sim.combo += 1
      sim.score += flip ? sim.combo * 2 : sim.combo
      sim.events.push({ kind: 'clear', text: sim.combo > 1 ? `${trick} x${sim.combo}` : `${trick}!` })
    }
  }
  if (sim.hits.size > 400) sim.hits.clear()
  if (sim.cleared.size > 400) sim.cleared.clear()
}

place()

// dev-only handle for poking at the sim from the console / test scripts
if (import.meta.env.DEV) (window as unknown as { __sim: typeof sim }).__sim = sim
