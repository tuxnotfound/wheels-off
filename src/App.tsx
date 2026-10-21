import { useEffect } from 'react'
import GameCanvas from './game/GameCanvas'
import { Hud } from './game/Hud'
import { Arcade } from './game/Arcade'
import { installMusic } from './audio/music'
import { useWebGL } from './game/webgl'
import { TouchControls } from './game/TouchControls'
import { touchDevice } from './player/touch'

export default function App() {
  useEffect(installMusic, [])
  const webgl = useWebGL((s) => s.ok)
  return (
    <>
      {/* without WebGL the canvas would only throw; the landing page says why instead */}
      {webgl && <GameCanvas />}
      <Hud />
      <TouchControls />
      <Arcade />
      {/* a phone held upright: the game wants it sideways (shown by the styles in portrait only) */}
      {touchDevice && (
        <div className="rotate" role="alert">
          <p className="rotate__title">TURN YOUR PHONE SIDEWAYS</p>
          <p className="rotate__jp">横向きにしてください</p>
        </div>
      )}
    </>
  )
}
