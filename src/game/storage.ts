// localStorage for the arcade data (records, leaderboard, last name). Every access can throw
// (private mode, blocked storage), and the game plays on without it.

const PREFIX = 'wheelsoff:'

// Open the game with ?reset-records to start the records, the leaderboard, the remembered name
// and the music setting over. The flag is dropped from the URL straight away, so a reload keeps
// what comes after.
function resetIfAsked() {
  const url = new URL(location.href)
  if (!url.searchParams.has('reset-records')) return
  url.searchParams.delete('reset-records')
  history.replaceState(null, '', url)
  try {
    const keys = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i))
    for (const key of keys) if (key?.startsWith(PREFIX)) localStorage.removeItem(key)
  } catch {
    // storage blocked: nothing was kept to reset
  }
}

resetIfAsked()

/** Reads a stored value, or null. */
export function readJson(key: string): unknown {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null')
  } catch {
    return null
  }
}

export function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // storage blocked: the value still holds for this session
  }
}
