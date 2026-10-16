import { BOARD_SIZE, cleanName, nameAllowed, weekOf } from '../shared/leaderboard'
import type { Boards, Entry, Week } from '../shared/leaderboard'

// /api/leaderboard: the leaderboards, kept for everyone in D1 (migrations/). GET returns both top
// 10s of all time and both of this week. POST signs a finished run onto them and returns them. A
// run is one row, signed into the week it reaches the API in; each board is the top 10 rows by
// one column, of all time or of this week. Scores come from the game in the browser, so they can
// only be checked for sense: a name that breaks the rules, an absurd value or a flood from one
// address is turned away. Moderation is by hand: a row with hidden = 1 drops off the boards
// (README, Leaderboards).

export type Env = { DB: D1Database; IP_SALT?: string; CORS_ORIGINS?: string }

// Far past anything played: a run without a wipeout scores about n² for n obstacles cleared, at
// most 1.6 cleared a second, so five unbroken minutes come to about 200,000.
const MAX_SCORE = 1_000_000
const MAX_STREAK = 3600 // seconds
export const PER_HOUR = 60 // runs one address may sign in an hour (on each board)

export const reply = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { 'cache-control': 'no-store' } })

/** A board: the top 10 rows by one column, of all time (week null) or of one week. */
function board(db: D1Database, column: 'score' | 'streak', week: string | null) {
  const select = `SELECT name, ${column} AS value FROM runs WHERE hidden = 0 AND ${column} > 0`
  const order = `ORDER BY ${column} DESC, id LIMIT ?`
  if (week === null) return db.prepare(`${select} ${order}`).bind(BOARD_SIZE)
  return db.prepare(`${select} AND week = ? ${order}`).bind(week, BOARD_SIZE)
}

/** What GET and POST answer: the boards of all time, and this week's. */
type Tables = { boards: Boards; week: Week }

async function readTables(db: D1Database, week: string, before: D1PreparedStatement[] = []): Promise<Tables> {
  const boards = [board(db, 'score', null), board(db, 'streak', null), board(db, 'score', week), board(db, 'streak', week)]
  const results = await db.batch<Entry>([...before, ...boards])
  const [score, speed, weekScore, weekSpeed] = results.slice(-boards.length).map((r) => r.results)
  return { boards: { score, speed }, week: { id: week, score: weekScore, speed: weekSpeed } }
}

type Run = { name: string; score: number; streak: number }

/** The run in a POST body, or why it is turned away. */
function readRun(body: unknown): Run | string {
  const { name, score, streak } = (body ?? {}) as Record<string, unknown>
  const clean = typeof name === 'string' ? cleanName(name) : ''
  if (!nameAllowed(clean)) return 'name'
  if (!Number.isInteger(score) || (score as number) < 0 || (score as number) > MAX_SCORE) return 'score'
  if (typeof streak !== 'number' || !(streak >= 0 && streak <= MAX_STREAK)) return 'streak'
  if (score === 0 && streak === 0) return 'empty run'
  return { name: clean, score: score as number, streak: Math.round(streak * 1000) / 1000 }
}

/** The sender's address, salted and hashed, for the rate limit; null with no salt set. */
export async function addressOf(request: Request, salt: string | undefined): Promise<string | null> {
  const ip = request.headers.get('cf-connecting-ip')
  if (!salt) console.warn('IP_SALT is not set: runs are signed with no rate limit')
  if (!ip || !salt) return null
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + ip))
  return Array.from(new Uint8Array(digest).slice(0, 8), (b) => b.toString(16).padStart(2, '0')).join('')
}

export function leaderboard(request: Request, env: Env): Promise<Response> | Response {
  if (request.method === 'GET') return readTables(env.DB, weekOf(new Date())).then((tables) => reply(tables))
  if (request.method === 'POST') return signRun(request, env)
  return reply({ error: 'method' }, 405)
}

async function signRun(request: Request, env: Env): Promise<Response> {
  if (Number(request.headers.get('content-length')) > 1024) return reply({ error: 'too long' }, 413)
  const run = readRun(await request.json().catch(() => null))
  if (typeof run === 'string') return reply({ error: run }, 422)
  const address = await addressOf(request, env.IP_SALT)
  if (address) {
    const recent = await env.DB.prepare(
      `SELECT count(*) AS n FROM runs WHERE ip_hash = ? AND created_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 hour')`,
    )
      .bind(address)
      .first<number>('n')
    if ((recent ?? 0) >= PER_HOUR) return reply({ error: 'too many runs' }, 429)
  }
  const week = weekOf(new Date())
  const insert = env.DB.prepare('INSERT INTO runs (name, score, streak, ip_hash, week) VALUES (?, ?, ?, ?, ?)').bind(
    run.name,
    run.score,
    run.streak,
    address,
    week,
  )
  return reply(await readTables(env.DB, week, [insert]), 201)
}
