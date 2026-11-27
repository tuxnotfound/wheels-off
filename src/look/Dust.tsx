import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { sim } from '../game/sim'
import { patchCurve } from './materials'
import { dustTex } from './textures'

// Cartoon dust where the board meets the road: two puffs at the trucks on every landing, a
// bigger cloud on a wipeout. Each puff stays where it was kicked up (so it falls behind a kid
// riding on), swells, drifts up and out, then shrinks away. Opaque cut-outs, so the ink pass
// outlines them like everything else. On the sim's clock: a pause freezes them.

const N = 16 // puffs alive at once at most
const LIFE = 0.55 // seconds
type Puff = { t0: number; x: number; z: number; vx: number; vz: number; size: number }

const dummy = new THREE.Object3D()
const parentQ = new THREE.Quaternion()

export function Dust() {
  const mesh = useRef<THREE.InstancedMesh>(null!)
  const camera = useThree((s) => s.camera)
  const st = useMemo(() => ({ puffs: [] as Puff[], next: 0, landT: sim.landT, bailT: sim.bailT }), [])
  const geo = useMemo(() => new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0), [])
  const mat = useMemo(() => {
    const m = new THREE.MeshBasicMaterial({ map: dustTex(), alphaTest: 0.5 })
    m.onBeforeCompile = patchCurve
    m.customProgramCacheKey = () => 'basic-curve'
    return m
  }, [])
  useEffect(
    () => () => {
      geo.dispose()
      mat.dispose()
    },
    [geo, mat],
  )

  const kick = (n: number, size: number, spread: number) => {
    const fx = Math.sin(sim.heading)
    const fz = -Math.cos(sim.heading)
    for (let i = 0; i < n; i++) {
      const along = (i % 2 ? 1 : -1) * 0.32 // the trucks
      const out = (Math.random() - 0.5) * spread
      const p: Puff = {
        t0: sim.time,
        x: sim.px + fx * along - fz * out,
        z: sim.pz + fz * along + fx * out,
        vx: -fz * out * 2.2 + (Math.random() - 0.5) * 0.4,
        vz: fx * out * 2.2 + (Math.random() - 0.5) * 0.4,
        size: size * (0.8 + Math.random() * 0.4),
      }
      st.puffs[st.next] = p
      st.next = (st.next + 1) % N
    }
  }

  useFrame(() => {
    if (sim.landT !== st.landT) {
      st.landT = sim.landT
      if (sim.time - sim.landT < 0.1) kick(2, 0.55, 0.5)
    }
    if (sim.bailT !== st.bailT) {
      st.bailT = sim.bailT
      if (sim.time - sim.bailT < 0.1) kick(6, 0.7, 1.4)
    }
    // face the camera from inside the world group, which turns with the street
    mesh.current.parent!.getWorldQuaternion(parentQ).invert()
    dummy.quaternion.copy(parentQ).multiply(camera.quaternion)
    for (let i = 0; i < N; i++) {
      const p = st.puffs[i]
      const age = p ? sim.time - p.t0 : LIFE
      if (!p || age >= LIFE || age < 0) {
        dummy.scale.setScalar(0)
      } else {
        const t = age / LIFE
        dummy.position.set(p.x + p.vx * age, age * 0.5, p.z + p.vz * age)
        // swells fast, then shrinks away
        dummy.scale.setScalar(p.size * Math.sin(Math.PI * Math.min(1, t * 1.15)) * (1 + t * 0.6))
      }
      dummy.updateMatrix()
      mesh.current.setMatrixAt(i, dummy.matrix)
    }
    mesh.current.instanceMatrix.needsUpdate = true
  })

  return <instancedMesh ref={mesh} args={[geo, mat, N]} frustumCulled={false} />
}
