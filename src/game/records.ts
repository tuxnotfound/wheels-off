import { readJson, writeJson } from './storage'

// Personal records, kept in this browser across sessions: the best run score, and the
// longest unbroken time riding above STREAK_KMH. The streak itself is counted in the sim.
// A run lasts from one wipeout to the next. The records rise (and save) live, but a run
// only sets them when it ends, which is when the HUD announces them.

export const STREAK_KMH = 58

type Records = { score: number; streak: number } // streak in seconds

const KEY = 'wheelsoff:records'
const SAVE_EVERY = 2 // seconds, while a record is climbing

function load(): Records {
  const r = readJson(KEY) as Partial<Records> | null
  return { score: Number(r?.score) || 0, streak: Number(r?.streak) || 0 }
}

export const records = load()
/** The records as they stood when this run started. With no record yet (0) there is nothing to beat. */
const runStart = { ...records }
/** The streak record as it stood when the live streak began. */
let streakStart = records.streak
/** Whether the live score and streak are beating the records they started against. */
export const beating = { score: false, streak: false }
/** The best of the run so far: its score (which only climbs until the wipeout) and its longest streak. */
const run = { score: 0, streak: 0 }

let dirty = false
let savedAt = -Infinity

function save() {
  if (!dirty) return
  dirty = false
  writeJson(KEY, records)
}

/** Raises the records to the live values. Saves at most every few seconds, and when the page hides. */
export function beatRecords(score: number, streak: number, now: number) {
  run.score = Math.max(run.score, score)
  run.streak = Math.max(run.streak, streak)
  if (streak === 0) streakStart = records.streak
  beating.score = runStart.score > 0 && score > runStart.score
  beating.streak = streakStart > 0 && streak > streakStart
  if (score > records.score) {
    records.score = score
    dirty = true
  }
  if (streak > records.streak) {
    records.streak = streak
    dirty = true
  }
  if (dirty && now - savedAt >= SAVE_EVERY) {
    savedAt = now
    save()
  }
}

/** A finished run: its score and longest streak, and which personal records it set. */
export type RunEnd = { score: number; streak: number; prScore: boolean; prStreak: boolean }

/** Ends the run (a wipeout) and starts the next one against the records as they now stand. */
export function endRun(): RunEnd {
  const end = {
    score: run.score,
    streak: run.streak,
    prScore: runStart.score > 0 && records.score > runStart.score,
    prStreak: runStart.streak > 0 && records.streak > runStart.streak,
  }
  runStart.score = records.score
  runStart.streak = records.streak
  streakStart = records.streak // a run can end mid-streak (switching to free roam)
  run.score = 0
  run.streak = 0
  return end
}

window.addEventListener('pagehide', save)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') save()
})
