import { create } from 'zustand'

// Whether this browser can draw the game. three.js needs WebGL 2, and with the graphics card
// off (hardware acceleration disabled, a blocklisted GPU, Safari's Lockdown Mode) there is
// none: the ride can never start, so the landing page says why instead of PRESS START.

function probe(): boolean {
  try {
    const gl = document.createElement('canvas').getContext('webgl2')
    gl?.getExtension('WEBGL_lose_context')?.loseContext() // hand the context straight back
    return gl !== null
  } catch {
    return false
  }
}

export const useWebGL = create(() => ({ ok: probe() }))

// The probe can pass and three.js still fail to make its own context: the same card then.
window.addEventListener('unhandledrejection', (e) => {
  const reason: unknown = e.reason
  const message = reason instanceof Error ? reason.message : String(reason)
  if (message.includes('WebGL context')) useWebGL.setState({ ok: false })
})
