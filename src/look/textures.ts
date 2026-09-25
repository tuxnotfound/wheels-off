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
