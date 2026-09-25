import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm'
import type { VRM, VRMHumanBoneName } from '@pixiv/three-vrm'
import { curvedDepth } from '../look/materials'
import { ProceduralRider } from './ProceduralRider'
import type { Pose } from './pose'
import type { RiderProps } from './Skater'

const DECK_TOP = 0.16
const TARGET_HEIGHT = 1.45 // the kid's height in world meters, whatever the model's size

type Rig = {
  vrm: VRM
  scale: number
  lift: number // puts the soles on the deck
  legLen: number // hip to ankle, model units
  hipsRest: THREE.Vector3
  bone: (name: VRMHumanBoneName) => THREE.Object3D | null
}

function buildRig(vrm: VRM): Rig {
  VRMUtils.rotateVRM0(vrm) // VRM 0.x faces -Z; normalize to +Z like VRM 1.0
  vrm.scene.updateMatrixWorld(true)
  const y = (name: VRMHumanBoneName) => vrm.humanoid.getRawBoneNode(name)?.getWorldPosition(new THREE.Vector3()).y ?? 0
  const headY = y('head')
  const footY = Math.min(y('leftFoot'), y('rightFoot'))
  const hipsY = y('hips')
  const scale = TARGET_HEIGHT / (headY + (headY - y('neck')) * 2.2)
  vrm.scene.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true
      o.receiveShadow = true
      o.frustumCulled = false // skinned bounds don't follow the pose
      o.customDepthMaterial = curvedDepth
    }
  })
  const bone = (name: VRMHumanBoneName) => vrm.humanoid.getNormalizedBoneNode(name)
  return {
    vrm,
    scale,
    lift: -footY * scale + 0.07,
    legLen: hipsY - footY,
    hipsRest: bone('hips')!.position.clone(),
    bone,
  }
}

/**
 * Applies the shared skate pose to a VRM's normalized humanoid bones. The model is
 * turned to face -Z like the rider frame, which mirrors X and Z rotations (Y stays).
 * Spring bones (hair, skirt, bag straps) swing on their own via vrm.update().
 */
function applyPose(r: Rig, p: Pose, dt: number, blink: { t: number }) {
  const b = r.bone
  const drop = r.legLen * (1 - Math.cos(p.frontBend)) + p.hipDrop / r.scale
  b('hips')!.position.set(r.hipsRest.x, r.hipsRest.y - drop, r.hipsRest.z)
  // front foot is the kid's left (regular stance)
  b('leftUpperLeg')?.rotation.set(-p.frontBend, 0, 0)
  b('leftLowerLeg')?.rotation.set(2 * p.frontBend, 0, 0)
  b('leftFoot')?.rotation.set(-p.frontBend, 0, 0)
  b('rightUpperLeg')?.rotation.set(-p.backThigh, 0, 0)
  b('rightLowerLeg')?.rotation.set(-p.backShin, 0, 0)
  b('rightFoot')?.rotation.set(-p.backFoot, 0, 0)
  b('spine')?.rotation.set(-p.torsoLean * 0.55, 0, 0)
  b('chest')?.rotation.set(-p.torsoLean * 0.45, 0, 0)
  b('neck')?.rotation.set(0, p.headYaw * 0.4, 0)
  b('head')?.rotation.set(p.torsoLean * 0.4, p.headYaw * 0.6, 0)
  // T-pose arms: lower them from horizontal, then swing
  const lower = Math.PI / 2 - p.armOut
  b('leftUpperArm')?.rotation.set(-p.armSwing, 0, -lower)
  b('rightUpperArm')?.rotation.set(p.armSwing, 0, lower)
  b('leftLowerArm')?.rotation.set(0, p.elbow, 0)
  b('rightLowerArm')?.rotation.set(0, -p.elbow, 0)

  // blink every few seconds
  blink.t -= dt
  const em = r.vrm.expressionManager
  if (em) {
    if (blink.t < 0) blink.t = 2 + Math.random() * 3
    em.setValue('blink', blink.t < 0.12 ? 1 : 0)
  }
  r.vrm.update(dt)
}

/** A VRoid / VRM character on the board. Shows the procedural kid until it loads (or if it fails). */
export function VrmRider({ url, bind }: RiderProps & { url: string }) {
  const [rig, setRig] = useState<Rig | null>(null)
  const rider = useRef<THREE.Group>(null!)
  const body = useRef<THREE.Group>(null!)

  useEffect(() => {
    let dead = false
    let loaded: VRM | null = null
    const loader = new GLTFLoader()
    loader.register((parser) => new VRMLoaderPlugin(parser))
    loader
      .loadAsync(url)
      .then((gltf) => {
        const vrm = gltf.userData.vrm as VRM | undefined
        if (!vrm) throw new Error('not a VRM file')
        VRMUtils.removeUnnecessaryVertices(gltf.scene)
        VRMUtils.combineSkeletons(gltf.scene)
        loaded = vrm
        if (!dead) setRig(buildRig(vrm))
      })
      .catch((e) => console.warn(`[wheels-off] character ${url} not loaded, using the procedural kid:`, e))
    return () => {
      dead = true
      if (loaded) VRMUtils.deepDispose(loaded.scene)
    }
  }, [url])

  useLayoutEffect(() => {
    if (!rig) return
    const blink = { t: 2 }
    bind((p, dt) => {
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
