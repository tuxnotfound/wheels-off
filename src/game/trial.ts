import { create } from 'zustand'
import { BOARD_SIZE, weekOf } from '../../shared/leaderboard'
import type { Entry } from '../../shared/leaderboard'
import { GHOST_HZ, TRIAL_FINISH, TRIAL_LENGTH, TRIAL_MAX_TIME } from '../../shared/trial'
import type { Ghost } from '../../shared/trial'
import { roll } from './mode'
import { resetToStart, sim } from './sim'
import { readJson, writeJson } from './storage'

// The time trial (mode.ts): the week's course, straight down the start street of the week's
// town (shared/trial.ts), against the clock. Each attempt starts on the start line after a
// countdown, and a wipeout only costs speed. The run is recorded as a ghost; your best of the
// week is kept in this browser and rides along as a ghost, and so does the week's fastest from
// the API (worker/trial.ts), which keeps the board: the week's 10 fastest times.

const COUNTDOWN = 3 // seconds before GO
const RESULT_AFTER = 1 // seconds of rolling on past the finish before the result card
const API = '/api/trial'
const PB_KEY = 'wheelsoff:trial' // this week's best: { week, time, ghost }
const REFRESH_EVERY = 60_000 // ms between fetches of the board, at most

export type Phase = 'countdown' | 'riding' | 'done'

/** A finished run: its time and ghost, and where it stands. */
export type TrialRun = {
  id: number
  time: number
  ghost: Ghost
  pb: number | null // the best before this run
  newPb: boolean
  rank: number | null // this week (0 is first), null when it misses the top 10
}

type Leader = Entry & { ghost: Ghost }

/** What the HUD and the cards show. clock is in tenths; toGo in whole meters. */
export const useTrial = create(() => ({
  phase: 'countdown' as Phase,
  count: COUNTDOWN,
  clock: 0,
  toGo: TRIAL_LENGTH,
  pb: null as number | null,
  board: [] as Entry[],
  leader: null as Entry | null,
}))

const week = weekOf(new Date())

function storedPb(): { time: number; ghost: Ghost } | null {
  const raw = readJson(PB_KEY) as { week?: unknown; time?: unknown; ghost?: Ghost } | null
  if (raw?.week !== week || typeof raw.time !== 'number' || !Array.isArray(raw.ghost?.u)) return null
  return { time: raw.time, ghost: raw.ghost }
}

let pb = storedPb()
let leaderGhost: Ghost | null = null
useTrial.setState({ pb: pb?.time ?? null })

const live = {
  phase: 'countdown' as Phase,
  count: COUNTDOWN,
  goAt: 0, // sim time of GO
  finishedAt: 0,
  next: 1, // the next ghost sample due
  last: { t: 0, u: 0, lat: 0, y: 0 }, // the kid before this frame's step
  rec: { u: [], lat: [], y: [] } as Ghost,
  run: null as TrialRun | null,
}

const cm = (m: number) => Math.round(m * 100)

function sample(u: number, lat: number, y: number) {
  live.rec.u.push(cm(u))
  live.rec.lat.push(cm(lat))
  live.rec.y.push(cm(y))
}

/** A new attempt: back on the start line, and the countdown. */
export function startAttempt() {
  resetToStart()
  live.phase = 'countdown'
  live.count = COUNTDOWN
  live.run = null
  useTrial.setState({ phase: 'countdown', count: COUNTDOWN, clock: 0, toGo: TRIAL_LENGTH })
}

/** T: into the time trial (from the landing page or another mode), or a fresh attempt in it. */
export function enterTrial() {
  roll('trial')
  startAttempt()
  refreshTrial(true)
}

/** Seconds from GO, for the ghosts: 0 before it. */
export function trialClock(): number {
  return live.phase === 'countdown' ? 0 : sim.time - live.goAt
}

/** The ghosts to race: your best this week, and the week's fastest. */
export function ghosts(): { pb: Ghost | null; leader: Ghost | null } {
  return { pb: pb?.ghost ?? null, leader: leaderGhost }
}

/** Where a time would place on the week's board (0 is first), or null if it misses the top 10. */
export function rankTime(time: number): number | null {
  const list = useTrial.getState().board
  const i = list.findIndex((e) => time < e.value)
  if (i >= 0) return i
  return list.length < BOARD_SIZE ? list.length : null
}

/**
 * Before the sim steps, each frame in the time trial: counts down, holding the kid on the line
 * until GO. Returns whether the sim steps this frame.
 */
export function trialTick(dt: number): boolean {
  if (live.phase === 'countdown') {
    live.count -= Math.min(dt, 1 / 20)
    if (live.count > 0) {
      const count = Math.ceil(live.count)
      if (count !== useTrial.getState().count) useTrial.setState({ count })
      return false
    }
    live.phase = 'riding'
    live.goAt = sim.time
    live.next = 1
    live.rec = { u: [], lat: [], y: [] }
    sample(sim.u, sim.lat, sim.y)
    useTrial.setState({ phase: 'riding', count: 0 })
  }
  live.last = { t: sim.time, u: sim.u, lat: sim.lat, y: sim.y }
  return true
}

/**
 * After the sim steps: records the ghost's samples that fell in this frame, and stops the
 * clock at the finish line. Returns the finished run once, when its result card is due.
 */
export function trialAfterStep(): TrialRun | null {
  if (live.phase === 'done') {
    if (live.run && sim.time - live.finishedAt >= RESULT_AFTER) {
      const run = live.run
      live.run = null
      return run
    }
    return null
  }
  if (live.phase !== 'riding') return null
  const a = live.last
  const span = sim.time - a.t
  // the moment the line was crossed, between the last frame and this one
  const crossed = sim.u >= TRIAL_FINISH && a.u < TRIAL_FINISH
  const until = crossed ? a.t + ((TRIAL_FINISH - a.u) / (sim.u - a.u)) * span : sim.time
  for (let ts = live.goAt + live.next / GHOST_HZ; ts <= until + 1e-9; ts = live.goAt + live.next / GHOST_HZ) {
    const f = span > 0 ? (ts - a.t) / span : 1
    sample(a.u + (sim.u - a.u) * f, a.lat + (sim.lat - a.lat) * f, a.y + (sim.y - a.y) * f)
    live.next += 1
  }
  const clock = Math.floor((until - live.goAt) * 10) / 10
  const toGo = Math.max(0, Math.ceil(TRIAL_FINISH - sim.u))
  const now = useTrial.getState()
  if (clock !== now.clock || toGo !== now.toGo) useTrial.setState({ clock, toGo })
  if (crossed) finish(until - live.goAt)
  return null
}

function finish(time: number) {
  live.phase = 'done'
  live.finishedAt = sim.time
  const before = pb?.time ?? null
  const newPb = before === null || time < before
  const ghost = live.rec
  if (newPb && time <= TRIAL_MAX_TIME) {
    pb = { time, ghost }
    writeJson(PB_KEY, { week, time, ghost })
  }
  live.run = { id: sim.time, time, ghost, pb: before, newPb, rank: time <= TRIAL_MAX_TIME ? rankTime(time) : null }
  useTrial.setState({ phase: 'done', pb: pb?.time ?? null })
}

// The week's board and its leader's ghost, from the API. Only the answer to the last request
// sent is taken, as with the other boards.
let sent = 0
let fetchedAt = -Infinity

async function ask(init?: RequestInit) {
  const n = ++sent
  try {
    const res = await fetch(API, init)
    const data = res.ok ? ((await res.json()) as { week?: { id?: string; board?: Entry[]; leader?: Leader | null } }) : null
    if (!data?.week || !Array.isArray(data.week.board) || n !== sent) return
    const leader = data.week.leader ?? null
    leaderGhost = leader && Array.isArray(leader.ghost?.u) ? leader.ghost : null
    useTrial.setState({ board: data.week.board.slice(0, BOARD_SIZE), leader: leader && { name: leader.name, value: leader.value } })
  } catch {
    // offline, or no API: the board stays as it was, and your own ghost still rides
  }
}

/** Fetches the week's board and leader, at most once a minute unless asked now. */
export function refreshTrial(now = false) {
  const t = performance.now()
  if (!now && t - fetchedAt < REFRESH_EVERY) return
  fetchedAt = t
  void ask()
}

/** Signs a finished run onto the week's board: in this copy at once, then with the API. */
export function signTrial(name: string, run: TrialRun) {
  const board = [...useTrial.getState().board]
  const rank = rankTime(run.time)
  if (rank !== null) {
    board.splice(rank, 0, { name, value: run.time })
    board.length = Math.min(board.length, BOARD_SIZE)
    useTrial.setState({ board })
  }
  void ask({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, time: run.time, ghost: run.ghost }) })
}
