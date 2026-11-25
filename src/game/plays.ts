import { cleanSource } from '../../shared/play'
import { PORTAL, api } from '../site'
import { readJson, writeJson } from './storage'

// The play tracker's side in the game (worker/play.ts): one session per page visit that rides,
// with where the visit came from, the runs ended and the seconds ridden. The session id is
// random and lives in memory only; nothing is stored in a player's browser. My own browsers
// carry one mark, set by opening the game with ?me=1, so their rides count as source `me` and
// the reads (README, Plays) leave them out: my address moves too often to tell them apart by
// it. On itch.io the frame's storage can't be marked that way, so my rides there still count.
// The row is made when the
// ride starts, and raised after each run, every minute of riding, and when the page is hidden
// or closed (sendBeacon, which survives the page going away).

const API = api('play')
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

const ME_KEY = 'wheelsoff:me'

/** Whether this is one of my browsers: ?me=1 marks it, ?me=0 unmarks it; the flag then leaves the address bar. */
function isMe(): boolean {
  const url = new URL(location.href)
  const mark = url.searchParams.get('me')
  if (mark !== null) {
    url.searchParams.delete('me')
    history.replaceState(history.state, '', url.pathname + url.search + url.hash)
    writeJson(ME_KEY, mark === '1')
  }
  return readJson(ME_KEY) === true
}

const from = PORTAL ? cleanSource(PORTAL) : sourceOf() // in a portal's frame, the portal is the source
const source = isMe() ? 'me' : from
const play = { session: '', runs: 0, seconds: 0, sentAt: 0 }

function body(): string {
  return JSON.stringify({ session: play.session, source, runs: play.runs, seconds: Math.round(play.seconds * 10) / 10 })
}

function send() {
  if (!play.session) return
  play.sentAt = play.seconds
  // plain text, so a portal build's cross-origin send needs no preflight (which keepalive can't wait for)
  void fetch(API, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: body(), keepalive: true }).catch(() => {
    // offline, or no API: the next send carries the counts
  })
}

function leaving() {
  if (play.session) navigator.sendBeacon?.(API, body())
}

/**
 * A random v4 UUID, the session id the API accepts. crypto.randomUUID exists only in a secure
 * context (https, or localhost): a phone trying the dev server over the LAN has neither, and
 * the throw froze the game on its first ride. getRandomValues works anywhere.
 */
function uuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40 // version 4
  b[8] = (b[8] & 0x3f) | 0x80 // variant 10
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

/** The ride has started (the landing page was left): the session begins. */
export function playStarted() {
  if (play.session) return
  play.session = uuid()
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
