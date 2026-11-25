// The CrazyGames covers and preview videos (docs.crazygames.com, Game covers). Two videos of 18 s,
// silent: 1920x1080 and 1080x1620 (2:3, the phone layout). Each opens on its cover, the title over
// the attract ride, then cuts to arcade at top speed. The covers are those two first frames (the
// portrait one at 800x1200) and an 800x800 one.
// The game is built as the CrazyGames one (no "YOUR AD HERE" signs) and ridden headless by
// media-page.mjs's scripted rider. A take with a wipeout is ridden again.
// Needs ffmpeg on the PATH and Playwright's Chromium (`npx playwright-core install chromium`).
// Usage: npm run media:crazygames (writes preview-media/)
import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { launch, ride, rider, startArcade, startClock, step } from './media-page.mjs'

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

const game = await launch('crazygames')
mkdirSync(OUT, { recursive: true })
const ffmpeg = (...args) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args])

/** One take of a video's frames into dir: the cover, then the ride. False if the kid wiped out. */
async function take(view, dir) {
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  const page = await game.open(view)
  try {
    await page.evaluate(rider)
    const cover = await page.addStyleTag({ content: COVER_CSS })
    await page.waitForTimeout(500)
    await startClock(page)
    let n = 0
    const shoot = () => page.screenshot({ path: join(dir, `f${String(n++).padStart(4, '0')}.png`) })
    for (let i = 0; i < COVER_S * FPS; i++) {
      await step(page, STEPS)
      await shoot()
    }
    // into arcade the way a player goes; the lead-in up to speed isn't recorded
    await cover.evaluate((el) => el.remove())
    await page.addStyleTag({ content: RIDE_CSS })
    await startArcade(page, view.touch)
    await step(page, LEAD_S * 60)
    if ((await ride(page)).hits) return false
    for (let i = 0; i < RIDE_S * FPS; i++) {
      await step(page, STEPS)
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
  const page = await game.open({ w: 800, h: 800 })
  await page.addStyleTag({ content: COVER_CSS })
  await page.waitForTimeout(800)
  await page.screenshot({ path: join(OUT, 'cover-square-800x800.png') })
  await page.context().close()
  console.log(`done: ${OUT}/`)
} finally {
  await game.close()
}
