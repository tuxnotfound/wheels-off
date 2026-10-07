import { create } from 'zustand'
import { input, releaseKeys } from '../player/input'
import { DEFAULT_NAME, cleanName, rememberName, signRun } from './leaderboard'

// The arcade layer over the ride: the pause screen (P), and the name entry after a run that
// makes the leaderboard. Either one holds the sim still and takes the keyboard from it.

/** A finished run waiting for its name: what it scored and where it places. */
export type PendingRun = {
  id: number
  score: number
  streak: number
  scoreRank: number | null // 0 is first, null when it misses the top 10
  speedRank: number | null
  prScore: boolean
  prStreak: boolean
}

type ArcadeState = { menu: boolean; pending: PendingRun | null }

export const useArcade = create<ArcadeState>(() => ({ menu: false, pending: null }))

export function isPaused(): boolean {
  const s = useArcade.getState()
  return s.menu || s.pending !== null
}

function hold(on: boolean) {
  input.blocked = on
  if (on) releaseKeys()
}

export function togglePause() {
  const s = useArcade.getState()
  if (s.pending) return // the name entry has its own keys
  useArcade.setState({ menu: !s.menu })
  hold(!s.menu)
}

export function resume() {
  if (!useArcade.getState().menu) return
  useArcade.setState({ menu: false })
  hold(false)
}

export function askForName(run: PendingRun) {
  useArcade.setState({ pending: run })
  hold(true)
}

/** Signs the pending run onto the boards. null (Esc) or a blank name signs as DEFAULT_NAME. */
export function signName(typed: string | null) {
  const run = useArcade.getState().pending
  if (!run) return
  const name = typed === null ? '' : cleanName(typed)
  if (name) rememberName(name)
  signRun(name || DEFAULT_NAME, run.score, run.streak)
  useArcade.setState({ pending: null })
  hold(false)
}
