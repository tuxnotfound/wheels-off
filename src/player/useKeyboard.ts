import { useEffect, useRef } from 'react'

export interface MoveInput {
  x: number
  z: number
}

/** WASD / arrow keys -> a live {x,z} input ref (z>0 means "forward"). */
export function useKeyboard() {
  const keys = useRef<MoveInput>({ x: 0, z: 0 })
  useEffect(() => {
    const set = (e: KeyboardEvent, v: number) => {
      const k = e.key.toLowerCase()
      if (k === 'w' || k === 'arrowup') keys.current.z = v
      if (k === 's' || k === 'arrowdown') keys.current.z = -v
      if (k === 'a' || k === 'arrowleft') keys.current.x = -v
      if (k === 'd' || k === 'arrowright') keys.current.x = v
    }
    const down = (e: KeyboardEvent) => set(e, 1)
    const up = (e: KeyboardEvent) => set(e, 0)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])
  return keys
}
