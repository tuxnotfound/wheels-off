// The time trial, as the game (src/game/trial.ts) and the API that keeps the week's times
// (worker/trial.ts) agree on it: the course, the ghost (a run's replay) and the checks a time
// has to pass before it goes on the board.

/** The course: straight down the start street of the week's town, ten blocks from the start line. */
export const TRIAL_START = 6 // meters along the start street, where the kid waits for GO
export const TRIAL_LENGTH = 320
export const TRIAL_FINISH = TRIAL_START + TRIAL_LENGTH
/** The fastest the kid ever rides, meters a second: the sim's top speed (src/game/sim.ts). */
export const TOP_SPEED = 17
/**
 * How fast the kid can get going, measured 2026-10-13 with push held from GO (the fastest
 * start there is) at 45, 98 and 121 fps, which all agree: the most the speed grows in one
 * ghost sample (2.7 m/s), and the meters covered 1 to 5 s after GO. The checks allow a margin
 * over both. Measure again after any change to the pushes in src/game/sim.ts.
 */
export const MAX_GAIN = 3.5 // meters a second, in one sample
const RAMP = [0, 2.5, 10.7, 23.7, 39.2, 55.9] // meters after 0..5 s
const RAMP_MARGIN = 1.15
export const GHOST_HZ = 10 // samples a second
export const TRIAL_MAX_TIME = 300 // seconds: a slower run is not signed

/** A run's replay: where the kid was every 1/GHOST_HZ s from GO, in centimeters. */
export type Ghost = { u: number[]; lat: number[]; y: number[] }

const isInts = (a: unknown, n: number): a is number[] => Array.isArray(a) && a.length === n && a.every(Number.isInteger)

/**
 * Why a time and its ghost cannot be true, or null when they can. The ghost has to start on the
 * start line, reach the finish when the time says, never ride faster than the top speed, never
 * gain speed faster than a push can give it, and get going no faster than the kid can from a
 * standstill. That floors a made-up ghost at about 20.6 s: the measured start, then top speed
 * all the way. A real run can't hold top speed through the jumps: a bot that clears every
 * obstacle with perfect timing rode 22.6 s (2026-10-13). The obstacles live in the game, not
 * here, so those 2 s are open to a forged ghost; closing them means checking the ghost's jumps
 * against the course.
 */
export function checkTrial(time: unknown, ghost: unknown): string | null {
  if (typeof time !== 'number' || !(time >= TRIAL_LENGTH / TOP_SPEED && time <= TRIAL_MAX_TIME)) return 'time'
  const g = (ghost ?? {}) as Partial<Ghost>
  const n = Math.floor(time * GHOST_HZ) + 1 // a sample at GO, then one every 1/GHOST_HZ s up to the finish
  if (!Array.isArray(g.u) || Math.abs(g.u.length - n) > 1) return 'ghost length'
  const len = g.u.length
  if (!isInts(g.u, len) || !isInts(g.lat, len) || !isInts(g.y, len)) return 'ghost'
  if (Math.abs(g.u[0] - TRIAL_START * 100) > 50) return 'start'
  const step = (TOP_SPEED * 100) / GHOST_HZ // the furthest one sample can go, centimeters
  const last = g.u[len - 1]
  if (last > TRIAL_FINISH * 100 + 2 || last < TRIAL_FINISH * 100 - step * 1.1) return 'finish'
  const gain = (MAX_GAIN * 100) / GHOST_HZ
  let before = 0 // the kid stands still at GO
  for (let i = 1; i < len; i++) {
    const du = g.u[i] - g.u[i - 1]
    if (du < -2 || du > step * 1.02 + 2) return 'speed'
    if (du - before > gain + 2) return 'push'
    before = du
    if (Math.abs(g.lat[i]) > 500 || g.y[i] < -5 || g.y[i] > 400) return 'place'
  }
  for (let s = 1; s < RAMP.length && s * GHOST_HZ < len; s++) {
    if (g.u[s * GHOST_HZ] - g.u[0] > RAMP[s] * 100 * RAMP_MARGIN) return 'start speed'
  }
  return null
}

/** Where a ghost was at a time from GO, in meters, between its samples; held at its last after the finish. */
export function ghostAt(ghost: Ghost, t: number): { u: number; lat: number; y: number } {
  const last = ghost.u.length - 1
  const f = Math.min(Math.max(t * GHOST_HZ, 0), last)
  const i = Math.min(Math.floor(f), Math.max(last - 1, 0))
  const a = f - i
  const at = (v: number[]) => (last < 1 ? v[0] : v[i] + (v[i + 1] - v[i]) * a) / 100
  return { u: at(ghost.u), lat: at(ghost.lat), y: at(ghost.y) }
}
