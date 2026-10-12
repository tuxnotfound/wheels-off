import { create } from 'zustand'
import { input, releaseKeys } from '../player/input'
import { DEFAULT_NAME, cleanName, nameAllowed, refreshBoards, rememberName, signRun } from './leaderboard'
import type { Board, Period } from './leaderboard'

// The arcade layer over the ride: the pause screen (P), the records (R), and the name entry
// after a run that makes a leaderboard. Each one holds the sim still and takes the keyboard
// from it.

/** Where a run places on each board (0 is first), null where it misses the top 10. */
export type Ranks = Record<Period, Record<Board, number | null>>

/** A finished run waiting for its name: what it scored and where it places. */
export type PendingRun = {
  id: number
  score: number
  streak: number
  ranks: Ranks
  prScore: boolean
  prStreak: boolean
}

type Menu = 'pause' | 'records' | null
// back: where closing the records returns to (the pause screen, or the ride or landing page)
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
  if (menu) refreshBoards()
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

/** Esc: back to the ride (or the landing page) from any menu. */
export function resume() {
  if (useArcade.getState().menu) show(null)
}

export function askForName(run: PendingRun) {
  useArcade.setState({ pending: run })
  hold(true)
}

/**
 * Signs the pending run onto the boards. A blank name, or one the boards turn away, signs as
 * DEFAULT_NAME (the name entry asks for another before it gets here).
 */
export function signName(typed: string) {
  const run = useArcade.getState().pending
  if (!run) return
  const clean = cleanName(typed)
  const name = nameAllowed(clean) ? clean : ''
  if (name) rememberName(name)
  signRun(name || DEFAULT_NAME, run.score, run.streak)
  useArcade.setState({ pending: null })
  hold(false)
}

/** Esc on the name entry: the run goes on no board. */
export function skipRun() {
  if (!useArcade.getState().pending) return
  useArcade.setState({ pending: null })
  hold(false)
}
