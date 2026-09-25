import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { loadArt } from './art/art'
import './styles.css'

// preload the painted art before the town is generated from it
loadArt().then(() =>
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  ),
)
