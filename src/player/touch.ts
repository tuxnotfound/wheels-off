// Touch screens (phones and tablets), by the same media query the styles use. On one, the ride
// is driven by the on-screen controls (src/game/TouchControls.tsx), the cards show buttons where
// a keyboard has keys, and the renderer starts without supersampling (src/look/PostFX.tsx).
export const touchDevice = typeof matchMedia === 'function' && matchMedia('(hover: none) and (pointer: coarse)').matches
