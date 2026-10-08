import { BOARD_SIZE, cleanName, nameAllowed } from '../../shared/leaderboard'
import type { Boards, Entry } from '../../shared/leaderboard'

// The leaderboards, kept for everyone in D1 (migrations/). GET returns both top 10s. POST signs
// a finished run onto them and returns them. A run is one row; each board is the top 10 rows by
// one column. Scores come from the game in the browser, so they can only be checked for sense:
// a name that breaks the rules, an absurd value or a flood from one address is turned away.
// Moderation is by hand: a row with hidden = 1 drops off the boards (README, Leaderboards).

type Env = { DB: D1Database; IP_SALT?: string }

// Far past anything played: a run without a wipeout scores about n² for n obstacles cleared, at
// most 1.6 cleared a second, so five unbroken minutes come to about 200,000.
const MAX_SCORE = 1_000_000
const MAX_STREAK = 3600 // seconds
const PER_HOUR = 60 // runs one address may sign in an hour

const reply = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { 'cache-control': 'no-store' } })

const board = (db: D1Database, column: 'score' | 'streak') =>
  db
    .prepare(`SELECT name, ${column} AS value FROM runs WHERE hidden = 0 AND ${column} > 0 ORDER BY ${column} DESC, id LIMIT ?`)
    .bind(BOARD_SIZE)

async function readBoards(db: D1Database, before: D1PreparedStatement[] = []): Promise<Boards> {
  const results = await db.batch<Entry>([...before, board(db, 'score'), board(db, 'streak')])
  const [score, speed] = results.slice(-2).map((r) => r.results)
  return { score, speed }
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
async function addressOf(request: Request, salt: string | undefined): Promise<string | null> {
  const ip = request.headers.get('cf-connecting-ip')
  if (!salt) console.warn('IP_SALT is not set: runs are signed with no rate limit')
  if (!ip || !salt) return null
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + ip))
  return Array.from(new Uint8Array(digest).slice(0, 8), (b) => b.toString(16).padStart(2, '0')).join('')
}

export const onRequestGet: PagesFunction<Env> = async ({ env }) => reply({ boards: await readBoards(env.DB) })

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
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
  const insert = env.DB.prepare('INSERT INTO runs (name, score, streak, ip_hash) VALUES (?, ?, ?, ?)').bind(
    run.name,
    run.score,
    run.streak,
    address,
  )
  return reply({ boards: await readBoards(env.DB, [insert]) }, 201)
}
