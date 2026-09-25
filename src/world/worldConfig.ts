// Tunable world constants.
export const CURVE = 0.006 // planet curvature (bigger = tighter horizon)
export const BLOCK = 32 // distance between intersections along a street
export const AHEAD = 3 // blocks of the current street rendered ahead
export const BEHIND = 1 // blocks rendered behind
export const BRANCH_DEPTH = 2 // blocks of a side-street rendered before you take it
export const TURN_R = 6 // centerline radius of the arc carved through an intersection
export const SIDEWALK = 2.2 // sidewalk width
export const CURB = 0.16 // sidewalk height
// Obstacles only live in the straight middle of a block, clear of the turn arcs.
export const OBST_MIN = TURN_R + 4
export const OBST_MAX = BLOCK - TURN_R - 4

// Direction index -> unit vector. 0 = -Z (N), 1 = +X (E), 2 = +Z (S), 3 = -X (W).
// Heading angle h for direction i is i*PI/2; forward(h) = (sin h, -cos h).
export const DIR: ReadonlyArray<readonly [number, number]> = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
]
