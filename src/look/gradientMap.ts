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

  const data = new Uint8Array(bands)
  for (let i = 0; i < bands; i++) data[i] = Math.round(((i + 1) / bands) * 255)

  const tex = new THREE.DataTexture(data, bands, 1, THREE.RedFormat, THREE.UnsignedByteType)
  tex.minFilter = THREE.NearestFilter
  tex.magFilter = THREE.NearestFilter
  tex.generateMipmaps = false
  tex.needsUpdate = true

  cache.set(bands, tex)
  return tex
}
