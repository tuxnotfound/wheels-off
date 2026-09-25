import * as THREE from 'three'
import { celRamp } from './gradientMap'
import { CURVE } from '../world/worldConfig'

// Curve the world down with distance from the origin (the camera anchor), so flat
// geometry reads as the surface of a small planet. Long meshes need tessellation
// along their length or they stay straight chords above the curved road.
const CURVE_VERTEX = /* glsl */ `
  vec4 mvPosition = vec4( transformed, 1.0 );
  #ifdef USE_INSTANCING
    mvPosition = instanceMatrix * mvPosition;
  #endif
  vec4 _world = modelMatrix * mvPosition;
  _world.y -= (_world.x * _world.x + _world.z * _world.z) * uCurve;
  mvPosition = viewMatrix * _world;
  gl_Position = projectionMatrix * mvPosition;
`

export function patchCurve(shader: THREE.WebGLProgramParametersWithUniforms) {
  shader.uniforms.uCurve = { value: CURVE }
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nuniform float uCurve;')
    .replace('#include <project_vertex>', CURVE_VERTEX)
}

const cache = new Map<string, THREE.Material>()
function cached<T extends THREE.Material>(key: string, make: () => T): T {
  let m = cache.get(key) as T | undefined
  if (!m) {
    m = make()
    cache.set(key, m)
  }
  return m
}

/** Shared curved toon material for a color (created once, reused everywhere). */
export function toonMat(color: string, doubleSided = false): THREE.MeshToonMaterial {
  return cached(`toon:${color}:${doubleSided}`, () => {
    const m = new THREE.MeshToonMaterial({ color, gradientMap: celRamp(), side: doubleSided ? THREE.DoubleSide : THREE.FrontSide })
    m.onBeforeCompile = patchCurve
    m.customProgramCacheKey = () => 'toon-curve'
    return m
  })
}

/** Curved toon material with a texture in the regular UVs (signs, panels, decals). */
export function decalMat(key: string, map: THREE.Texture, transparent = false): THREE.MeshToonMaterial {
  return cached(`decal:${key}`, () => {
    const m = new THREE.MeshToonMaterial({ map, gradientMap: celRamp() })
    if (transparent) {
      m.alphaTest = 0.5
      m.polygonOffset = true
      m.polygonOffsetFactor = -1
      m.polygonOffsetUnits = -4
    }
    m.onBeforeCompile = patchCurve
    m.customProgramCacheKey = () => 'toon-curve'
    return m
  })
}

/** Flat paint on the road (lines, zebra stripes): pulled toward the camera so it never z-fights. */
export function paintMat(color: string): THREE.MeshToonMaterial {
  return cached(`paint:${color}`, () => {
    const m = toonMat(color).clone()
    m.polygonOffset = true
    m.polygonOffsetFactor = -1
    m.polygonOffsetUnits = -4
    m.onBeforeCompile = patchCurve
    m.customProgramCacheKey = () => 'toon-curve'
    return m
  })
}

export function lineMat(color: string): THREE.LineBasicMaterial {
  return cached(`line:${color}`, () => {
    const m = new THREE.LineBasicMaterial({ color })
    m.onBeforeCompile = patchCurve
    m.customProgramCacheKey = () => 'basic-curve'
    return m
  })
}

/**
 * Shadow-pass depth material with the same planet bend, so cast shadows land where
 * the curved geometry actually is. Without it they slide away with distance.
 */
export const curvedDepth = (() => {
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking })
  m.onBeforeCompile = patchCurve
  m.customProgramCacheKey = () => 'depth-curve'
  return m
})()
