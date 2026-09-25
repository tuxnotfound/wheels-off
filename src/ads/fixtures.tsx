import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import type * as THREE from 'three'
import { CYL } from '../look/geom'
import { M } from '../world/parts'
import { AdSlot } from './AdSlot'
import { AD_SIZE } from './ads'

// The physical structures that carry ads. All in block-local coords: +x is the right
// of the street, -z is forward (u grows), so a face with +Z normal faces oncoming riders.

type V3 = [number, number, number]
const at = (s: number, y: number, u: number): V3 => [s, y, -u]
const STEEL = '#6f7876'
const STEEL_DARK = '#4d5553'

/**
 * Rooftop billboard on a short steel frame at the street edge of a low roof, angled toward
 * oncoming riders and tipped slightly down to them, so it is read head-on from the road.
 * `scale` fits it to the building it stands on.
 */
export function RooftopBillboard({ s, u, roofY, side, r, slot, scale }: { s: number; u: number; roofY: number; side: number; r: number; slot: string; scale: number }) {
  const [w, h] = AD_SIZE.billboard
  const legH = 0.8
  return (
    <group position={at(s, roofY, u)} rotation={[0, -side * 0.5, 0]} scale={scale}>
      {[-w * 0.36, 0, w * 0.36].map((x) => (
        <group key={x}>
          <M c={STEEL} p={[x, legH / 2, -0.3]} s={[0.16, legH, 0.16]} />
          <M c={STEEL} p={[x, (legH + h) / 2, -0.85]} s={[0.12, legH + h, 0.12]} r={[-0.22, 0, 0]} />
        </group>
      ))}
      <group position={[0, legH, 0]} rotation={[0.08, 0, 0]}>
        {/* catwalk, and the frame the face is mounted on */}
        <M c={STEEL_DARK} p={[0, -0.05, 0.15]} s={[w + 0.4, 0.08, 0.6]} />
        <M c={STEEL} p={[0, h / 2, -0.12]} s={[w + 0.3, h + 0.3, 0.18]} />
        <AdSlot format="billboard" r={r} slot={slot} p={[0, h / 2, 0]} />
        {/* two lamps on arms over the face */}
        {[-w * 0.25, w * 0.25].map((x) => (
          <group key={x}>
            <M c={STEEL_DARK} p={[x, h + 0.2, 0.35]} s={[0.05, 0.05, 0.8]} />
            <M c="#e9ece6" p={[x, h + 0.16, 0.72]} s={[0.36, 0.1, 0.2]} />
          </group>
        ))}
      </group>
    </group>
  )
}

/** A banner strung across the street between two posts, high enough to ride under. */
export function StreetBanner({ u, half, r, slot }: { u: number; half: number; r: number; slot: string }) {
  const [w, h] = AD_SIZE.banner
  const span = half + 0.35
  const scale = Math.min(1, (2 * span - 0.8) / w)
  const wireY = 6.0
  const y = 5.1
  return (
    <group position={at(0, 0, u)}>
      {[-1, 1].map((sd) => (
        <group key={sd}>
          <M g={CYL} c={STEEL} p={[sd * span, wireY / 2 + 0.2, 0]} s={[0.14, wireY + 0.4, 0.14]} />
          <M g={CYL} c={STEEL_DARK} p={[sd * span, wireY + 0.45, 0]} s={[0.2, 0.1, 0.2]} />
        </group>
      ))}
      <M c="#2b3634" p={[0, wireY, 0]} s={[2 * span, 0.025, 0.025]} />
      {[-1, 1].map((sd) => (
        <M key={sd} c="#2b3634" p={[(sd * w * scale) / 2.2, (wireY + y + (h * scale) / 2) / 2, 0]} s={[0.02, wireY - y - (h * scale) / 2, 0.02]} />
      ))}
      <AdSlot format="banner" r={r} slot={slot} p={[0, y, 0]} scale={scale} twoSided />
    </group>
  )
}

/** A poster pasted on a block wall, facing the road. */
export function WallPoster({ s, u, side, r, slot }: { s: number; u: number; side: number; r: number; slot: string }) {
  const [, h] = AD_SIZE.poster
  return <AdSlot format="poster" r={r} slot={slot} p={at(s, 0.2 + h / 2, u)} rot={[0, (-side * Math.PI) / 2, 0]} />
}

/** Nobori: a tall shop flag on a pole at the sidewalk edge, swaying a little in the breeze. */
export function Nobori({ s, u, side, r, slot }: { s: number; u: number; side: number; r: number; slot: string }) {
  const flag = useRef<THREE.Group>(null!)
  const [w, h] = AD_SIZE.nobori
  const top = 2.5
  useFrame(({ clock }) => {
    flag.current.rotation.y = Math.sin(clock.elapsedTime * 1.3 + r * 20) * 0.1
  })
  return (
    <group position={at(s, 0.16, u)} rotation={[0, -side * 0.5, 0]}>
      <M c="#2f3a38" p={[0, 0.06, 0]} s={[0.3, 0.12, 0.3]} />
      <M g={CYL} c="#e9ece6" p={[0, top / 2, 0]} s={[0.05, top, 0.05]} />
      <M g={CYL} c="#e9ece6" p={[-side * (w / 2 + 0.02), top - 0.05, 0]} s={[0.035, w + 0.1, 0.035]} r={[0, 0, Math.PI / 2]} />
      <group ref={flag}>
        <AdSlot format="nobori" r={r} slot={slot} p={[-side * (w / 2 + 0.04), top - 0.1 - h / 2, 0]} twoSided />
      </group>
    </group>
  )
}
