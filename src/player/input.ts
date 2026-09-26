// Keyboard state as a plain module: read by the sim every frame, no React.
export const input = {
  x: 0, // -1 left .. 1 right
  z: 0, // 1 push, -1 brake
  jumpBuffer: 0, // seconds left on a buffered jump press
  flipBuffer: 0, // seconds left on a second, quick jump press (kickflip)
  steerSide: 0, // last steer key pressed
  steerBuffer: 0, // seconds left on that press (turn intent survives a tap)
  started: false,
}

const held = new Set<string>()
const LEFT = ['a', 'arrowleft']
const RIGHT = ['d', 'arrowright']
const UP = ['w', 'arrowup']
const DOWN = ['s', 'arrowdown']

function recompute() {
  const has = (ks: string[]) => ks.some((k) => held.has(k))
  input.x = (has(RIGHT) ? 1 : 0) - (has(LEFT) ? 1 : 0)
  input.z = (has(UP) ? 1 : 0) - (has(DOWN) ? 1 : 0)
}

const DOUBLE_TAP_MS = 320
let lastSpace = -1e9

let installed = false
export function installInput() {
  if (installed) return
  installed = true
  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase()
    if (k === ' ' || k.startsWith('arrow')) e.preventDefault()
    input.started = true
    if (e.repeat) return
    held.add(k)
    if (k === ' ') {
      const now = performance.now()
      if (now - lastSpace < DOUBLE_TAP_MS) {
        input.flipBuffer = 0.2
        lastSpace = -1e9
      } else {
        input.jumpBuffer = 0.15
        lastSpace = now
      }
    }
    if (LEFT.includes(k)) {
      input.steerSide = -1
      input.steerBuffer = 0.5
    }
    if (RIGHT.includes(k)) {
      input.steerSide = 1
      input.steerBuffer = 0.5
    }
    recompute()
  })
  window.addEventListener('keyup', (e) => {
    held.delete(e.key.toLowerCase())
    recompute()
  })
  window.addEventListener('blur', () => {
    held.clear()
    recompute()
  })
}
