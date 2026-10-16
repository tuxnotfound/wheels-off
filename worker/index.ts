import { challenge } from './challenge'
import { leaderboard } from './leaderboard'
import { trial } from './trial'
import { forgetOldPlays, play } from './play'
import type { Env } from './leaderboard'
import { portalOrigin, preflight, withCors } from './cors'

// The Worker behind the game. It sees every request (run_worker_first in wrangler.toml):
// plain http and www redirect to the one URL, /api/* is the API every player shares, and
// everything else is the built game (dist), served through the assets binding.

const APEX = 'playwheelsoff.com'

function route(path: string, request: Request, env: Env): Promise<Response> | Response {
  if (path === '/api/challenge') return challenge(request, env)
  if (path === '/api/leaderboard') return leaderboard(request, env)
  if (path === '/api/trial') return trial(request, env)
  if (path === '/api/play') return play(request, env)
  return Response.json({ error: 'not found' }, { status: 404 })
}

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
    if (url.pathname.startsWith('/api/')) {
      // a portal build calls from the portal's host (worker/cors.ts)
      const origin = portalOrigin(request, env.CORS_ORIGINS)
      if (request.method === 'OPTIONS') return origin ? preflight(origin) : new Response(null, { status: 403 })
      return Promise.resolve(route(url.pathname, request, env)).then((res) => withCors(res, origin))
    }
    return env.ASSETS.fetch(request)
  },
  // once a day (triggers in wrangler.toml): play counts older than 13 months go, as the privacy
  // page says
  scheduled(_controller, env, ctx) {
    ctx.waitUntil(forgetOldPlays(env))
  },
} satisfies ExportedHandler<Env & { ASSETS: Fetcher }>
