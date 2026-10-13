import { TRIAL_LENGTH, TRIAL_START } from '../../shared/trial'
import { START_SEED, h, hasBranch, laneLimit, setCourseWalls } from '../world/streetGen'
import type { Obstacle } from '../world/streetGen'
import { BLOCK, TURN_R } from '../world/worldConfig'
import { START, childStreet, setTurnRule, sim } from './sim'
import type { Street } from './sim'

// The time trial's course (trial.ts): TRIAL_LENGTH meters from the start line on the week's start
// street, through the week's town. Each leg runs 2 to 4 blocks, then turns into a side street,
// left or right, picked from the week's seed like the rest of the town; the last leg ends on the
// finish line. On the course only its own turns can be taken (the sim's turn rule), and just
// past each one, rows of barriers close the road ahead, deeper than one ollie can clear, so it
// can't be ridden straight on. A kid who misses a turn is put back RESPAWN_BACK meters before it.

/** A straight stretch of the course: from fromU to toU on a street, then its turn (none on the last). */
export type Leg = { street: Street; fromU: number; toU: number; s: number; turn: { k: number; side: number } | null }

export const ARC = (Math.PI / 2) * TURN_R // a turn's length along its centerline, meters
const MIN_BLOCKS = 2
const MAX_BLOCKS = 4
const WALL_ROWS = 3 // 2.5 m apart: an ollie stays above a barrier for at most about 5 m
const WALL_GAP = 2.5
const WALL_SPACING = 2 // meters between barriers across the road, so no gap lets the kid through
const RESPAWN_BACK = 25 // meters before the turn: 2.5 s at RESPAWN_SPEED to make it
const MIN_LAST = 2 * BLOCK // the last straight at least this long: the finish never sits right after a turn

/** The rows of barriers across a street just past the turn at intersection k. */
function wall(street: Street, k: number): Obstacle[] {
  // past the cross street: its half width, whichever side it's widest on
  const cross = Math.max(...[-1, 1].filter((side) => hasBranch(street.seed, k, side)).map((side) => childStreet(street, k, side).width)) / 2
  const lim = laneLimit(street.width)
  const n = Math.ceil((2 * lim) / WALL_SPACING) + 1
  const out: Obstacle[] = []
  for (let row = 0; row < WALL_ROWS; row++) {
    const u = k * BLOCK + cross + 2 + row * WALL_GAP
    for (let i = 0; i < n; i++) {
      const s = n > 1 ? -lim + (2 * lim * i) / (n - 1) : 0
      out.push({ id: `${street.seed}:${k}:wall:${row}:${i}`, kind: 'barrier', u, s, w: 2.4, d: 0.5, h: 0.9 })
    }
  }
  return out
}

function build(): Leg[] {
  const legs: Leg[] = []
  const walls = new Map<string, Obstacle[]>()
  let street = START
  let fromU = TRIAL_START
  let s = 0
  for (let n = 0; ; n++) {
    const blocks = MIN_BLOCKS + Math.floor(h(START_SEED, n, 911) * (MAX_BLOCKS - MIN_BLOCKS + 1))
    const pref = h(START_SEED, n, 912) < 0.5 ? -1 : 1
    // the first intersection that far along with a side street, the preferred side first
    let turn: Leg['turn'] = null
    const first = Math.ceil((fromU + blocks * BLOCK + TURN_R) / BLOCK)
    for (let k = first; k < first + 12 && !turn; k++) {
      for (const side of [pref, -pref]) if (!turn && hasBranch(street.seed, k, side)) turn = { k, side }
    }
    const toU = turn ? turn.k * BLOCK - TURN_R : Infinity
    // too little course left after this turn: no turn, the finish is on this street
    if (!turn || s + (toU - fromU) + ARC + MIN_LAST > TRIAL_LENGTH) {
      legs.push({ street, fromU, toU: fromU + (TRIAL_LENGTH - s), s, turn: null })
      break
    }
    legs.push({ street, fromU, toU, s, turn })
    walls.set(`${street.seed}:${turn.k}`, wall(street, turn.k))
    s += toU - fromU + ARC
    street = childStreet(street, turn.k, turn.side)
    fromU = TURN_R // where the sim leaves a turn onto the new street
  }
  setCourseWalls(walls)
  return legs
}

export const legs = build()
const bySeed = new Map(legs.map((leg, i) => [leg.street.seed, i]))
const last = legs[legs.length - 1]

/** The finish line: on the last leg's street, at this u. */
export const finish = { seed: last.street.seed, u: last.toU }

// on the course, the only turn a street lets you take is the course's own
setTurnRule((street, k, side) => {
  const turn = legs[bySeed.get(street.seed) ?? -1]?.turn
  return !!turn && turn.k === k && turn.side === side
})

/** The leg the kid is on, or -1 off the course. */
export function legNow(): number {
  return bySeed.get(sim.street.seed) ?? -1
}

/** Meters along the course to where the kid is (turns along their centerline), or null off it. */
export function progress(): number | null {
  const i = legNow()
  if (i < 0) return null
  const leg = legs[i]
  if (sim.arc) return leg.s + (leg.toU - leg.fromU) + (sim.arc.phi / (Math.PI / 2)) * ARC
  return leg.s + (sim.u - leg.fromU)
}

/** Whether the kid rode straight on past the turn of the leg they are on. */
export function missedTurn(): boolean {
  const leg = legs[legNow()]
  return !!leg?.turn && !sim.arc && sim.u > leg.turn.k * BLOCK + 2
}

/** Where a kid who missed the turn of the leg they are on goes back to. */
export function respawnPoint(): { street: Street; u: number } | null {
  const leg = legs[legNow()]
  if (!leg?.turn) return null
  return { street: leg.street, u: Math.max(leg.fromU, leg.toU - RESPAWN_BACK) }
}
