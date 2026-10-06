// Personal records, kept in this browser across sessions: the best run score, and the
// longest unbroken time riding above STREAK_KMH. The streak itself is counted in the sim.

export const STREAK_KMH = 58

type Records = { score: number; streak: number } // streak in seconds

const KEY = 'wheelsoff:records'
const SAVE_EVERY = 2 // seconds, while a record is climbing

function load(): Records {
  try {
    const r = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    return { score: Number(r.score) || 0, streak: Number(r.streak) || 0 }
  } catch {
    return { score: 0, streak: 0 }
  }
}

export const records = load()
/**
 * The records the current run has to beat: each as it stood when its live value was last 0
 * (the score at a wipeout, the streak when it broke). A run is beating its record while
 * the record has climbed past this.
 */
export const standing = { ...records }

let dirty = false
let savedAt = -Infinity

function save() {
  if (!dirty) return
  dirty = false
  try {
    localStorage.setItem(KEY, JSON.stringify(records))
  } catch {
    // private mode or storage blocked: the records still hold for this session
  }
}

/** Raises the records to the current run. Saves at most every few seconds, and when the page hides. */
export function beatRecords(score: number, streak: number, now: number) {
  if (score === 0) standing.score = records.score
  if (streak === 0) standing.streak = records.streak
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

window.addEventListener('pagehide', save)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') save()
})
