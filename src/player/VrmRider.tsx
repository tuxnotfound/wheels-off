import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm'
import type { MToonMaterial, VRM, VRMHumanBoneName } from '@pixiv/three-vrm'
import { curveMToon, curvedDepth, markRider, riderMat } from '../look/materials'
import { BEANIE, BEANIE_CUFF, BEANIE_TAG, PHONES, PHONES_CAP, ProceduralRider } from './ProceduralRider'
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

const GAZE_DOWN = 8 // degrees: the kid looks a little down the road

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
  tuckUnder(vrm, new THREE.Matrix4().compose(
    v3().set((lo.x + hi.x) / 2, rimY, (lo.z + hi.z) / 2),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt, 0, 0)),
    v3().set(rx, ry, rz),
  ))

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

const TUCK = 0.95 // what is under the beanie is pulled in to this much of its size

/**
 * Everything under the beanie pulled inside it: a full crown, spiky hair, or the scalp that
 * VRoid's body skin carries under short hair would poke through. Above the rim it moves
 * toward the dome's center, under the cuff toward its axis. `frame` maps the unit half
 * sphere (rim on y = 0) to the beanie at rest, in world space. Run at rest.
 */
function tuckUnder(vrm: VRM, frame: THREE.Matrix4) {
  const toUnit = frame.clone().invert()
  const p = v3()
  vrm.scene.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh) return
    const toMesh = m.matrixWorld.clone().invert().multiply(frame)
    const toBeanie = toUnit.clone().multiply(m.matrixWorld)
    const pos = m.geometry.attributes.position
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i).applyMatrix4(toBeanie)
      if (p.y < -0.08) continue // below the cuff
      const r = p.y > 0 ? p.length() : Math.hypot(p.x, p.z)
      if (r <= TUCK) continue
      if (p.y > 0) p.multiplyScalar(TUCK / r)
      else p.set((p.x * TUCK) / r, p.y, (p.z * TUCK) / r)
      p.applyMatrix4(toMesh)
      pos.setXYZ(i, p.x, p.y, p.z)
    }
    pos.needsUpdate = true
  })
}

/**
 * Long strands (4+ joints) that hang past the shoulder blades squashed along their length
 * below the first joint, so they keep their width. Hair that already ends higher, a bob,
 * stays as it was made. Run at rest, before the body is rescaled.
 */
function cutHair(vrm: VRM) {
  const back = vrm.humanoid.getRawBoneNode('upperChest') ?? vrm.humanoid.getRawBoneNode('chest')
  const blades = back ? back.getWorldPosition(v3()).y : -Infinity
  vrm.scene.traverse((o) => {
    const m = /^J_Sec_Hair2_(\d+)$/.exec(o.name)
    if (!m || !o.parent) return
    let depth = 0
    let tip: THREE.Object3D = o
    for (let c: THREE.Object3D | undefined = o; c; c = c.children.find((k) => /Hair/.test(k.name))) {
      depth++
      tip = c
    }
    if (depth >= 4 && tip.getWorldPosition(v3()).y < blades) o.scale.set(1, 1 - HAIR_CUT, 1)
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

const CLOTH_SHADE = 0.66 // a garment's shade is its color this much darker

/**
 * Each garment in the color picked for it. VRoid multiplies that color with the garment's
 * texture, which carries its own grey and baked shading, so a picked green or navy comes
 * out near black. A garment left white keeps its texture: its colors are in it.
 */
function dressAsPicked(vrm: VRM) {
  const c = new THREE.Color()
  vrm.scene.traverse((o) => {
    if (!(o as THREE.Mesh).isMesh) return
    for (const m of ([] as THREE.Material[]).concat((o as THREE.Mesh).material)) {
      const mt = m as MToonMaterial
      if (!mt.isMToonMaterial || mt.isOutline || !/cloth/i.test(mt.name)) continue
      const { r, g, b } = mt.color.getRGB(c, THREE.SRGBColorSpace)
      if (Math.min(r, g, b) > 0.95) continue
      mt.map = null
      mt.shadeMultiplyTexture = null
      mt.shadingShiftTexture = null
      mt.rimMultiplyTexture = null
      mt.matcapTexture = null
      mt.normalMap = null
      mt.emissiveMap = null
      mt.emissive.set(0x000000)
      mt.shadeColorFactor.setRGB(r * CLOTH_SHADE, g * CLOTH_SHADE, b * CLOTH_SHADE, THREE.SRGBColorSpace)
      mt.needsUpdate = true
    }
  })
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
  dressAsPicked(vrm)
  if (vrm.lookAt) vrm.lookAt.pitch = -GAZE_DOWN
  const crown = addHeadwear(vrm) ?? headRestY + (headRestY - at('neck').y) * 2.2
  vrm.scene.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh) return
    m.castShadow = true
    m.receiveShadow = true
    m.frustumCulled = false // skinned bounds don't follow the pose
    m.customDepthMaterial = curvedDepth
    for (const mat of ([] as THREE.Material[]).concat(m.material)) {
      if ((mat as MToonMaterial).isMToonMaterial) curveMToon(mat)
      markRider(mat)
    }
  })

  cutHair(vrm)
  raw('hips')?.scale.setScalar(BODY_SCALE)
  raw('head')?.scale.setScalar(HEAD_SCALE / BODY_SCALE)
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

  // a blink every few seconds
  blink.t -= dt
  const em = r.vrm.expressionManager
  if (em) {
    if (blink.t < 0) blink.t = 2 + Math.random() * 3
    em.setValue('blink', blink.t < 0.12 ? 1 : 0)
  }
  r.vrm.update(dt)
}

const rigs = new Map<string, Promise<Rig | null>>()
const ready = new Map<string, Rig | null>() // settled loads, readable synchronously

/**
 * Load (once) and rig a VRM. Called at boot, so the model's parse never lands mid-ride;
 * cached, so remounts (and StrictMode's double effects) reuse the same rigged model.
 */
export function loadRig(url: string, onProgress?: (e: ProgressEvent) => void): Promise<Rig | null> {
  let p = rigs.get(url)
  if (!p) {
    const loader = new GLTFLoader()
    loader.register((parser) => new VRMLoaderPlugin(parser))
    p = loader
      .loadAsync(url, onProgress)
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
