import { create } from 'zustand'

// The two ways to ride the endless town. Arcade: obstacles, scores and the leaderboards, and a
// wipeout ends the run. Free roam: no obstacles and nothing scored, just the ride.

export type Mode = 'arcade' | 'free'

export const useMode = create<{ mode: Mode }>(() => ({ mode: 'arcade' }))

export const freeRoam = () => useMode.getState().mode === 'free'

// Blocks laid out during free roam keep no obstacles for good. Back in arcade, none drops in
// right in front of the rider: they come back with the blocks that rise over the horizon.
const clearBlocks = new Set<string>()

export function switchMode() {
  const free = !freeRoam()
  if (free) clearBlocks.clear() // the blocks in view mark themselves again (keepClear)
  useMode.setState({ mode: free ? 'free' : 'arcade' })
}

/** Marks a block (`seed:k`) as laid out in free roam. */
export function keepClear(key: string) {
  clearBlocks.add(key)
}

/** Whether a block (`seed:k`) has its obstacles: never in free roam, nor once laid out in it. */
export function hasObstacles(key: string, free = freeRoam()): boolean {
  return !free && !clearBlocks.has(key)
}
