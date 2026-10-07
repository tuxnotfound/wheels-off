import { useEffect } from 'react'
import GameCanvas from './game/GameCanvas'
import { Hud } from './game/Hud'
import { Arcade } from './game/Arcade'
import { installMusic } from './audio/music'

export default function App() {
  useEffect(installMusic, [])
  return (
    <>
      <GameCanvas />
      <Hud />
      <Arcade />
    </>
  )
}
