// Where the game runs. On playwheelsoff.com every request stays on the one origin. A portal build
// (`npm run build:itch`, VITE_PORTAL=itch) runs in the portal's frame, on the portal's own host
// and in a subfolder there: files load by relative path (Vite's base is './'), and the API, the
// privacy page and every shared link point back at the game's site, whose Worker lets the
// portal's origin in (worker/cors.ts).

/** The game's own site. VITE_SITE points a local portal build at `wrangler dev` (README, Portals). */
export const SITE: string = import.meta.env.VITE_SITE ?? 'https://playwheelsoff.com'

/** The portal this build is for ('itch'), or '' on the game's own site. */
export const PORTAL: string = import.meta.env.VITE_PORTAL ?? ''

/** An API route: on this origin at home, on the game's site from a portal. */
export const api = (route: string) => `${PORTAL ? SITE : ''}/api/${route}`

/** A file shipped with the game (public/), by a path that also works in a portal's subfolder. */
export const asset = (path: string) => `${import.meta.env.BASE_URL}${path}`
