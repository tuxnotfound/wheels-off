import * as THREE from 'three'
import { makeToonGradient } from './gradientMap'
import { CURVE } from '../world/worldConfig'

// Curve the world down with distance from the origin (the character) — same patch
// as ToonMaterial, but here materials are shared (cached by color) so the whole
// city draws with a handful of material objects instead of one per mesh.
function patchCurve(shader: THREE.WebGLProgramParametersWithUniforms) {
  shader.uniforms.uCurve = { value: CURVE }
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nuniform float uCurve;')
    .replace(
      '#include <project_vertex>',
      /* glsl */ `
        vec4 mvPosition = vec4( transformed, 1.0 );
        #ifdef USE_INSTANCING
          mvPosition = instanceMatrix * mvPosition;
        #endif
        vec4 _world = modelMatrix * mvPosition;
        _world.y -= (_world.x * _world.x + _world.z * _world.z) * uCurve;
        mvPosition = viewMatrix * _world;
        gl_Position = projectionMatrix * mvPosition;
        vViewPosition = -mvPosition.xyz;
      `,
    )
}

const cache = new Map<string, THREE.MeshToonMaterial>()

/** Shared curved toon material for a color (created once, reused everywhere). */
export function toonMat(color: string): THREE.MeshToonMaterial {
  let m = cache.get(color)
  if (!m) {
    m = new THREE.MeshToonMaterial({ color, gradientMap: makeToonGradient(3) })
    m.onBeforeCompile = patchCurve
    m.customProgramCacheKey = () => 'toon-curve'
    cache.set(color, m)
  }
  return m
}
