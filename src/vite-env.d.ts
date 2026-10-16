/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** The portal a build is for ('itch'); unset on the game's own site (src/site.ts). */
  readonly VITE_PORTAL?: string
  /** The game's site, for a local portal build against `wrangler dev` (src/site.ts). */
  readonly VITE_SITE?: string
}
