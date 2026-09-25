/** Deterministic pseudo-random in [0,1) per integer cell — stable as you move. */
export function hash2(i: number, j: number): number {
  const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453
  return s - Math.floor(s)
}
