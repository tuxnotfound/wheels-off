import * as THREE from 'three'
import { useMemo } from 'react'
import { makeToonGradient } from './gradientMap'

type Props = {
  color?: THREE.ColorRepresentation
  bands?: number
}

/**
 * Cel material: idiomatic <meshToonMaterial> with a procedural banded gradientMap.
 * (Outlines are applied separately at the mesh level.)
 */
export function ToonMaterial({ color = '#7fa99b', bands = 3 }: Props) {
  const gradientMap = useMemo(() => makeToonGradient(bands), [bands])
  return <meshToonMaterial color={color} gradientMap={gradientMap} />
}
