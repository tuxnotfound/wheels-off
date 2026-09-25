import * as THREE from 'three'

const cache = new Map<number, THREE.DataTexture>()

/**
 * Zero-asset toon ramp: an N-band luminance gradient as a DataTexture.
 * NearestFilter on BOTH min and mag is mandatory — otherwise the cel bands
 * interpolate to smooth shading and the hand-drawn look collapses.
 */
export function makeToonGradient(bands = 3): THREE.DataTexture {
  const hit = cache.get(bands)
  if (hit) return hit

  // Lift the darkest band off 0 so shadowed faces read as soft shade, not black.
  const lo = 128
  const data = new Uint8Array(bands)
  for (let i = 0; i < bands; i++) {
    const tn = bands === 1 ? 1 : i / (bands - 1)
    data[i] = Math.round(lo + (255 - lo) * tn)
  }

  const tex = new THREE.DataTexture(data, bands, 1, THREE.RedFormat, THREE.UnsignedByteType)
  tex.minFilter = THREE.NearestFilter
  tex.magFilter = THREE.NearestFilter
  tex.generateMipmaps = false
  tex.needsUpdate = true

  cache.set(bands, tex)
  return tex
}
