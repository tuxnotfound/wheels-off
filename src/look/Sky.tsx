import { useMemo } from 'react'
import * as THREE from 'three'

// Painted anime sky: teal gradient with streaky, flat-toned brush clouds.
// Unlit, unfogged, never written to depth; the post pass treats depth=1 as sky.
const vert = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`
const frag = /* glsl */ `
  uniform vec3 uTop, uMid, uHorizon, uCloud, uCloudShade;
  varying vec3 vDir;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + 17.1; a *= 0.5; }
    return v;
  }
  void main() {
    vec3 d = normalize(vDir);
    float e = clamp(d.y, -0.2, 1.0);
    vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.28, e));
    col = mix(col, uTop, smoothstep(0.28, 0.85, e));
    // diagonal brush streaks on a cloud plane above (seamless in every direction)
    vec2 pl = d.xz / (max(d.y, 0.0) + 0.18);
    vec2 q = vec2(pl.x * 0.9 + pl.y * 0.5, pl.y * 2.6 - pl.x * 1.3);
    float n = fbm(q + vec2(fbm(q * 0.7) * 1.6, 0.0));
    float band = smoothstep(0.02, 0.12, e) * (1.0 - smoothstep(0.55, 0.8, e));
    float c = n * band;
    col = mix(col, uCloudShade, step(0.5, c));
    col = mix(col, uCloud, step(0.55, c));
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`

export function Sky() {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: vert,
        fragmentShader: frag,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          uTop: { value: new THREE.Color('#4aa9a8') },
          uMid: { value: new THREE.Color('#7ccac0') },
          uHorizon: { value: new THREE.Color('#c9ece3') },
          uCloud: { value: new THREE.Color('#e6f7f2') },
          uCloudShade: { value: new THREE.Color('#b5e2da') },
        },
      }),
    [],
  )
  return (
    <mesh material={mat} renderOrder={-1} frustumCulled={false}>
      <sphereGeometry args={[380, 32, 16]} />
    </mesh>
  )
}
