import * as THREE from 'three'
import { patchCurve } from '../look/materials'
import { celRamp } from '../look/gradientMap'

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
  // decal: flat on the ground
  mode: 'card' | 'cross' | 'box' | 'wall' | 'decal'
  glow?: boolean // keep its painted color in shade (foliage, signs)
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

/** Load images (paths relative to /art/) into the shared texture map used by paintedMat. */
export async function loadTextures(paths: string[], loader = new THREE.TextureLoader().setPath('/art/')) {
  await Promise.all(
    paths.map(async (p) => {
      const t = await loader.loadAsync(p)
      t.colorSpace = THREE.SRGBColorSpace
      t.anisotropy = 8
      textures.set(p, t)
    }),
  )
}

/** Fetch the manifest and preload every image, so nothing pops in while riding. */
export async function loadArt(base = '/art/'): Promise<ArtManifest> {
  const m = (await (await fetch(`${base}manifest.json`)).json()) as ArtManifest
  const loader = new THREE.TextureLoader().setPath(base)
  await loadTextures([...m.buildings.map((b) => b.front), ...m.props.map((p) => p.image)], loader)
  art = m
  props.clear()
  for (const p of m.props) props.set(p.id, p)
  return m
}

/** Character to ride: `?vrm=<path under /art/>` overrides the manifest's `character`. */
export function characterUrl(): string | null {
  const q = new URLSearchParams(window.location.search).get('vrm')
  const path = q ?? art.character
  return path ? `/art/${path}` : null
}

export function propArt(id: string): PropArt | undefined {
  return props.get(id)
}

const mats = new Map<string, THREE.Material>()

/**
 * Painted surfaces keep their own painted shading, and also take the scene's light
 * through the same hard two-tone cel ramp as everything else: sun-facing art gets the
 * warm light, the rest falls into the tinted shade, and cast shadows land on facades.
 * Alpha-tested, fogged, curved like the world.
 */
export function paintedMat(path: string, doubleSided = false, glow = false): THREE.MeshToonMaterial {
  const key = `${path}:${doubleSided}:${glow}`
  let m = mats.get(key) as THREE.MeshToonMaterial | undefined
  if (!m) {
    m = new THREE.MeshToonMaterial({
      map: textures.get(path),
      gradientMap: celRamp(),
      alphaTest: 0.5,
      side: doubleSided ? THREE.DoubleSide : THREE.FrontSide,
    })
    if (glow) {
      // glows a little with its own color, so shade only dims it (foliage stays green,
      // ads stay readable) and the two planes of a crossed card don't split in tone
      m.emissiveMap = m.map
      m.emissive = new THREE.Color('#ffffff')
      m.emissiveIntensity = 0.5
    }
    m.onBeforeCompile = patchCurve
    m.customProgramCacheKey = () => 'toon-curve'
    mats.set(key, m)
  }
  return m
}

/** Painted art lying flat on a surface (fallen petals): pulled toward the camera so it never z-fights. */
export function decalPaintMat(path: string): THREE.MeshToonMaterial {
  const key = `decal:${path}`
  let m = mats.get(key) as THREE.MeshToonMaterial | undefined
  if (!m) {
    m = paintedMat(path).clone()
    m.polygonOffset = true
    m.polygonOffsetFactor = -2
    m.polygonOffsetUnits = -6
    m.onBeforeCompile = patchCurve
    m.customProgramCacheKey = () => 'toon-curve'
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
