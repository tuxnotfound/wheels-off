import { cleanName, nameAllowed, weekOf } from '../shared/leaderboard'
import { checkTrial } from '../shared/trial'
import type { Ghost } from '../shared/trial'
import { addressOf, reply } from './leaderboard'
import type { Env } from './leaderboard'

// /api/challenge: challenge links (migrations/0006_challenges.sql). POST stores a finished time
// trial run that a player is sharing (an optional name, the time and its ghost, checked as the
// board checks it) and returns its id, for the link /?c=<id>. GET ?id= returns the run, so the
// friend who opens the link races its ghost; the game uses it only in the week it was set.

const MAX_BODY = 128 * 1024 // as /api/trial: the longest ghost is about 70 KB
const PER_HOUR = 20 // challenges one address may make in an hour
const ID = /^[a-z2-9]{8}$/
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789' // no 0, 1, i, l or o to misread

function newId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('')
}

export function challenge(request: Request, env: Env): Promise<Response> | Response {
  if (request.method === 'GET') return readChallenge(new URL(request.url).searchParams.get('id') ?? '', env)
  if (request.method === 'POST') return makeChallenge(request, env)
  return reply({ error: 'method' }, 405)
}

async function readChallenge(id: string, env: Env): Promise<Response> {
  if (!ID.test(id)) return reply({ error: 'not found' }, 404)
  const row = await env.DB.prepare('SELECT id, name, week, time, ghost FROM challenges WHERE id = ?')
    .bind(id)
    .first<{ id: string; name: string | null; week: string; time: number; ghost: string }>()
  if (!row) return reply({ error: 'not found' }, 404)
  return reply({ ...row, ghost: JSON.parse(row.ghost) as Ghost })
}

async function makeChallenge(request: Request, env: Env): Promise<Response> {
  if (Number(request.headers.get('content-length')) > MAX_BODY) return reply({ error: 'too long' }, 413)
  const body = (await request.json().catch(() => null)) as { name?: unknown; time?: unknown; ghost?: unknown } | null
  const wrong = checkTrial(body?.time, body?.ghost)
  if (wrong) return reply({ error: wrong }, 422)
  // the name is optional here: a run off the board may have none, and a refused one is dropped
  const typed = typeof body?.name === 'string' ? cleanName(body.name) : ''
  const name = typed && nameAllowed(typed) ? typed : null
  const { x, z, y, r } = body!.ghost as Ghost
  const address = await addressOf(request, env.IP_SALT)
  if (address) {
    const recent = await env.DB.prepare(
      `SELECT count(*) AS n FROM challenges WHERE ip_hash = ? AND created_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 hour')`,
    )
      .bind(address)
      .first<number>('n')
    if ((recent ?? 0) >= PER_HOUR) return reply({ error: 'too many challenges' }, 429)
  }
  const time = Math.round((body!.time as number) * 1000) / 1000
  const ghost = JSON.stringify({ x, z, y, r })
  const week = weekOf(new Date())
  // a clash of two random ids is about one in 850 billion; one retry covers it
  for (let attempt = 0; attempt < 2; attempt++) {
    const id = newId()
    const { meta } = await env.DB.prepare(
      'INSERT INTO challenges (id, name, week, time, ghost, ip_hash) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING',
    )
      .bind(id, name, week, time, ghost, address)
      .run()
    if (meta.changes > 0) return reply({ id }, 201)
  }
  return reply({ error: 'try again' }, 503)
}
