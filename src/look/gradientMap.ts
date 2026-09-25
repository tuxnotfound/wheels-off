import * as THREE from 'three'

let ramp: THREE.DataTexture | null = null

/**
 * Hard two-tone cel ramp, looked up at dot(N,L)*0.5+0.5. Faces are either lit or
 * in shade, with the terminator pushed toward the light (dot(N,L) > 0.25) so
 * grazing faces fall into shade for a bolder graphic split. The shade band gets
 * no direct light at all; its color comes from the tinted ambient light.
 * NearestFilter is mandatory, or the bands blur back into smooth shading.
 */
export function celRamp(): THREE.DataTexture {
  if (ramp) return ramp
  const data = new Uint8Array([0, 0, 0, 0, 0, 255, 255, 255])
  ramp = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat, THREE.UnsignedByteType)
  ramp.minFilter = THREE.NearestFilter
  ramp.magFilter = THREE.NearestFilter
  ramp.generateMipmaps = false
  ramp.needsUpdate = true
  return ramp
}
