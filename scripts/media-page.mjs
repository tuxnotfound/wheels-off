// The game in headless Chromium, for the scripts that shoot it (preview-media.mjs, art-shots.mjs).
// It runs on a Vite dev server, its API on a dead address, so no test ride reaches the site's
// tracker or boards. Frames are drawn on a virtual clock (virtual-clock.js), so each one lands at
// an exact time however slowly it renders, and ridden by a script that picks a line across the
// street and times each jump from the sim's own numbers.
// Needs Playwright's Chromium (`npx playwright-core install chromium`).
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright-core'
import { createServer } from 'vite'

const clock = readFileSync(new URL('./virtual-clock.js', import.meta.url), 'utf8')
// For a ride that repeats frame for frame: Math.random seeded, and the virtual clock on from the
// page's first script, so nothing moves (not even the attract ride) until the script steps it
const frozen = `(() => {
  let s = 1
  Math.random = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
  window.__vstart()
})()`

/** A dev server built for `portal` (or the site) and a browser to open the game in. */
export async function launch(portal) {
  if (portal) process.env.VITE_PORTAL = portal
  process.env.VITE_SITE = 'http://127.0.0.1:9'
  const server = await createServer({ logLevel: 'error' })
  await server.listen()
  const url = server.resolvedUrls.local[0]
  const browser = await chromium.launch({ channel: 'chromium', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio'] })
  return {
    /**
     * The landing page in a fresh context, art loaded and shaders compiled. Frozen, the page is on
     * the virtual clock from the start (no startClock), and the ride that follows repeats exactly.
     */
    async open({ w, h, dpr = 1, touch = false, frozen: freeze = false, query = '' }) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, isMobile: touch, hasTouch: touch })
      await ctx.addInitScript({ content: clock })
      if (freeze) await ctx.addInitScript({ content: frozen })
      const page = await ctx.newPage()
      page.on('pageerror', (e) => console.error('page error:', e.message))
      await page.goto(url + query, { waitUntil: 'domcontentloaded', timeout: 90000 })
      await page.waitForSelector('.landing__title', { timeout: 90000 })
      await page.waitForTimeout(6000)
      return page
    },
    async close() {
      await browser.close()
      await server.close()
    },
  }
}

/** Puts the page on the virtual clock: from here on, time moves only by step(). */
export const startClock = (page) => page.evaluate(() => window.__vstart())

/** Moves the virtual clock n 60 Hz steps, a frame drawn at each. */
export const step = (page, n) =>
  page.evaluate(async (n) => {
    for (let i = 0; i < n; i++) await window.__vstep(1000 / 60)
  }, n)

/** Into arcade the way a player goes: a click, or a tap on a touch screen. */
export const startArcade = (page, touch) => (touch ? page.tap('.mode-card--arcade') : page.click('.mode-card--arcade'))

/** The run so far: its score, and whether the kid hit anything. */
export const ride = (page) => page.evaluate(() => ({ score: window.__sim.score, hits: window.__sim.hits.size }))

/**
 * The rider, in the page, on the game's own modules: once the ride is the player's, it picks a
 * line across the street that a jump can take for the obstacles in the next 32 m, and jumps at
 * the middle of the window that clears every obstacle met in the air (half the jumps kickflips).
 * Run it with page.evaluate(rider).
 */
export function rider() {
  return import('/src/world/streetGen.ts').then(async ({ obstaclesFor, laneLimit }) => {
    const { hasObstacles } = await import('/src/game/mode.ts')
    const { input, touchSteer } = await import('/src/player/input.ts')
    const { BLOCK } = await import('/src/world/worldConfig.ts')
    const sim = window.__sim
    const JV = 7.6 // sim.ts: JUMP_V
    const G = 25 // sim.ts: GRAVITY
    const BOARD = 0.45 // sim.ts: BOARD_HALF
    const BODY = 0.3 // sim.ts: BODY_HALF
    const MARGIN = 0.1
    let seed = 7
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647
    let lane = null

    window.__V.tick = () => {
      if (!input.started) return
      const s = sim.street
      const lim = laneLimit(s.width)
      const v = Math.max(sim.speed, 1)
      const air = (v * 2 * JV) / G // metres in the air
      const kb = Math.floor(sim.u / BLOCK)
      const soon = []
      for (const k of [kb, kb + 1]) {
        if (!hasObstacles(`${s.seed}:${k}`)) continue
        for (const ob of obstaclesFor(s.seed, k, s.width, false)) {
          if (ob.u + ob.d / 2 + BOARD > sim.u && ob.u - sim.u < 32 && !sim.cleared.has(ob.id)) soon.push(ob)
        }
      }
      soon.sort((a, b) => a.u - b.u)

      // takeoffs D metres before a line's first obstacle that clear every obstacle met in the air
      // and leave room to jump again for the next one: the widest run of them
      const plan = (line) => {
        const ok = []
        for (let D = 1; D <= air; D += 0.1) {
          const u0 = line[0].u - D
          const clears = line.every((ob) => {
            const a = ob.u - ob.d / 2 - BOARD - u0
            const b = ob.u + ob.d / 2 + BOARD - u0
            if (a >= air) return a - air >= 3.5
            if (b >= air) return false
            for (let x = Math.max(a, 0); x <= b; x += 0.05) {
              const t = x / v
              if (JV * t - 0.5 * G * t * t < ob.h - 0.02) return false
            }
            return true
          })
          if (clears) ok.push(D)
        }
        let run = []
        let cur = []
        for (const D of ok) {
          if (cur.length && D - cur[cur.length - 1] > 0.15) cur = []
          cur.push(D)
          if (cur.length > run.length) run = cur
        }
        return run.length ? { lo: run[0], mid: run[run.length >> 1] } : null
      }
      // what a line across the street meets, on the way there (about 3 m/s across) and on it
      const lineFor = (c) =>
        soon.filter((ob) => {
          const tOb = (ob.u - sim.u) / v
          const tReach = Math.abs(c - sim.lat) / 3
          const l = tOb >= tReach ? c : sim.lat + (c - sim.lat) * (tOb / tReach)
          return Math.abs(l - ob.s) < ob.w / 2 + BODY + MARGIN
        })

      if (!soon.length) lane = null
      else if (sim.grounded && !sim.arc) {
        // near where the kid is, over something to trick on when there is, and kept once chosen
        let best = null
        for (let i = 0; i <= 16; i++) {
          const c = -lim + (2 * lim * i) / 16
          const line = lineFor(c)
          const p = line.length ? plan(line) : null
          if (line.length && (!p || p.lo > line[0].u - sim.u - 0.3)) continue
          const cost = Math.abs(c - sim.lat) * 0.6 + (line.length ? 0 : 1.2) + (lane !== null && Math.abs(c - lane) < 0.2 ? -0.9 : 0)
          if (!best || cost < best.cost) best = { c, cost }
        }
        if (best) lane = best.c
      }
      const target = lane ?? 0.45 * lim * Math.sin(sim.time * 0.8)
      touchSteer(Math.max(-1, Math.min(1, (target - sim.lat) * 1.6)))
      if (sim.arc || !sim.grounded || lane === null) return

      // the jump goes by where the kid really is heading, not the line it aims for
      const latAt = (ob) => sim.lat + sim.latVel * Math.min((ob.u - sim.u) / v, 0.3)
      const line = soon.filter((ob) => Math.abs(latAt(ob) - ob.s) < ob.w / 2 + BODY + MARGIN)
      const p = line.length ? plan(line) : null
      if (!p) return
      const dist = line[0].u - sim.u
      if (dist <= p.mid + 0.15 && dist >= p.lo - 0.05) {
        input.jumpBuffer = 0.15
        if (rand() < 0.5) input.flipBuffer = 0.2
      }
    }
  })
}
