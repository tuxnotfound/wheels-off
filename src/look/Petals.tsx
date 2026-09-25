import { useFrame } from '@react-three/fiber'
import { useMemo } from 'react'
import * as THREE from 'three'
import { CURVE } from '../world/worldConfig'

// Sakura petals drifting down like a very soft rain. One draw call: every petal is a
// quad whose fall, drift, sway and flutter are computed in the vertex shader from a
// per-petal seed and the time, wrapped inside a box that follows the camera anchor,
// so the air around the rider always holds petals and riding carries you through them.
// They don't write depth, so the ink pass leaves them unoutlined, like painted specks.

const COUNT = 900
const BOX = new THREE.Vector3(44, 16, 64) // x, height, z (meters) around the anchor

const vert = /* glsl */ `
  uniform float uTime, uCurve;
  uniform vec2 uAnchor;
  uniform vec3 uBox;
  attribute vec2 corner;
  attribute vec4 seed;
  varying vec2 vCorner;
  varying float vTint, vLight;
  void main() {
    float t = uTime;
    vec3 p = seed.xyz * uBox;
    // fall slowly, drift with a light breeze, sway side to side
    p.y -= t * (0.45 + seed.w * 0.4);
    p.x += t * 0.7 + sin(t * 0.9 + seed.w * 23.0) * 0.8;
    p.z += t * 0.25 + cos(t * 0.7 + seed.x * 19.0) * 0.6;
    vec2 o = uAnchor - uBox.xz * 0.5;
    p.xz = mod(p.xz - o, uBox.xz) + o;
    p.y = mod(p.y, uBox.y) + 0.1;
    // flutter: tumble around two axes at the petal's own rate
    float a = t * (1.6 + seed.w * 2.5) + seed.y * 6.283;
    float b = t * (1.1 + seed.x * 1.8) + seed.z * 6.283;
    float size = 0.1 + seed.w * 0.06;
    vec3 l = vec3(corner * vec2(size, size * 0.65), 0.0);
    l = vec3(l.x, l.y * cos(a), l.y * sin(a));
    l = vec3(l.x * cos(b) + l.z * sin(b), l.y, -l.x * sin(b) + l.z * cos(b));
    vec4 w = modelMatrix * vec4(p + l, 1.0);
    w.y -= (w.x * w.x + w.z * w.z) * uCurve;
    vCorner = corner;
    vTint = seed.z;
    vLight = 0.72 + 0.28 * abs(cos(a)); // catches the light as it turns
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`
const frag = /* glsl */ `
  uniform vec3 uPink, uPale, uDeep;
  varying vec2 vCorner;
  varying float vTint, vLight;
  void main() {
    // petal: an oval with the little notch at its tip
    vec2 c = vCorner;
    if (dot(c * vec2(1.0, 1.35), c * vec2(1.0, 1.35)) > 1.0) discard;
    if (c.x > 0.72 && abs(c.y) < (c.x - 0.72) * 0.9) discard;
    vec3 col = vTint < 0.5 ? mix(uPink, uPale, vTint * 2.0) : mix(uPale, uDeep, (vTint - 0.5) * 0.6);
    gl_FragColor = vec4(col * vLight, 1.0);
    #include <colorspace_fragment>
  }
`

export function Petals({ anchor }: { anchor: { x: number; z: number } }) {
  const { geo, mat } = useMemo(() => {
    const corners = new Float32Array(COUNT * 4 * 2)
    const seeds = new Float32Array(COUNT * 4 * 4)
    const index: number[] = []
    const quad = [-1, -1, 1, -1, 1, 1, -1, 1]
    for (let i = 0; i < COUNT; i++) {
      const s = [Math.random(), Math.random(), Math.random(), Math.random()]
      for (let v = 0; v < 4; v++) {
        corners.set([quad[v * 2], quad[v * 2 + 1]], (i * 4 + v) * 2)
        seeds.set(s, (i * 4 + v) * 4)
      }
      const b = i * 4
      index.push(b, b + 1, b + 2, b, b + 2, b + 3)
    }
    const geo = new THREE.BufferGeometry()
    // position is unused by the shader but three needs one for bounds/draw range
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(COUNT * 4 * 3), 3))
    geo.setAttribute('corner', new THREE.BufferAttribute(corners, 2))
    geo.setAttribute('seed', new THREE.BufferAttribute(seeds, 4))
    geo.setIndex(index)
    const mat = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      side: THREE.DoubleSide,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uCurve: { value: CURVE },
        uAnchor: { value: new THREE.Vector2() },
        uBox: { value: BOX.clone() },
        uPink: { value: new THREE.Color('#f5b3c6') },
        uPale: { value: new THREE.Color('#fde3ea') },
        uDeep: { value: new THREE.Color('#e88aa8') },
      },
    })
    return { geo, mat }
  }, [])

  useFrame((_, dt) => {
    mat.uniforms.uTime.value += Math.min(dt, 1 / 20)
    mat.uniforms.uAnchor.value.set(anchor.x, anchor.z)
  })

  return <mesh geometry={geo} material={mat} frustumCulled={false} renderOrder={2} />
}
