import { cleanSource } from '../../shared/play'

// The play tracker's side in the game (worker/play.ts): one session per page visit that rides,
// with where the visit came from, the runs ended and the seconds ridden. The session id is
// random and lives in memory only; nothing is stored in the browser. The row is made when the
// ride starts, and raised after each run, every minute of riding, and when the page is hidden
// or closed (sendBeacon, which survives the page going away).

const API = '/api/play'
const BEAT = 60 // seconds of riding between sends

/** The link's ?ref, else the referring site, else direct; the ref then leaves the address bar, so a copied address doesn't carry it on. */
function sourceOf(): string {
  const url = new URL(location.href)
  const ref = url.searchParams.get('ref')
  if (ref !== null) {
    url.searchParams.delete('ref')
    history.replaceState(history.state, '', url.pathname + url.search + url.hash)
    return cleanSource(ref)
  }
  try {
    const host = new URL(document.referrer).hostname
    if (host && host !== location.hostname) return cleanSource(host)
  } catch {
    // no referrer, or not a URL
  }
  return 'direct'
}

const source = sourceOf()
const play = { session: '', runs: 0, seconds: 0, sentAt: 0 }

function body(): string {
  return JSON.stringify({ session: play.session, source, runs: play.runs, seconds: Math.round(play.seconds * 10) / 10 })
}

function send() {
  if (!play.session) return
  play.sentAt = play.seconds
  void fetch(API, { method: 'POST', headers: { 'content-type': 'application/json' }, body: body(), keepalive: true }).catch(() => {
    // offline, or no API: the next send carries the counts
  })
}

function leaving() {
  if (play.session) navigator.sendBeacon?.(API, body())
}

/** The ride has started (the landing page was left): the session begins. */
export function playStarted() {
  if (play.session) return
  play.session = crypto.randomUUID()
  addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && leaving())
  addEventListener('pagehide', leaving)
  send()
}

/** A frame of riding, any mode, not paused. */
export function playRode(dt: number) {
  if (!play.session) return
  play.seconds += Math.min(dt, 0.25) // a stalled frame doesn't count as riding
  if (play.seconds - play.sentAt >= BEAT) send()
}

/** An arcade run ended (a wipeout, or leaving arcade) or a time trial run finished. */
export function playRunEnded() {
  if (!play.session) return
  play.runs += 1
  send()
}
