import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'

// One full-screen pass over the rendered scene:
//  - fisheye (barrel) lens, the wide-angle look of the reference shots
//  - ink lines from depth (silhouettes + creases) and from color steps
//  - a soft vignette
// Silhouettes/creases: the depth buffer is affine in 1/z, so its Laplacian is ~0
// on any flat surface and spikes on edges and folds.
const vert = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`
const frag = /* glsl */ `
  #include <packing>
  uniform sampler2D tColor;
  uniform sampler2D tDepth;
  uniform vec2 uRes;
  uniform float uNear, uFar, uBarrel, uThick;
  uniform vec3 uInk;
  varying vec2 vUv;

  float invZ(vec2 uv) {
    float d = texture2D(tDepth, uv).x;
    return -1.0 / perspectiveDepthToViewZ(d, uNear, uFar);
  }
  float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

  void main() {
    float aspect = uRes.x / uRes.y;
    vec2 p = vUv * 2.0 - 1.0;
    p.x *= aspect;
    float r2 = dot(p, p);
    float rmax2 = aspect * aspect + 1.0;
    p *= (1.0 + uBarrel * r2) / (1.0 + uBarrel * rmax2);
    p.x /= aspect;
    vec2 uv = p * 0.5 + 0.5;

    vec3 col = texture2D(tColor, uv).rgb;
    vec2 o = uThick / uRes;
    float c = invZ(uv);
    float l = invZ(uv - vec2(o.x, 0.0)), r = invZ(uv + vec2(o.x, 0.0));
    float dn = invZ(uv - vec2(0.0, o.y)), up = invZ(uv + vec2(0.0, o.y));
    float lap = abs(l + r - 2.0 * c) + abs(dn + up - 2.0 * c);
    float nearest = max(max(max(l, r), max(dn, up)), c);
    float depthEdge = smoothstep(0.1, 0.3, lap / nearest);

    // color steps (window frames, band edges, signs) but not inside the sky
    float solid = step(texture2D(tDepth, uv).x, 0.99999);
    vec3 cl = texture2D(tColor, uv - vec2(o.x, 0.0)).rgb, cr = texture2D(tColor, uv + vec2(o.x, 0.0)).rgb;
    vec3 cd = texture2D(tColor, uv - vec2(0.0, o.y)).rgb, cu = texture2D(tColor, uv + vec2(0.0, o.y)).rgb;
    float g = abs(lum(cl) - lum(cr)) + abs(lum(cd) - lum(cu));
    float colorEdge = smoothstep(0.32, 0.5, g) * solid;

    float ink = max(depthEdge, colorEdge * 0.75);
    // thin the ink out in the distance so far blocks don't turn to scribble
    ink *= 1.0 - smoothstep(55.0, 110.0, 1.0 / nearest);
    col = mix(col, uInk, ink * 0.9);

    vec2 v = vUv - 0.5;
    col *= 1.0 - dot(v, v) * 0.35;
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`

export function PostFX({ barrel = 0.22, thickness = 1.6 }: { barrel?: number; thickness?: number }) {
  const gl = useThree((s) => s.gl)
  const size = useThree((s) => s.size)
  const dpr = useThree((s) => s.viewport.dpr)

  const { target, quad, cam, mat } = useMemo(() => {
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType })
    target.depthTexture = new THREE.DepthTexture(1, 1, THREE.FloatType)
    const mat = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tColor: { value: target.texture },
        tDepth: { value: target.depthTexture },
        uRes: { value: new THREE.Vector2(1, 1) },
        uNear: { value: 0.1 },
        uFar: { value: 100 },
        uBarrel: { value: barrel },
        uThick: { value: thickness },
        uInk: { value: new THREE.Color('#263230') },
      },
    })
    const quad = new THREE.Scene()
    quad.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat))
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    return { target, quad, cam, mat }
  }, [barrel, thickness])

  useEffect(() => {
    const v = gl.getDrawingBufferSize(new THREE.Vector2())
    target.setSize(v.x, v.y)
    mat.uniforms.uRes.value.copy(v)
    mat.uniforms.uThick.value = thickness * Math.max(1, dpr)
  }, [gl, size, dpr, target, mat, thickness])

  useEffect(() => () => target.dispose(), [target])

  // priority 1: this callback owns rendering (r3f stops auto-rendering)
  useFrame(({ scene, camera }) => {
    const pc = camera as THREE.PerspectiveCamera
    mat.uniforms.uNear.value = pc.near
    mat.uniforms.uFar.value = pc.far
    gl.setRenderTarget(target)
    gl.render(scene, camera)
    gl.setRenderTarget(null)
    gl.render(quad, cam)
  }, 1)

  return null
}
