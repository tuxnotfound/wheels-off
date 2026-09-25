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
  // world-space outputs
  px: 0,
  pz: 0,
  heading: 0,
  turnRate: 0, // signed yaw rate along the path (rad/s), for leaning
  pushing: false,
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
  input.steerBuffer = Math.max(0, input.steerBuffer - dt)
  const bailing = sim.time - sim.bailT < BAIL_TIME

  // --- speed: push, brake, or settle to a cruise ---
  if (input.started) {
    let target = CRUISE
    if (input.z > 0) target = MAX_SPEED
    else if (input.z < 0) target = MIN_SPEED
    if (bailing) target = MIN_SPEED
    const rate = target > sim.speed ? (sim.grounded ? 0.9 : 0) : input.z < 0 ? 2.2 : 0.5
    sim.speed = damp(sim.speed, target, rate, dt)
    sim.pushing = sim.grounded && !bailing && (input.z > 0 || sim.speed < CRUISE - 1.5)
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
  }
  if (!sim.grounded) {
    sim.vy -= GRAVITY * dt
    sim.y += sim.vy * dt
    if (sim.y <= 0) {
      sim.y = 0
      sim.vy = 0
      sim.grounded = true
      sim.landT = sim.time
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
      sim.cleared.add(ob.id)
      sim.combo += 1
      sim.score += sim.combo
      sim.events.push({ kind: 'clear', text: sim.combo > 1 ? `OLLIE x${sim.combo}` : 'OLLIE!' })
    }
  }
  if (sim.hits.size > 400) sim.hits.clear()
  if (sim.cleared.size > 400) sim.cleared.clear()
}

place()

// dev-only handle for poking at the sim from the console / test scripts
if (import.meta.env.DEV) (window as unknown as { __sim: typeof sim }).__sim = sim
