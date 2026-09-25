// Tunable world constants.
export const CURVE = 0.015 // planet curvature (bigger = tighter horizon)
export const BLOCK = 16 // distance between intersections along a street
export const AHEAD = 4 // blocks of the current street rendered ahead
export const BEHIND = 2 // blocks rendered behind
export const BRANCH_DEPTH = 2 // how many blocks a side-street is rendered before you take it
export const SPAWN_R = 2 * 16 // radius (world units) to pre-spawn side-streets
export const CULL_R = 3 * 16 // radius beyond which streets are dropped
export const MAX_ROAD = 9 // widest a street gets (building setback)
export const BASE_SPEED = 8 // forward run speed
export const TURN_RATE = Math.PI / 2 / 0.9 // sweep 90° over ~0.9s

// Direction index -> unit vector. 0 = -Z (N), 1 = +X (E), 2 = +Z (S), 3 = -X (W).
export const DIR: ReadonlyArray<readonly [number, number]> = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
]
