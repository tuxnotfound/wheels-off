import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { curvedDepth, toonMat } from '../look/materials'
import { CURVE } from './worldConfig'

// Blossoming trees in 3D. A toon-shaded trunk and branches carry a canopy of
// camera-facing blossom clusters, each one drawn from dozens of tiny flowers. Each
// cluster is lit as one piece from its direction off the canopy center, so the sun side
// reads pale and warm and the far side deep rose, in two cel tones. Reads full from
// every angle, with a ragged, flowery silhouette instead of a bubbly one.

export type TreeKind = 'sakura' | 'green'

const PALETTES: Record<TreeKind, { flowers: string[]; base: string; lit: string; shade: string; bark: string }> = {
  sakura: { flowers: ['#fde8ee', '#fbd3df', '#f6bccd', '#f1a9bf'], base: '#f3b6c8', lit: '#fff3ea', shade: '#c98fae', bark: '#4f3d3a' },
  green: { flowers: ['#b7d98f', '#9dcb7a', '#86b96a', '#6fa65c'], base: '#8cbd70', lit: '#fff4dc', shade: '#6f8fa0', bark: '#5b4640' },
}

// ---------- seeded random ----------
function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ---------- blossom cluster texture ----------
const texCache = new Map<TreeKind, THREE.CanvasTexture>()
function clusterTex(kind: TreeKind): THREE.CanvasTexture {
  const hit = texCache.get(kind)
  if (hit) return hit
  const pal = PALETTES[kind]
  const S = 256
  const c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d')!
  const r = rng(kind === 'sakura' ? 7 : 11)
  // a ragged body fills the gaps so clusters read solid; flowers break the outline
  g.fillStyle = pal.base
  for (let i = 0; i < 14; i++) {
    const a = r() * Math.PI * 2
    const d = r() * 52
    g.beginPath()
    g.arc(S / 2 + Math.cos(a) * d, S / 2 + Math.sin(a) * d, 34 + r() * 22, 0, Math.PI * 2)
    g.fill()
  }
  const flower = (x: number, y: number, rad: number, col: string) => {
    g.fillStyle = col
    const rot = r() * Math.PI
    for (let k = 0; k < 5; k++) {
      const a = rot + (k * Math.PI * 2) / 5
      g.beginPath()
      g.ellipse(x + Math.cos(a) * rad * 0.55, y + Math.sin(a) * rad * 0.55, rad * 0.55, rad * 0.36, a, 0, Math.PI * 2)
      g.fill()
    }
    g.fillStyle = kind === 'sakura' ? '#e98aa6' : '#5f8f4e'
    g.beginPath()
    g.arc(x, y, rad * 0.16, 0, Math.PI * 2)
    g.fill()
  }
  for (let i = 0; i < 150; i++) {
    const a = r() * Math.PI * 2
    const d = Math.pow(r(), 0.6) * 100
    const x = S / 2 + Math.cos(a) * d
    const y = S / 2 + Math.sin(a) * d * 0.92
    // lighter flowers toward the top of the cluster
    const tone = Math.min(pal.flowers.length - 1, Math.floor(((y / S) * 0.8 + r() * 0.5) * pal.flowers.length))
    flower(x, y, 9 + r() * 7, pal.flowers[tone])
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  texCache.set(kind, t)
  return t
}

// ---------- materials ----------
const clusterVert = /* glsl */ `
  #include <common>
  #include <fog_pars_vertex>
  uniform float uCurve;
  uniform vec3 uSun;
  attribute vec2 corner;
  attribute float size;
  attribute float rot;
  attribute vec3 nrm;
  varying vec2 vUv;
  varying float vLit;
  varying float vDepth;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    w.y -= (w.x * w.x + w.z * w.z) * uCurve;
    vec4 mvPosition = viewMatrix * w;
    float c = cos(rot), s = sin(rot);
    vec2 q = vec2(c * corner.x - s * corner.y, s * corner.x + c * corner.y);
    mvPosition.xy += q * size * 0.5 * length(modelMatrix[0].xyz);
    gl_Position = projectionMatrix * mvPosition;
    vUv = corner * 0.5 + 0.5;
    vLit = dot(normalize(mat3(modelMatrix) * nrm), uSun);
    vDepth = nrm.y; // underside clusters sit in the canopy's own shade
    #include <fog_vertex>
  }
`
const clusterFrag = /* glsl */ `
  #include <common>
  #include <fog_pars_fragment>
  uniform sampler2D uMap;
  uniform vec3 uLit, uShade;
  varying vec2 vUv;
  varying float vLit;
  varying float vDepth;
  void main() {
    vec4 t = texture2D(uMap, vUv);
    if (t.a < 0.5) discard;
    float lit = step(0.0, vLit - 0.1 + vDepth * 0.35);
    gl_FragColor = vec4(t.rgb * mix(uShade, uLit, lit), 1.0);
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`

const clusterMats = new Map<TreeKind, THREE.ShaderMaterial>()
function clusterMat(kind: TreeKind): THREE.ShaderMaterial {
  let m = clusterMats.get(kind)
  if (!m) {
    const pal = PALETTES[kind]
    m = new THREE.ShaderMaterial({
      vertexShader: clusterVert,
      fragmentShader: clusterFrag,
      fog: true,
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        {
          uMap: { value: null },
          uCurve: { value: CURVE },
          uSun: { value: new THREE.Vector3(0, 1, 0) },
          uLit: { value: new THREE.Color(pal.lit) },
          uShade: { value: new THREE.Color(pal.shade) },
        },
      ]),
    })
    m.uniforms.uMap.value = clusterTex(kind)
    clusterMats.set(kind, m)
  }
  return m
}

/** Keep the canopies lit from the same direction as the sun (world group rotates with the camera). */
export function setTreeSun(dir: THREE.Vector3) {
  for (const m of clusterMats.values()) m.uniforms.uSun.value.copy(dir)
}

// ---------- tree variants (built once, shared by every tree) ----------
type Variant = { wood: THREE.BufferGeometry; canopy: THREE.BufferGeometry }

function limb(a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number): THREE.BufferGeometry {
  const dir = b.clone().sub(a)
  const len = dir.length()
  const g = new THREE.CylinderGeometry(r1, r0, len, 7, 1)
  g.translate(0, len / 2, 0)
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()))
  g.translate(a.x, a.y, a.z)
  return g
}

function buildVariant(seed: number): Variant {
  const r = rng(seed)
  const lean = new THREE.Vector3((r() - 0.5) * 0.6, 0, (r() - 0.5) * 0.6)
  const fork = new THREE.Vector3(lean.x, 2.3 + r() * 0.5, lean.z)
  const center = new THREE.Vector3(lean.x * 1.4, 4.5 + r() * 0.4, lean.z * 1.4)
  const R = { x: 2.8 + r() * 0.5, y: 1.35 + r() * 0.3, z: 2.8 + r() * 0.5 }
  const woods: THREE.BufferGeometry[] = [limb(new THREE.Vector3(0, -0.2, 0), fork, 0.24, 0.16)]
  const tips: THREE.Vector3[] = []
  const nBranch = 5 + Math.floor(r() * 2)
  for (let i = 0; i < nBranch; i++) {
    const a = (i / nBranch) * Math.PI * 2 + r() * 0.6
    const tip = new THREE.Vector3(center.x + Math.cos(a) * R.x * 0.72, center.y - 0.1 + r() * 0.9, center.z + Math.sin(a) * R.z * 0.72)
    const mid = fork.clone().lerp(tip, 0.5).add(new THREE.Vector3(0, 0.35, 0))
    woods.push(limb(fork, mid, 0.13, 0.09), limb(mid, tip, 0.09, 0.04))
    tips.push(tip)
  }
  const wood = mergeGeometries(woods)!
  woods.forEach((g) => g.dispose())

  // clusters: a dome of them over an ellipsoid, a few drooping under the branch tips
  const clusters: { p: THREE.Vector3; s: number }[] = []
  for (let i = 0; i < 46; i++) {
    const u = r() * Math.PI * 2
    const v = Math.acos(1 - r() * 1.35) // biased to the top half
    const n = new THREE.Vector3(Math.sin(v) * Math.cos(u), Math.cos(v), Math.sin(v) * Math.sin(u))
    const k = 0.75 + r() * 0.25
    clusters.push({ p: new THREE.Vector3(center.x + n.x * R.x * k, center.y + n.y * R.y * k, center.z + n.z * R.z * k), s: 1.5 + r() * 0.9 })
  }
  for (const t of tips) clusters.push({ p: t.clone().add(new THREE.Vector3(0, -0.35, 0)), s: 1.4 + r() * 0.6 })

  const N = clusters.length
  const pos = new Float32Array(N * 12)
  const corner = new Float32Array(N * 8)
  const size = new Float32Array(N * 4)
  const rot = new Float32Array(N * 4)
  const nrm = new Float32Array(N * 12)
  const index: number[] = []
  const quad = [-1, -1, 1, -1, 1, 1, -1, 1]
  clusters.forEach((c, i) => {
    const n = c.p.clone().sub(center)
    n.set(n.x / R.x, n.y / R.y, n.z / R.z).normalize()
    const rr = r() * Math.PI * 2
    for (let v = 0; v < 4; v++) {
      const o = i * 4 + v
      pos.set([c.p.x, c.p.y, c.p.z], o * 3)
      corner.set([quad[v * 2], quad[v * 2 + 1]], o * 2)
      size[o] = c.s
      rot[o] = rr
      nrm.set([n.x, n.y, n.z], o * 3)
    }
    index.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3)
  })
  const canopy = new THREE.BufferGeometry()
  canopy.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  canopy.setAttribute('corner', new THREE.BufferAttribute(corner, 2))
  canopy.setAttribute('size', new THREE.BufferAttribute(size, 1))
  canopy.setAttribute('rot', new THREE.BufferAttribute(rot, 1))
  canopy.setAttribute('nrm', new THREE.BufferAttribute(nrm, 3))
  canopy.setIndex(index)
  canopy.computeBoundingSphere()
  canopy.boundingSphere!.radius += 1.5 // billboards reach past their centers
  return { wood, canopy }
}

const VARIANTS = [101, 202, 303].map(buildVariant)

/** A tree standing at p (block-local), variant and size from r in [0,1). */
export function Tree3D({ p, r, kind = 'sakura' }: { p: [number, number, number]; r: number; kind?: TreeKind }) {
  const v = VARIANTS[Math.floor(r * VARIANTS.length) % VARIANTS.length]
  const s = 0.85 + ((r * 7.31) % 1) * 0.3
  return (
    <group position={p} rotation-y={r * 40} scale={s}>
      <mesh geometry={v.wood} material={toonMat(PALETTES[kind].bark)} castShadow receiveShadow customDepthMaterial={curvedDepth} />
      <mesh geometry={v.canopy} material={clusterMat(kind)} />
    </group>
  )
}
