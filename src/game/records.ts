// Personal records, kept in this browser across sessions: the best score, and the
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
/** The records as they stood when the page loaded, to tell a new PR from an old one. */
export const recordsAtLoad = { ...records }

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
