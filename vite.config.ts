import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // /api is the leaderboard API, served by `npm run api` (wrangler, on 8788) next to this.
  server: { port: 5173, host: true, proxy: { '/api': 'http://localhost:8788' } },
  // Pre-bundle the heavy 3D libs so the first dev load is fast.
  optimizeDeps: { include: ['three', '@react-three/fiber', '@react-three/drei', 'maath'] },
  build: { target: 'es2022', sourcemap: true },
})
