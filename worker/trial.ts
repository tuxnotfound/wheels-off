import { BOARD_SIZE, cleanName, nameAllowed, weekOf } from '../shared/leaderboard'
import type { Entry } from '../shared/leaderboard'
import { checkTrial } from '../shared/trial'
import type { Ghost } from '../shared/trial'
import { PER_HOUR, addressOf, reply } from './leaderboard'
import type { Env } from './leaderboard'

// /api/trial: the time trial's board, this week only (the course changes with the town). GET
// returns the week's 10 fastest times and the fastest run's ghost; POST signs a run (name, time
// and its ghost) and returns the same. The time comes from the game, so the ghost has to back it
// up (checkTrial): a run that rides faster than the kid can, or picks up speed faster than a push
// gives it, is turned away. Moderation is by hand, as on the other boards: hidden = 1.

const MAX_BODY = 64 * 1024 // a five-minute ghost is about 45 KB

/** The week's fastest run, raced as a ghost: its name, time and replay. */
export type Leader = Entry & { ghost: Ghost }
export type TrialWeek = { id: string; board: Entry[]; leader: Leader | null }

async function readWeek(db: D1Database, week: string, before: D1PreparedStatement[] = []): Promise<TrialWeek> {
  const board = db
    .prepare('SELECT name, time AS value FROM trials WHERE hidden = 0 AND week = ? ORDER BY time, id LIMIT ?')
    .bind(week, BOARD_SIZE)
  const top = db.prepare('SELECT name, time AS value, ghost FROM trials WHERE hidden = 0 AND week = ? ORDER BY time, id LIMIT 1').bind(week)
  const results = await db.batch([...before, board, top])
  const [list, first] = results.slice(-2).map((r) => r.results as (Entry & { ghost?: string })[])
  const row = first[0]
  const leader = row ? { name: row.name, value: row.value, ghost: JSON.parse(row.ghost ?? '{}') as Ghost } : null
  return { id: week, board: list, leader }
}

export function trial(request: Request, env: Env): Promise<Response> | Response {
  if (request.method === 'GET') return readWeek(env.DB, weekOf(new Date())).then((week) => reply({ week }))
  if (request.method === 'POST') return signTrial(request, env)
  return reply({ error: 'method' }, 405)
}

async function signTrial(request: Request, env: Env): Promise<Response> {
  if (Number(request.headers.get('content-length')) > MAX_BODY) return reply({ error: 'too long' }, 413)
  const body = (await request.json().catch(() => null)) as { name?: unknown; time?: unknown; ghost?: unknown } | null
  const name = typeof body?.name === 'string' ? cleanName(body.name) : ''
  if (!nameAllowed(name)) return reply({ error: 'name' }, 422)
  const wrong = checkTrial(body?.time, body?.ghost)
  if (wrong) return reply({ error: wrong }, 422)
  const { u, lat, y } = body!.ghost as Ghost
  const address = await addressOf(request, env.IP_SALT)
  if (address) {
    const recent = await env.DB.prepare(
      `SELECT count(*) AS n FROM trials WHERE ip_hash = ? AND created_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 hour')`,
    )
      .bind(address)
      .first<number>('n')
    if ((recent ?? 0) >= PER_HOUR) return reply({ error: 'too many runs' }, 429)
  }
  const week = weekOf(new Date())
  const time = Math.round((body!.time as number) * 1000) / 1000
  const insert = env.DB.prepare('INSERT INTO trials (name, week, time, ghost, ip_hash) VALUES (?, ?, ?, ?, ?)').bind(
    name,
    week,
    time,
    JSON.stringify({ u, lat, y }),
    address,
  )
  return reply({ week: await readWeek(env.DB, week, [insert]) }, 201)
}
