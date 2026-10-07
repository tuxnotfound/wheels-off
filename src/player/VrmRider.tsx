import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm'
import type { MToonMaterial, VRM, VRMHumanBoneName } from '@pixiv/three-vrm'
import { curvedDepth, markRider, riderMat } from '../look/materials'
import { BEANIE, BEANIE_CUFF, BEANIE_TAG, PANTS, PANTS_SHADE, PHONES, PHONES_CAP, ProceduralRider } from './ProceduralRider'
import { DECK_TOP, footFlat, riderLeg, solveLeg, toBody } from './pose'
import type { Foot, LegAngles, Pose } from './pose'
import type { RiderProps } from './Skater'

const TARGET_HEIGHT = 1.45 // the kid's height in world meters (beanie included), whatever the model's size

// Chibi: a smaller body under a much bigger head, chubby limbs, long hair cut to the
// shoulder blades.
const BODY_SCALE = 0.8
const HEAD_SCALE = 1.9
const HAIR_CUT = 0.8 // long strands keep their width, lose this much length below the ears
const LEG_PUFF = 1.25 // limbs thickened around their bones, not lengthened
const ARM_PUFF = 1.15

// An oversized dark green sweater and a chunky red scarf.
const SWEATER = '#2f6b5a'
const SWEATER_SHADE = '#1e4a3f'
const SWEATER_LOOSE = 0.012 // the body pushed out this far from the top it is made from
const SLEEVE_PAST_WRIST = 0.02 // the cuffs come down over the heels of the hands
const SCARF = '#d8483d'

// Her face, after the Lofi Girl: small dark almond eyes under heavy lids, looking a little
// down, a darker lash line, warmer skin and a round jaw in place of the pointed chin.
const EYE_SIZE = 0.85 // the eyes shrunk about their own centers,
const EYE_SQUASH = 0.85 // and flattened into almonds
const LASH_SIZE = 0.95 // the lash lines shrink less, so they stay bold and flick past the eyes
const IRIS = '#1e1412' // multiplies the iris texture nearly black
const LASHES = '#404040' // multiplies the lash line darker
const SKIN = '#f0e8d4' // multiplies the skin from pink toward peach,
const SKIN_SHADE = '#ecc4a8' // and its shade, warm instead of VRoid's pink
const LIDS = 0.42 // how far closed the eyes rest
const GAZE_DOWN = 8 // degrees
const JAW_ROUND = 0.32 // the lower face widened toward the chin, as a fraction
const CHIN_LIFT = 0.012 // meters

type Rig = {
  vrm: VRM
  scale: number
  lift: number // puts the soles on the deck
  hipsRest: THREE.Vector3
  hipL: THREE.Vector3 // hip joints at rest, model units
  hipR: THREE.Vector3
  hipMid: THREE.Vector3
  thigh: number
  shin: number
  leg: typeof riderLeg // the same, in world meters
  bone: (name: VRMHumanBoneName) => THREE.Object3D | null
}

const v3 = () => new THREE.Vector3()

/** Over-ear headphones in the beanie's frame: band over the crown, cups on the ears. */
function headphones(rx: number, ry: number, earY: number): THREE.Group {
  const g = new THREE.Group()
  const cupR = ry * 0.34
  const cupT = rx * 0.2
  const cx = rx + cupT * 0.5 // cups sit on the hair at the sides
  const bx = rx * 1.04 + cupT * 0.3 // band clears the beanie's cuff
  const top = ry * 1.06 + cupT * 0.3
  const pts = [new THREE.Vector3(cx, earY + cupR * 0.75, 0)]
  for (let i = 0; i <= 18; i++) {
    const a = (i / 18) * Math.PI
    pts.push(new THREE.Vector3(bx * Math.cos(a), top * Math.sin(a), 0))
  }
  pts.push(new THREE.Vector3(-cx, earY + cupR * 0.75, 0))
  const band = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 90, rx * 0.05, 8), riderMat(PHONES))
  g.add(band)
  for (const s of [-1, 1]) {
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(cupR, cupR, cupT, 28), riderMat(PHONES))
    cup.rotation.z = Math.PI / 2
    cup.position.set(s * cx, earY, 0)
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(cupR * 0.74, cupR * 0.74, cupT * 0.35, 28), riderMat(PHONES_CAP))
    cap.rotation.z = Math.PI / 2
    cap.position.set(s * (cx + cupT * 0.6), earY, 0)
    const slider = new THREE.Mesh(new THREE.BoxGeometry(cupT * 0.7, cupR * 0.6, cupR * 0.45), riderMat(PHONES))
    slider.position.set(s * cx, earY + cupR * 1.05, 0)
    g.add(cup, cap, slider)
  }
  return g
}

/**
 * Knit beanie fitted over the hair's crown, with headphones over it, parented to the
 * head bone so they follow every nod. Returns the top of the beanie (model units).
 */
function addHeadwear(vrm: VRM) {
  const head = vrm.humanoid.getRawBoneNode('head')
  const eye = vrm.humanoid.getRawBoneNode('leftEye') ?? head
  if (!head || !eye) return
  const eyeY = eye.getWorldPosition(v3()).y
  const lo = v3().setScalar(Infinity)
  const hi = v3().setScalar(-Infinity)
  const p = v3()
  vrm.scene.traverse((o) => {
    const m = o as THREE.Mesh
    const mats = m.isMesh ? ([] as THREE.Material[]).concat(m.material) : []
    if (!m.isMesh || !(/hair/i.test(m.name) || mats.some((x) => /hair/i.test(x.name)))) return
    const pos = m.geometry.attributes.position
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld)
      if (p.y < eyeY) continue
      lo.min(p)
      hi.max(p)
    }
  })
  if (!Number.isFinite(lo.y)) return
  const rx = ((hi.x - lo.x) / 2) * 1.05
  const rz = ((hi.z - lo.z) / 2) * 1.05
  const rimY = eyeY + (hi.y - eyeY) * 0.3
  const ry = (hi.y - rimY) * 1.12
  const tilt = -0.28 // rim above the bangs in front, low over the nape behind

  const beanie = new THREE.Group()
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 36, 14, 0, Math.PI * 2, 0, Math.PI / 2), riderMat(BEANIE))
  dome.scale.set(rx, ry, rz)
  const cuff = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.02, 1, 36), riderMat(BEANIE_CUFF))
  cuff.scale.set(rx * 1.04, ry * 0.36, rz * 1.04)
  cuff.position.y = ry * 0.1
  const tag = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), riderMat(BEANIE_TAG))
  tag.scale.set(rx * 0.32, ry * 0.2, rz * 0.08)
  tag.position.set(0, ry * 0.1, rz * 1.04)
  const earY = (eyeY - (hi.y - eyeY) * 0.12 - rimY) / Math.cos(tilt)
  beanie.add(dome, cuff, tag, headphones(rx, ry, earY))
  beanie.position.set((lo.x + hi.x) / 2, rimY, (lo.z + hi.z) / 2)
  beanie.rotation.x = tilt
  beanie.updateMatrix()
  vrm.scene.updateMatrixWorld(true)
  beanie.matrix.premultiply(head.matrixWorld.clone().invert())
  beanie.matrix.decompose(beanie.position, beanie.quaternion, beanie.scale)
  head.add(beanie)
  return rimY + ry * 1.06
}

/** A chunky red scarf wound twice round the neck, on the neck bone. */
function addScarf(vrm: VRM, skin: THREE.SkinnedMesh) {
  const neck = vrm.humanoid.getRawBoneNode('neck')
  const head = vrm.humanoid.getRawBoneNode('head')
  if (!neck || !head) return
  vrm.scene.updateMatrixWorld(true)
  const y0 = neck.getWorldPosition(v3()).y
  const y1 = head.getWorldPosition(v3()).y
  const lo = v3().setScalar(Infinity)
  const hi = v3().setScalar(-Infinity)
  const p = v3()
  const pos = skin.geometry.attributes.position
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i).applyMatrix4(skin.matrixWorld)
    if (p.y < y0 || p.y > y1) continue
    lo.min(p)
    hi.max(p)
  }
  if (!Number.isFinite(lo.y)) return
  const r = Math.max(hi.x - lo.x, hi.z - lo.z) / 2
  const tube = r * 0.62
  const ring = (y: number, R: number, t: number, tilt: number) => {
    const m = new THREE.Mesh(new THREE.TorusGeometry(R, t, 12, 36), riderMat(SCARF))
    m.rotation.set(Math.PI / 2 + tilt, 0, 0)
    m.position.y = y
    return m
  }
  // two wraps, the upper one tipped up at the back
  const scarf = new THREE.Group()
  scarf.add(ring(0, r * 1.45, tube, 0), ring(tube * 1.1, r * 1.3, tube * 0.85, -0.18))
  scarf.position.set((lo.x + hi.x) / 2, y0 + (y1 - y0) * 0.2, (lo.z + hi.z) / 2)
  scarf.updateMatrix()
  scarf.matrix.premultiply(neck.matrixWorld.clone().invert())
  scarf.matrix.decompose(scarf.position, scarf.quaternion, scarf.scale)
  neck.add(scarf)
}

/** Long strands (4+ joints) squashed along their length below the first joint, so they keep their width. */
function cutHair(scene: THREE.Object3D) {
  scene.traverse((o) => {
    const m = /^J_Sec_Hair2_(\d+)$/.exec(o.name)
    if (!m || !o.parent) return
    let depth = 0
    for (let c: THREE.Object3D | undefined = o; c; c = c.children.find((k) => /Hair/.test(k.name))) depth++
    if (depth >= 4) o.scale.set(1, 1 - HAIR_CUT, 1)
  })
}

// [bone, its child, thickening, fades in from the body joint]
const LIMBS: [VRMHumanBoneName, VRMHumanBoneName, number, boolean][] = [
  ['leftUpperLeg', 'leftLowerLeg', LEG_PUFF, true],
  ['leftLowerLeg', 'leftFoot', LEG_PUFF, false],
  ['rightUpperLeg', 'rightLowerLeg', LEG_PUFF, true],
  ['rightLowerLeg', 'rightFoot', LEG_PUFF, false],
  ['leftUpperArm', 'leftLowerArm', ARM_PUFF, true],
  ['leftLowerArm', 'leftHand', ARM_PUFF, false],
  ['rightUpperArm', 'rightLowerArm', ARM_PUFF, true],
  ['rightLowerArm', 'rightHand', ARM_PUFF, false],
]
const CLOTH_EXTRA = 1.1 // clothes puff a bit more than the skin under them

/**
 * Chubby chibi limbs: push vertices out from the nearest limb bone's axis. Thicker, not
 * longer, and no bone scale, so no shear when the joints bend. The push depends only on
 * where a vertex sits along the bone, never on its skin weights, so skin and the clothes
 * over it move together. It fades in from the hips and shoulders and stops at the wrists
 * and ankles, leaving hands and shoes their size. Hair and face meshes are left alone.
 */
function puffLimbs(vrm: VRM) {
  const raw = (n: VRMHumanBoneName) => vrm.humanoid.getRawBoneNode(n) as THREE.Bone | null
  const p = v3()
  const c = v3()
  vrm.scene.traverse((o) => {
    const m = o as THREE.SkinnedMesh
    if (!m.isSkinnedMesh) return
    const bones = m.skeleton.bones
    // joint positions in bind space, where bindMatrix puts the vertices
    const joint = (b: THREE.Bone) => v3().setFromMatrixPosition(m.skeleton.boneInverses[bones.indexOf(b)].clone().invert())
    const mats = ([] as THREE.Material[]).concat(m.material)
    if (mats.some((x) => /hair|face|eye/i.test(x.name))) return
    const cloth = mats.some((x) => /cloth/i.test(x.name)) ? CLOTH_EXTRA : 1
    const segs: { a: THREE.Vector3; ab: THREE.Vector3; f: number; root: boolean }[] = []
    for (const [from, to, f, root] of LIMBS) {
      const a = raw(from)
      const b = raw(to)
      if (!a || !b || !bones.includes(a) || !bones.includes(b)) continue
      const ja = joint(a)
      segs.push({ a: ja, ab: joint(b).sub(ja), f: 1 + (f - 1) * cloth, root })
    }
    if (!segs.length) return
    const reach = Math.max(...segs.map((g) => g.ab.length())) * 0.45
    const pos = m.geometry.attributes.position
    for (let k = 0; k < pos.count; k++) {
      p.fromBufferAttribute(pos, k).applyMatrix4(m.bindMatrix)
      let best = segs[0]
      let bestD = Infinity
      let bestT = 0
      for (const g of segs) {
        const tu = c.subVectors(p, g.a).dot(g.ab) / g.ab.lengthSq()
        const d = c.copy(g.a).addScaledVector(g.ab, THREE.MathUtils.clamp(tu, 0, 1)).distanceTo(p)
        if (d < bestD) {
          bestD = d
          best = g
          bestT = tu
        }
      }
      if (bestD > reach) continue
      const fade = (best.root ? THREE.MathUtils.smoothstep(bestT, 0.05, 0.4) : 1) * (1 - THREE.MathUtils.smoothstep(bestT, 0.95, 1.05))
      c.copy(best.a).addScaledVector(best.ab, THREE.MathUtils.clamp(bestT, 0, 1))
      p.add(c.subVectors(p, c).multiplyScalar((best.f - 1) * fade)).applyMatrix4(m.bindMatrixInverse)
      pos.setXYZ(k, p.x, p.y, p.z)
    }
    pos.needsUpdate = true
    m.geometry.computeBoundingBox()
    m.geometry.computeBoundingSphere()
  })
}

/** Height range of a skinned mesh's vertices in bind space. */
function bindRangeY(m: THREE.SkinnedMesh): [number, number] {
  const pos = m.geometry.attributes.position
  const p = v3()
  let lo = Infinity
  let hi = -Infinity
  for (let i = 0; i < pos.count; i++) {
    const y = p.fromBufferAttribute(pos, i).applyMatrix4(m.bindMatrix).y
    lo = Math.min(lo, y)
    hi = Math.max(hi, y)
  }
  return [lo, hi]
}

/** A model's skinned meshes, found by material name. */
function meshFinder(vrm: VRM) {
  const meshes: THREE.SkinnedMesh[] = []
  vrm.scene.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) meshes.push(o as THREE.SkinnedMesh)
  })
  return (re: RegExp) => meshes.find((m) => ([] as THREE.Material[]).concat(m.material).some((x) => re.test(x.name)))
}

/** The mesh's own MToon material, not its outline. */
function mtoonOf(m: THREE.Mesh): MToonMaterial | undefined {
  return ([] as THREE.Material[]).concat(m.material).find((x) => (x as MToonMaterial).isMToonMaterial && !(x as MToonMaterial).isOutline) as MToonMaterial | undefined
}

/** An MToon material in flat colors: its textures dropped, lit and shade colors set. */
function flatten(m: MToonMaterial, color: string, shade: string) {
  m.map = null
  m.shadeMultiplyTexture = null
  m.shadingShiftTexture = null
  m.rimMultiplyTexture = null
  m.matcapTexture = null
  m.normalMap = null
  m.emissiveMap = null
  m.emissive.set(0x000000) // its map may have masked it to highlights
  m.uvAnimationMaskTexture = null
  m.color.set(color)
  m.shadeColorFactor.set(shade)
  m.needsUpdate = true
  return m
}

/** A cloth material for a shell open at its ends, from the clothes' own MToon if there is one. */
function clothMat(src: MToonMaterial | undefined, color: string, shade: string) {
  if (!src) return riderMat(color, true)
  const m = flatten(src.clone(), color, shade)
  m.side = THREE.DoubleSide
  m.userData = {}
  return m
}

/**
 * Normals in bind space, one per position: corners split at UV seams share it, so pushing
 * along it can't open cracks along the seams.
 */
function weldedNormals(m: THREE.SkinnedMesh, verts: Iterable<number>) {
  const pos = m.geometry.attributes.position
  const nrm = m.geometry.attributes.normal
  const p = v3()
  const key = (i: number) => p.fromBufferAttribute(pos, i).applyMatrix4(m.bindMatrix).toArray().map((c) => Math.round(c * 1e5)).join()
  const sums = new Map<string, THREE.Vector3>()
  for (const i of verts) {
    const k = key(i)
    sums.set(k, (sums.get(k) ?? v3()).add(v3().fromBufferAttribute(nrm, i).transformDirection(m.bindMatrix)))
  }
  for (const n of sums.values()) n.normalize()
  return (i: number) => sums.get(key(i))!
}

/** Pushes a skinned mesh out along its normals, by `push` of each vertex in bind space. */
function inflate(m: THREE.SkinnedMesh, push: (p: THREE.Vector3) => number) {
  const pos = m.geometry.attributes.position
  const normal = weldedNormals(m, Array.from({ length: pos.count }, (_, i) => i))
  const p = v3()
  for (let i = 0; i < pos.count; i++) {
    const n = normal(i)
    p.fromBufferAttribute(pos, i).applyMatrix4(m.bindMatrix)
    p.addScaledVector(n, push(p)).applyMatrix4(m.bindMatrixInverse)
    pos.setXYZ(i, p.x, p.y, p.z)
  }
  pos.needsUpdate = true
  m.geometry.computeBoundingSphere()
}

/**
 * A cloth shell over part of the skin: the triangles whose corners all pass `keep`, copied
 * into a new mesh on the same skeleton and pushed out along their normals by `push` (both
 * get the corner in bind space). It bends exactly with the skin under it.
 */
function skinShell(
  skin: THREE.SkinnedMesh,
  keep: (p: THREE.Vector3) => boolean,
  push: (p: THREE.Vector3) => number,
  mat: THREE.Material,
  name: string,
) {
  const g = skin.geometry
  const index = g.index!
  const group = g.groups.find((x) => x.materialIndex === 0) ?? { start: 0, count: index.count }
  const pos = g.attributes.position
  const p = v3()
  const at = (i: number) => p.fromBufferAttribute(pos, i).applyMatrix4(skin.bindMatrix)
  const remap = new Map<number, number>()
  const tris: number[] = []
  for (let k = group.start; k < group.start + group.count; k += 3) {
    const abc = [index.getX(k), index.getX(k + 1), index.getX(k + 2)]
    if (!abc.every((i) => keep(at(i)))) continue
    for (const i of abc) {
      if (!remap.has(i)) remap.set(i, remap.size)
      tris.push(remap.get(i)!)
    }
  }
  if (!tris.length) return

  const out = new THREE.BufferGeometry()
  for (const attr of ['position', 'normal', 'uv', 'skinIndex', 'skinWeight']) {
    const src = g.attributes[attr] as THREE.BufferAttribute | undefined
    if (!src) continue
    const Arr = src.array.constructor as new (n: number) => THREE.TypedArray
    const dst = new THREE.BufferAttribute(new Arr(remap.size * src.itemSize), src.itemSize, src.normalized)
    for (const [from, to] of remap) for (let c = 0; c < src.itemSize; c++) dst.setComponent(to, c, src.getComponent(from, c))
    out.setAttribute(attr, dst)
  }
  out.setIndex(tris)
  const normal = weldedNormals(skin, remap.keys())
  const op = out.attributes.position
  for (const [from, to] of remap) {
    const n = normal(from)
    at(from)
    p.addScaledVector(n, push(p)).applyMatrix4(skin.bindMatrixInverse)
    op.setXYZ(to, p.x, p.y, p.z)
  }

  const shell = new THREE.SkinnedMesh(out, mat)
  shell.name = name
  shell.position.copy(skin.position)
  shell.quaternion.copy(skin.quaternion)
  shell.scale.copy(skin.scale)
  skin.parent!.add(shell)
  shell.bind(skin.skeleton, skin.bindMatrix)
}

/**
 * Loose pants in place of the shorts: a shell over the skin from the waist to just over the
 * shoes, widening from the thighs down. The shorts go.
 */
function addPants(vrm: VRM) {
  const named = meshFinder(vrm)
  const skin = named(/^body.*skin/i)
  const shorts = named(/bottoms/i)
  const shoes = named(/shoe/i)
  if (!skin || !shorts) return
  const waist = bindRangeY(shorts)[1] + 0.005
  const hem = shoes ? bindRangeY(shoes)[1] - 0.02 : bindRangeY(skin)[0] + 0.1
  skinShell(
    skin,
    (p) => p.y >= hem && p.y <= waist,
    // thin at the waist, loose from mid-thigh down
    (p) => 0.01 + 0.024 * THREE.MathUtils.smoothstep((waist - p.y) / (waist - hem), 0.12, 0.55),
    clothMat(mtoonOf(shorts), PANTS, PANTS_SHADE),
    'Pants',
  )
  shorts.visible = false
}

/**
 * An oversized sweater made from the top: dark green, its body pushed out loose, with long
 * baggy sleeves from the shoulders down over the heels of the hands. In the bind T-pose the
 * arms lie along x, so the sleeves are the skin out past the shoulder joints. They start
 * under the top's short sleeves, which lift off the arm as it lowers and would show skin.
 */
function addSweater(vrm: VRM) {
  const named = meshFinder(vrm)
  const skin = named(/^body.*skin/i)
  const top = named(/tops/i)
  const shoulder = vrm.humanoid.getRawBoneNode('leftUpperArm')
  const hand = vrm.humanoid.getRawBoneNode('leftHand')
  const src = top && mtoonOf(top)
  if (!top || !src) return
  flatten(src, SWEATER, SWEATER_SHADE)
  inflate(top, () => SWEATER_LOOSE)
  if (!skin || !shoulder || !hand) return
  const start = Math.abs(shoulder.getWorldPosition(v3()).x)
  const cuff = Math.abs(hand.getWorldPosition(v3()).x) + SLEEVE_PAST_WRIST
  skinShell(
    skin,
    (q) => Math.abs(q.x) >= start && Math.abs(q.x) <= cuff,
    // baggy, and wider still at the cuffs
    (q) => 0.016 + 0.016 * THREE.MathUtils.smoothstep((Math.abs(q.x) - start) / (cuff - start), 0.5, 1),
    clothMat(src, SWEATER, SWEATER_SHADE),
    'Sleeves',
  )
}

/**
 * Her face: the eye parts (whites, irises, highlights, lash lines) scaled about each eye's
 * center, their morph deltas too so a blink still closes the smaller eye; the lower face
 * widened toward the chin and the chin lifted, front of the face only so the seam at the
 * neck stays shut; and the eyes, lashes and skin recolored. Works in the face meshes' own
 * space, which VRoid gives all of them (they are parts of one node). Run at rest.
 */
function shapeFace(vrm: VRM) {
  const parts: [THREE.Mesh, MToonMaterial][] = []
  vrm.scene.traverse((o) => {
    const mat = (o as THREE.Mesh).isMesh ? mtoonOf(o as THREE.Mesh) : undefined
    if (mat) parts.push([o as THREE.Mesh, mat])
  })
  const named = (re: RegExp) => parts.filter(([, mat]) => re.test(mat.name)).map(([m]) => m)
  // the face is often in shade, where MToon shows the shade color, so both are set
  const tint = (mat: MToonMaterial, lit: string, shade: string) => {
    mat.color.set(lit)
    mat.shadeColorFactor.set(shade)
  }
  for (const [, mat] of parts) {
    if (/iris/i.test(mat.name)) tint(mat, IRIS, IRIS)
    else if (/eyeline/i.test(mat.name)) tint(mat, LASHES, LASHES)
    else if (/skin/i.test(mat.name)) tint(mat, SKIN, SKIN_SHADE)
  }
  const white = named(/^eyewhite/i)[0]
  const face = named(/^face.*skin/i)[0]
  if (!white || !face) return

  // each eye's center, from its white
  const sums = new Map<number, THREE.Vector3>()
  const counts = new Map<number, number>()
  const wp = white.geometry.attributes.position
  const p = v3()
  for (let i = 0; i < wp.count; i++) {
    p.fromBufferAttribute(wp, i)
    const side = Math.sign(p.x) || 1
    sums.set(side, (sums.get(side) ?? v3()).add(p))
    counts.set(side, (counts.get(side) ?? 0) + 1)
  }
  const center = (x: number) => {
    const side = Math.sign(x) || 1
    return sums.get(side)!.clone().divideScalar(counts.get(side)!)
  }
  for (const m of named(/^eye|eyeline/i)) {
    const lash = /eyeline/i.test(mtoonOf(m)!.name)
    const sx = lash ? LASH_SIZE : EYE_SIZE
    const sy = lash ? LASH_SIZE * EYE_SQUASH : EYE_SIZE * EYE_SQUASH
    const pos = m.geometry.attributes.position
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i)
      const c = center(p.x)
      pos.setXY(i, c.x + (p.x - c.x) * sx, c.y + (p.y - c.y) * sy)
    }
    pos.needsUpdate = true
    for (const d of m.geometry.morphAttributes.position ?? []) {
      for (let i = 0; i < d.count; i++) d.setXY(i, d.getX(i) * sx, d.getY(i) * sy)
      d.needsUpdate = true
    }
  }

  // the jaw: measured from the eyes, the tip of the nose and the chin under it
  const eyeY = (center(1).y + center(-1).y) / 2
  const pos = face.geometry.attributes.position
  face.geometry.computeBoundingBox()
  const front = Math.sign(center(1).z - face.geometry.boundingBox!.getCenter(v3()).z) || 1 // which way the face looks
  let zMax = -Infinity
  let zMin = Infinity
  let chin = Infinity
  for (let i = 0; i < pos.count; i++) zMax = Math.max(zMax, pos.getZ(i) * front)
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i)
    if (p.z * front > zMax - 0.04) chin = Math.min(chin, p.y)
    if (p.y < eyeY) zMin = Math.min(zMin, p.z * front)
  }
  const mouth = eyeY - (eyeY - chin) * 0.45
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i)
    const t = THREE.MathUtils.clamp((mouth - p.y) / (mouth - chin), 0, 1)
    const w = THREE.MathUtils.smoothstep((p.z * front - zMin) / (zMax - zMin), 0.25, 0.75)
    pos.setXY(i, p.x * (1 + JAW_ROUND * Math.sin((t * Math.PI) / 2) * w), p.y + CHIN_LIFT * t * t * w)
  }
  pos.needsUpdate = true
}

/**
 * Spring colliders and joint radii don't follow bone scale; match them to the new sizes.
 * The cut hair also gets some weight and damping: short hair bounces less, and without
 * it a landing squash whips the strands up over the beanie.
 */
function fitSprings(vrm: VRM) {
  const sm = vrm.springBoneManager
  if (!sm) return
  const s = v3()
  for (const c of sm.colliders) {
    const k = c.getWorldScale(s).x
    ;(c.shape as { radius?: number }).radius! *= k
  }
  for (const j of sm.joints) {
    j.bone.getWorldScale(s)
    j.settings.hitRadius *= Math.max(s.x, s.z)
    if (/hair/i.test(j.bone.name)) {
      j.settings.gravityPower = Math.max(j.settings.gravityPower, 0.35)
      j.settings.dragForce = Math.max(j.settings.dragForce, 0.6)
      j.settings.stiffness *= 1.4
    }
  }
  sm.setInitState()
}

function buildRig(vrm: VRM): Rig {
  VRMUtils.rotateVRM0(vrm) // VRM 0.x faces -Z; normalize to +Z like VRM 1.0
  vrm.scene.updateMatrixWorld(true)
  const raw = (name: VRMHumanBoneName) => vrm.humanoid.getRawBoneNode(name)
  const at = (name: VRMHumanBoneName) => raw(name)?.getWorldPosition(v3()) ?? v3()
  const headRestY = at('head').y
  const footRestY = at('rightFoot').y
  let soleRest = Infinity
  vrm.scene.traverse((o) => {
    if (!(o as THREE.Mesh).isMesh) return
    const g = (o as THREE.Mesh).geometry
    g.computeBoundingBox()
    soleRest = Math.min(soleRest, g.boundingBox!.min.y)
  })
  puffLimbs(vrm)
  addPants(vrm)
  addSweater(vrm)
  const skin = meshFinder(vrm)(/^body.*skin/i)
  if (skin) addScarf(vrm, skin)
  shapeFace(vrm)
  if (vrm.lookAt) vrm.lookAt.pitch = -GAZE_DOWN
  const crown = addHeadwear(vrm) ?? headRestY + (headRestY - at('neck').y) * 2.2
  vrm.scene.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh) return
    m.castShadow = true
    m.receiveShadow = true
    m.frustumCulled = false // skinned bounds don't follow the pose
    m.customDepthMaterial = curvedDepth
    for (const mat of ([] as THREE.Material[]).concat(m.material)) markRider(mat)
  })

  raw('hips')?.scale.setScalar(BODY_SCALE)
  raw('head')?.scale.setScalar(HEAD_SCALE / BODY_SCALE)
  cutHair(vrm.scene)
  vrm.scene.updateMatrixWorld(true)
  fitSprings(vrm)

  const top = at('head').y + (crown - headRestY) * HEAD_SCALE
  const foot = at('rightFoot')
  const toes = raw('rightToes') ? at('rightToes') : null
  const sole = foot.y - (footRestY - soleRest) * BODY_SCALE
  const scale = TARGET_HEIGHT / (top - sole)
  const hip = at('rightUpperLeg')
  const hipL = at('leftUpperLeg')
  const knee = at('rightLowerLeg')

  const bone = (name: VRMHumanBoneName) => vrm.humanoid.getNormalizedBoneNode(name)
  return {
    vrm,
    scale,
    lift: -sole * scale + 0.004,
    hipsRest: bone('hips')!.position.clone(),
    hipL,
    hipR: hip,
    hipMid: hip.clone().add(hipL).multiplyScalar(0.5),
    thigh: hip.distanceTo(knee),
    shin: knee.distanceTo(foot),
    leg: {
      len: (hip.distanceTo(knee) + knee.distanceTo(foot)) * scale,
      ankle: (foot.y - sole) * scale,
      hipX: (hip.distanceTo(hipL) / 2) * scale,
      foot: (toes ? Math.abs(toes.z - foot.z) : knee.distanceTo(foot) * 0.3) * scale,
    },
    bone,
  }
}

const ik: LegAngles = { abduct: 0, thigh: 0, knee: 0 }
const tgt = v3()
const shift = v3()
const q = new THREE.Quaternion()
const eul = new THREE.Euler()

/** Rider frame -> model space: undo the body yaw, the half turn, the scale and the lift. */
function toModel(r: Rig, p: THREE.Vector3, yaw: number, out: THREE.Vector3) {
  toBody(p, yaw, out)
  return out.set(-out.x / r.scale, (out.y - r.lift) / r.scale, -out.z / r.scale)
}

/** One leg reaching its foot target, knee over the toes, sole set by the foot's toe pitch. */
function reachFoot(r: Rig, side: 'left' | 'right', foot: Foot, yaw: number) {
  const b = r.bone
  toModel(r, foot.pos, yaw, tgt)
    .sub(side === 'left' ? r.hipL : r.hipR)
    .sub(shift)
  const twist = foot.yaw - yaw
  solveLeg(tgt, twist, r.thigh, r.shin, ik)
  b(`${side}UpperLeg`)?.quaternion.setFromEuler(eul.set(ik.thigh, twist, ik.abduct, 'YZX'))
  b(`${side}LowerLeg`)?.quaternion.setFromEuler(eul.set(ik.knee, 0, 0, 'XYZ'))
  b(`${side}Foot`)?.quaternion.copy(footFlat(ik, foot.toe, q))
}

/**
 * Applies the shared skate pose to a VRM's normalized humanoid bones. The model is
 * turned to face -Z like the rider frame, which mirrors X and Z rotations (Y stays).
 * The hips move so the hip joints land on the pose's pelvis, and each leg reaches its
 * foot. Spring bones (hair, cloth) swing on their own via vrm.update().
 */
function applyPose(r: Rig, p: Pose, dt: number, blink: { t: number }) {
  const b = r.bone
  shift.subVectors(toModel(r, p.pelvis, p.bodyYaw, tgt), r.hipMid)
  b('hips')!.position.copy(r.hipsRest).add(shift)
  reachFoot(r, 'left', p.front, p.bodyYaw) // front foot is the kid's left (regular stance)
  reachFoot(r, 'right', p.back, p.bodyYaw)
  b('spine')?.rotation.set(-p.torsoLean * 0.55, p.spineYaw * 0.5, -p.torsoSide * 0.5)
  b('chest')?.rotation.set(-p.torsoLean * 0.45, p.spineYaw * 0.5, -p.torsoSide * 0.5)
  b('neck')?.rotation.set(0, p.headYaw * 0.4, 0)
  // the head holds the horizon while the body leans
  b('head')?.rotation.set(p.torsoLean * 0.65, p.headYaw * 0.6, p.torsoSide * 0.7)
  // T-pose arms: lower them from horizontal, then swing
  const lower = Math.PI / 2 - p.armOut
  b('leftUpperArm')?.rotation.set(-p.armSwing, 0, -lower)
  b('rightUpperArm')?.rotation.set(p.armSwing, 0, lower)
  b('leftLowerArm')?.rotation.set(0, p.elbowL, 0)
  b('rightLowerArm')?.rotation.set(0, -p.elbowR, 0)
  b('leftHand')?.rotation.set(0, 0, 0.25)
  b('rightHand')?.rotation.set(0, 0, -0.25)

  // heavy lids, and a blink every few seconds
  blink.t -= dt
  const em = r.vrm.expressionManager
  if (em) {
    if (blink.t < 0) blink.t = 2 + Math.random() * 3
    em.setValue('blink', blink.t < 0.12 ? 1 : LIDS)
  }
  r.vrm.update(dt)
}

const rigs = new Map<string, Promise<Rig | null>>()
const ready = new Map<string, Rig | null>() // settled loads, readable synchronously

/**
 * Load (once) and rig a VRM. Called at boot, so the 10 MB parse never lands mid-ride;
 * cached, so remounts (and StrictMode's double effects) reuse the same rigged model.
 */
export function loadRig(url: string): Promise<Rig | null> {
  let p = rigs.get(url)
  if (!p) {
    const loader = new GLTFLoader()
    loader.register((parser) => new VRMLoaderPlugin(parser))
    p = loader
      .loadAsync(url)
      .then((gltf) => {
        const vrm = gltf.userData.vrm as VRM | undefined
        if (!vrm) throw new Error('not a VRM file')
        VRMUtils.removeUnnecessaryVertices(gltf.scene)
        VRMUtils.combineSkeletons(gltf.scene)
        return buildRig(vrm)
      })
      .then((r) => {
        ready.set(url, r)
        // dev-only handle for test scripts (rig measurements, close-up probes)
        if (import.meta.env.DEV) Object.assign(window, { __rig: r })
        return r
      })
      .catch((e) => {
        console.warn(`[wheels-off] character ${url} not loaded, using the procedural kid:`, e)
        ready.set(url, null)
        return null
      })
    rigs.set(url, p)
  }
  return p
}

/** A VRoid / VRM character on the board. Shows the procedural kid until it loads (or if it fails). */
export function VrmRider({ url, bind }: RiderProps & { url: string }) {
  const [rig, setRig] = useState<Rig | null>(() => ready.get(url) ?? null)
  const rider = useRef<THREE.Group>(null!)
  const body = useRef<THREE.Group>(null!)

  useEffect(() => {
    let dead = false
    loadRig(url).then((r) => {
      if (!dead && r) setRig(r)
    })
    return () => {
      dead = true
    }
  }, [url])

  useLayoutEffect(() => {
    if (!rig) return
    const blink = { t: 2 }
    Object.assign(riderLeg, rig.leg)
    bind((p, dt) => {
      rider.current.position.y = DECK_TOP + p.riderLift
      rider.current.rotation.set(p.riderPitch, 0, p.roll)
      body.current.rotation.y = p.bodyYaw
      applyPose(rig, p, dt, blink)
    })
    return () => bind(null)
  }, [rig, bind])

  if (!rig) return <ProceduralRider bind={bind} />
  return (
    <group ref={rider} position={[0, DECK_TOP, 0]}>
      <group ref={body}>
        <group rotation-y={Math.PI} scale={rig.scale} position-y={rig.lift}>
          <primitive object={rig.vrm.scene} />
        </group>
      </group>
    </group>
  )
}
