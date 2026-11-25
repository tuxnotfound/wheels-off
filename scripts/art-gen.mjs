// Paints new art with gpt-image-2 in the town's style (ART.md, Generating with an image model): a
// facade, a prop, a vehicle's or an obstacle's four-view sheet, a pole's sheet of its views in a
// row, or something lying flat seen from above (ground). Sends the kind's style prompt
// with the subject appended and saves the image under art-gen/, ready for art:import or
// art:vehicle. One image a run, quality high, about a minute and 5,500 to 7,000 output tokens.
//
// Usage: OPENAI_API_KEY=... npm run art:gen -- <facade|prop|vehicle|obstacle|pole|ground> "<subject>"
//          [--shape square|wide|tall] [--out <file.png>]
//  --shape  the image's frame: square 1024x1024, wide 1536x1024, tall 1024x1536 (default: square
//           for a facade, a prop or the ground, wide for a sheet, tall for a pole; tall for a tall
//           prop or a tower)
//  --out    where to save it (default: art-gen/<kind>-<subject's first words>-<time>.png)
//
// Through curl, not fetch: Node's fetch gives up after five minutes without an answer, and on a
// busy day gpt-image-2 took longer. Requests sent together hung for 17 minutes, so run one at a
// time. The key goes to curl on stdin, never on its command line, and is never printed.
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { parseArgs } from 'node:util'

// The prompts each image so far was made with; ART.md quotes the facade's and the sheet's.
const STYLE = {
  facade:
    'anime background art, flat cel shading, clean dark teal ink outlines of even weight, muted ' +
    'pastel palette (cream, sage, teal, dusty pink), painted blue shadow shapes, Japanese small ' +
    'town, neutral daylight colors with no sunset light, straight-on orthographic front ' +
    'elevation, no perspective and no vanishing point, the whole building visible and centered ' +
    'with a margin around it, its base a straight level line, no ground and no cast shadow on the' +
    ' ground, sign boards left blank, isolated on a solid flat magenta background',
  prop:
    'anime background art, flat cel shading, clean dark teal ink outlines of even weight, muted ' +
    'pastel palette, painted blue shadow shapes, Japanese small town street furniture, neutral ' +
    'daylight colors with no sunset light, straight-on orthographic front view, no perspective ' +
    'and no vanishing point, no side or top visible, the whole object visible and centered with a' +
    ' margin around it, its base a straight level line, no ground and no cast shadow on the ' +
    'ground, any lettering left blank, isolated on a solid flat magenta background',
  vehicle:
    'anime background art, flat cel shading, clean dark teal ink outlines of even weight, muted ' +
    'pastel palette, painted blue shadow shapes, neutral daylight colors with no sunset light. An' +
    ' orthographic vehicle reference sheet of one vehicle: four separate views of the same ' +
    'vehicle at exactly the same scale, laid out in a two by two grid with wide empty gaps ' +
    'between them so no view touches another. Top left: its left side, nose pointing left. Top ' +
    'right: its front. Bottom left: seen from directly above, nose pointing left. Bottom right: ' +
    'its rear. Every view perfectly straight-on with no perspective, no vanishing point and no ' +
    'three-quarter angle, the side and top views the same length and lined up, the front and rear' +
    ' views the same height as the side view. No labels, no text, no arrows, no ground and no ' +
    'cast shadow, number plates blank, isolated on a solid flat magenta background',
  obstacle:
    'anime background art, flat cel shading, clean dark teal ink outlines of even weight, muted ' +
    'pastel palette, painted blue shadow shapes, neutral daylight colors with no sunset light. An' +
    ' orthographic reference sheet of one object: four separate views of the same object at ' +
    'exactly the same scale, laid out in a two by two grid with wide empty gaps between them so ' +
    'no view touches another. Top left: its front, one of its long sides. Top right: its left ' +
    'end, seen end-on, narrower than the front. Bottom left: seen from directly above, its front ' +
    'toward the bottom of the view, lined up under the front view. Bottom right: its right end, ' +
    'seen end-on. Every view perfectly straight-on with no perspective, no vanishing point and no' +
    ' three-quarter angle, the front and top views the same length and lined up, the end views ' +
    'the same height as the front view. No labels, no text, no arrows, no ground and no cast ' +
    'shadow, isolated on a solid flat magenta background',
  pole:
    'anime background art, flat cel shading, clean dark teal ink outlines of even weight, muted ' +
    'pastel palette, painted blue shadow shapes, Japanese small town street furniture, neutral ' +
    'daylight colors with no sunset light. An orthographic reference sheet of one tall street ' +
    'fixture: separate pieces at exactly the same scale, standing side by side in one row on the ' +
    'same level baseline, with wide empty gaps between them so no piece touches another. Left: ' +
    'the fixture seen from the front. Next to it: the same fixture seen from its side, exactly ' +
    'the same height. Every view perfectly straight-on with no perspective, no vanishing point ' +
    'and no three-quarter angle, each piece whole with a margin around it. No wires or cables, no' +
    ' labels, no text, no arrows, no ground and no cast shadow, any lettering left blank, ' +
    'isolated on a solid flat magenta background',
  ground:
    'anime background art, flat cel shading, clean dark teal ink outlines of even weight, muted ' +
    'pastel palette, painted blue shadow shapes, neutral daylight colors with no sunset light, ' +
    'seen from directly above, looking straight down at things lying flat, a top-down view with ' +
    'no perspective, the whole group visible and centered with a margin around it, no ground ' +
    'surface drawn and no cast shadow, isolated on a solid flat magenta background',
}
const SHAPE = { square: '1024x1024', wide: '1536x1024', tall: '1024x1536' }
const DEFAULT_SHAPE = { facade: 'square', prop: 'square', vehicle: 'wide', obstacle: 'wide', pole: 'tall', ground: 'square' }
const NEXT = {
  facade: 'npm run art:import -- <file> --id <id> --width <m> [--body <m>] [--roof-shape pitched] [--awning <m>,<m>]',
  prop: 'npm run art:import -- <file> --id <id> --width <m> --prop card|cross|box|wall [--depth <m>]',
  vehicle: 'npm run art:vehicle -- <file> --id <id> --kind kei-car|kei-truck|van --length <m> --width <m>',
  obstacle: 'npm run art:vehicle -- <file> --id <id> --kind bags|boxes --length <m> --width <m>',
  pole: 'npm run art:import -- <file> --id <id> --height <m> --prop pole',
  ground: 'npm run art:import -- <file> --id <id> --width <m> --prop decal',
}

const { values: o, positionals } = parseArgs({ allowPositionals: true, options: { shape: { type: 'string' }, out: { type: 'string' } } })
const [kind, subject] = positionals
if (!STYLE[kind] || !subject?.trim()) throw new Error(`usage: npm run art:gen -- <${Object.keys(STYLE).join('|')}> "<subject>" [--shape square|wide|tall] [--out <file.png>]`)
const shape = o.shape ?? DEFAULT_SHAPE[kind]
if (!SHAPE[shape]) throw new Error('--shape is square, wide or tall')
const key = process.env.OPENAI_API_KEY
if (!key) throw new Error('set OPENAI_API_KEY to an OpenAI API key with access to gpt-image-2')
const slug = subject.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').slice(0, 5).join('-')
const out = o.out ?? join('art-gen', `${kind}-${slug}-${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}.png`)

const tmp = mkdtempSync(join(tmpdir(), 'art-gen-'))
const started = Date.now()
let res
try {
  writeFileSync(join(tmp, 'body.json'), JSON.stringify({ model: 'gpt-image-2', prompt: `${STYLE[kind]}. Subject: ${subject.trim()}`, n: 1, size: SHAPE[shape], quality: 'high' }))
  console.log(`painting a ${kind}, ${SHAPE[shape]}: usually about a minute, at worst several`)
  res = await new Promise((resolve, reject) => {
    const c = spawn('curl', ['-sS', '-m', '900', '-H', '@-', '-H', 'content-type: application/json', '--data-binary', `@${join(tmp, 'body.json')}`, 'https://api.openai.com/v1/images/generations'])
    let body = ''
    let err = ''
    c.stdout.on('data', (d) => (body += d))
    c.stderr.on('data', (d) => (err += d))
    c.on('error', reject)
    c.on('close', (code) => (code ? reject(new Error(`curl ${code}: ${err.trim()}`)) : resolve(body)))
    c.stdin.end(`authorization: Bearer ${key}\n`)
  })
} finally {
  rmSync(tmp, { recursive: true, force: true })
}
let j
try {
  j = JSON.parse(res)
} catch {
  throw new Error(`not JSON from the API: ${res.slice(0, 200)}`)
}
if (j.error) throw new Error(`OpenAI: ${j.error.message}`)
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, Buffer.from(j.data[0].b64_json, 'base64'))
console.log(`${out}: ${Math.round((Date.now() - started) / 1000)} s, ${j.usage?.output_tokens ?? '?'} output tokens`)
console.log('look at it, then bring it in:')
console.log(`  ${NEXT[kind].replace('<file>', out)}`)
