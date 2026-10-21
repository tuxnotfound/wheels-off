import { useEffect, useRef, useState } from 'react'
import type { PointerEvent } from 'react'
import { jumpPress, touchPedal, touchSteer } from '../player/input'
import { touchDevice } from '../player/touch'
import { useArcade } from './arcadeStore'
import { useHud } from './hudStore'

// The ride's controls on a touch screen. The left half steers: a thumb lands anywhere there and
// drags left or right from that spot, a full carve at REACH, and held into a side street it turns
// into it, as A and D do. On the right, three buttons: push and brake while held (W and S), and
// ollie (Space), tapped twice quickly for a kickflip. Each finger is its own pointer, so steering
// and the buttons work together. The layer sits under the HUD, whose own buttons (pause, music,
// the trial's ghost and restart) stay on top, and it goes while a card covers the ride.

const REACH = 60 // px of drag for a full carve
const DEAD = 8 // px of drag that steer nothing

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

export function TouchControls() {
  const started = useHud((s) => s.started)
  const covered = useArcade((s) => s.menu !== null || s.pending !== null || s.result !== null)
  const [thumb, setThumb] = useState<{ x: number; y: number; dx: number } | null>(null)
  const steer = useRef<{ id: number; x: number } | null>(null)
  const pedals = useRef(new Map<number, number>()) // pointer to 1 (push) or -1 (brake)

  // a card over the ride lets go of everything, so nothing is held when it closes
  useEffect(() => {
    if (!covered) return
    steer.current = null
    pedals.current.clear()
    setThumb(null)
    touchSteer(0)
    touchPedal(0)
  }, [covered])

  if (!touchDevice || !started || covered) return null

  const steerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (steer.current) return
    e.currentTarget.setPointerCapture(e.pointerId)
    steer.current = { id: e.pointerId, x: e.clientX }
    setThumb({ x: e.clientX, y: e.clientY, dx: 0 })
  }
  const steerMove = (e: PointerEvent<HTMLDivElement>) => {
    const s = steer.current
    if (!s || e.pointerId !== s.id) return
    const dx = clamp(e.clientX - s.x, -REACH, REACH)
    touchSteer(Math.abs(dx) < DEAD ? 0 : (dx - Math.sign(dx) * DEAD) / (REACH - DEAD))
    setThumb((t) => t && { ...t, dx })
  }
  const steerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== steer.current?.id) return
    steer.current = null
    setThumb(null)
    touchSteer(0)
  }

  const pedal = () => {
    let z = 0
    for (const v of pedals.current.values()) z += v
    touchPedal(z)
  }
  const pedalDown = (z: number) => (e: PointerEvent<HTMLButtonElement>) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    pedals.current.set(e.pointerId, z)
    pedal()
  }
  const pedalUp = (e: PointerEvent<HTMLButtonElement>) => {
    pedals.current.delete(e.pointerId)
    pedal()
  }

  return (
    <div className="touch" onContextMenu={(e) => e.preventDefault()}>
      <div className="touch__steer" onPointerDown={steerDown} onPointerMove={steerMove} onPointerUp={steerUp} onPointerCancel={steerUp}>
        {thumb ? (
          <span className="touch__thumb" style={{ left: thumb.x, top: thumb.y }} aria-hidden="true">
            <span className="touch__knob" style={{ transform: `translateX(${thumb.dx}px)` }} />
          </span>
        ) : (
          <span className="touch__hint">drag to carve</span>
        )}
      </div>
      <div className="touch__buttons">
        <button type="button" className="touch__button touch__button--brake" onPointerDown={pedalDown(-1)} onPointerUp={pedalUp} onPointerCancel={pedalUp}>
          BRAKE
        </button>
        <button type="button" className="touch__button touch__button--push" onPointerDown={pedalDown(1)} onPointerUp={pedalUp} onPointerCancel={pedalUp}>
          PUSH
        </button>
        <button
          type="button"
          className="touch__button touch__button--ollie"
          onPointerDown={(e) => {
            e.preventDefault()
            jumpPress()
          }}
        >
          OLLIE
        </button>
      </div>
    </div>
  )
}
