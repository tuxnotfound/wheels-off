import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { characterUrl, loadArt } from './art/art'
import { loadRig } from './player/VrmRider'
import './styles.css'

// preload the painted art (the town is generated from it) and the character, so
// nothing parses or pops in mid-ride
loadArt()
  .then(() => {
    const url = characterUrl()
    return url ? loadRig(url) : null
  })
  .then(() =>
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <App />
      </StrictMode>,
    ),
  )
