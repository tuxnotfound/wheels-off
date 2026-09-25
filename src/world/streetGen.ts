import { hash2 } from './hash'
import { BAY_W, BLOCK, OBST_MAX, OBST_MIN, SIDEWALK } from './worldConfig'
import type { FacadeStyle } from '../look/textures'

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
export type LotKind = 'apt' | 'house' | 'shop' | 'office' | 'wall'
export type Lot = {
  kind: LotKind
  side: number
  a: number // start u' within the block
  len: number
  depth: number
  floors: number
  wall: string
  roof: string
  style: FacadeStyle
  r: number // spare randomness for details
  r2: number
  sign?: { word: string; color: string; vertical: boolean }
  vending?: string
  tank?: boolean
}
export type Segment = { a: number; b: number }
export type BlockPlan = {
  roadFrom: number
  sides: { side: number; walk: Segment; gapStart: number; gapEnd: number }[]
  lots: Lot[]
  crosswalk: number | null // half-width of the crossing street ahead, or null
  stopText: boolean
  poleSide: number
  overpass: boolean
  truck: { side: number; u: number } | null
  mailbox: { side: number; u: number } | null
}

const WALLS = ['#ece7d8', '#f1e6cf', '#e8bfb0', '#a9cbb8', '#8cc2b8', '#d8c7a6', '#cfd2c9', '#f3efe6', '#b8d3cf']
const ROOFS = ['#6e5f5a', '#5e7b7a', '#9b5a4a', '#7a8a86', '#4f6664']
const VENDING = ['#3f7fc4', '#d24a3c', '#e9ece6']
const SIGN_WORDS = ['ラーメン', '喫茶', '薬局', '本屋', 'コンビニ', '花屋', 'パン', '銭湯', '床屋', 'たばこ', '食堂', '酒']
const SIGN_COLORS = ['#e8b64a', '#d9533f', '#f3efe2', '#5aa6a0', '#e58da0', '#4b7fbf']

export function blockPlan(seed: number, k: number, width: number, u0: number): BlockPlan {
  const roadFrom = k === 0 && u0 > 0 ? u0 : 0
  const sides: BlockPlan['sides'] = []
  const lots: Lot[] = []
  for (const side of [-1, 1]) {
    const gs = hasBranch(seed, k, side) ? widthForSeed(childSeed(seed, k, side)) / 2 : 0
    const ge = hasBranch(seed, k + 1, side) ? widthForSeed(childSeed(seed, k + 1, side)) / 2 : 0
    // a side-street's own first block starts past its parent's sidewalk
    const start = roadFrom > 0 ? roadFrom : gs
    const walk = { a: start, b: BLOCK - ge }
    sides.push({ side, walk, gapStart: gs, gapEnd: ge })
    // buildings keep clear of the corner sidewalks
    const la = start + (roadFrom > 0 || gs > 0 ? SIDEWALK + 0.4 : 0.2)
    const lb = BLOCK - (ge > 0 ? ge + SIDEWALK + 0.4 : 0.2)
    let u = la
    let i = 0
    while (u < lb - 1) {
      const r = h(seed, k * 31 + i, side * 7 + 501)
      const r2 = h(seed, k * 31 + i, side * 7 + 502)
      let kind: LotKind = r < 0.3 ? 'house' : r < 0.55 ? 'apt' : r < 0.78 ? 'shop' : r < 0.88 ? 'office' : 'wall'
      let bays = 2 + Math.floor(r2 * 2.5)
      if (kind === 'office') bays += 1
      let len = bays * BAY_W
      if (u + len > lb) {
        const fit = Math.floor((lb - u) / BAY_W)
        if (fit >= 2) len = fit * BAY_W
        else {
          kind = 'wall'
          len = lb - u
        }
      }
      if (kind === 'wall') len = Math.min(len, lb - u)
      const rf = h(seed, k * 31 + i, side * 7 + 503)
      const floors =
        kind === 'house' ? 2 : kind === 'shop' ? 2 + Math.floor(rf * 2) : kind === 'apt' ? 3 + Math.floor(rf * 3) : kind === 'office' ? 4 + Math.floor(rf * 3) : 0
      const lot: Lot = {
        kind,
        side,
        a: u,
        len,
        depth: (2 + Math.floor(rf * 2)) * BAY_W,
        floors,
        wall: pick(WALLS, h(seed, k * 31 + i, side * 7 + 504)),
        roof: pick(ROOFS, h(seed, k * 31 + i, side * 7 + 505)),
        style: kind === 'house' ? 'house' : kind === 'office' ? 'office' : kind === 'wall' ? 'block' : 'apt',
        r: h(seed, k * 31 + i, side * 7 + 506),
        r2: h(seed, k * 31 + i, side * 7 + 507),
      }
      if (kind === 'shop') {
        lot.sign = {
          word: pick(SIGN_WORDS, lot.r),
          color: pick(SIGN_COLORS, lot.r2),
          vertical: lot.r2 > 0.55,
        }
      }
      if ((kind === 'shop' || kind === 'wall' || kind === 'apt') && h(seed, k * 31 + i, side * 7 + 508) > 0.6 && len > 3) {
        lot.vending = pick(VENDING, h(seed, k * 31 + i, side * 7 + 509))
      }
      if (kind === 'apt' || kind === 'office') lot.tank = h(seed, k * 31 + i, side * 7 + 510) > 0.55
      lots.push(lot)
      u += len + 0.3 + h(seed, k * 31 + i, side * 7 + 511) * 0.9
      i++
    }
  }
  const aheadL = hasBranch(seed, k + 1, -1) ? widthForSeed(childSeed(seed, k + 1, -1)) / 2 : 0
  const aheadR = hasBranch(seed, k + 1, 1) ? widthForSeed(childSeed(seed, k + 1, 1)) / 2 : 0
  const cross = Math.max(aheadL, aheadR)
  const poleSide = h(seed, 0, 601) > 0.5 ? 1 : -1
  const truckR = h(seed, k, 611)
  return {
    roadFrom,
    sides,
    lots,
    crosswalk: cross > 0 ? cross : null,
    stopText: cross > 0 && h(seed, k, 602) > 0.55,
    poleSide,
    overpass: width >= 6 && h(seed, k, 603) > 0.86,
    truck: width >= 7 && truckR > 0.6 ? { side: -poleSide, u: 11 + h(seed, k, 612) * 8 } : null,
    mailbox: h(seed, k, 621) > 0.7 ? { side: h(seed, k, 622) > 0.5 ? 1 : -1, u: 9 + h(seed, k, 623) * 12 } : null,
  }
}
