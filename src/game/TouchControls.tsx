import { useEffect, useRef, useState } from 'react'
import type { PointerEvent } from 'react'
import { input, jumpPress, touchPedal, touchSteer } from '../player/input'
import { touchDevice } from '../player/touch'
import { laneLimit } from '../world/streetGen'
import { useArcade } from './arcadeStore'
import { useHud } from './hudStore'
import { sim } from './sim'

// The ride on a touch screen: a trackpad across the bottom of the screen, where a thumb stays.
// Across the pad is across the street: the skater rides to the spot under the thumb, left curb
// to right curb, and held at an edge into an intersection, turns that way. The pad's top half
// pushes and its bottom half cruises; there's no brake. Lifting the thumb and
// landing it again within GRACE is a tap, an ollie; two quick taps are a kickflip (as Space).
// Through the lift the skater keeps the pedal and the line it had, so a tap costs no speed, and
// a tap's landing changes neither until the thumb stays or moves (SETTLE). A second finger's tap
// while the first holds is an ollie too. The pad sits under the HUD, whose buttons stay on top,
// and lets go of everything while a card covers the ride.

const GRACE = 600 // ms a lifted thumb keeps the pedal and the line, and a landing counts as a tap
const SETTLE = 150 // ms a tap's landing waits before it steers or pedals
const SETTLE_PX = 12 // or how far it moves
const PUSH_BAND = 0.5 // the top half of the pad pushes (a fraction of its height, from the top)
const EDGE = 0.85 // past this fraction of the lane the thumb also asks for the side street
const GAIN = 1.6 // steer per meter off the thumb's line

/** The pad's state, outside React: read every frame by trackpadTick. */
const pad = {
  aim: null as number | null, // -1 left curb .. 1 right curb, null with no thumb
  z: 0,
  thumb: null as { id: number; at: number; x: number; y: number; settled: boolean } | null,
  liftedAt: -Infinity,
  rect: { left: 0, top: 0, width: 1, height: 1 },
}

function read(x: number, y: number) {
  const r = pad.rect
  pad.aim = Math.max(-1, Math.min(1, ((x - r.left) / r.width) * 2 - 1))
  const v = (y - r.top) / r.height
  pad.z = v < PUSH_BAND ? 1 : 0
}

function release() {
  pad.aim = null
  pad.z = 0
  pad.thumb = null
  touchSteer(0)
  touchPedal(0)
}

/**
 * Each frame before the sim steps (GameCanvas): steers the skater toward the thumb's line and
 * holds the pedal, through a tap's lift too; after GRACE with no thumb, lets go.
 */
export function trackpadTick() {
  if (!touchDevice || pad.aim === null) return
  if (!pad.thumb && performance.now() - pad.liftedAt > GRACE) {
    release()
    return
  }
  const lim = laneLimit(sim.street.width)
  const x = Math.max(-1, Math.min(1, (pad.aim * lim - sim.lat) * GAIN))
  touchSteer(x)
  if (Math.abs(pad.aim) > EDGE) {
    input.steerSide = Math.sign(pad.aim)
    input.steerBuffer = 0.5
  }
  touchPedal(pad.z)
}

export function TouchControls() {
  const started = useHud((s) => s.started)
  const covered = useArcade((s) => s.menu !== null || s.pending !== null || s.result !== null)
  const [mark, setMark] = useState<{ x: number; y: number } | null>(null)
  const area = useRef<HTMLDivElement>(null)

  // a card over the ride lets go of everything, so nothing is held when it closes
  useEffect(() => {
    if (covered) {
      release()
      setMark(null)
    }
  }, [covered])

  if (!touchDevice || !started || covered) return null

  const down = (e: PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    const now = performance.now()
    if (pad.thumb) {
      jumpPress() // a second finger's tap while the thumb holds
      return
    }
    const r = area.current!.getBoundingClientRect()
    pad.rect = { left: r.left, top: r.top, width: r.width, height: r.height }
    e.currentTarget.setPointerCapture(e.pointerId)
    const tap = now - pad.liftedAt < GRACE
    if (tap) jumpPress()
    pad.thumb = { id: e.pointerId, at: now, x: e.clientX, y: e.clientY, settled: !tap }
    if (!tap) read(e.clientX, e.clientY)
    setMark({ x: e.clientX - r.left, y: e.clientY - r.top })
  }
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const t = pad.thumb
    if (!t || e.pointerId !== t.id) return
    if (!t.settled && (performance.now() - t.at > SETTLE || Math.hypot(e.clientX - t.x, e.clientY - t.y) > SETTLE_PX)) t.settled = true
    if (t.settled) read(e.clientX, e.clientY)
    setMark({ x: e.clientX - pad.rect.left, y: e.clientY - pad.rect.top })
  }
  const up = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== pad.thumb?.id) return
    pad.thumb = null
    pad.liftedAt = performance.now()
    setMark(null)
  }

  return (
    <div className="pad" ref={area} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onContextMenu={(e) => e.preventDefault()}>
      <span className="pad__band">PUSH</span>
      {mark ? <span className="pad__mark" style={{ left: mark.x, top: mark.y }} aria-hidden="true" /> : <span className="pad__hint">hold a thumb here · tap to ollie</span>}
    </div>
  )
}
