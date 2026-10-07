import { create } from 'zustand'
import { input, releaseKeys } from '../player/input'
import { DEFAULT_NAME, cleanName, rememberName, signRun } from './leaderboard'

// The arcade layer over the ride: the pause screen (P), the records (R), and the name entry
// after a run that makes a leaderboard. Each one holds the sim still and takes the keyboard
// from it.

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

type Menu = 'pause' | 'records' | null
// back: where closing the records returns to (the pause screen, or the ride or title card)
type ArcadeState = { menu: Menu; back: Menu; pending: PendingRun | null }

export const useArcade = create<ArcadeState>(() => ({ menu: null, back: null, pending: null }))

export function isPaused(): boolean {
  const s = useArcade.getState()
  return s.menu !== null || s.pending !== null
}

function hold(on: boolean) {
  input.blocked = on
  if (on) releaseKeys()
}

function show(menu: Menu, back: Menu = null) {
  useArcade.setState({ menu, back })
  hold(menu !== null)
}

export function togglePause() {
  const s = useArcade.getState()
  if (s.pending) return // the name entry has its own keys
  show(s.menu ? null : 'pause')
}

export function toggleRecords() {
  const s = useArcade.getState()
  if (s.pending) return
  if (s.menu === 'records') show(s.back)
  else show('records', s.menu)
}

/** Esc: back to the ride (or the title card) from any menu. */
export function resume() {
  if (useArcade.getState().menu) show(null)
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
