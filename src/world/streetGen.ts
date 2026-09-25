import { hash2 } from './hash'

// Seed-based, path-relative street generation. A "street" is identified by a seed;
// everything about it (width, where it branches, its buildings, and the seeds of
// the streets that branch off it) is a deterministic function of that seed. The
// world is the tree of streets reachable from the start seed along the path you
// take — infinite, and not a fixed 2D grid.

const BRANCH_T = 0.45 // lower => side-streets appear more often

function h(seed: number, k: number, salt: number): number {
  return hash2(seed * 0.731 + k * 2.17 + salt * 5.31, seed * 3.19 - k * 1.43 + salt * 0.97)
}

export function widthForSeed(seed: number): number {
  return 4 + h(seed, 0, 7) * 5 // 4 (alley) .. 9 (boulevard)
}

// Independent per-side branch presence at intersection k.
export function branchLeft(seed: number, k: number): boolean {
  return h(seed, k, 11) > BRANCH_T
}
export function branchRight(seed: number, k: number): boolean {
  return h(seed, k, 23) > BRANCH_T
}

// The seed of the street that branches off intersection k on the given side.
export function childSeed(seed: number, k: number, left: boolean): number {
  return Math.floor(h(seed, k, left ? 101 : 202) * 1e6) + 1
}

// Building lining the street in block-segment k on a side.
const PALETTE = ['#9ab3a5', '#5d7d72', '#7e9b8e', '#b6c7bd', '#86a397', '#c9d6cd']
export function building(seed: number, k: number, left: boolean) {
  const s = left ? 1 : 2
  return {
    h: 2.5 + h(seed, k, s * 13) * 8,
    w: 0.5 + 0.45 * h(seed, k, s * 29), // fraction of footprint, along the street
    d: 0.5 + 0.45 * h(seed, k, s * 41), // fraction of footprint, depth
    color: PALETTE[Math.floor(h(seed, k, s * 53) * PALETTE.length) % PALETTE.length],
  }
}
