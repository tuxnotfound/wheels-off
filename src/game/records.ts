// Personal records, kept in this browser across sessions: the best run score, and the
// longest unbroken time riding above STREAK_KMH. The streak itself is counted in the sim.
// A run lasts from one wipeout to the next. The records rise (and save) live, but a run
// only sets them when it ends, which is when the HUD announces them.

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

// Open the game with ?reset-records to start the records over. The flag is dropped from the
// URL straight away, so a reload keeps the new records.
function resetIfAsked() {
  const url = new URL(location.href)
  if (!url.searchParams.has('reset-records')) return
  url.searchParams.delete('reset-records')
  history.replaceState(null, '', url)
  try {
    localStorage.removeItem(KEY)
  } catch {
    // storage blocked: nothing was kept to reset
  }
}

resetIfAsked()
export const records = load()
/** The records as they stood when this run started. With no record yet (0) there is nothing to beat. */
const runStart = { ...records }
/** The streak record as it stood when the live streak began. */
let streakStart = records.streak
/** Whether the live score and streak are beating the records they started against. */
export const beating = { score: false, streak: false }

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

/** Raises the records to the live values. Saves at most every few seconds, and when the page hides. */
export function beatRecords(score: number, streak: number, now: number) {
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

/** Ends the run (a wipeout): returns the records it set, if any, and starts the next run against them. */
export function endRun(): { score: number | null; streak: number | null } | null {
  const score = runStart.score > 0 && records.score > runStart.score ? records.score : null
  const streak = runStart.streak > 0 && records.streak > runStart.streak ? records.streak : null
  runStart.score = records.score
  runStart.streak = records.streak
  return score === null && streak === null ? null : { score, streak }
}

window.addEventListener('pagehide', save)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') save()
})
