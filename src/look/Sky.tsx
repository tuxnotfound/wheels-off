import { useFrame } from '@react-three/fiber'
import { useMemo } from 'react'
import * as THREE from 'three'
import { SKY, SUN_DIR } from './timeOfDay'

// Painted anime sky at golden hour: dusky blue overhead through a lavender band to a
// peach horizon, a soft sun disc with glow, and cel-shaded clouds on a plane high above,
// so they shrink and flatten into long bands toward the horizon. Each cloud is lit gold
// on the side facing the sun and pink on the far side. Unlit, unfogged, never written to
// depth; the post pass treats depth=1 as sky.
const vert = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`
const frag = /* glsl */ `
  uniform vec3 uTop, uMid, uHorizon, uCloud, uCloudShade, uCloudLit, uSunGlow, uSunDisc, uSun;
  uniform float uTime;
  varying vec3 vDir;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  // few octaves, fast falloff: rounded billows instead of torn-paper edges
  float fbm(vec2 p) {
    float v = 0.0, a = 0.55;
    for (int i = 0; i < 4; i++) { v += a * noise(p); p = p * 2.1 + 7.3; a *= 0.42; }
    return v;
  }
  float density(vec2 p) {
    vec2 w = vec2(noise(p * 0.5 + 3.1), noise(p * 0.5 - 5.7)) - 0.5;
    return fbm(p + w * 0.9);
  }

  void main() {
    vec3 d = normalize(vDir);
    float e = clamp(d.y, -0.2, 1.0);
    vec3 col = mix(uHorizon, uMid, smoothstep(0.02, 0.3, e));
    col = mix(col, uTop, smoothstep(0.3, 0.9, e));
    float sd = max(dot(d, uSun), 0.0);
    col = mix(col, uSunGlow, pow(sd, 6.0) * 0.75);

    // cloud plane: stretched along x so clouds read as long horizontal bodies
    float h = max(d.y, 0.035);
    vec2 p = d.xz / h * vec2(0.22, 0.55) + vec2(uTime * 0.012, 0.0);
    float n = density(p);
    // coverage thins overhead and fades out into the horizon haze
    float cover = 0.6 + smoothstep(0.35, 0.9, e) * 0.12;
    float aa = fwidth(n) * 0.8 + 0.004;
    float body = smoothstep(cover - aa, cover + aa, n);
    float fade = smoothstep(0.03, 0.12, e);
    // light: sample the cloud a step toward the sun; where it thins, this side faces it
    vec2 toSun = normalize(uSun.xz * vec2(0.22, 0.55) + 1e-4) * 0.35;
    float ns = density(p + toSun);
    float lit = smoothstep(-aa, aa + 0.01, n - ns);
    float core = smoothstep(cover + 0.05 - aa, cover + 0.05 + aa, n);
    vec3 cloud = mix(uCloudShade, uCloud, max(lit, core * 0.55));
    cloud = mix(cloud, uCloudLit, lit * (0.35 + 0.65 * pow(sd, 2.0)));
    // distant clouds sink into the horizon color
    cloud = mix(cloud, uHorizon, (1.0 - smoothstep(0.03, 0.25, e)) * 0.45);
    col = mix(col, cloud, body * fade);

    col = mix(col, uSunDisc, smoothstep(0.9975, 0.999, sd) * (1.0 - body * fade * 0.7));
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
          uTop: { value: new THREE.Color(SKY.top) },
          uMid: { value: new THREE.Color(SKY.mid) },
          uHorizon: { value: new THREE.Color(SKY.horizon) },
          uCloud: { value: new THREE.Color(SKY.cloud) },
          uCloudShade: { value: new THREE.Color(SKY.cloudShade) },
          uCloudLit: { value: new THREE.Color(SKY.cloudLit) },
          uSunGlow: { value: new THREE.Color(SKY.sunGlow) },
          uSunDisc: { value: new THREE.Color(SKY.sunDisc) },
          uSun: { value: SUN_DIR.clone() },
          uTime: { value: 0 },
        },
      }),
    [],
  )
  useFrame((_, dt) => {
    mat.uniforms.uTime.value += Math.min(dt, 0.1)
  })
  return (
    <mesh material={mat} renderOrder={-1} frustumCulled={false}>
      <sphereGeometry args={[380, 32, 16]} />
    </mesh>
  )
}
