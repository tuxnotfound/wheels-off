import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import Boot from './Boot'
import './styles.css'

// Boot mounts at once over the static splash in index.html and downloads the town behind
// a progress bar (see Boot.tsx), so nothing parses or pops in mid-ride and a slow
// connection never stares at a white page.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Boot />
  </StrictMode>,
)
