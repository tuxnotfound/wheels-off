// Generates the placeholder ad campaign: fictional brands in every ad format, plus
// "advertise here" house ads, as SVG + public/art/ads.json. Real creatives replace these
// files (same format sizes, see ADS.md). Usage: node scripts/make-ads.mjs
import { mkdirSync, writeFileSync } from 'node:fs'

const OUT = new URL('../public/art/', import.meta.url)
const PX = 180 // pixels per meter: ads are read, so they get more pixels than facades
const INK = '#2b3634'
const FONT = "Hiragino Sans, 'Hiragino Kaku Gothic ProN', 'Noto Sans JP', 'Arial Black', sans-serif"

// Formats in meters: must match AD_SIZE in src/ads/ads.ts
const FORMATS = { billboard: [9.6, 3.2], banner: [6.4, 1.0], poster: [1.0, 1.4], nobori: [0.6, 1.8], van: [2.5, 1.0] }

// ---------- drawing helpers ----------
// rough rendered width: CJK glyphs are square, latin caps about 0.82 em in a heavy face
const textW = (s, size) => [...s].reduce((a, ch) => a + (ch.charCodeAt(0) > 0x2e80 ? 1 : ch === ' ' ? 0.32 : 0.82), 0) * size
// `max` squeezes text that would run wider than it (SVG textLength), never stretches it
const t = (x, y, s, size, fill, { anchor = 'middle', weight = 900, rot = 0, stroke = null, sw = 0, spacing = 0, max = 0 } = {}) =>
  `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" text-anchor="${anchor}" dominant-baseline="middle" font-family="${FONT}" font-weight="${weight}" letter-spacing="${spacing}"${max && textW(s, size) > max ? ` textLength="${max}" lengthAdjust="spacingAndGlyphs"` : ''}${rot ? ` transform="rotate(${rot} ${x} ${y})"` : ''}${stroke ? ` stroke="${stroke}" stroke-width="${sw}" paint-order="stroke"` : ''}>${s}</text>`
const vt = (x, y, s, size, fill, opts = {}) => [...s].map((ch, i) => t(x, y + i * size * 1.02, ch, size, fill, opts)).join('')
const rect = (x, y, w, h, fill, { r = 0, sw = 0, stroke = INK } = {}) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}"${sw ? ` stroke="${stroke}" stroke-width="${sw}"` : ''}/>`
const circ = (x, y, r, fill, sw = 0) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}"${sw ? ` stroke="${INK}" stroke-width="${sw}"` : ''}/>`
const path = (d, fill, sw = 0) => `<path d="${d}" fill="${fill}"${sw ? ` stroke="${INK}" stroke-width="${sw}" stroke-linejoin="round"` : ''}/>`
const frame = (W, H, bg, sw) => rect(sw / 2, sw / 2, W - sw, H - sw, bg, { sw, r: Math.min(W, H) * 0.03 })

// ---------- icons, drawn in a box of size S centered at (cx, cy) ----------
const icons = {
  bottle: (cx, cy, S) => {
    const w = S * 0.36, h = S * 0.95, x = cx - w / 2, y = cy - h / 2
    return path(`M${x + w * 0.35},${y} h${w * 0.3} v${h * 0.18} q${w * 0.35},${h * 0.08} ${w * 0.35},${h * 0.25} v${h * 0.52} q0,${h * 0.05} -${w * 0.08},${h * 0.05} h-${w * 0.84} q-${w * 0.08},0 -${w * 0.08},-${h * 0.05} v-${h * 0.52} q0,-${h * 0.17} ${w * 0.35},-${h * 0.25}z`, '#bfe8e2', S * 0.025) +
      rect(x + w * 0.02, y + h * 0.5, w * 0.96, h * 0.26, '#f4a3bd', { sw: S * 0.018 }) + circ(cx, y + h * 0.63, S * 0.06, '#fff3f6') +
      rect(x + w * 0.33, y - h * 0.04, w * 0.34, h * 0.07, '#d9533f', { sw: S * 0.015 }) +
      circ(cx - w * 0.2, y + h * 0.36, S * 0.025, '#ffffff') + circ(cx + w * 0.15, y + h * 0.42, S * 0.018, '#ffffff')
  },
  cup: (cx, cy, S) => {
    const w = S * 0.55, h = S * 0.5, x = cx - w / 2, y = cy - h * 0.2
    return path(`M${x},${y} h${w} l-${w * 0.1},${h} h-${w * 0.8}z`, '#f4f1e8', S * 0.025) + rect(x + w * 0.08, y + h * 0.3, w * 0.84, h * 0.3, '#5aa6a0') +
      path(`M${x + w},${y + h * 0.15} q${w * 0.35},0 ${w * 0.2},${h * 0.45} q-${w * 0.08},${h * 0.15} -${w * 0.22},${h * 0.12}`, 'none', S * 0.03) +
      circ(cx - S * 0.1, y - S * 0.2, S * 0.1, '#ffffff', S * 0.02) + circ(cx + S * 0.03, y - S * 0.28, S * 0.13, '#ffffff', S * 0.02) + circ(cx + S * 0.15, y - S * 0.18, S * 0.09, '#ffffff', S * 0.02)
  },
  bowl: (cx, cy, S) => {
    const w = S * 0.8, y = cy
    return path(`M${cx - S * 0.1},${y - S * 0.42} L${cx + S * 0.34},${y - S * 0.05}`, 'none', S * 0.03) + path(`M${cx + S * 0.02},${y - S * 0.46} L${cx + S * 0.4},${y - S * 0.1}`, 'none', S * 0.03) +
      path(`M${cx - w / 2},${y - S * 0.04} a${w / 2},${S * 0.36} 0 0 0 ${w},0z`, '#d9533f', S * 0.025) +
      rect(cx - w / 2 - S * 0.02, y - S * 0.08, w + S * 0.04, S * 0.08, '#f4e3c8', { sw: S * 0.02 }) +
      path(`M${cx - w * 0.36},${y - S * 0.1} q${w * 0.09},-${S * 0.1} ${w * 0.18},0 t${w * 0.18},0 t${w * 0.18},0 t${w * 0.18},0`, 'none', S * 0.02) +
      path(`M${cx - w * 0.3},${y + S * 0.08} l${w * 0.1},${S * 0.06} l${w * 0.1},-${S * 0.06} l${w * 0.1},${S * 0.06}`, 'none', S * 0.015) +
      // cat ears peeking over the rim
      path(`M${cx - S * 0.22},${y - S * 0.08} l${S * 0.07},-${S * 0.16} l${S * 0.07},${S * 0.16}z`, '#2b3634') + path(`M${cx + S * 0.08},${y - S * 0.08} l${S * 0.07},-${S * 0.16} l${S * 0.07},${S * 0.16}z`, '#2b3634')
  },
  board: (cx, cy, S) =>
    `<g transform="rotate(-18 ${cx} ${cy})">` + rect(cx - S * 0.46, cy - S * 0.1, S * 0.92, S * 0.2, '#e8b64a', { r: S * 0.1, sw: S * 0.025 }) + rect(cx - S * 0.3, cy - S * 0.05, S * 0.6, S * 0.1, '#2b3634', { r: S * 0.04 }) +
    circ(cx - S * 0.28, cy + S * 0.17, S * 0.07, '#6cc7b5', S * 0.02) + circ(cx + S * 0.28, cy + S * 0.17, S * 0.07, '#6cc7b5', S * 0.02) + `</g>`,
  lantern: (cx, cy, S) =>
    rect(cx - S * 0.12, cy - S * 0.46, S * 0.24, S * 0.08, INK) + `<ellipse cx="${cx}" cy="${cy}" rx="${S * 0.3}" ry="${S * 0.38}" fill="#d9533f" stroke="${INK}" stroke-width="${S * 0.025}"/>` +
    [-0.2, 0, 0.2].map((d) => `<ellipse cx="${cx}" cy="${cy}" rx="${S * 0.3 * Math.sqrt(1 - d * d * 4)}" ry="${S * 0.02}" fill="none" stroke="#7d2b25" stroke-width="${S * 0.012}" transform="translate(0 ${d * S * 0.8})"/>`).join('') +
    rect(cx - S * 0.12, cy + S * 0.36, S * 0.24, S * 0.08, INK) + t(cx, cy + S * 0.02, '祭', S * 0.3, '#fff3e0'),
  megaphone: (cx, cy, S) =>
    path(`M${cx - S * 0.35},${cy - S * 0.1} l${S * 0.5},-${S * 0.25} v${S * 0.7} l-${S * 0.5},-${S * 0.25}z`, '#f4f1e8', S * 0.025) + rect(cx - S * 0.45, cy - S * 0.12, S * 0.14, S * 0.34, '#d9533f', { sw: S * 0.02 }) +
    [0, 1, 2].map((i) => path(`M${cx + S * (0.25 + i * 0.09)},${cy - S * (0.12 + i * 0.05)} q${S * 0.08},${S * (0.22 + i * 0.05)} 0,${S * (0.44 + i * 0.1)}`, 'none', S * 0.022)).join(''),
  tag: (cx, cy, S) =>
    `<g transform="rotate(-12 ${cx} ${cy})">` + path(`M${cx - S * 0.36},${cy - S * 0.26} h${S * 0.56} l${S * 0.18},${S * 0.26} l-${S * 0.18},${S * 0.26} h-${S * 0.56}z`, '#f2c230', S * 0.025) + circ(cx + S * 0.2, cy, S * 0.05, '#fff', S * 0.015) +
    t(cx - S * 0.1, cy + S * 0.02, '%', S * 0.34, INK) + `</g>`,
}

// ---------- brands ----------
const BRANDS = {
  'sakura-soda': { advertiser: 'Sakura Soda (fictional)', name: 'SAKURA SODA', jp: 'さくらソーダ', tag: '春の味、しゅわっと。', en: 'A fizzy taste of spring', bg: '#fbd3df', fg: '#b43a62', accent: '#5aa6a0', icon: 'bottle' },
  'kumo-coffee': { advertiser: 'Kumo Coffee (fictional)', name: 'KUMO COFFEE', jp: 'くもコーヒー', tag: 'ほっと一息。', en: 'Take a cloud break', bg: '#d9efe9', fg: '#2f5f63', accent: '#e8b64a', icon: 'cup' },
  'nekomi-ramen': { advertiser: 'Nekomi Ramen (fictional)', name: 'NEKOMI RAMEN', jp: 'ねこみラーメン', tag: '駅前すぐ！', en: 'Right by the station', bg: '#f7e2c0', fg: '#b3321f', accent: '#2b3634', icon: 'bowl' },
  'wheels-off-skate': { advertiser: 'Wheels Off (house ad)', name: 'WHEELS OFF', jp: 'スケート', tag: 'デッキ・ウィール入荷！', en: 'Skate shop, new decks in', bg: '#f2c230', fg: '#2b3634', accent: '#d9533f', icon: 'board' },
  'haru-matsuri': { advertiser: 'Town festival (house ad)', name: 'HARU MATSURI', jp: '春まつり', tag: '4月6日・7日 商店街', en: 'Spring festival, this weekend', bg: '#fff3e0', fg: '#b3321f', accent: '#d9533f', icon: 'lantern' },
  'spring-sale': { advertiser: 'Shotengai sale (house ad)', name: 'SALE', jp: 'セール', tag: '春の大売出し', en: 'Spring sale', bg: '#d9533f', fg: '#fff3e0', accent: '#f2c230', icon: 'tag' },
  'ad-space': { advertiser: 'Available', name: 'YOUR AD HERE', jp: '広告募集中', tag: 'この場所に広告を', en: 'This space is for sale', bg: '#f4f1e8', fg: '#2b3634', accent: '#d9533f', icon: 'megaphone', stripes: true },
}

// ---------- layouts per format ----------
function stripes(W, H, c) {
  let s = ''
  const step = Math.min(W, H) * 0.18
  for (let x = -H; x < W + H; x += step * 2) s += path(`M${x},${H} L${x + H},0 L${x + H + step},0 L${x + step},${H}z`, c)
  return `<g opacity="0.12">${s}</g>`
}

const LAYOUT = {
  billboard: (b, W, H) => {
    const sw = H * 0.03
    let s = frame(W, H, b.bg, sw) + (b.stripes ? stripes(W, H, INK) : '')
    s += circ(H * 0.6, H * 0.5, H * 0.38, '#ffffff', sw * 0.6) + icons[b.icon](H * 0.6, H * 0.52, H * 0.62)
    const cx = (H * 1.1 + W) / 2 // centered in the space right of the icon
    const room = W - H * 1.3
    s += t(cx, H * 0.28, b.name, H * 0.22, b.fg, { max: room })
    s += t(cx, H * 0.54, b.jp, H * 0.18, INK, { max: room })
    s += rect(cx - room * 0.46, H * 0.72, room * 0.92, H * 0.17, b.accent, { r: H * 0.085 }) + t(cx, H * 0.805, `${b.tag}  ${b.en}`, H * 0.075, '#ffffff', { weight: 700, max: room * 0.84 })
    return s
  },
  banner: (b, W, H) => {
    let s = rect(0, 0, W, H, b.bg) + rect(0, 0, W, H * 0.1, b.accent) + rect(0, H * 0.9, W, H * 0.1, b.accent) + (b.stripes ? stripes(W, H, INK) : '')
    s += icons[b.icon](H * 0.75, H * 0.5, H * 0.72) + icons[b.icon](W - H * 0.75, H * 0.5, H * 0.72)
    s += t(W * 0.5, H * 0.42, b.jp, H * 0.42, b.fg, { stroke: '#ffffff', sw: H * 0.03, max: W - H * 3.2 })
    s += t(W * 0.5, H * 0.76, `${b.name}  ·  ${b.en}`, H * 0.13, INK, { weight: 700, max: W - H * 3.2 })
    // grommets
    for (const x of [H * 0.2, W - H * 0.2]) for (const y of [H * 0.2, H * 0.8]) s += circ(x, y, H * 0.035, '#c9cdc5', H * 0.012)
    return s
  },
  poster: (b, W, H) => {
    const sw = W * 0.02
    let s = frame(W, H, b.bg, sw) + (b.stripes ? stripes(W, H, INK) : '')
    s += t(W * 0.5, H * 0.1, b.name, W * 0.1, b.fg, { max: W * 0.84 })
    s += circ(W * 0.5, H * 0.4, W * 0.3, '#ffffff', sw) + icons[b.icon](W * 0.5, H * 0.41, W * 0.5)
    s += t(W * 0.5, H * 0.68, b.jp, W * 0.13, INK, { max: W * 0.86 })
    s += t(W * 0.5, H * 0.78, b.tag, W * 0.07, b.fg, { weight: 700, max: W * 0.86 })
    s += rect(W * 0.1, H * 0.85, W * 0.8, H * 0.08, b.accent, { r: W * 0.03 }) + t(W * 0.5, H * 0.89, b.en, W * 0.055, '#ffffff', { weight: 700, max: W * 0.74 })
    // tape corners, like it was stuck up by hand
    s += rect(-W * 0.03, -W * 0.01, W * 0.2, W * 0.07, 'rgba(240,235,215,0.85)', { r: 2 }).replace('/>', ` transform="rotate(-30 ${W * 0.07} ${W * 0.03})"/>`)
    s += rect(W * 0.83, -W * 0.01, W * 0.2, W * 0.07, 'rgba(240,235,215,0.85)', { r: 2 }).replace('/>', ` transform="rotate(30 ${W * 0.93} ${W * 0.03})"/>`)
    return s
  },
  nobori: (b, W, H) => {
    let s = rect(0, 0, W, H, b.bg) + rect(0, 0, W * 0.16, H, b.accent) + (b.stripes ? stripes(W, H, INK) : '')
    // the pole sleeve loops
    for (let y = H * 0.04; y < H; y += H * 0.12) s += rect(0, y, W * 0.16, H * 0.02, '#ffffff')
    s += icons[b.icon](W * 0.58, H * 0.12, W * 0.62)
    s += vt(W * 0.58, H * 0.28, b.jp.slice(0, 7), Math.min(W * 0.55, (H * 0.62) / Math.min(7, [...b.jp].length)), b.fg, { stroke: '#ffffff', sw: W * 0.03 })
    s += rect(W * 0.2, H * 0.93, W * 0.76, H * 0.05, INK)
    return s
  },
  van: (b, W, H) => {
    let s = rect(0, 0, W, H, b.bg, { r: H * 0.06 }) + (b.stripes ? stripes(W, H, INK) : '')
    s += path(`M0,${H * 0.72} Q${W * 0.5},${H * 0.55} ${W},${H * 0.72} V${H} H0z`, b.accent)
    s += icons[b.icon](H * 0.55, H * 0.45, H * 0.72)
    const vx = (H * 1.05 + W) / 2
    const vroom = W - H * 1.2
    s += t(vx, H * 0.3, b.name, H * 0.2, b.fg, { max: vroom })
    s += t(vx, H * 0.55, b.jp, H * 0.17, INK, { max: vroom })
    s += t(W * 0.5, H * 0.87, b.en, H * 0.09, '#ffffff', { weight: 700, max: W * 0.9 })
    return s
  },
}

// which brands run in which format (every format also carries "ad space")
const CAMPAIGN = {
  billboard: ['sakura-soda', 'kumo-coffee', 'wheels-off-skate', 'ad-space'],
  banner: ['haru-matsuri', 'sakura-soda', 'spring-sale', 'ad-space'],
  poster: ['nekomi-ramen', 'kumo-coffee', 'wheels-off-skate', 'sakura-soda', 'haru-matsuri', 'ad-space'],
  nobori: ['nekomi-ramen', 'sakura-soda', 'kumo-coffee', 'spring-sale', 'ad-space'],
  van: ['sakura-soda', 'nekomi-ramen', 'kumo-coffee', 'wheels-off-skate'],
}

mkdirSync(new URL('ads/', OUT), { recursive: true })
const creatives = []
for (const [format, ids] of Object.entries(CAMPAIGN)) {
  const [wm, hm] = FORMATS[format]
  const W = Math.round(wm * PX)
  const H = Math.round(hm * PX)
  for (const id of ids) {
    const b = BRANDS[id]
    const file = `ads/${format}-${id}.svg`
    writeFileSync(new URL(file, OUT), `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${LAYOUT[format](b, W, H)}</svg>`)
    creatives.push({ id: `${format}-${id}`, advertiser: b.advertiser, format, image: file, weight: id === 'ad-space' ? 0.6 : 1 })
  }
}
writeFileSync(
  new URL('ads.json', OUT),
  JSON.stringify({ note: 'Placeholder campaign from scripts/make-ads.mjs. All brands are fictional. See ADS.md.', creatives }, null, 2) + '\n',
)
console.log(`wrote ${creatives.length} creatives`)
