// The CrazyGames covers and preview videos (docs.crazygames.com, Game covers). Two videos of 18 s,
// silent: 1920x1080 and 1080x1620 (2:3, the phone layout). Each opens on its cover, the title over
// the attract ride, then cuts to arcade at top speed. The covers are those two first frames (the
// portrait one at 800x1200) and an 800x800 one.
// The game runs on a Vite dev server built as the CrazyGames one (no "YOUR AD HERE" signs), its API
// on a dead address, so no test run reaches the site's tracker or boards. Frames are drawn on a
// virtual clock (scripts/virtual-clock.js), so the video is smooth however slowly they render, and
// ridden by a script that picks a line across the street and times each jump from the sim's own
// numbers. A take with a wipeout is ridden again.
// Needs ffmpeg on the PATH and Playwright's Chromium (`npx playwright-core install chromium`).
// Usage: npm run media:crazygames (writes preview-media/)
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright-core'
import { createServer } from 'vite'

const OUT = 'preview-media'
const FPS = 30
const STEPS = 2 // 60 Hz steps a recorded frame: PostFX's back-off lowers the resolution on frames over 21 ms
const COVER_S = 1.5
const LEAD_S = 18 // arcade up to speed and into blocks with obstacles, not recorded
const RIDE_S = 16.5
const TAKES = 3

// covers carry the game's title and nothing else
const COVER_CSS = 'body * { visibility: hidden !important; } .game-canvas, .game-canvas *, .landing__title, .landing__title * { visibility: visible !important; }'
const RIDE_CSS = '.hud-keys, .pad__hint { visibility: hidden !important; }'

try {
  execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' })
} catch {
  throw new Error('ffmpeg is not on the PATH (brew install ffmpeg)')
}

process.env.VITE_PORTAL = 'crazygames'
process.env.VITE_SITE = 'http://127.0.0.1:9'
const server = await createServer({ logLevel: 'error' })
await server.listen()
const url = server.resolvedUrls.local[0]
const clock = readFileSync(new URL('./virtual-clock.js', import.meta.url), 'utf8')
const browser = await chromium.launch({ channel: 'chromium', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio'] })
mkdirSync(OUT, { recursive: true })
const ffmpeg = (...args) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args])

/** The landing page in a fresh context, art loaded and shaders compiled. */
async function open({ w, h, dpr = 1, touch = false }) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, isMobile: touch, hasTouch: touch })
  await ctx.addInitScript({ content: clock })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.error('page error:', e.message))
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 })
  await page.waitForSelector('.landing__title', { timeout: 90000 })
  await page.waitForTimeout(6000)
  return page
}

/**
 * The rider, in the page, on the game's own modules: once the ride is the player's, it picks a
 * line across the street that a jump can take for the obstacles in the next 32 m, and jumps at
 * the middle of the window that clears every obstacle met in the air (half the jumps kickflips).
 */
function rider() {
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

const ride = (page) => page.evaluate(() => ({ score: window.__sim.score, hits: window.__sim.hits.size }))

/** One take of a video's frames into dir: the cover, then the ride. False if the kid wiped out. */
async function take(view, dir) {
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  const page = await open(view)
  try {
    await page.evaluate(rider)
    const cover = await page.addStyleTag({ content: COVER_CSS })
    await page.waitForTimeout(500)
    await page.evaluate(() => window.__vstart())
    const step = (n) =>
      page.evaluate(async (n) => {
        for (let i = 0; i < n; i++) await window.__vstep(1000 / 60)
      }, n)
    let n = 0
    const shoot = () => page.screenshot({ path: join(dir, `f${String(n++).padStart(4, '0')}.png`) })
    for (let i = 0; i < COVER_S * FPS; i++) {
      await step(STEPS)
      await shoot()
    }
    // into arcade the way a player goes; the lead-in up to speed isn't recorded
    await cover.evaluate((el) => el.remove())
    await page.addStyleTag({ content: RIDE_CSS })
    if (view.touch) await page.tap('.mode-card--arcade')
    else await page.click('.mode-card--arcade')
    await step(LEAD_S * 60)
    if ((await ride(page)).hits) return false
    for (let i = 0; i < RIDE_S * FPS; i++) {
      await step(STEPS)
      await shoot()
    }
    const end = await ride(page)
    console.log(`  score ${end.score}${end.hits ? ', wiped out' : ''}`)
    return end.hits === 0
  } finally {
    await page.context().close()
  }
}

async function video(name, view, cover, size) {
  const dir = join(OUT, `frames-${name}`)
  for (let t = 1; ; t++) {
    console.log(`${name}: take ${t}`)
    if (await take(view, dir)) break
    if (t === TAKES) throw new Error(`${name}: a wipeout in every take`)
  }
  ffmpeg('-framerate', String(FPS), '-i', join(dir, 'f%04d.png'), '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', join(OUT, `video-${name}.mp4`))
  ffmpeg('-i', join(dir, 'f0000.png'), '-vf', `scale=${size}`, join(OUT, cover))
  rmSync(dir, { recursive: true, force: true })
}

try {
  await video('landscape-1920x1080', { w: 1920, h: 1080 }, 'cover-landscape-1920x1080.png', '1920:1080')
  await video('portrait-1080x1620', { w: 540, h: 810, dpr: 2, touch: true }, 'cover-portrait-800x1200.png', '800:1200')
  const page = await open({ w: 800, h: 800 })
  await page.addStyleTag({ content: COVER_CSS })
  await page.waitForTimeout(800)
  await page.screenshot({ path: join(OUT, 'cover-square-800x800.png') })
  await page.context().close()
  console.log(`done: ${OUT}/`)
} finally {
  await browser.close()
  await server.close()
}
