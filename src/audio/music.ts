import { create } from 'zustand'
import { isPaused, useArcade } from '../game/arcadeStore'
import { useHud } from '../game/hudStore'
import { readJson, writeJson } from '../game/storage'
import { createLofi } from './lofi'

// The soundtrack: lo-fi tunes composed live (lofi.ts). M turns it off and on, and the choice is
// kept in this browser. A browser only lets a page make sound after a key press or a click, so
// the music starts with the first one. Under the landing page and the cards over the ride it
// plays muffled, as if from the next room, and it stops while the tab is hidden.

const KEY = 'wheelsoff:music-off'
const LEVEL = 0.6
const LOOKAHEAD = 0.25 // seconds of music scheduled ahead of the clock
const OPEN_HZ = 8000
const MUFFLED_HZ = 650

export const useMusic = create<{ off: boolean }>(() => ({ off: readJson(KEY) === true }))

let ctx: AudioContext | null = null
let master: GainNode
let tone: BiquadFilterNode // the lowpass that muffles the music under a card
let sleep = 0

function build() {
  const ac = new AudioContext({ latencyHint: 'playback' })
  ctx = ac
  const glue = ac.createDynamicsCompressor()
  glue.threshold.value = -20
  glue.knee.value = 12
  glue.ratio.value = 3
  tone = ac.createBiquadFilter()
  tone.frequency.value = OPEN_HZ
  master = ac.createGain()
  master.gain.value = 0
  tone.connect(glue).connect(master).connect(ac.destination)
  muffle()
  const band = createLofi(ac, tone)
  band.start(ac.currentTime + 0.1)
  setInterval(() => band.fill(ac.currentTime + LOOKAHEAD), 50)
}

/** Fades the music in or out to match the setting and the tab, and stops the clock while it is silent. */
function apply() {
  if (!ctx) return
  const on = !useMusic.getState().off && document.visibilityState === 'visible'
  clearTimeout(sleep)
  if (on) void ctx.resume()
  master.gain.setTargetAtTime(on ? LEVEL : 0, ctx.currentTime, 0.06)
  if (!on) sleep = window.setTimeout(() => void ctx?.suspend(), 400)
}

function muffle() {
  if (!ctx) return
  const covered = !useHud.getState().started || isPaused()
  tone.frequency.setTargetAtTime(covered ? MUFFLED_HZ : OPEN_HZ, ctx.currentTime, 0.12)
}

function toggleMusic() {
  const off = !useMusic.getState().off
  useMusic.setState({ off })
  writeJson(KEY, off)
  if (!off && !ctx) build()
  apply()
}

/**
 * The first key press or click starts the music, unless it was turned off. A key that does not
 * count as a gesture (Esc) leaves the context suspended, so any later one wakes it too.
 */
function wake() {
  if (useMusic.getState().off || ctx?.state === 'running') return
  if (!ctx) build()
  apply()
}

/**
 * M, or the music button on the landing page. Music that is on but not yet playing (no key
 * press or click so far) starts, rather than being turned off unheard.
 */
export function pressMusic() {
  if (!useMusic.getState().off && ctx?.state !== 'running') wake()
  else toggleMusic()
}

let installed = false
export function installMusic() {
  if (installed) return
  installed = true
  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement) return // typing a name
    const m = e.key.toLowerCase() === 'm' && !e.metaKey && !e.ctrlKey && !e.altKey
    if (m && !e.repeat) pressMusic()
    else if (!m) wake()
  })
  window.addEventListener('pointerdown', wake)
  document.addEventListener('visibilitychange', apply)
  useArcade.subscribe(muffle)
  useHud.subscribe((s, prev) => {
    if (s.started !== prev.started) muffle()
  })
}
