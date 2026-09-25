import { useEffect, useRef } from 'react'
import type * as THREE from 'three'
import { PANEL } from '../look/geom'
import { paintedDepth, paintedMat } from '../art/art'
import { AD_SIZE, pickAd, trackAd } from './ads'
import type { AdFormat } from './ads'

type V3 = [number, number, number]

/**
 * One ad face: the creative picked for this slot, at the format's real size, centered
 * on `p` and facing +Z after `rot`. Glows slightly so it stays readable in shade, and
 * registers itself for impression counting while mounted. Renders nothing when the
 * inventory has no creative for the format.
 */
export function AdSlot({ format, r, slot, p, rot = [0, 0, 0], scale = 1, twoSided = false }: { format: AdFormat; r: number; slot: string; p: V3; rot?: V3; scale?: number; twoSided?: boolean }) {
  const ref = useRef<THREE.Mesh>(null)
  const ad = pickAd(format, r)
  useEffect(() => {
    if (!ad || !ref.current) return
    return trackAd(ref.current, ad, slot, twoSided)
  }, [ad, slot, twoSided])
  if (!ad) return null
  const [w, h] = AD_SIZE[format]
  return (
    <mesh
      ref={ref}
      geometry={PANEL}
      material={paintedMat(ad.image, twoSided, true)}
      position={p}
      rotation={rot}
      scale={[w * scale, h * scale, 1]}
      castShadow
      receiveShadow
      customDepthMaterial={paintedDepth(ad.image)}
    />
  )
}
