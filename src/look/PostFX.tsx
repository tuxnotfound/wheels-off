import { useFrame, useThree } from '@react-three/fiber'
import { useCallback, useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { GRADE } from './timeOfDay'

// The scene renders with MSAA, then one full-screen pass over it:
//  - fisheye (barrel) lens, the wide-angle look of the reference shots
//  - supersampled downsample (the scene is rendered above screen resolution)
//  - ink lines from depth (silhouettes + creases) and from color steps, weighted by distance
//  - a soft vignette
// and a final FXAA pass to the screen.
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
  uniform vec2 uOut; // output (drawing buffer) size in pixels
  uniform float uNear, uFar, uBarrel, uThick;
  uniform vec3 uInk, uGradeShadow, uGradeHigh;
  uniform float uGrade;
  varying vec2 vUv;

  float invZ(vec2 uv) {
    float d = texture2D(tDepth, uv).x;
    return -1.0 / perspectiveDepthToViewZ(d, uNear, uFar);
  }
  float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

  // Ink at one sample point. The line weight tapers with distance, full up close and
  // a hairline far away, so distant cones and poles aren't swallowed by their outlines.
  float inkAt(vec2 uv) {
    float c = invZ(uv);
    float w = uThick * clamp(14.0 * c, 0.3, 1.0); // c = 1/distance
    vec2 o = w / uOut;
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

    // fade the ink into the haze with distance
    return max(depthEdge, colorEdge * 0.35) * (1.0 - smoothstep(60.0, 115.0, 1.0 / nearest));
  }

  void main() {
    float aspect = uOut.x / uOut.y;
    vec2 p = vUv * 2.0 - 1.0;
    p.x *= aspect;
    float r2 = dot(p, p);
    float rmax2 = aspect * aspect + 1.0;
    float k = (1.0 + uBarrel * r2) / (1.0 + uBarrel * rmax2);
    p *= k;
    p.x /= aspect;
    vec2 uv = p * 0.5 + 0.5;

    // supersampled source: four taps over this output pixel's footprint (rotated grid),
    // each a bilinear read, and the ink computed per tap, so edges and lines come out
    // anti-aliased instead of stair-stepped
    vec2 px = k / uOut;
    vec2 t0 = vec2(0.125, 0.375) * px, t1 = vec2(-0.375, 0.125) * px;
    vec2 t2 = -t0, t3 = -t1;
    vec3 col = (texture2D(tColor, uv + t0).rgb + texture2D(tColor, uv + t1).rgb + texture2D(tColor, uv + t2).rgb + texture2D(tColor, uv + t3).rgb) * 0.25;
    float ink = (inkAt(uv + t0) + inkAt(uv + t1) + inkAt(uv + t2) + inkAt(uv + t3)) * 0.25;
    col = mix(col, uInk, ink * 0.9);

    // time-of-day grade: tint by brightness, violet in the darks, gold in the lights
    float L = lum(col);
    vec3 tint = mix(uGradeShadow, uGradeHigh, smoothstep(0.05, 0.6, L));
    col = mix(col, col * tint * 1.15, uGrade);

    vec2 v = vUv - 0.5;
    col *= 1.0 - dot(v, v) * 0.45;
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`

// FXAA over the finished frame, which also smooths the ink lines (MSAA can't reach those,
// they're drawn from the resolved depth). Edges are found on gamma-ish luma.
const fxaaFrag = /* glsl */ `
  uniform sampler2D tSrc;
  uniform vec2 uRcp;
  varying vec2 vUv;
  float luma(vec3 c) { return sqrt(dot(c, vec3(0.299, 0.587, 0.114))); }
  vec3 tap(vec2 o) { return texture2D(tSrc, vUv + o * uRcp).rgb; }
  void main() {
    vec3 m = tap(vec2(0.0));
    float lNW = luma(tap(vec2(-1.0, -1.0))), lNE = luma(tap(vec2(1.0, -1.0)));
    float lSW = luma(tap(vec2(-1.0, 1.0))), lSE = luma(tap(vec2(1.0, 1.0)));
    float lM = luma(m);
    float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE)));
    float lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
    vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), (lNW + lSW) - (lNE + lSE));
    float reduce = max((lNW + lNE + lSW + lSE) * (0.25 / 8.0), 1.0 / 128.0);
    dir = clamp(dir / (min(abs(dir.x), abs(dir.y)) + reduce), -8.0, 8.0);
    vec3 a = 0.5 * (tap(dir * (1.0 / 3.0 - 0.5)) + tap(dir * (2.0 / 3.0 - 0.5)));
    vec3 b = a * 0.5 + 0.25 * (tap(dir * -0.5) + tap(dir * 0.5));
    float lB = luma(b);
    vec3 col = (lB < lMin || lB > lMax) ? a : b;
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`

const SS_MAX = 1.75 // at most 1.75x the drawing buffer per axis
const SS_BUDGET = 7.5e6 // pixels rendered per frame at best
const SS_MIN_BUDGET = 1.5e6

export function PostFX({ barrel = 0.22, thickness = 2.1 }: { barrel?: number; thickness?: number }) {
  const gl = useThree((s) => s.gl)
  const size = useThree((s) => s.size)
  const dpr = useThree((s) => s.viewport.dpr)

  const { target, mid, quad, fxaa, cam, mat, fxaaMat } = useMemo(() => {
    // MSAA smooths geometry edges; three resolves the depth texture for the ink pass
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 })
    target.depthTexture = new THREE.DepthTexture(1, 1, THREE.FloatType)
    const mid = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false })
    const mat = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tColor: { value: target.texture },
        tDepth: { value: target.depthTexture },
        uOut: { value: new THREE.Vector2(1, 1) },
        uNear: { value: 0.1 },
        uFar: { value: 100 },
        uBarrel: { value: barrel },
        uThick: { value: thickness },
        uInk: { value: new THREE.Color('#2c2733') },
        uGradeShadow: { value: new THREE.Color(GRADE.shadow) },
        uGradeHigh: { value: new THREE.Color(GRADE.highlight) },
        uGrade: { value: GRADE.strength },
      },
    })
    const fxaaMat = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: fxaaFrag,
      depthTest: false,
      depthWrite: false,
      uniforms: { tSrc: { value: mid.texture }, uRcp: { value: new THREE.Vector2(1, 1) } },
    })
    const plane = new THREE.PlaneGeometry(2, 2)
    const quad = new THREE.Scene()
    quad.add(new THREE.Mesh(plane, mat))
    const fxaa = new THREE.Scene()
    fxaa.add(new THREE.Mesh(plane, fxaaMat))
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    return { target, mid, quad, fxaa, cam, mat, fxaaMat }
  }, [barrel, thickness])

  // Render the scene above screen resolution (supersampling) within a pixel budget, and
  // back off if the frame rate can't hold it.
  const quality = useMemo(() => ({ budget: SS_BUDGET, slow: 0, v: new THREE.Vector2() }), [])
  const resize = useCallback(() => {
    const v = gl.getDrawingBufferSize(quality.v)
    const ss = THREE.MathUtils.clamp(Math.sqrt(quality.budget / (v.x * v.y)), 1, SS_MAX)
    target.setSize(Math.round(v.x * ss), Math.round(v.y * ss))
    mid.setSize(v.x, v.y)
    mat.uniforms.uOut.value.copy(v)
    mat.uniforms.uThick.value = thickness * Math.max(1, dpr)
    fxaaMat.uniforms.uRcp.value.set(1 / v.x, 1 / v.y)
  }, [gl, dpr, target, mid, mat, fxaaMat, thickness, quality])
  useEffect(resize, [resize, size])

  useEffect(
    () => () => {
      target.dispose()
      mid.dispose()
    },
    [target, mid],
  )

  // priority 1: this callback owns rendering (r3f stops auto-rendering)
  useFrame(({ scene, camera }, dt) => {
    // sustained slow frames (>21 ms) drop the supersampling budget by a fifth
    quality.slow = dt > 0.021 ? quality.slow + 1 : Math.max(0, quality.slow - 1)
    if (quality.slow > 90 && quality.budget > SS_MIN_BUDGET) {
      quality.budget *= 0.8
      quality.slow = 0
      resize()
    }
    const pc = camera as THREE.PerspectiveCamera
    mat.uniforms.uNear.value = pc.near
    mat.uniforms.uFar.value = pc.far
    gl.setRenderTarget(target)
    gl.render(scene, camera)
    gl.setRenderTarget(mid)
    gl.render(quad, cam)
    gl.setRenderTarget(null)
    gl.render(fxaa, cam)
  }, 1)

  return null
}
