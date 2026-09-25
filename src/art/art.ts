import * as THREE from 'three'
import { patchCurve } from '../look/materials'

// The painted-art pipeline. public/art/manifest.json lists every painted image
// with its real-world size; the street generator lays lots out from it and the
// renderer maps the images onto simple shapes (see ART.md for the art spec).

export type BuildingArt = {
  id: string
  front: string // front elevation image, transparent around the silhouette
  width: number // meters, along the street
  height: number // meters, full image height (roof, tank, sign included)
  bodyHeight: number // meters, the wall the 3D body is built to
  depth: number // meters, how far the body extends back
  side: string // side wall color
  roof: string // roof color
  roofShape?: 'flat' | 'gable'
}
export type PropArt = {
  id: string
  image: string
  width: number
  height: number
  // card: one upright plane facing the street; cross: two crossed planes (reads
  // from any angle); box: a solid box with the image on the front; wall: a tile
  mode: 'card' | 'cross' | 'box' | 'wall'
  depth?: number
  color?: string
}
export type ArtManifest = {
  character: string | null
  buildings: BuildingArt[]
  props: PropArt[]
}

export let art: ArtManifest = { character: null, buildings: [], props: [] }
const props = new Map<string, PropArt>()
const textures = new Map<string, THREE.Texture>()

/** Fetch the manifest and preload every image, so nothing pops in while riding. */
export async function loadArt(base = '/art/'): Promise<ArtManifest> {
  const m = (await (await fetch(`${base}manifest.json`)).json()) as ArtManifest
  const loader = new THREE.TextureLoader().setPath(base)
  const paths = [...m.buildings.map((b) => b.front), ...m.props.map((p) => p.image)]
  await Promise.all(
    paths.map(async (p) => {
      const t = await loader.loadAsync(p)
      t.colorSpace = THREE.SRGBColorSpace
      t.anisotropy = 8
      textures.set(p, t)
    }),
  )
  art = m
  props.clear()
  for (const p of m.props) props.set(p.id, p)
  return m
}

export function propArt(id: string): PropArt | undefined {
  return props.get(id)
}

const mats = new Map<string, THREE.Material>()

/**
 * Painted surfaces are unlit: the art already carries its shading, and lighting it
 * again would muddy the painted colors. Alpha-tested, fogged, curved like the world.
 */
export function paintedMat(path: string, doubleSided = false): THREE.MeshBasicMaterial {
  const key = `${path}:${doubleSided}`
  let m = mats.get(key) as THREE.MeshBasicMaterial | undefined
  if (!m) {
    m = new THREE.MeshBasicMaterial({
      map: textures.get(path),
      alphaTest: 0.5,
      side: doubleSided ? THREE.DoubleSide : THREE.FrontSide,
    })
    m.onBeforeCompile = patchCurve
    m.customProgramCacheKey = () => 'basic-curve'
    mats.set(key, m)
  }
  return m
}

/** Shadow-pass material that respects the art's cut-out silhouette. */
export function paintedDepth(path: string): THREE.MeshDepthMaterial {
  const key = `depth:${path}`
  let m = mats.get(key) as THREE.MeshDepthMaterial | undefined
  if (!m) {
    m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: textures.get(path), alphaTest: 0.5 })
    m.onBeforeCompile = patchCurve
    m.customProgramCacheKey = () => 'depth-curve'
    mats.set(key, m)
  }
  return m
}
