import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { Outlines } from '@react-three/drei'
import { ToonMaterial } from '../look/ToonMaterial'

const SEG = 20 // length of one road segment (z)
const COUNT = 9 // number of recycled segments
const ROAD_W = 8
const INK = '#1a1a1a'

function Building({
  position,
  size,
  color,
}: {
  position: [number, number, number]
  size: [number, number, number]
  color: string
}) {
  return (
    <mesh position={position}>
      <boxGeometry args={size} />
      <ToonMaterial color={color} />
      <Outlines thickness={3} color={INK} screenspace={false} />
    </mesh>
  )
}

function Segment({ index }: { index: number }) {
  const hL = 4 + ((index * 2) % 5)
  const hR = 4 + ((index * 3) % 6)
  const cL = index % 2 ? '#9ab3a5' : '#5d7d72'
  const cR = index % 2 ? '#5d7d72' : '#9ab3a5'
  return (
    <group>
      {/* road */}
      <mesh rotation-x={-Math.PI / 2}>
        <planeGeometry args={[ROAD_W, SEG]} />
        <ToonMaterial color="#6d8378" />
      </mesh>
      {/* sidewalks */}
      <mesh position={[-ROAD_W / 2 - 1, 0.02, 0]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[2, SEG]} />
        <ToonMaterial color="#93a59b" />
      </mesh>
      <mesh position={[ROAD_W / 2 + 1, 0.02, 0]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[2, SEG]} />
        <ToonMaterial color="#93a59b" />
      </mesh>
      {/* buildings */}
      <Building position={[-ROAD_W / 2 - 3.5, hL / 2, 0]} size={[3, hL, 6]} color={cL} />
      <Building position={[ROAD_W / 2 + 3.5, hR / 2, 0]} size={[3, hR, 6]} color={cR} />
    </group>
  )
}

/** Endless road: COUNT segments recycled ahead of the runner as it advances. */
export function Road({ targetRef }: { targetRef: React.RefObject<THREE.Group | null> }) {
  const segs = useRef<(THREE.Group | null)[]>([])
  useFrame(() => {
    const pz = targetRef.current?.position.z ?? 0
    for (const g of segs.current) {
      if (!g) continue
      // once a segment falls >1.5 segs behind the runner, jump it to the far end.
      while (g.position.z - pz > SEG * 1.5) g.position.z -= SEG * COUNT
    }
  })
  return (
    <group>
      {Array.from({ length: COUNT }).map((_, i) => (
        <group
          key={i}
          ref={(el) => {
            segs.current[i] = el
          }}
          position={[0, 0, SEG - i * SEG]}
        >
          <Segment index={i} />
        </group>
      ))}
    </group>
  )
}
