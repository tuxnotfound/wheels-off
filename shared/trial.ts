// The time trial, as the game (src/game/trial.ts, src/game/course.ts) and the API that keeps the
// week's times (worker/trial.ts) agree on it: the course's length, the ghost (a run's replay)
// and the checks a time has to pass before it goes on the board.

/**
 * The course: from the start line on the start street of the week's town, TRIAL_LENGTH meters of
 * streets with turns (src/game/course.ts lays them out) to the finish line.
 */
export const TRIAL_START = 6 // meters along the start street, where the kid waits for GO
export const TRIAL_LENGTH = 600 // about 43 s for a bot that clears everything; 50 to 60 for a good run
// The start line in world centimeters: the start street runs from the origin, heading -z.
const START_X = 0
const START_Z = -TRIAL_START * 100
/** The fastest the kid ever rides, meters a second: the sim's top speed (src/game/sim.ts). */
export const TOP_SPEED = 17
/** The fastest the kid carves across the street, meters a second (the sim's, too). */
export const CARVE_SPEED = 6.5
/** The speed the kid gets back when put back before a turn they missed, meters a second. */
export const RESPAWN_SPEED = 10
/**
 * How fast the kid can get going: the meters covered 1 to 5 s after GO, measured 2026-10-13
 * with push held from GO (the fastest start there is) at 45, 98 and 121 fps, which all agree.
 * The check allows a margin. Measure again after any change to the pushes in src/game/sim.ts.
 */
const RAMP = [0, 2.5, 10.7, 23.7, 39.2, 55.9] // meters after 0..5 s
const RAMP_MARGIN = 1.15
// Carving adds speed across the street, but the street's width caps how far: over WINDOW
// seconds the kid gets no further than top speed allows, plus WINDOW_SLACK meters (edge to
// edge across the widest street adds about 0.4 m to 51).
const WINDOW = 3
const WINDOW_SLACK = 0.6
/** Meters a tight line through the turns can save on the course's length (about 1.6 a turn). */
const PATH_SLACK = 15
export const GHOST_HZ = 10 // samples a second
export const TRIAL_MAX_TIME = 300 // seconds: a slower run is not signed

/**
 * A run's replay: where the kid was every 1/GHOST_HZ s from GO, in world centimeters, and the
 * samples that come right after a respawn (the jump back before a turn the kid missed).
 */
export type Ghost = { x: number[]; z: number[]; y: number[]; r: number[] }

const isInts = (a: unknown, n: number): a is number[] => Array.isArray(a) && a.length === n && a.every(Number.isInteger)

/**
 * Why a time and its ghost cannot be true, or null when they can. The ghost has to start on the
 * start line, get going no faster than the kid can from a standstill, never cover more ground
 * in WINDOW seconds than top speed allows (nor in one sample more than top speed and a full
 * carve together), and ride the course's length, counted only between samples: a respawn's jump
 * back is never progress. That floors a made-up ghost at the measured start and top speed all
 * the way; a real run loses time to the jumps and the turns on top of that, which the check
 * can't see (it doesn't know the obstacles).
 */
export function checkTrial(time: unknown, ghost: unknown): string | null {
  if (typeof time !== 'number' || !(time >= (TRIAL_LENGTH - PATH_SLACK) / TOP_SPEED && time <= TRIAL_MAX_TIME)) return 'time'
  const g = (ghost ?? {}) as Partial<Ghost>
  const n = Math.floor(time * GHOST_HZ) + 1 // a sample at GO, then one every 1/GHOST_HZ s up to the finish
  if (!Array.isArray(g.x) || Math.abs(g.x.length - n) > 1) return 'ghost length'
  const len = g.x.length
  if (!isInts(g.x, len) || !isInts(g.z, len) || !isInts(g.y, len)) return 'ghost'
  if (!Array.isArray(g.r) || !g.r.every((i) => Number.isInteger(i) && i > 0 && i < len)) return 'ghost'
  const jumps = new Set(g.r)
  if (Math.hypot(g.x[0] - START_X, g.z[0] - START_Z) > 50) return 'start'
  const step = (Math.hypot(TOP_SPEED, CARVE_SPEED) * 100) / GHOST_HZ // the furthest one sample can go, centimeters
  const span = WINDOW * GHOST_HZ
  const reach = (TOP_SPEED * WINDOW + WINDOW_SLACK) * 100
  const net = (a: number, b: number) => Math.hypot(g.x![b] - g.x![a], g.z![b] - g.z![a])
  let path = 0 // centimeters ridden
  let since = 0 // the sample the kid last started riding from (GO, or a respawn)
  for (let i = 1; i < len; i++) {
    if (g.y[i] < -5 || g.y[i] > 400) return 'place'
    if (jumps.has(i)) {
      since = i
      continue
    }
    const d = net(i - 1, i)
    if (d > step * 1.02 + 2) return 'speed'
    path += d
    if (i - since >= span && net(i - span, i) > reach + 2) return 'speed'
    const s = i / GHOST_HZ
    if (since === 0 && Number.isInteger(s) && s < RAMP.length && net(0, i) > RAMP[s] * 100 * RAMP_MARGIN) return 'start speed'
  }
  if (path + step < (TRIAL_LENGTH - PATH_SLACK) * 100) return 'short'
  return null
}

/**
 * Where a ghost was at a time from GO, in world meters, between its samples (held through a
 * respawn's jump, never sliding along it), and its heading; held at its last after the finish.
 */
export function ghostAt(ghost: Ghost, t: number): { x: number; z: number; y: number; heading: number | null } {
  const last = ghost.x.length - 1
  const f = Math.min(Math.max(t * GHOST_HZ, 0), last)
  const i = Math.min(Math.floor(f), Math.max(last - 1, 0))
  const jump = ghost.r.includes(i + 1)
  const a = jump ? 0 : f - i
  const at = (v: number[]) => (last < 1 ? v[0] : v[i] + (v[i + 1] - v[i]) * a) / 100
  const dx = last < 1 || jump ? 0 : ghost.x[i + 1] - ghost.x[i]
  const dz = last < 1 || jump ? 0 : ghost.z[i + 1] - ghost.z[i]
  // forward is (sin h, -cos h), as in the sim; no heading while standing still
  const heading = Math.hypot(dx, dz) > 1 ? Math.atan2(dx, -dz) : null
  return { x: at(ghost.x), z: at(ghost.z), y: at(ghost.y), heading }
}
