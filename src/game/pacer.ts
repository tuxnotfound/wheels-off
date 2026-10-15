// Frame pacing: a frame every Nth display refresh, N chosen so frames come at the target rate or
// the nearest one above it, evenly spaced. At a target of 120, 60, 120 and 144 Hz screens draw
// every refresh and a 240 Hz screen every other one. The refresh interval
// is the median gap between the browser's animation callbacks, so a slow frame or a jittery
// clock doesn't throw it off, and a frame is drawn once N refreshes have nearly passed since the
// last one, so a late callback is drawn, never skipped.

const WINDOW = 60 // callbacks the refresh interval is measured over
const LEARN = 10 // callbacks drawn while it is being measured

/** A pacer for the target rate: call it on every animation callback; true means draw. */
export function pacer(fps: number): (t: number) => boolean {
  const gaps: number[] = []
  let prev = -1
  let last = -Infinity
  return (t) => {
    if (prev >= 0 && t > prev) {
      gaps.push(t - prev)
      if (gaps.length > WINDOW) gaps.shift()
    }
    prev = t
    if (gaps.length >= LEARN) {
      const sorted = [...gaps].sort((a, b) => a - b)
      const period = sorted[sorted.length >> 1]
      // refreshes per frame, with a fifth of one to spare, so a jittery measure doesn't flip it
      const every = Math.max(1, Math.floor(1000 / fps / period + 0.2))
      if (t - last < (every - 0.5) * period) return false
    }
    last = t
    return true
  }
}
