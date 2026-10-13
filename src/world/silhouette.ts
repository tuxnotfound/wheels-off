import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

// The time trial's ghosts take the kid's shape: the skater (character and board) as it stands
// right now, frozen into one static geometry in the skater's own frame. Skinned parts are taken
// in their current pose, so the ghost is the kid on the board, not a T-pose; one plain mesh, so
// a ghost costs a draw call or two and no skinning. Meshes marked userData.noGhost (the board's
// wheel decals) are left out.

const v = new THREE.Vector3()
const toRoot = new THREE.Matrix4()
const local = new THREE.Matrix4()

/** The skater under `root`, as it is posed now, in root's frame; null if it holds no meshes. */
export function bakeSilhouette(root: THREE.Object3D): THREE.BufferGeometry | null {
  root.updateMatrixWorld(true)
  toRoot.copy(root.matrixWorld).invert()
  const parts: THREE.BufferGeometry[] = []
  root.traverseVisible((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh || mesh.userData.noGhost) return
    const pos = mesh.geometry.getAttribute('position')
    if (!pos) return
    const skinned = (mesh as THREE.SkinnedMesh).isSkinnedMesh
    local.multiplyMatrices(toRoot, mesh.matrixWorld)
    const out = new Float32Array(pos.count * 3)
    for (let i = 0; i < pos.count; i++) {
      if (skinned) mesh.getVertexPosition(i, v) // skinning and morphs applied
      else v.fromBufferAttribute(pos, i)
      v.applyMatrix4(local)
      out[i * 3] = v.x
      out[i * 3 + 1] = v.y
      out[i * 3 + 2] = v.z
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(out, 3))
    const index = mesh.geometry.index
    g.setIndex(index ? Array.from(index.array) : Array.from({ length: pos.count }, (_, i) => i))
    parts.push(g)
  })
  if (!parts.length) return null
  const merged = mergeGeometries(parts)
  for (const g of parts) g.dispose()
  return merged
}
