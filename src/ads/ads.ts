import * as THREE from 'three'
import { loadTextures } from '../art/art'
import { CURVE } from '../world/worldConfig'

// Advertising inventory. The town has fixed ad *slots* (rooftop billboards, banners over
// the street, wall posters, nobori flags outside shops, delivery-van sides); which
// *creative* fills a slot comes from public/art/ads.json, so a campaign is swapped by
// editing one file and dropping in images, no code. Every slot counts impressions
// (on screen, close enough to read, facing the rider, for a second) and reports them as
// a DOM event, so sold space can be measured. See ADS.md.

export type AdFormat = 'billboard' | 'banner' | 'poster' | 'nobori' | 'van'

/** Physical size of each format in meters (width x height). Creatives must match its aspect. */
export const AD_SIZE: Record<AdFormat, [number, number]> = {
  billboard: [9.6, 3.2],
  banner: [6.4, 1.0],
  poster: [1.0, 1.4],
  nobori: [0.6, 1.8],
  van: [2.5, 1.0],
}

export type Creative = {
  id: string
  advertiser: string
  format: AdFormat
  image: string // path under /art/
  weight?: number // relative share of its format's slots (default 1)
  url?: string // advertiser link, for reporting
}

type Inventory = Record<AdFormat, Creative[]>
const inventory: Inventory = { billboard: [], banner: [], poster: [], nobori: [], van: [] }

/** Load the ad manifest and its images. Missing or broken file = empty inventory, no ads. */
export async function loadAds(url = '/art/ads.json') {
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`${res.status}`)
    const list = ((await res.json()) as { creatives: Creative[] }).creatives
    await loadTextures(list.map((c) => c.image))
    for (const f of Object.keys(inventory) as AdFormat[]) inventory[f] = list.filter((c) => c.format === f)
  } catch (e) {
    console.warn('[wheels-off] no ads loaded:', e)
  }
}

/** Deterministic weighted pick for a slot (r in [0,1) from the slot's seed). */
export function pickAd(format: AdFormat, r: number): Creative | null {
  const list = inventory[format]
  if (!list.length) return null
  const total = list.reduce((a, c) => a + (c.weight ?? 1), 0)
  let x = r * total
  for (const c of list) {
    x -= c.weight ?? 1
    if (x < 0) return c
  }
  return list[list.length - 1]
}

// ---------- impression tracking ----------

export type Impression = { creative: string; advertiser: string; format: AdFormat; slot: string; at: number }

type Tracked = { obj: THREE.Object3D; creative: Creative; slot: string; seen: number; counted: boolean; twoSided: boolean }
const tracked = new Set<Tracked>()

/** Running totals per creative, for the session. */
export const adStats = new Map<string, { advertiser: string; impressions: number }>()

/** Register a mounted slot; returns the unregister function. */
export function trackAd(obj: THREE.Object3D, creative: Creative, slot: string, twoSided = false): () => void {
  const t: Tracked = { obj, creative, slot, seen: 0, counted: false, twoSided }
  tracked.add(t)
  return () => tracked.delete(t)
}

const MAX_DIST: Record<AdFormat, number> = { billboard: 70, banner: 45, poster: 18, nobori: 18, van: 25 }
const p = new THREE.Vector3()
const n = new THREE.Vector3()
const toCam = new THREE.Vector3()

/**
 * Advance every slot's on-screen time by dt. A slot counts one impression per mount once
 * it has been readable for a full second: inside the frame, within its format's reading
 * distance, and facing the camera.
 */
export function tickAds(camera: THREE.Camera, dt: number) {
  for (const t of tracked) {
    if (t.counted) continue
    t.obj.getWorldPosition(p)
    p.y -= (p.x * p.x + p.z * p.z) * CURVE // where the curved world actually draws it
    toCam.copy(camera.position).sub(p)
    const dist = toCam.length()
    let ok = dist < MAX_DIST[t.creative.format]
    if (ok && !t.twoSided) {
      n.set(0, 0, 1).transformDirection(t.obj.matrixWorld)
      ok = n.dot(toCam) > 0.25 * dist
    }
    if (ok) {
      p.project(camera)
      ok = Math.abs(p.x) < 0.95 && Math.abs(p.y) < 0.95 && p.z < 1
    }
    t.seen = ok ? t.seen + dt : 0
    if (t.seen >= 1) {
      t.counted = true
      const c = t.creative
      const s = adStats.get(c.id) ?? { advertiser: c.advertiser, impressions: 0 }
      s.impressions++
      adStats.set(c.id, s)
      const detail: Impression = { creative: c.id, advertiser: c.advertiser, format: c.format, slot: t.slot, at: Date.now() }
      window.dispatchEvent(new CustomEvent<Impression>('wheelsoff:ad-impression', { detail }))
    }
  }
}

if (import.meta.env.DEV) Object.assign(window, { __ads: adStats, __adSlots: tracked })
