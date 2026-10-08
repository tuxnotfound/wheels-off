import { leaderboard } from './leaderboard'
import type { Env } from './leaderboard'

// The Worker behind the game. Cloudflare serves the built game (dist) as static assets and runs
// this only for /api/* (run_worker_first in wrangler.toml): the API every player shares.
export default {
  fetch(request, env) {
    const { pathname } = new URL(request.url)
    if (pathname === '/api/leaderboard') return leaderboard(request, env)
    return Response.json({ error: 'not found' }, { status: 404 })
  },
} satisfies ExportedHandler<Env>
