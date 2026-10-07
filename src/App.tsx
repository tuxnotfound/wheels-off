import GameCanvas from './game/GameCanvas'
import { Hud } from './game/Hud'
import { Arcade } from './game/Arcade'

export default function App() {
  return (
    <>
      <GameCanvas />
      <Hud />
      <Arcade />
    </>
  )
}
