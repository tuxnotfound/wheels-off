import * as THREE from 'three'

// Procedural hand-drawn textures (canvas), cached by key. Zero asset files.

const INK = '#2b3634'
const cache = new Map<string, THREE.CanvasTexture>()

function make(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat = false) {
  const hit = cache.get(key)
  if (hit) return hit
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')!
  draw(g)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping
  cache.set(key, t)
  return t
}

function box(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill: string, line = 3) {
  g.fillStyle = fill
  g.fillRect(x, y, w, h)
  g.lineWidth = line
  g.strokeStyle = INK
  g.strokeRect(x, y, w, h)
}

/** Shop sign board with a word, horizontal or vertical. */
export function signTex(word: string, bg: string, vertical: boolean): THREE.CanvasTexture {
  const w = vertical ? 64 : 256
  const h = vertical ? 256 : 64
  return make(`sign:${word}:${bg}:${vertical}`, w, h, (g) => {
    box(g, 2, 2, w - 4, h - 4, bg, 4)
    const light = bg === '#f3efe2' || bg === '#e8b64a'
    g.fillStyle = light ? INK : '#fbf8ee'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    const font = "900 44px 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Noto Sans JP', sans-serif"
    g.font = font
    if (vertical) {
      const chars = [...word]
      const step = Math.min(52, (h - 24) / chars.length)
      chars.forEach((ch, i) => g.fillText(ch, w / 2, 16 + step * (i + 0.5)))
    } else {
      g.fillText(word, w / 2, h / 2 + 2, w - 24)
    }
  })
}

/** Big road lettering. */
export function roadTextTex(word: string): THREE.CanvasTexture {
  return make(`road:${word}`, 128, 384, (g) => {
    g.clearRect(0, 0, 128, 384)
    g.fillStyle = '#f4f3ea'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.font = "900 118px 'Hiragino Sans', 'Noto Sans JP', sans-serif"
    // top of the texture is the far end: read in order while driving toward it
    ;[...word].forEach((ch, i) => g.fillText(ch, 64, 64 + i * 124))
  })
}

/** Yellow/black hazard stripes with an inked border. */
export function hazardTex(): THREE.CanvasTexture {
  return make('hazard', 256, 64, (g) => {
    g.fillStyle = '#f2c230'
    g.fillRect(0, 0, 256, 64)
    g.fillStyle = '#26282b'
    for (let x = -64; x < 320; x += 64) {
      g.beginPath()
      g.moveTo(x, 64)
      g.lineTo(x + 32, 64)
      g.lineTo(x + 64, 0)
      g.lineTo(x + 32, 0)
      g.fill()
    }
    g.lineWidth = 6
    g.strokeStyle = INK
    g.strokeRect(3, 3, 250, 58)
  })
}

/** Cardboard: a tape strip, a shipping label, a "this way up" mark, inked. */
export function cardboardTex(): THREE.CanvasTexture {
  return make('cardboard', 128, 128, (g) => {
    g.fillStyle = '#c9a36f'
    g.fillRect(0, 0, 128, 128)
    g.fillStyle = '#d9b784'
    g.fillRect(52, 0, 24, 128)
    g.strokeStyle = 'rgba(43,54,52,0.55)'
    g.lineWidth = 2
    g.strokeRect(52, -2, 24, 132)
    box(g, 12, 70, 34, 24, '#f4f3ea', 2)
    g.fillStyle = INK
    for (let i = 0; i < 3; i++) g.fillRect(16, 75 + i * 6, 24 - i * 6, 2)
    g.strokeStyle = INK
    g.lineWidth = 3
    g.beginPath()
    g.moveTo(96, 40)
    g.lineTo(96, 18)
    g.moveTo(88, 26)
    g.lineTo(96, 16)
    g.lineTo(104, 26)
    g.stroke()
    g.lineWidth = 5
    g.strokeRect(2, 2, 124, 124)
  })
}

/**
 * The road's marks in a 2x2 atlas (world/roadMarks.tsx), each cell 256 px, transparent around:
 * top left a manhole cover with a sakura emblem, top right a patch of newer tarmac, bottom left
 * a crack, bottom right a drain grate filling its cell (stretched to the gutter's shape).
 * Colors sit near the road's (#86959a): the scene lights them the same way.
 */
export function roadMarksTex(): THREE.CanvasTexture {
  return make('road-marks', 512, 512, (g) => {
    g.clearRect(0, 0, 512, 512)
    // the manhole: a dark iron disc, a rim, a ring of studs and five petals
    g.save()
    g.translate(128, 128)
    g.fillStyle = '#69767d'
    g.beginPath()
    g.arc(0, 0, 118, 0, Math.PI * 2)
    g.fill()
    g.lineWidth = 7
    g.strokeStyle = INK
    g.stroke()
    g.lineWidth = 3
    g.strokeStyle = '#4c575e'
    g.beginPath()
    g.arc(0, 0, 98, 0, Math.PI * 2)
    g.stroke()
    g.fillStyle = '#8c989e'
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2
      g.beginPath()
      g.arc(Math.cos(a) * 108, Math.sin(a) * 108, 3.5, 0, Math.PI * 2)
      g.fill()
    }
    for (let i = 0; i < 5; i++) {
      g.save()
      g.rotate((i / 5) * Math.PI * 2)
      g.beginPath()
      g.moveTo(0, -8)
      g.bezierCurveTo(-34, -34, -26, -78, -9, -80) // petal, with the sakura's notch at its tip
      g.lineTo(0, -68)
      g.lineTo(9, -80)
      g.bezierCurveTo(26, -78, 34, -34, 0, -8)
      g.fillStyle = '#909ca2'
      g.fill()
      g.lineWidth = 3
      g.strokeStyle = '#4c575e'
      g.stroke()
      g.restore()
    }
    g.fillStyle = '#4c575e'
    g.beginPath()
    g.arc(0, 0, 10, 0, Math.PI * 2)
    g.fill()
    g.restore()

    // the patch: an uneven slab of darker tarmac with pale sealed seams
    g.beginPath()
    const patch = [
      [266, 14], [400, 8], [500, 18], [504, 130], [496, 244], [380, 250], [270, 240], [262, 120],
    ]
    patch.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)))
    g.closePath()
    g.fillStyle = '#6f7d86'
    g.fill()
    g.lineWidth = 7
    g.strokeStyle = '#a9b4b7'
    g.stroke()

    // the crack: a few jagged branches from one break, from a fixed seed so it never changes
    let seed = 11
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647
    g.strokeStyle = '#4e5a61'
    g.lineCap = 'round'
    g.lineJoin = 'round'
    const branch = (x: number, y: number, a: number, len: number, w: number) => {
      g.lineWidth = w
      g.beginPath()
      g.moveTo(x, y)
      for (let i = 0; i < 6 && len > 0; i++) {
        a += (rand() - 0.5) * 1.1
        const step = 10 + rand() * 14
        x = Math.min(250, Math.max(262 - 256, x + Math.cos(a) * step))
        y = Math.min(506, Math.max(262, y + Math.sin(a) * step))
        g.lineTo(x, y)
        len -= step
        if (rand() < 0.3 && w > 2) {
          g.stroke()
          branch(x, y, a + (rand() < 0.5 ? 0.9 : -0.9), len * 0.6, w - 1.5)
          g.lineWidth = w
          g.beginPath()
          g.moveTo(x, y)
        }
      }
      g.stroke()
    }
    for (let i = 0; i < 3; i++) branch(128, 384, (i / 3) * Math.PI * 2 + rand(), 120, 5)

    // the grate: steel bars across a dark slot, in an inked frame
    g.fillStyle = '#3f4a50'
    g.fillRect(256, 256, 256, 256)
    g.fillStyle = '#7f898d'
    for (let y = 270; y < 500; y += 15) g.fillRect(266, y, 236, 5)
    g.lineWidth = 12
    g.strokeStyle = INK
    g.strokeRect(262, 262, 244, 244)
  })
}

