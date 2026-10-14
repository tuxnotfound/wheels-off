import { leaderboard } from './leaderboard'
import { trial } from './trial'
import type { Env } from './leaderboard'

// The Worker behind the game. It sees every request (run_worker_first in wrangler.toml):
// plain http and www redirect to the one URL, /api/* is the API every player shares, and
// everything else is the built game (dist), served through the assets binding.

const APEX = 'playwheelsoff.com'

export default {
  fetch(request, env) {
    const url = new URL(request.url)
    // CF-Visitor carries the visitor's scheme and only Cloudflare's edge sets it, so
    // wrangler dev (which presents the production URL, http) never redirects.
    const http = request.headers.get('cf-visitor')?.includes('"scheme":"http"') ?? false
    if (url.hostname === `www.${APEX}` || (http && url.hostname === APEX)) {
      url.protocol = 'https:'
      url.hostname = APEX
      return Response.redirect(url.href, 301)
    }
    if (url.pathname === '/api/leaderboard') return leaderboard(request, env)
    if (url.pathname === '/api/trial') return trial(request, env)
    if (url.pathname.startsWith('/api/')) return Response.json({ error: 'not found' }, { status: 404 })
    return env.ASSETS.fetch(request)
  },
} satisfies ExportedHandler<Env & { ASSETS: Fetcher }>
