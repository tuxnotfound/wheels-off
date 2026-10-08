import { useEffect } from 'react'
import GameCanvas from './game/GameCanvas'
import { Hud } from './game/Hud'
import { Arcade } from './game/Arcade'
import { installMusic } from './audio/music'
import { useWebGL } from './game/webgl'

export default function App() {
  useEffect(installMusic, [])
  const webgl = useWebGL((s) => s.ok)
  return (
    <>
      {/* without WebGL the canvas would only throw; the landing page says why instead */}
      {webgl && <GameCanvas />}
      <Hud />
      <Arcade />
    </>
  )
}
