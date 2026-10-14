import { useFrame, useThree } from '@react-three/fiber'
import { useCallback, useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { GRADE } from './timeOfDay'
import { skater } from '../player/Skater'

// The scene renders into an 8-bit sRGB target, then one full-screen pass over it:
//  - fisheye (barrel) lens, the wide-angle look of the reference shots
//  - supersampled downsample (the scene is rendered above screen resolution)
//  - ink lines from depth (silhouettes + creases) and from color steps, weighted by distance
//  - a soft vignette
// and a final FXAA pass to the screen. No MSAA: the ink covers the silhouettes and FXAA the rest,
// and at 3024x1800 4x MSAA cost a third of the GPU's frame and about 360 MB for no visible gain.
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
  uniform vec4 uRider; // the rider's box in the scene image: min xy, max xy
  varying vec2 vUv;

  float invZ(vec2 uv) {
    float d = texture2D(tDepth, uv).x;
    return -1.0 / perspectiveDepthToViewZ(d, uNear, uFar);
  }
  float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

  // The rider's pixels carry alpha 0 (materials.ts markRider); the sky never writes depth.
  float riderAt(vec2 p) {
    return (1.0 - texture2D(tColor, p).a) * step(texture2D(tDepth, p).x, 0.99999);
  }

  // Ink at one sample point. The line weight tapers with distance, full up close and
  // a hairline far away, so distant cones and poles aren't swallowed by their outlines.
  // On the rider it is finer still and skips color steps: a leg is a few pixels wide.
  float inkAt(vec2 uv, float rider) {
    float c = invZ(uv);
    float w = uThick * clamp(14.0 * c, 0.3, 1.0) * mix(1.0, 0.5, rider); // c = 1/distance
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
    float colorEdge = smoothstep(0.32, 0.5, g) * solid * (1.0 - rider);

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
    // rider mask, grown by a line width so its outline is fine on both sides of the silhouette;
    // ten texture reads, so only inside the rider's box
    float rider = 0.0;
    if (all(greaterThan(uv, uRider.xy)) && all(lessThan(uv, uRider.zw))) {
      vec2 ro = uThick / uOut;
      rider = max(riderAt(uv), max(max(riderAt(uv + vec2(ro.x, 0.0)), riderAt(uv - vec2(ro.x, 0.0))), max(riderAt(uv + vec2(0.0, ro.y)), riderAt(uv - vec2(0.0, ro.y)))));
    }
    float ink = (inkAt(uv + t0, rider) + inkAt(uv + t1, rider) + inkAt(uv + t2, rider) + inkAt(uv + t3, rider)) * 0.25;
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

// FXAA over the finished frame: it smooths the edges the ink doesn't cover, and the ink lines
// themselves. Edges are found on gamma-ish luma.
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

// The rider's box: a sphere around the kid and the board, projected, so the shader looks for the
// rider only where it can be
const RIDER_MID = 0.85 // meters above the board's ground point
const RIDER_R = 1.3 // meters, enough for the kid and the board through tricks and wipeouts
const mid3 = new THREE.Vector3()

/** The rider's box in the scene image (uv: min xy, max xy), grown by `grow`; the whole image if the camera is too close. */
function riderBox(camera: THREE.PerspectiveCamera, grow: THREE.Vector2, out: THREE.Vector4) {
  const root = skater.root
  if (!root) return out.set(0, 0, 1, 1)
  root.updateWorldMatrix(true, false)
  camera.updateMatrixWorld()
  mid3.setFromMatrixPosition(root.matrixWorld)
  mid3.y += RIDER_MID
  mid3.applyMatrix4(camera.matrixWorldInverse)
  const d = -mid3.z
  if (d < camera.near + RIDER_R) return out.set(0, 0, 1, 1)
  // the sphere's radius in uv (half its size in NDC)
  const ry = (0.5 * RIDER_R) / (d * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2))
  const rx = ry / camera.aspect
  mid3.applyMatrix4(camera.projectionMatrix)
  const u = mid3.x * 0.5 + 0.5
  const v = mid3.y * 0.5 + 0.5
  return out.set(u - rx - grow.x, v - ry - grow.y, u + rx + grow.x, v + ry + grow.y)
}

const SS_MAX = 1.75 // at most 1.75x the drawing buffer per axis
const SS_BUDGET = 7.5e6 // pixels rendered per frame at best
const SLOW = 0.021 // seconds: frames averaging slower than this run under about 48 a second
const SUSTAIN = 60 // frames that slow, one after another, before quality steps down
const SETTLE = 2 // seconds of frames before any counts: shaders compile, the art uploads
const STEP = 0.8 // each step keeps this much of the supersampling budget, then of the resolution

export function PostFX({ barrel = 0.22, thickness = 2.1 }: { barrel?: number; thickness?: number }) {
  const gl = useThree((s) => s.gl)
  const size = useThree((s) => s.size)
  const dpr = useThree((s) => s.viewport.dpr)
  const setDpr = useThree((s) => s.setDpr)

  const { target, mid, quad, fxaa, cam, mat, fxaaMat } = useMemo(() => {
    // 8-bit sRGB: stored encoded and read back linear, so the darks stay smooth at half the
    // memory and bandwidth of half-float; the depth texture feeds the ink
    const target = new THREE.WebGLRenderTarget(1, 1, { colorSpace: THREE.SRGBColorSpace })
    target.depthTexture = new THREE.DepthTexture(1, 1, THREE.FloatType)
    const mid = new THREE.WebGLRenderTarget(1, 1, { colorSpace: THREE.SRGBColorSpace, depthBuffer: false })
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
        uRider: { value: new THREE.Vector4(0, 0, 1, 1) },
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

  // Render the scene above screen resolution (supersampling) within a pixel budget, and step
  // quality down on a machine that can't hold the frame rate (frames averaging slower than
  // SLOW, SUSTAIN of them in a row): first the supersampling, a fifth of its budget at a time,
  // down to the screen's own resolution; then the resolution itself (the canvas DPR), a fifth at
  // a time, down to 1x on a high-DPI screen and 0.75x on a 1x one. It never steps back up.
  const quality = useMemo(
    () => ({ budget: SS_BUDGET, ss: true, avg: 1 / 60, slow: 0, age: 0, v: new THREE.Vector2(), grow: new THREE.Vector2() }),
    [],
  )
  const resize = useCallback(() => {
    const v = gl.getDrawingBufferSize(quality.v)
    const ss = quality.ss ? THREE.MathUtils.clamp(Math.sqrt(quality.budget / (v.x * v.y)), 1, SS_MAX) : 1
    target.setSize(Math.round(v.x * ss), Math.round(v.y * ss))
    mid.setSize(v.x, v.y)
    mat.uniforms.uOut.value.copy(v)
    mat.uniforms.uThick.value = thickness * Math.max(1, dpr)
    fxaaMat.uniforms.uRcp.value.set(1 / v.x, 1 / v.y)
  }, [gl, dpr, target, mid, mat, fxaaMat, thickness, quality])
  useEffect(resize, [resize, size])

  const stepDown = () => {
    const v = gl.getDrawingBufferSize(quality.v)
    const pixels = v.x * v.y
    const floor = Math.max(0.75, Math.min(window.devicePixelRatio, 2) / 2)
    if (quality.ss && quality.budget > pixels) {
      // from the budget in use: on a small screen the cap holds it below the full budget
      quality.budget = Math.max(pixels, Math.min(quality.budget, SS_MAX * SS_MAX * pixels) * STEP)
      quality.ss = quality.budget > pixels
      resize()
    } else if (dpr > floor) {
      quality.ss = false // off for good: a smaller canvas would take it back up
      setDpr(Math.max(floor, dpr * STEP)) // the canvas resizes, then resize() runs
    }
  }
  // dev-only handle for test scripts: the quality state, and a step down on demand
  if (import.meta.env.DEV) Object.assign(window, { __quality: { state: quality, dpr, stepDown } })

  useEffect(
    () => () => {
      target.dispose()
      mid.dispose()
    },
    [target, mid],
  )

  // priority 1: this callback owns rendering (r3f stops auto-rendering)
  useFrame(({ scene, camera }, dt) => {
    // a pause or a hidden tab shows up as one long frame: capped, it can't count as many
    const t = Math.min(dt, 0.1)
    quality.age += t
    quality.avg += (t - quality.avg) * 0.05
    quality.slow = quality.age > SETTLE && quality.avg > SLOW ? quality.slow + 1 : 0
    if (quality.slow > SUSTAIN) {
      quality.slow = 0
      quality.avg = 1 / 60 // the next step waits for a second of fresh evidence
      stepDown()
    }
    const pc = camera as THREE.PerspectiveCamera
    mat.uniforms.uNear.value = pc.near
    mat.uniforms.uFar.value = pc.far
    // grown by two line widths: the mask reaches one past the silhouette
    const u = mat.uniforms
    quality.grow.set(2, 2).multiplyScalar(u.uThick.value).divide(u.uOut.value)
    riderBox(pc, quality.grow, u.uRider.value)
    gl.setRenderTarget(target)
    gl.render(scene, camera)
    gl.setRenderTarget(mid)
    gl.render(quad, cam)
    gl.setRenderTarget(null)
    gl.render(fxaa, cam)
  }, 1)

  return null
}
