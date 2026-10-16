// Packs a portal build (src/site.ts) into the zip a portal takes, after dropping what only the
// game's own site serves: the local test model (public/art/_dev, never deployed), source maps,
// the privacy page, robots.txt and the sitemap (the build links the site's own privacy page).
// Then it checks itch.io's rules for HTML5 uploads: index.html at the top, no absolute paths
// (the game runs in a subfolder there), at most 1,000 files, 500 MB in all, 200 MB a file.
// Usage: node scripts/portal-zip.mjs dist-itch wheels-off-itch.zip
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

const [dir, zip] = process.argv.slice(2)
if (!dir || !zip) throw new Error('usage: node scripts/portal-zip.mjs <build dir> <zip>')

for (const drop of ['art/_dev', 'privacy.html', 'robots.txt', 'sitemap.xml']) rmSync(join(dir, drop), { recursive: true, force: true })

const files = []
const walk = (d) => {
  for (const name of readdirSync(d)) {
    const p = join(d, name)
    if (statSync(p).isDirectory()) walk(p)
    else if (p.endsWith('.map')) rmSync(p)
    else files.push(p)
  }
}
walk(dir)

const size = files.reduce((n, f) => n + statSync(f).size, 0)
const biggest = Math.max(...files.map((f) => statSync(f).size))
const html = readFileSync(join(dir, 'index.html'), 'utf8')
const absolute = html.match(/(?:src|href)="\/[^/"][^"]*"/g) ?? []
const problems = [
  files.length > 1000 && `${files.length} files, over 1,000`,
  size > 500e6 && `${size} bytes in all, over 500 MB`,
  biggest > 200e6 && `a file of ${biggest} bytes, over 200 MB`,
  absolute.length > 0 && `absolute paths in index.html: ${absolute.join(', ')}`,
].filter(Boolean)
if (problems.length) throw new Error(`not ready for a portal: ${problems.join('; ')}`)

const out = resolve(zip)
if (existsSync(out)) rmSync(out)
execFileSync('zip', ['-q', '-r', '-X', out, '.'], { cwd: dir })
console.log(`${zip}: ${files.length} files, ${(size / 1e6).toFixed(1)} MB unpacked, ${(statSync(out).size / 1e6).toFixed(1)} MB zipped`)
