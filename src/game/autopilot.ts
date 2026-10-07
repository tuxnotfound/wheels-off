import { input } from '../player/input'
import { BLOCK, TURN_R } from '../world/worldConfig'
import { sim } from './sim'

// The attract ride behind the landing page. Until someone takes over, the kid cruises the town
// on their own: straight down the street, carving now and then, with an ollie or a kickflip
// every few seconds. It drives the same input the keyboard does, and it runs under free roam's
// rules (mode.ts), so there is nothing to hit and nothing is scored.

const pilot = { nextTrick: 3, nextCarve: 4, carveUntil: 0, side: 1 }

/** Steps the autopilot, before the sim, on every frame before anyone has taken over. */
export function autopilot() {
  const t = sim.time
  // no carving near an intersection: steering there takes the side street, and the landing
  // shot looks back down this one
  const toCorner = (Math.floor((sim.u + TURN_R) / BLOCK) + 1) * BLOCK - TURN_R - sim.u
  const clear = !sim.arc && toCorner > 14
  if (t >= pilot.nextCarve && clear) {
    pilot.side = -pilot.side
    pilot.carveUntil = t + 0.3 + Math.random() * 0.25
    pilot.nextCarve = t + 2.2 + Math.random() * 2.5
  }
  input.x = t < pilot.carveUntil && clear ? pilot.side : 0
  if (t >= pilot.nextTrick && sim.grounded && sim.speed > 6) {
    input.jumpBuffer = 0.15
    if (Math.random() < 0.4) input.flipBuffer = 0.2
    pilot.nextTrick = t + 3.5 + Math.random() * 4
  }
}
