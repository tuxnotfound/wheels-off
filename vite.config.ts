import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// Openstage's view counter and page link in index.html are for playwheelsoff.com only, so a portal
// build drops both.
function siteOnly(): Plugin {
  let portal = ''
  return {
    name: 'site-only',
    configResolved: (config) => {
      portal = config.env.VITE_PORTAL ?? ''
    },
    transformIndexHtml: (html) =>
      portal
        ? html
            .replace(/\s*<!-- Openstage's view counter[\s\S]*?<\/script>/, '')
            .replace(/\s*<!-- Openstage's page link[\s\S]*?<\/noscript>/, '')
        : html,
  }
}

export default defineConfig({
  plugins: [react(), siteOnly()],
  // relative paths in the build, so it also runs from a portal's subfolder (src/site.ts)
  base: './',
  // /api is the leaderboard API, served by `npm run api` (wrangler, on 8788) next to this.
  server: { port: 5173, host: true, proxy: { '/api': 'http://localhost:8788' } },
  // Pre-bundle the heavy 3D libs so the first dev load is fast.
  optimizeDeps: { include: ['three', '@react-three/fiber', '@react-three/drei', 'maath'] },
  build: { target: 'es2022', sourcemap: true },
})
