// Shots for the art pass: the same moments of the game, every time, so a change to the look can be
// judged before against after. The CrazyGames build (what their QA sees), ridden headless by
// media-page.mjs's scripted rider on a virtual clock that runs from the page's first script, so
// each shot lands on the same frame of the same ride.
//  - landing: the title over the attract ride, 1280x720
//  - arcade-1 to -3: arcade at top speed, 18, 20 and 22 s in, 1280x720
//  - arcade-land: the next landing after that, 0.15 s on
//  - phone: a phone held upright (390x844 at 2x), 18 s in
// Usage: npm run shots -- <label> [?query] (writes art-shots/<label>/; the query goes on the game's
// address, such as ?vrm=<file> for a character to try). Once art-shots/before/ exists, any other
// label also writes art-shots/compare-<label>/: before on top of (or left of) the new shot.
// Needs ffmpeg on the PATH for the compare sheets.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { launch, ride, rider, startArcade, step } from './media-page.mjs'

const [label, query = ''] = process.argv.slice(2)
if (!label || !/^[\w-]+$/.test(label) || (query && !query.startsWith('?'))) throw new Error('usage: npm run shots -- <label> [?query]')
const OUT = join('art-shots', label)
const BEFORE = join('art-shots', 'before')
const LEAD_S = 18
const GAP_S = 2

rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })
const game = await launch('crazygames')

async function shoot(view, shots) {
  const page = await game.open({ ...view, frozen: true, query })
  try {
    await page.evaluate(rider)
    await shots(page, (name) => page.screenshot({ path: join(OUT, `${name}.png`) }))
    const end = await ride(page)
    if (end.hits) console.log(`  ${view.w}x${view.h}: the kid wiped out (score ${end.score})`)
  } finally {
    await page.context().close()
  }
}

try {
  await shoot({ w: 1280, h: 720 }, async (page, snap) => {
    await step(page, 90)
    await snap('landing')
    await startArcade(page, false)
    await step(page, LEAD_S * 60)
    for (let i = 1; i <= 3; i++) {
      if (i > 1) await step(page, GAP_S * 60)
      await snap(`arcade-${i}`)
    }
    // the next landing, 0.15 s on: the dust it kicks up
    const landed = () => page.evaluate(() => window.__sim.landT)
    const before = await landed()
    for (let i = 0; i < 6 * 60 && (await landed()) === before; i++) await step(page, 1)
    await step(page, 9)
    await snap('arcade-land')
  })
  await shoot({ w: 390, h: 844, dpr: 2, touch: true }, async (page, snap) => {
    await step(page, 90)
    await startArcade(page, true)
    await step(page, LEAD_S * 60)
    await snap('phone')
  })
  console.log(`shots: ${OUT}/`)
} finally {
  await game.close()
}

if (label !== 'before' && existsSync(BEFORE)) {
  const sheets = join('art-shots', `compare-${label}`)
  rmSync(sheets, { recursive: true, force: true })
  mkdirSync(sheets, { recursive: true })
  for (const f of readdirSync(OUT)) {
    if (!existsSync(join(BEFORE, f))) continue
    const stack = f.startsWith('phone') ? 'hstack' : 'vstack'
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', join(BEFORE, f), '-i', join(OUT, f), '-filter_complex', stack, join(sheets, f)])
  }
  console.log(`before against ${label}: ${sheets}/`)
}
