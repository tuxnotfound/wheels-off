import { create } from 'zustand'
import { BOARD_SIZE, weekOf } from '../../shared/leaderboard'
import type { Board, Boards, Entry, Week } from '../../shared/leaderboard'
import { readJson, writeJson } from './storage'

export { BOARD_SIZE, NAME_MAX, cleanName, nameAllowed, typedName, weekOf } from '../../shared/leaderboard'
export type { Board, Entry } from '../../shared/leaderboard'

// The high score tables, like an arcade cabinet's: the top 10 runs by score, and the top 10
// by longest time at full speed, each kept twice: of all time, and of this week, which starts
// empty every Monday (00:00 UTC). The API keeps them for everyone (worker/leaderboard.ts).
// This browser keeps the last copy it saw, so the game opens on it and plays on without the
// API (offline, or `npm run dev` with no API running), signing runs into its own copy until the
// API answers again. A browser that has never reached the API starts from the default table,
// and an empty week. The top entry of each all-time board is the world record.

/** Which runs a board ranks: all of them, or this week's. */
export type Period = 'week' | 'all'
export const PERIODS: Period[] = ['week', 'all']
export const PERIOD_TITLE: Record<Period, string> = { week: 'this week', all: 'all time' }

/** What each board is called in the game, and in Japanese (as the title card does for the game). */
export const BOARD_TITLE: Record<Board, string> = { score: 'trickster', speed: 'speedster' }
export const BOARD_JP: Record<Board, string> = { score: 'トリックスター', speed: 'スピードスター' }

export const DEFAULT_NAME = 'John Doe'

const API = '/api/leaderboard'
const KEY = 'wheelsoff:boards' // the last copy (the local-only tables lived under wheelsoff:leaderboard)
const WEEK_KEY = 'wheelsoff:week' // the last copy of a week's boards, with the week they are for
const NAME_KEY = 'wheelsoff:name'
const REFRESH_EVERY = 60_000 // ms between fetches of the boards, at most

// The default table: TUX on top of both, then made-up locals, there to be beaten. The API starts
// from the same table (migrations/0002_seed.sql); change the two together.
const table = (rows: [string, number][]): Entry[] => rows.map(([name, value]) => ({ name, value }))
const SEED: Boards = {
  score: table([
    ['TUX', 200], ['HANA', 150], ['KENJI', 110], ['YUKI', 80], ['SORA', 60],
    ['RIN', 45], ['TAKUMI', 30], ['MOMO', 20], ['JIRO', 12], ['AOI', 6],
  ]),
  speed: table([
    ['TUX', 92], ['REN', 70], ['MIKA', 55], ['DAI', 42], ['NAO', 32],
    ['KOTA', 24], ['EMI', 18], ['SHO', 12], ['YUNA', 8], ['HARU', 5],
  ]),
}

/** Boards read from storage or the API, or null when they are not boards. */
function parse(raw: unknown): Boards | null {
  const data = raw as Partial<Record<Board, unknown>> | null
  if (!Array.isArray(data?.score) || !Array.isArray(data?.speed)) return null
  const pick = (list: unknown[]): Entry[] =>
    list
      .filter((e): e is Entry => typeof (e as Entry)?.name === 'string' && Number.isFinite((e as Entry)?.value))
      .slice(0, BOARD_SIZE)
  return { score: pick(data.score), speed: pick(data.speed) }
}

const empty = (): Boards => ({ score: [], speed: [] })

/** The week whose boards this copy holds: this one, unless the API says otherwise (a wrong clock here). */
let week = weekOf(new Date())

/** The boards of this week kept in storage, or empty ones when what is kept is for another week. */
function storedWeek(): Boards {
  const raw = readJson(WEEK_KEY) as { id?: unknown } | null
  return (raw?.id === week && parse(raw)) || empty()
}

export const tables: Record<Period, Boards> = {
  all: parse(readJson(KEY)) ?? structuredClone(SEED),
  week: storedWeek(),
}

/** Bumped whenever the boards change, so the cards that show them draw again. */
export const useBoards = create(() => ({ version: 0 }))

function changed() {
  writeJson(KEY, tables.all)
  writeJson(WEEK_KEY, { id: week, ...tables.week } satisfies Week)
  useBoards.setState((s) => ({ version: s.version + 1 }))
}

/** The week by this browser's clock, the last time it was looked at. */
let clockWeek = week

/** A new week here (the page left open over Monday): its boards start empty, until the API answers. */
function turnWeek() {
  const now = weekOf(new Date())
  if (now === clockWeek) return
  clockWeek = now
  week = now
  tables.week = empty()
  changed()
}

// Only the answer to the last request sent is taken. A fetch sent at the wipeout and answered
// after the run is signed would otherwise drop that run from this copy.
let sent = 0

async function ask(init?: RequestInit) {
  const n = ++sent
  try {
    const res = await fetch(API, init)
    const data = res.ok ? ((await res.json()) as { boards?: unknown; week?: { id?: unknown } }) : null
    const all = parse(data?.boards)
    if (!all || n !== sent) return
    tables.all = all
    const thisWeek = parse(data?.week)
    if (thisWeek && typeof data?.week?.id === 'string') {
      week = data.week.id
      tables.week = thisWeek
    }
    changed()
  } catch {
    // offline, or no API: this copy stands
  }
}

let fetchedAt = -Infinity

/** Fetches the boards from the API, at most once a minute. */
export function refreshBoards() {
  turnWeek()
  const now = performance.now()
  if (now - fetchedAt < REFRESH_EVERY) return
  fetchedAt = now
  void ask()
}

refreshBoards()

/** The world record on a board: the top entry of all time. */
export function worldRecord(board: Board): Entry | null {
  return tables.all[board][0] ?? null
}

/** The top entry of a board this week, or null while it is empty. */
export function weekTop(board: Board): Entry | null {
  return tables.week[board][0] ?? null
}

/** Where a run's value would place on a board (0 is first), or null if it misses the top 10. */
export function rankFor(period: Period, board: Board, value: number): number | null {
  if (!(value > 0)) return null
  const list = tables[period][board]
  const i = list.findIndex((e) => value > e.value)
  if (i >= 0) return i
  return list.length < BOARD_SIZE ? list.length : null
}

/** Signs a finished run onto every board it makes: in this copy at once, then with the API. */
export function signRun(name: string, score: number, streak: number) {
  turnWeek()
  for (const period of PERIODS) {
    for (const [board, value] of [
      ['score', score],
      ['speed', streak],
    ] as const) {
      const rank = rankFor(period, board, value)
      if (rank === null) continue
      const list = tables[period][board]
      list.splice(rank, 0, { name, value })
      list.length = Math.min(list.length, BOARD_SIZE)
    }
  }
  changed()
  void ask({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, score, streak }) })
}

/** The name typed last time, to offer again. */
export function lastName(): string {
  const name = readJson(NAME_KEY)
  return typeof name === 'string' ? name : ''
}

export function rememberName(name: string) {
  writeJson(NAME_KEY, name)
}
