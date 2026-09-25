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
