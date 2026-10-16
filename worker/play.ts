import { weekOf } from '../shared/leaderboard'
import { cleanSource } from '../shared/play'
import { addressOf, reply } from './leaderboard'
import type { Env } from './leaderboard'

// /api/play: the play tracker (migrations/0005_plays.sql). The game sends its page visit's
// session as it rides: a random id kept in memory, where the visit came from, the runs ended
// and the seconds ridden so far. The first send makes the row, later ones raise its counts.
// Nothing comes back but the status. The counts come from the browser, so only sense is checked,
// and one address may open a limited number of sessions an hour.

const SESSION = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const MAX_RUNS = 5000
const MAX_SECONDS = 12 * 3600
const SESSIONS_PER_HOUR = 30 // new sessions one address may open in an hour

type Play = { session: string; source: string; runs: number; seconds: number }

function readPlay(body: unknown): Play | null {
  const p = body as Partial<Record<keyof Play, unknown>> | null
  if (typeof p?.session !== 'string' || !SESSION.test(p.session)) return null
  const runs = p.runs
  const seconds = p.seconds
  if (typeof runs !== 'number' || !Number.isInteger(runs) || runs < 0 || runs > MAX_RUNS) return null
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0 || seconds > MAX_SECONDS) return null
  return { session: p.session, source: cleanSource(typeof p.source === 'string' ? p.source : ''), runs, seconds: Math.round(seconds * 10) / 10 }
}

export async function play(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') return reply({ error: 'method' }, 405)
  if (Number(request.headers.get('content-length')) > 1024) return reply({ error: 'too long' }, 413)
  // sendBeacon posts as text/plain, so the body is read as text whatever the content type
  const p = readPlay(await request.text().then(JSON.parse).catch(() => null))
  if (!p) return reply({ error: 'bad play' }, 422)
  const address = await addressOf(request, env.IP_SALT)
  const update = env.DB.prepare(
    `UPDATE plays SET runs = max(runs, ?), seconds = max(seconds, ?), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE session = ?`,
  ).bind(p.runs, p.seconds, p.session)
  const { meta } = await update.run()
  if (meta.changes > 0) return new Response(null, { status: 204 })
  if (address) {
    const recent = await env.DB.prepare(
      `SELECT count(*) AS n FROM plays WHERE ip_hash = ? AND created_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 hour')`,
    )
      .bind(address)
      .first<number>('n')
    if ((recent ?? 0) >= SESSIONS_PER_HOUR) return reply({ error: 'too many sessions' }, 429)
  }
  const now = new Date()
  await env.DB.prepare(
    'INSERT INTO plays (session, ip_hash, source, week, day, runs, seconds) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT (session) DO NOTHING',
  )
    .bind(p.session, address, p.source, weekOf(now), now.toISOString().slice(0, 10), p.runs, p.seconds)
    .run()
  return new Response(null, { status: 201 })
}
