import { hash2 } from './hash'
import { BLOCK, OBST_MAX, OBST_MIN, SIDEWALK } from './worldConfig'
import { art, propArt } from '../art/art'
import type { BuildingArt } from '../art/art'
import type { TreeKind } from './Tree3D'
import { VEHICLE_LEN } from './vehicles'
import type { VehicleKind } from './vehicles'

// Seed-based, path-relative street generation. A "street" is identified by a seed;
// everything about it (width, where it branches, its buildings, obstacles and the
// seeds of the streets that branch off it) is a deterministic function of that
// seed. The world is the tree of streets reachable from the start seed along the
// path you take: infinite, and not a fixed 2D grid.
//
// Block k of a street spans u in [k*BLOCK, (k+1)*BLOCK]; intersection k sits at its
// start. Side -1 is left, +1 is right. Local coords: u along, s lateral (right +).

const BRANCH_T = 0.42 // lower => side-streets appear more often

export function h(seed: number, k: number, salt: number): number {
  return hash2(seed * 0.731 + k * 2.17 + salt * 5.31, seed * 3.19 - k * 1.43 + salt * 0.97)
}
function pick<T>(arr: readonly T[], r: number): T {
  return arr[Math.floor(r * arr.length) % arr.length]
}

export function widthForSeed(seed: number): number {
  return 5 + Math.floor(h(seed, 0, 7) * 4) // 5 (alley) .. 8 (main street)
}

/** Side-street presence at intersection k. None at the very start of a street. */
export function hasBranch(seed: number, k: number, side: number): boolean {
  if (k < 1) return false
  return h(seed, k, side < 0 ? 11 : 23) > BRANCH_T
}

/** The seed of the street that branches off intersection k on the given side. */
export function childSeed(seed: number, k: number, side: number): number {
  return Math.floor(h(seed, k, side < 0 ? 101 : 202) * 1e6) + 1
}

// ---------- street names ----------
const NAME_A = [
  ['Sakura', '桜'], ['Minato', '港'], ['Hikari', '光'], ['Midori', '緑'], ['Asahi', '旭'],
  ['Tsubame', '燕'], ['Hoshi', '星'], ['Kaede', '楓'], ['Nishi', '西'], ['Higashi', '東'],
  ['Kawa', '川'], ['Matsu', '松'], ['Yume', '夢'], ['Aoba', '青葉'],
] as const
const NAME_B = [
  ['Dori', '通り'], ['Zaka', '坂'], ['Cho', '町'], ['Shotengai', '商店街'], ['Yokocho', '横丁'],
] as const
export function streetName(seed: number): { name: string; kanji: string } {
  const a = pick(NAME_A, h(seed, 0, 301))
  const b = pick(NAME_B, h(seed, 0, 302))
  return { name: `${a[0]} ${b[0]}`.toUpperCase(), kanji: a[1] + b[1] }
}

// ---------- obstacles ----------
export type ObstacleKind = 'cone' | 'cones' | 'barrier' | 'boxes' | 'bags'
export type Obstacle = {
  id: string
  kind: ObstacleKind
  u: number // absolute u along the street
  s: number // lateral center
  w: number // lateral size
  d: number // size along the street
  h: number // height to clear
}
const OBST_SIZE: Record<ObstacleKind, [w: number, d: number, h: number]> = {
  cone: [0.55, 0.55, 0.75],
  cones: [2.6, 0.55, 0.75],
  barrier: [2.4, 0.5, 0.9],
  boxes: [1.1, 0.9, 0.72],
  bags: [1.2, 0.8, 0.55],
}
const OBST_KINDS: ObstacleKind[] = ['cone', 'cone', 'cones', 'barrier', 'boxes', 'bags']

export function laneLimit(width: number): number {
  return width / 2 - 0.9
}

const obstCache = new Map<string, Obstacle[]>()
export function blockObstacles(seed: number, k: number, width: number): Obstacle[] {
  const key = `${seed}:${k}`
  const hit = obstCache.get(key)
  if (hit) return hit
  const out: Obstacle[] = []
  // calm start: nothing in the first blocks of the very first street
  if (!(seed === 1 && k < 1)) {
    const n = Math.floor(h(seed, k, 401) * 3.2) // 0..3
    const span = OBST_MAX - OBST_MIN
    for (let i = 0; i < n; i++) {
      const kind = pick(OBST_KINDS, h(seed, k, 410 + i))
      const [w, d, hh] = OBST_SIZE[kind]
      const u = k * BLOCK + OBST_MIN + (span * (i + 0.2 + 0.6 * h(seed, k, 420 + i))) / n
      const lim = Math.max(0, laneLimit(width) - w / 2 + 0.3)
      const s = (h(seed, k, 430 + i) * 2 - 1) * lim
      out.push({ id: `${key}:${i}`, kind, u, s, w, d, h: hh })
    }
  }
  if (obstCache.size > 600) obstCache.clear()
  obstCache.set(key, out)
  return out
}

// ---------- block plan (everything static in one block) ----------
export type Lot =
  | { kind: 'building'; side: number; a: number; len: number; art: BuildingArt }
  | { kind: 'wall'; side: number; a: number; len: number; tree: TreeKind | null; r: number }
export type PropSpot = { id: string; side: number; u: number }
/** Fallen petals lying flat: on the sidewalk (y = curb) or the road. */
export type Litter = { s: number; u: number; onWalk: boolean; rot: number; size: number }
export type Segment = { a: number; b: number }
export type BlockPlan = {
  roadFrom: number
  sides: { side: number; walk: Segment; gapStart: number; gapEnd: number }[]
  lots: Lot[]
  props: PropSpot[]
  trees: { side: number; u: number; kind: TreeKind; r: number }[] // occasional sidewalk trees
  litter: Litter[]
  crosswalk: number | null // half-width of the crossing street ahead, or null
  stopText: boolean
  poleSide: number
  overpass: boolean
  vehicles: VehicleSpot[]
  billboards: { s: number; u: number; roofY: number; side: number; r: number }[]
  banner: { u: number; r: number } | null // strung across the street
  nobori: { s: number; u: number; side: number; r: number }[]
  posters: { s: number; u: number; side: number; r: number }[]
}
export type VehicleSpot = { kind: VehicleKind; side: number; s: number; u: number; r: number; flip: boolean; curb: boolean }

const ROAD_VEHICLES: [VehicleKind, number][] = [
  ['kei-car', 0.45],
  ['kei-truck', 0.3],
  ['van', 0.25],
]
function weighted<T>(list: [T, number][], r: number): T {
  let x = r
  for (const [v, w] of list) {
    x -= w
    if (x < 0) return v
  }
  return list[list.length - 1][0]
}
const SHOP_FRONT = /^(shop|konbini|shokudo)/

export const POLE_U = [5, 21] // utility poles along the pole side of every block
// (a flat bicycle card reads as a spider edge-on, so it isn't placed until it has real depth)
const SIDEWALK_PROPS = ['vending-blue', 'vending-red', 'postbox', 'plants']

/** A building whose art fits in the room left, starting from a hashed pick. */
function fitBuilding(r: number, room: number): BuildingArt | null {
  const list = art.buildings
  if (!list.length) return null
  const i0 = Math.floor(r * list.length)
  for (let i = 0; i < list.length; i++) {
    const b = list[(i0 + i) % list.length]
    if (b.width <= room) return b
  }
  return null
}

export function blockPlan(seed: number, k: number, width: number, u0: number): BlockPlan {
  const key = `${seed}:${k}:${width}:${u0}`
  const hit = planCache.get(key)
  if (hit) return hit
  const plan = makePlan(seed, k, width, u0)
  if (planCache.size > 400) planCache.clear()
  planCache.set(key, plan)
  return plan
}
const planCache = new Map<string, BlockPlan>()

function makePlan(seed: number, k: number, width: number, u0: number): BlockPlan {
  const roadFrom = k === 0 && u0 > 0 ? u0 : 0
  const poleSide = h(seed, 0, 601) > 0.5 ? 1 : -1
  const sides: BlockPlan['sides'] = []
  const lots: Lot[] = []
  const props: PropSpot[] = []
  const trees: BlockPlan['trees'] = []
  const litter: Litter[] = []
  const vehicles: VehicleSpot[] = []
  const billboards: BlockPlan['billboards'] = []
  const nobori: BlockPlan['nobori'] = []
  const posters: BlockPlan['posters'] = []
  const propIds = SIDEWALK_PROPS.filter((id) => propArt(id))
  const half = width / 2
  const front = half + SIDEWALK + 0.3 // where facades stand

  const aheadL = hasBranch(seed, k + 1, -1) ? widthForSeed(childSeed(seed, k + 1, -1)) / 2 : 0
  const aheadR = hasBranch(seed, k + 1, 1) ? widthForSeed(childSeed(seed, k + 1, 1)) / 2 : 0
  const cross = Math.max(aheadL, aheadR)
  const overpass = width >= 6 && h(seed, k, 603) > 0.86

  // what already stands on each sidewalk, as [from, to] spans along u, so nothing overlaps
  const taken: Record<number, [number, number][]> = { [-1]: [], [1]: [] }
  const free = (side: number, a: number, b: number) => taken[side].every(([x, y]) => b < x || a > y)
  const take = (side: number, a: number, b: number) => taken[side].push([a, b])
  for (const p of POLE_U) take(poleSide, p - 0.7, p + 0.7)
  if (cross) take(-1, BLOCK - cross - 4, BLOCK)
  if (overpass) take(-poleSide, 9.5, 18.5)

  // a banner strung over the street now and then (never under the footbridge)
  let banner: BlockPlan['banner'] = null
  if (!overpass && width >= 6 && h(seed, k, 800) > 0.7) {
    const bu = 9 + h(seed, k, 801) * 8
    if (free(-1, bu - 0.6, bu + 0.6) && free(1, bu - 0.6, bu + 0.6)) {
      banner = { u: bu, r: h(seed, k, 802) }
      take(-1, bu - 0.6, bu + 0.6)
      take(1, bu - 0.6, bu + 0.6)
    }
  }

  for (const side of [-1, 1]) {
    const gs = hasBranch(seed, k, side) ? widthForSeed(childSeed(seed, k, side)) / 2 : 0
    const ge = hasBranch(seed, k + 1, side) ? widthForSeed(childSeed(seed, k + 1, side)) / 2 : 0
    // a side-street's own first block starts past its parent's sidewalk
    const start = roadFrom > 0 ? roadFrom : gs
    const walk = { a: start, b: BLOCK - ge }
    sides.push({ side, walk, gapStart: gs, gapEnd: ge })
    // now and then a single tree at the back of the sidewalk
    if (h(seed, k, side + 700) > 0.85) {
      const tu = 8 + h(seed, k, side + 701) * 16
      if (free(side, tu - 1.5, tu + 1.5) && tu > walk.a + 3 && tu < walk.b - 3) {
        take(side, tu - 1.5, tu + 1.5)
        trees.push({ side, u: tu, kind: h(seed, k, side + 702) < 0.85 ? 'sakura' : 'green', r: h(seed, k, side + 703) })
        // petals fallen under it, on the pavement and spilling onto the road
        litter.push({ s: side * (half + SIDEWALK / 2), u: tu + 0.6, onWalk: true, rot: h(seed, k, side + 710) * 6.28, size: 2.6 })
        litter.push({ s: side * (half - 0.9), u: tu + 1.2, onWalk: false, rot: h(seed, k, side + 711) * 6.28, size: 2.2 })
      }
    }
    // parked cars, half up on the curb on the side without poles
    if (side === -poleSide && width >= 6) {
      const n = width >= 7 ? Math.floor(h(seed, k, side + 810) * 2.6) : h(seed, k, side + 810) > 0.65 ? 1 : 0
      for (let i = 0; i < n; i++) {
        const kind = weighted(ROAD_VEHICLES, h(seed, k * 5 + i, side + 811))
        const len = VEHICLE_LEN[kind]
        const hiEnd = Math.min(walk.b - 1.5, cross ? BLOCK - cross - 4 : BLOCK) - len / 2
        const lo = walk.a + 1.5 + len / 2
        if (hiEnd <= lo) break
        const vu = lo + h(seed, k * 5 + i, side + 812) * (hiEnd - lo)
        if (!free(side, vu - len / 2 - 0.5, vu + len / 2 + 0.5)) continue
        take(side, vu - len / 2 - 0.5, vu + len / 2 + 0.5)
        vehicles.push({ kind, side, s: side * (half + 0.35), u: vu, r: h(seed, k * 5 + i, side + 813), flip: h(seed, k * 5 + i, side + 814) > 0.6, curb: true })
      }
    }
    // buildings keep clear of the corner sidewalks
    const la = start + (roadFrom > 0 || gs > 0 ? SIDEWALK + 0.4 : 0.2)
    const lb = BLOCK - (ge > 0 ? ge + SIDEWALK + 0.4 : 0.2)
    let u = la
    let i = 0
    while (u < lb - 1) {
      const r = (salt: number) => h(seed, k * 31 + i, side * 7 + salt)
      const room = lb - u
      const b = r(500) < 0.85 ? fitBuilding(r(501), room) : null
      let len: number
      if (b) {
        len = b.width
        lots.push({ kind: 'building', side, a: u, len, art: b })
        // a billboard on a tall flat roof
        if (b.roofShape !== 'gable' && b.bodyHeight >= 9 && len >= 6.4 && r(520) > 0.55) {
          billboards.push({ s: side * (front + b.depth * 0.55), u: u + len / 2, roofY: b.bodyHeight, side, r: r(521) })
        }
        // nobori flags out in front of shops
        if (SHOP_FRONT.test(b.id) && r(522) > 0.3) {
          const count = 2 + (r(523) > 0.5 ? 1 : 0)
          for (let j = 0; j < count; j++) {
            const nu = u + 0.7 + j * 1.2
            if (nu > u + len - 0.4 || !free(side, nu - 0.4, nu + 0.4)) continue
            take(side, nu - 0.4, nu + 0.4)
            nobori.push({ s: side * (half + 0.35), u: nu, side, r: h(seed, k * 31 + i * 3 + j, side + 830) })
          }
        }
        // a scooter or a bicycle left outside
        if (r(524) > 0.7) {
          const bu = u + len - 1.3
          if (free(side, bu - 1, bu + 1)) {
            take(side, bu - 1, bu + 1)
            vehicles.push({ kind: r(525) < 0.45 ? 'scooter' : 'bicycle', side, s: side * (half + 0.95), u: bu, r: r(526), flip: r(527) > 0.5, curb: false })
          }
        }
      } else {
        // a stretch of block wall fills what no building fits
        len = Math.min(room, 3.2 * (1 + Math.floor(r(502) * 2)))
        // sometimes a garden tree behind the wall, usually a sakura
        const tree: TreeKind | null = r(503) > 0.86 ? (r(509) < 0.75 ? 'sakura' : 'green') : null
        if (len >= 1) lots.push({ kind: 'wall', side, a: u, len, tree, r: r(504) })
        // posters pasted on the wall, one per tile
        if (len >= 3.2 && r(528) > 0.4) {
          const tiles = Math.min(2, Math.floor(len / 3.2))
          for (let j = 0; j < tiles; j++) {
            posters.push({ s: side * (front + 0.2 - 0.185), u: u + 1.6 + j * 3.2, side, r: h(seed, k * 31 + i * 3 + j, side + 840) })
          }
        }
      }
      // something on the sidewalk in front
      if (propIds.length && r(505) > 0.55 && len > 2) {
        const pu = u + 0.8 + r(506) * (len - 1.6)
        if (free(side, pu - 0.7, pu + 0.7)) {
          take(side, pu - 0.7, pu + 0.7)
          props.push({ id: pick(propIds, r(507)), side, u: pu })
        }
      }
      u += len + 0.25 + r(508) * 0.6
      i++
    }
  }
  if (propArt('petals-ground')) {
    for (let i = 0; i < 2; i++) {
      const lu = roadFrom + 2 + h(seed, k, 720 + i) * (BLOCK - roadFrom - 4)
      litter.push({ s: (h(seed, k, 730 + i) * 2 - 1) * (half - 0.6), u: lu, onWalk: false, rot: h(seed, k, 740 + i) * 6.28, size: 1.4 + h(seed, k, 750 + i) })
    }
  }
  return {
    roadFrom,
    sides,
    lots,
    props,
    trees,
    litter,
    crosswalk: cross > 0 ? cross : null,
    stopText: cross > 0 && h(seed, k, 602) > 0.55,
    poleSide,
    overpass,
    vehicles,
    billboards,
    banner,
    nobori,
    posters,
  }
}
