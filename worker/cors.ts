// A portal build (src/site.ts) calls the API from the portal's own host, so /api/* answers
// those origins with CORS headers; any other origin gets none and the browser keeps the answer
// from it. itch.io serves HTML5 games from html-classic.itch.zone, and its staff suggest
// allowing all of itch.zone, where they expect games to move. CrazyGames runs games on several
// crazygames.com origins (its technical requirements), so all of them. CORS_ORIGINS (comma separated, in
// .dev.vars) adds origins for a local portal build against `wrangler dev`; production has none.

const PORTALS = [/^https:\/\/([a-z0-9-]+\.)*itch\.zone$/, /^https:\/\/([a-z0-9-]+\.)*crazygames\.com$/]

/** The request's origin when it is a portal's (or a local one listed in CORS_ORIGINS), else null. */
export function portalOrigin(request: Request, extra: string | undefined): string | null {
  const origin = request.headers.get('origin')
  if (!origin) return null
  const listed = (extra ?? '').split(',').map((o) => o.trim())
  return PORTALS.some((r) => r.test(origin)) || listed.includes(origin) ? origin : null
}

/** The answer to a browser's preflight: what a portal may send. */
export function preflight(origin: string): Response {
  return new Response(null, {
    status: 204,
    headers: {
      'access-control-allow-origin': origin,
      'access-control-allow-methods': 'GET, POST',
      'access-control-allow-headers': 'content-type',
      'access-control-max-age': '86400',
      vary: 'Origin',
    },
  })
}

/** An API answer, opened to a portal's origin. */
export function withCors(res: Response, origin: string | null): Response {
  if (!origin) return res
  const out = new Response(res.body, res)
  out.headers.set('access-control-allow-origin', origin)
  out.headers.append('vary', 'Origin')
  return out
}
