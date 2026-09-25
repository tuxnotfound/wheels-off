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

export type FacadeStyle = 'apt' | 'house' | 'office' | 'block'

/** One window bay by one storey. White walls: the material color tints them. */
export function facadeTex(style: FacadeStyle): THREE.CanvasTexture {
  return make(`facade:${style}`, 128, 120, (g) => {
    g.fillStyle = '#ffffff'
    g.fillRect(0, 0, 128, 120)
    g.strokeStyle = 'rgba(43,54,52,0.35)'
    g.lineWidth = 2
    if (style === 'apt') {
      // floor slab line + window + small vent
      g.beginPath()
      g.moveTo(0, 118)
      g.lineTo(128, 118)
      g.stroke()
      box(g, 22, 22, 84, 62, '#d7dcd6')
      box(g, 28, 28, 34, 50, '#48625f', 2)
      box(g, 66, 28, 34, 50, '#48625f', 2)
      g.fillStyle = 'rgba(190,225,220,0.55)'
      g.beginPath()
      g.moveTo(34, 70)
      g.lineTo(54, 32)
      g.lineTo(60, 32)
      g.lineTo(40, 70)
      g.fill()
      box(g, 104, 8, 14, 10, '#cfd3cc', 2)
    } else if (style === 'house') {
      for (let y = 10; y < 120; y += 14) {
        g.beginPath()
        g.moveTo(0, y)
        g.lineTo(128, y)
        g.stroke()
      }
      box(g, 34, 26, 60, 56, '#dfe4dc')
      box(g, 40, 32, 48, 44, '#5a7470', 2)
      g.strokeStyle = '#dfe4dc'
      g.lineWidth = 3
      g.beginPath()
      g.moveTo(64, 32)
      g.lineTo(64, 76)
      g.moveTo(40, 54)
      g.lineTo(88, 54)
      g.stroke()
      box(g, 30, 82, 68, 6, '#c8cdc6', 2)
    } else if (style === 'office') {
      box(g, -4, 30, 136, 56, '#3f5a58')
      g.strokeStyle = '#9fb8b4'
      g.lineWidth = 3
      for (const x of [32, 64, 96]) {
        g.beginPath()
        g.moveTo(x, 32)
        g.lineTo(x, 84)
        g.stroke()
      }
      g.fillStyle = 'rgba(190,225,220,0.35)'
      g.fillRect(6, 36, 18, 44)
    } else {
      // concrete block wall
      g.strokeStyle = 'rgba(43,54,52,0.4)'
      for (let y = 0; y <= 120; y += 20) {
        g.beginPath()
        g.moveTo(0, y)
        g.lineTo(128, y)
        g.stroke()
        const off = (y / 20) % 2 ? 32 : 0
        for (let x = off; x < 128; x += 64) {
          g.beginPath()
          g.moveTo(x, y)
          g.lineTo(x, y + 20)
          g.stroke()
        }
      }
    }
  }, true)
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

/** Vending machine front: drink samples, a price strip, a lit panel. */
export function vendingTex(): THREE.CanvasTexture {
  return make('vending', 96, 192, (g) => {
    box(g, 2, 2, 92, 188, '#f5f7f2', 3)
    const cans = ['#d9533f', '#4b7fbf', '#e8b64a', '#5aa6a0', '#8a5a44', '#f3efe2']
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 5; c++) {
        g.fillStyle = cans[(r * 2 + c) % cans.length]
        g.fillRect(10 + c * 16, 14 + r * 30, 11, 20)
        g.strokeStyle = INK
        g.lineWidth = 1.5
        g.strokeRect(10 + c * 16, 14 + r * 30, 11, 20)
      }
    }
    box(g, 10, 110, 76, 22, '#34403e', 2)
    box(g, 30, 150, 36, 24, '#2f3a38', 2)
  })
}

/** Yellow/black hazard stripes. */
export function hazardTex(): THREE.CanvasTexture {
  return make('hazard', 128, 32, (g) => {
    g.fillStyle = '#f2c230'
    g.fillRect(0, 0, 128, 32)
    g.fillStyle = '#26282b'
    for (let x = -32; x < 160; x += 32) {
      g.beginPath()
      g.moveTo(x, 32)
      g.lineTo(x + 16, 32)
      g.lineTo(x + 32, 0)
      g.lineTo(x + 16, 0)
      g.fill()
    }
  })
}

/** Rolling shutter for closed shops. */
export function shutterTex(): THREE.CanvasTexture {
  return make('shutter', 64, 64, (g) => {
    g.fillStyle = '#d6dad3'
    g.fillRect(0, 0, 64, 64)
    g.strokeStyle = 'rgba(43,54,52,0.45)'
    g.lineWidth = 2
    for (let y = 4; y < 64; y += 6) {
      g.beginPath()
      g.moveTo(0, y)
      g.lineTo(64, y)
      g.stroke()
    }
  })
}

/** Glass shop front with a door frame. */
export function glassTex(): THREE.CanvasTexture {
  return make('glass', 128, 64, (g) => {
    box(g, 2, 2, 124, 60, '#46605d', 4)
    g.strokeStyle = '#dfe4dc'
    g.lineWidth = 4
    for (const x of [42, 86]) {
      g.beginPath()
      g.moveTo(x, 2)
      g.lineTo(x, 62)
      g.stroke()
    }
    g.fillStyle = 'rgba(200,230,225,0.4)'
    g.fillRect(10, 8, 12, 48)
    g.fillStyle = '#f2c230'
    g.fillRect(52, 22, 24, 10)
  })
}
