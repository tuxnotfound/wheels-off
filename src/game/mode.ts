import { create } from 'zustand'
import { input } from '../player/input'

// The three ways to ride the endless town. Arcade: obstacles, scores and the leaderboards, and a
// wipeout ends the run. Free roam: no obstacles and nothing scored, just the ride. Time trial:
// the week's course against the clock and the ghosts (trial.ts), straight down the start street.
// Before anyone takes over, the landing page's attract ride (autopilot.ts) runs under free
// roam's rules too, whichever mode the player then picks.

export type Mode = 'arcade' | 'free' | 'trial'

export const useMode = create<{ mode: Mode }>(() => ({ mode: 'arcade' }))

/** Whether free roam's rules apply: in free roam, and on the attract ride before anyone takes over. */
export const freeRoam = () => useMode.getState().mode === 'free' || !input.started

/** Whether the time trial's rules apply: on the course, where no side street can be taken. */
export const onCourse = () => useMode.getState().mode === 'trial' && input.started

// Blocks laid out under free roam's rules keep no obstacles for good. Back in arcade, none
// drops in right in front of the rider: they come back with the blocks that rise over the horizon.
const clearBlocks = new Set<string>()

export function setMode(mode: Mode) {
  if (useMode.getState().mode === mode) return
  // into free roam, the blocks in view mark themselves again (keepClear); into the time trial,
  // the course gets every obstacle back, whatever the attract ride or free roam cleared
  if (mode !== 'arcade') clearBlocks.clear()
  useMode.setState({ mode })
}

/** F: free roam, or back to arcade from it. */
export function switchMode() {
  setMode(useMode.getState().mode === 'free' ? 'arcade' : 'free')
}

/** Takes over from the autopilot in the given mode: the landing page's buttons. */
export function roll(mode: Mode) {
  input.started = true // first, so the blocks drawn again for the new mode no longer count as the attract ride's
  setMode(mode)
}

/** Marks a block (`seed:k`) as laid out under free roam's rules. */
export function keepClear(key: string) {
  clearBlocks.add(key)
}

/** Whether a block (`seed:k`) has its obstacles: never under free roam's rules, nor once laid out under them. */
export function hasObstacles(key: string, free = freeRoam()): boolean {
  return !free && !clearBlocks.has(key)
}
