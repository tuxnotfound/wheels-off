import * as THREE from 'three'
import { makeToonGradient } from './gradientMap'
import { BAY_W, CURVE, FLOOR_H } from '../world/worldConfig'

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

function patchCurve(shader: THREE.WebGLProgramParametersWithUniforms) {
  shader.uniforms.uCurve = { value: CURVE }
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nuniform float uCurve;')
    .replace('#include <project_vertex>', CURVE_VERTEX)
}

// Facade UVs come from the scaled object-space position, so one shared unit box
// tiles windows at a fixed world size (one bay x one storey) whatever its scale.
function patchFacade(shader: THREE.WebGLProgramParametersWithUniforms) {
  patchCurve(shader)
  shader.vertexShader = shader.vertexShader.replace(
    '#include <uv_vertex>',
    /* glsl */ `
      #include <uv_vertex>
      vec3 _s = vec3(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz), length(modelMatrix[2].xyz));
      vec3 _p = (position + 0.5) * _s;
      vMapUv = (abs(normal.x) > 0.5 ? vec2(_p.z, _p.y) : vec2(_p.x, _p.y)) / vec2(${BAY_W.toFixed(3)}, ${FLOOR_H.toFixed(3)});
    `,
  )
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
    const m = new THREE.MeshToonMaterial({ color, gradientMap: makeToonGradient(3), side: doubleSided ? THREE.DoubleSide : THREE.FrontSide })
    m.onBeforeCompile = patchCurve
    m.customProgramCacheKey = () => 'toon-curve'
    return m
  })
}

/** Curved toon material with a texture in the regular UVs (signs, panels, decals). */
export function decalMat(key: string, map: THREE.Texture, transparent = false): THREE.MeshToonMaterial {
  return cached(`decal:${key}`, () => {
    const m = new THREE.MeshToonMaterial({ map, gradientMap: makeToonGradient(3) })
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

/** Wall material with a tiled facade texture on the sides and a plain roof, for the unit BOX. */
export function facadeMats(wall: string, roof: string, map: THREE.Texture, style: string): THREE.Material[] {
  const side = cached(`facade:${wall}:${style}`, () => {
    const m = new THREE.MeshToonMaterial({ color: wall, map, gradientMap: makeToonGradient(3) })
    m.onBeforeCompile = patchFacade
    m.customProgramCacheKey = () => 'toon-curve-facade'
    return m
  })
  const top = toonMat(roof)
  // BoxGeometry groups: +x, -x, +y, -y, +z, -z
  return [side, side, top, top, side, side]
}

/** Curved unlit material (sky-independent shadows, lines). */
export function basicMat(color: string, opacity = 1): THREE.MeshBasicMaterial {
  return cached(`basic:${color}:${opacity}`, () => {
    const m = new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 })
    m.onBeforeCompile = patchCurve
    m.customProgramCacheKey = () => 'basic-curve'
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
