import { readJson, writeJson } from './storage'

// The high score tables, like an arcade cabinet's: the top 10 runs by score, and the top 10
// by longest time at full speed. They live on this machine (this browser), and a fresh
// cabinet comes with a default table to beat. The top entry of each is the world record.

export type Board = 'score' | 'speed'
/** What each board is called in the game, and in Japanese (as the title card does for the game). */
export const BOARD_TITLE: Record<Board, string> = { score: 'trickster', speed: 'speedster' }
export const BOARD_JP: Record<Board, string> = { score: 'トリックスター', speed: 'スピードスター' }
export type Entry = { name: string; value: number } // speed values in seconds

export const BOARD_SIZE = 10
export const DEFAULT_NAME = 'John Doe'
export const NAME_MAX = 12

const KEY = 'wheelsoff:leaderboard'
const NAME_KEY = 'wheelsoff:name'

// The default table: made-up locals, there to be beaten. Set low for play-testing, so a world
// record is in reach; raise it before launch (it was 200 points and 90 s at the top).
const SEED_NAMES = ['HANA', 'KENJI', 'YUKI', 'SORA', 'RIN', 'TAKUMI', 'MOMO', 'JIRO', 'AOI', 'REN']
const SEED: Record<Board, number[]> = {
  score: [15, 12, 10, 8, 6, 5, 4, 3, 2, 1],
  speed: [12, 10, 8, 6, 5, 4, 3, 2, 1.5, 1],
}

function seeded(board: Board): Entry[] {
  const shift = board === 'speed' ? 4 : 0
  return SEED[board].map((value, i) => ({ name: SEED_NAMES[(i * 3 + shift) % SEED_NAMES.length], value }))
}

function load(): Record<Board, Entry[]> {
  const raw = readJson(KEY) as Partial<Record<Board, unknown>> | null
  const pick = (board: Board): Entry[] => {
    const list = raw?.[board]
    if (!Array.isArray(list)) return seeded(board)
    return list
      .filter((e): e is Entry => typeof e?.name === 'string' && Number.isFinite(e?.value))
      .slice(0, BOARD_SIZE)
  }
  return { score: pick('score'), speed: pick('speed') }
}

export const boards = load()

/** The world record on a board: its top entry. */
export function worldRecord(board: Board): Entry | null {
  return boards[board][0] ?? null
}

/** Where a run's value would place on a board (0 is first), or null if it misses the top 10. */
export function rankFor(board: Board, value: number): number | null {
  if (!(value > 0)) return null
  const list = boards[board]
  const i = list.findIndex((e) => value > e.value)
  if (i >= 0) return i
  return list.length < BOARD_SIZE ? list.length : null
}

/** Signs a finished run onto every board it makes. */
export function signRun(name: string, score: number, streak: number) {
  for (const [board, value] of [
    ['score', score],
    ['speed', streak],
  ] as const) {
    const rank = rankFor(board, value)
    if (rank === null) continue
    boards[board].splice(rank, 0, { name, value })
    boards[board].length = Math.min(boards[board].length, BOARD_SIZE)
  }
  writeJson(KEY, boards)
}

/** The name typed last time, to offer again. */
export function lastName(): string {
  const name = readJson(NAME_KEY)
  return typeof name === 'string' ? name : ''
}

export function rememberName(name: string) {
  writeJson(NAME_KEY, name)
}

/** A typed name made fit for the table: single spaces, at most NAME_MAX characters. */
export function cleanName(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX)
}
