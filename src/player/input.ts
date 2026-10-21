// Keyboard state as a plain module: read by the sim every frame, no React. On a touch screen the
// on-screen controls (src/game/TouchControls.tsx) add to it: a thumb's steer, the push and brake
// buttons, and the ollie button's presses.
export const input = {
  x: 0, // -1 left .. 1 right
  z: 0, // 1 push, -1 brake
  jumpBuffer: 0, // seconds left on a buffered jump press
  flipBuffer: 0, // seconds left on a second, quick jump press (kickflip)
  steerSide: 0, // last steer key pressed
  steerBuffer: 0, // seconds left on that press (turn intent survives a tap)
  started: false,
  blocked: false, // paused or typing a name: the game ignores the keyboard
}

const held = new Set<string>()
const LEFT = ['a', 'arrowleft']
const RIGHT = ['d', 'arrowright']
const UP = ['w', 'arrowup']
const DOWN = ['s', 'arrowdown']
// pause, records, music and the ghost never start the ride, nor do keys that leave the page or move
// around it (Cmd+Tab, Tab to the landing page's buttons)
const NEVER_START = ['p', 'r', 'm', 'g', 'tab', 'escape', 'shift', 'meta', 'control', 'alt', 'capslock']

const touch = { x: 0, z: 0 }
const clamp1 = (v: number) => Math.max(-1, Math.min(1, v))

function recompute() {
  const has = (ks: string[]) => ks.some((k) => held.has(k))
  input.x = clamp1((has(RIGHT) ? 1 : 0) - (has(LEFT) ? 1 : 0) + touch.x)
  input.z = clamp1((has(UP) ? 1 : 0) - (has(DOWN) ? 1 : 0) + touch.z)
}

const DOUBLE_TAP_MS = 320
let lastSpace = -1e9

/** Space, or the ollie button: an ollie, or a kickflip when it comes quickly after the last one. */
export function jumpPress() {
  const now = performance.now()
  if (now - lastSpace < DOUBLE_TAP_MS) {
    input.flipBuffer = 0.2
    lastSpace = -1e9
  } else {
    input.jumpBuffer = 0.15
    lastSpace = now
  }
}

/** A thumb's steer, -1 left to 1 right. Past half way it also asks for the side street that way, as a held A or D does. */
export function touchSteer(x: number) {
  touch.x = clamp1(x)
  if (Math.abs(x) > 0.5) {
    input.steerSide = Math.sign(x)
    input.steerBuffer = 0.5
  }
  recompute()
}

/** The push (1) and brake (-1) buttons, 0 with neither held. */
export function touchPedal(z: number) {
  touch.z = clamp1(z)
  recompute()
}

let installed = false
export function installInput() {
  if (installed) return
  installed = true
  window.addEventListener('keydown', (e) => {
    if (input.blocked || e.target instanceof HTMLInputElement) return
    const k = e.key.toLowerCase()
    if (k === ' ' || k.startsWith('arrow')) e.preventDefault()
    if (!NEVER_START.includes(k) && !e.metaKey && !e.ctrlKey && !e.altKey) input.started = true
    if (e.repeat) {
      // a key held down through a pause or a card went down while the game ignored it: its
      // repeats count it as held from here (W held into a time trial's countdown pushes at GO)
      if (!held.has(k)) {
        held.add(k)
        recompute()
      }
      return
    }
    held.add(k)
    if (k === ' ') jumpPress()
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

/** Lets go of every key and drops buffered presses, so nothing carries over a pause. */
export function releaseKeys() {
  held.clear()
  touch.x = 0
  touch.z = 0
  recompute()
  input.jumpBuffer = 0
  input.flipBuffer = 0
  input.steerBuffer = 0
}
