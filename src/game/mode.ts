import { create } from 'zustand'
import { input } from '../player/input'

// The two ways to ride the endless town. Arcade: obstacles, scores and the leaderboards, and a
// wipeout ends the run. Free roam: no obstacles and nothing scored, just the ride.
// Before anyone takes over, the landing page's attract ride (autopilot.ts) runs under free
// roam's rules too, whichever mode the player then picks.

export type Mode = 'arcade' | 'free'

export const useMode = create<{ mode: Mode }>(() => ({ mode: 'arcade' }))

/** Whether free roam's rules apply: in free roam, and on the attract ride before anyone takes over. */
export const freeRoam = () => useMode.getState().mode === 'free' || !input.started

// Blocks laid out under free roam's rules keep no obstacles for good. Back in arcade, none
// drops in right in front of the rider: they come back with the blocks that rise over the horizon.
const clearBlocks = new Set<string>()

export function switchMode() {
  const free = useMode.getState().mode !== 'free'
  if (free) clearBlocks.clear() // the blocks in view mark themselves again (keepClear)
  useMode.setState({ mode: free ? 'free' : 'arcade' })
}

/** Takes over from the autopilot in the given mode: the landing page's buttons. */
export function roll(mode: Mode) {
  if (useMode.getState().mode !== mode) switchMode()
  input.started = true
}

/** Marks a block (`seed:k`) as laid out under free roam's rules. */
export function keepClear(key: string) {
  clearBlocks.add(key)
}

/** Whether a block (`seed:k`) has its obstacles: never under free roam's rules, nor once laid out under them. */
export function hasObstacles(key: string, free = freeRoam()): boolean {
  return !free && !clearBlocks.has(key)
}
