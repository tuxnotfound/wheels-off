import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm'
import type { MToonMaterial, VRM, VRMHumanBoneName } from '@pixiv/three-vrm'
import { curvedDepth, markRider, riderMat } from '../look/materials'
import { PANTS, PANTS_SHADE, ProceduralRider } from './ProceduralRider'
import { DECK_TOP, footFlat, riderLeg, solveLeg, toBody } from './pose'
import type { Foot, LegAngles, Pose } from './pose'
import type { RiderProps } from './Skater'

const TARGET_HEIGHT = 1.45 // the kid's height in world meters (bun included), whatever the model's size

// Chibi: a smaller body under a much bigger head, chubby limbs, hair cut to a bob.
const BODY_SCALE = 0.8
const HEAD_SCALE = 1.9
const BOB = 0.5 // the cut, from the head joint (0) down to the neck joint (1): about the jaw
const LEG_PUFF = 1.25 // limbs thickened around their bones, not lengthened
const ARM_PUFF = 1.15

// The Lofi Girl look: a chestnut bob tied up in a bun, big pink and cream headphones, a
// chunky red scarf and a dark green sweater.
const HAIR = '#8a4a34'
const HAIR_SHADE = '#5a2f24'
const HAIR_TIE = '#3f9a8c'
const SWEATER = '#2f6b5a'
const SWEATER_SHADE = '#1e4a3f'
const SCARF = '#d8483d'
const PHONES_BAND = '#e4a69c'
const PHONES_SHELL = '#cf4c43'
const PHONES_FACE = '#f4e7d3'
const PHONES_PAD = '#4a302b'
const RELAXED = 0.45 // how much of the model's relaxed expression she wears

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

/** A disc facing sideways (along x), for the headphone cups. */
function disc(r: number, t: number, color: string, x: number) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, t, 28), riderMat(color))
  m.rotation.z = Math.PI / 2
  m.position.x = x
  return m
}

/**
 * Big over-ear headphones, centered between the ears: a wide flat band over the crown and
 * padded cups, cream faces in red shells on dark cushions.
 */
function headphones(rx: number, top: number): THREE.Group {
  const g = new THREE.Group()
  const cupR = top * 0.3
  const cupT = rx * 0.26
  const cx = rx + cupT * 0.5 // cups sit on the hair at the sides
  const bx = rx * 1.06
  const crown = top * 1.04
  const pts = [new THREE.Vector3(cx, cupR * 0.8, 0)]
  for (let i = 0; i <= 18; i++) {
    const a = (i / 18) * Math.PI
    pts.push(new THREE.Vector3(bx * Math.cos(a), crown * Math.sin(a), 0))
  }
  pts.push(new THREE.Vector3(-cx, cupR * 0.8, 0))
  const band = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 90, rx * 0.045, 8), riderMat(PHONES_BAND))
  band.scale.z = 2.4 // wide and flat across the head
  g.add(band)
  for (const s of [-1, 1]) {
    const slider = new THREE.Mesh(new THREE.BoxGeometry(cupT * 0.6, cupR * 0.7, cupR * 0.5), riderMat(PHONES_BAND))
    slider.position.set(s * cx, cupR * 1.05, 0)
    g.add(
      disc(cupR, cupT * 0.45, PHONES_PAD, s * (rx + cupT * 0.22)),
      disc(cupR * 0.94, cupT * 0.55, PHONES_SHELL, s * (rx + cupT * 0.7)),
      disc(cupR * 0.68, cupT * 0.2, PHONES_FACE, s * (rx + cupT * 1.02)),
      slider,
    )
  }
  return g
}

/**
 * Her hair tied up in a bun at the back of the crown, with headphones over it, parented to
 * the head bone so they follow every nod. Returns the top of the bun or band (model units).
 */
function addHeadwear(vrm: VRM, hairMat: THREE.Material) {
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
  const rx = ((hi.x - lo.x) / 2) * 1.02
  const rz = (hi.z - lo.z) / 2
  const earY = eyeY - (hi.y - eyeY) * 0.12
  const top = hi.y - earY // the crown, above the ears

  // the bun, high on the back of the head, with a teal tie where it meets the hair
  const bunR = rx * 0.5
  const out = new THREE.Vector3(0, 0.77, -0.64).normalize() // 50 degrees up from straight back
  const base = new THREE.Vector3(0, top * out.y, rz * out.z)
  const bun = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 18), hairMat)
  bun.scale.set(bunR, bunR * 0.9, bunR)
  bun.position.copy(base).addScaledVector(out, bunR * 0.85)
  const tie = new THREE.Mesh(new THREE.TorusGeometry(bunR * 0.6, bunR * 0.14, 10, 28), riderMat(HAIR_TIE))
  tie.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), out)
  tie.position.copy(base).addScaledVector(out, bunR * 0.3)

  const gear = new THREE.Group()
  gear.add(bun, tie, headphones(rx, top))
  gear.position.set((lo.x + hi.x) / 2, earY, (lo.z + hi.z) / 2)
  gear.updateMatrix()
  vrm.scene.updateMatrixWorld(true)
  gear.matrix.premultiply(head.matrixWorld.clone().invert())
  gear.matrix.decompose(gear.position, gear.quaternion, gear.scale)
  head.add(gear)
  return earY + Math.max(top * 1.04 + rx * 0.045, bun.position.y + bunR * 0.9)
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

/**
 * A blunt bob, cut level at the jaw: hair wholly below the cut goes, and strands that cross
 * it end on it. Cut in the mesh, not by squashing bones: a strand can't be shortened above
 * its first joint, and the back strands hang from the nape. Run at rest. Returns the hair
 * joints below the cut, which have nothing left to swing.
 */
function cutHair(vrm: VRM) {
  const below = new Set<THREE.Object3D>()
  const head = vrm.humanoid.getRawBoneNode('head')
  const neck = vrm.humanoid.getRawBoneNode('neck')
  if (!head || !neck) return below
  const y0 = head.getWorldPosition(v3()).y
  const cut = y0 - (y0 - neck.getWorldPosition(v3()).y) * BOB
  const p = v3()
  head.traverse((o) => {
    if (/^J_Sec_Hair/.test(o.name) && o.getWorldPosition(p).y < cut) below.add(o)
  })
  vrm.scene.traverse((o) => {
    const m = o as THREE.SkinnedMesh
    const mat = m.isSkinnedMesh ? mtoonOf(m) : undefined
    if (!mat || !/hair/i.test(mat.name) || !m.geometry.index) return
    const g = m.geometry
    const index = g.index!
    const pos = g.attributes.position
    const y = (i: number) => p.fromBufferAttribute(pos, i).applyMatrix4(m.bindMatrix).y
    const tris: number[] = []
    const groups = g.groups.length ? [...g.groups] : [{ start: 0, count: index.count, materialIndex: 0 }]
    g.clearGroups()
    for (const gr of groups) {
      const start = tris.length
      for (let k = gr.start; k < gr.start + gr.count; k += 3) {
        const abc = [index.getX(k), index.getX(k + 1), index.getX(k + 2)]
        if (abc.some((i) => y(i) >= cut)) tris.push(...abc)
      }
      g.addGroup(start, tris.length - start, gr.materialIndex)
    }
    g.setIndex(tris)
    for (let i = 0; i < pos.count; i++) {
      if (y(i) >= cut) continue
      p.y = cut
      p.applyMatrix4(m.bindMatrixInverse)
      pos.setXYZ(i, p.x, p.y, p.z)
    }
    pos.needsUpdate = true
  })
  return below
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
  const nrm = g.attributes.normal
  const p = v3()
  const n = v3()
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
  // corners split at UV seams share one normal, or the push would open cracks along them
  const key = (i: number) => at(i).toArray().map((c) => Math.round(c * 1e5)).join()
  const welded = new Map<string, THREE.Vector3>()
  for (const from of remap.keys()) {
    const k = key(from)
    welded.set(k, (welded.get(k) ?? v3()).add(n.fromBufferAttribute(nrm, from).transformDirection(skin.bindMatrix)))
  }
  const op = out.attributes.position
  for (const [from, to] of remap) {
    n.copy(welded.get(key(from))!).normalize()
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
 * Her sweater: the top goes dark green, with long sleeves from the shoulders to the wrists,
 * a little loose at the cuffs. In the bind T-pose the arms lie along x, so the sleeves are
 * the skin out past the shoulder joints. They start under the top's short sleeves, which
 * lift off the arm as it lowers and would show skin there.
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
  if (!skin || !shoulder || !hand) return
  const start = Math.abs(shoulder.getWorldPosition(v3()).x)
  const wrist = Math.abs(hand.getWorldPosition(v3()).x)
  skinShell(
    skin,
    (q) => Math.abs(q.x) >= start && Math.abs(q.x) <= wrist,
    (q) => 0.01 + 0.014 * THREE.MathUtils.smoothstep((Math.abs(q.x) - start) / (wrist - start), 0.6, 1),
    clothMat(src, SWEATER, SWEATER_SHADE),
    'Sleeves',
  )
}

/** Flat chestnut hair, for her bob and bun. Returns the hair material. */
function dyeHair(vrm: VRM) {
  let hair: MToonMaterial | undefined
  vrm.scene.traverse((o) => {
    const m = (o as THREE.Mesh).isMesh ? mtoonOf(o as THREE.Mesh) : undefined
    if (m && /hair/i.test(m.name)) hair = flatten(m, HAIR, HAIR_SHADE)
  })
  return hair ?? riderMat(HAIR)
}

/**
 * Spring colliders and joint radii don't follow bone scale; match them to the new sizes.
 * Hair joints below the bob's cut stop swinging: the strand ends they would fling about
 * are gone. The rest of the hair gets some weight and damping: short hair bounces less,
 * and without it a landing squash whips the strands up over the headphones.
 */
function fitSprings(vrm: VRM, cut: Set<THREE.Object3D>) {
  const sm = vrm.springBoneManager
  if (!sm) return
  for (const j of [...sm.joints]) if (cut.has(j.bone)) sm.deleteJoint(j)
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
  const crown = addHeadwear(vrm, dyeHair(vrm)) ?? headRestY + (headRestY - at('neck').y) * 2.2
  vrm.scene.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh) return
    m.castShadow = true
    m.receiveShadow = true
    m.frustumCulled = false // skinned bounds don't follow the pose
    m.customDepthMaterial = curvedDepth
    for (const mat of ([] as THREE.Material[]).concat(m.material)) markRider(mat)
  })

  const cut = cutHair(vrm)
  raw('hips')?.scale.setScalar(BODY_SCALE)
  raw('head')?.scale.setScalar(HEAD_SCALE / BODY_SCALE)
  vrm.scene.updateMatrixWorld(true)
  fitSprings(vrm, cut)

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

  // her calm, half-lidded look, and a blink every few seconds
  blink.t -= dt
  const em = r.vrm.expressionManager
  if (em) {
    if (blink.t < 0) blink.t = 2 + Math.random() * 3
    em.setValue('relaxed', RELAXED)
    em.setValue('blink', blink.t < 0.12 ? 1 : 0)
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
