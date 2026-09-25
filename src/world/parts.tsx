import type * as THREE from 'three'
import { BLOB, BOX, CYL, HALF_CYL, PANEL, PRISM, SMALL_BOX, TRI } from '../look/geom'
import { decalMat, facadeMats, toonMat } from '../look/materials'
import { facadeTex, glassTex, shutterTex, signTex, vendingTex } from '../look/textures'
import { FLOOR_H, SIDEWALK } from './worldConfig'
import type { Lot } from './streetGen'

type V3 = [number, number, number]

/** One mesh from shared geometry + shared material. */
export function M({
  g = SMALL_BOX,
  c,
  m,
  p,
  s,
  r,
}: {
  g?: THREE.BufferGeometry
  c?: string
  m?: THREE.Material | THREE.Material[]
  p: V3
  s: V3
  r?: V3
}) {
  return <mesh geometry={g} material={m ?? toonMat(c!)} position={p} scale={s} rotation={r} />
}

// Block-local frame: +x is the right of the street, -z is "forward" (u grows).
const at = (s: number, y: number, u: number): V3 => [s, y, -u]

export function Tree({ s, u, r }: { s: number; u: number; r: number }) {
  const h = 2 + r * 1.6
  return (
    <group position={at(s, 0, u)}>
      <M g={CYL} c="#8a6f5a" p={[0, h / 2, 0]} s={[0.28, h, 0.28]} />
      <M g={BLOB} c="#7fae6e" p={[0, h + 0.4, 0]} s={[2.4, 2, 2.4]} />
      <M g={BLOB} c="#6a9c5e" p={[0.7, h - 0.2, 0.4]} s={[1.6, 1.4, 1.6]} />
      <M g={BLOB} c="#93bf7c" p={[-0.5, h + 1.1, -0.3]} s={[1.4, 1.2, 1.4]} />
    </group>
  )
}

export function UtilityPole({ s, u, transformer }: { s: number; u: number; transformer: boolean }) {
  return (
    <group position={at(s, 0, u)}>
      <M g={CYL} c="#9a9d95" p={[0, 4, 0]} s={[0.26, 8, 0.26]} />
      <M c="#7d817a" p={[0, 7.45, 0]} s={[1.6, 0.12, 0.14]} />
      <M c="#7d817a" p={[0, 6.9, 0]} s={[1.0, 0.1, 0.12]} />
      {transformer && <M g={CYL} c="#aab0a8" p={[0.32 * Math.sign(-s), 6.1, 0]} s={[0.5, 0.9, 0.5]} />}
      <M c="#e8b64a" p={[0, 2.2, 0.14]} s={[0.3, 0.9, 0.04]} />
    </group>
  )
}

export function StopSign({ s, u }: { s: number; u: number }) {
  return (
    <group position={at(s, 0, u)}>
      <M g={CYL} c="#b9bdb5" p={[0, 1.2, 0]} s={[0.09, 2.4, 0.09]} />
      <M g={TRI} c="#d9533f" p={[0, 2.35, 0.06]} s={[0.95, 0.9, 0.06]} />
    </group>
  )
}

export function Mailbox({ s, u }: { s: number; u: number }) {
  return (
    <group position={at(s, 0, u)}>
      <M c="#d24a3c" p={[0, 0.55, 0]} s={[0.5, 1.1, 0.45]} />
      <M g={HALF_CYL} c="#d24a3c" p={[0, 1.1, 0]} s={[0.5, 0.5, 0.45]} />
      <M c="#2b3634" p={[0, 0.85, 0.23]} s={[0.3, 0.05, 0.02]} />
    </group>
  )
}

export function Vending({ s, u, color, side }: { s: number; u: number; color: string; side: number }) {
  return (
    <group position={at(s, 0, u)}>
      <M c={color} p={[0, 0.9, 0]} s={[0.8, 1.8, 0.95]} />
      <M g={PANEL} m={decalMat('vending', vendingTex())} p={[-side * 0.41, 0.95, 0]} s={[0.82, 1.64, 1]} r={[0, (-side * Math.PI) / 2, 0]} />
    </group>
  )
}

export function KeiTruck({ s, u }: { s: number; u: number }) {
  return (
    <group position={at(s, 0, u)}>
      <M c="#3b3f3e" p={[0, 0.45, 0.2]} s={[1.3, 0.3, 3.3]} />
      <M c="#eef0ea" p={[0, 1.1, -1.05]} s={[1.5, 1.2, 1.1]} />
      <M c="#46605d" p={[0, 1.38, -1.12]} s={[1.42, 0.46, 1.0]} />
      <M c="#eef0ea" p={[0, 0.85, 0.7]} s={[1.5, 0.45, 2.1]} />
      <M c="#c9ccc4" p={[0, 0.98, 0.7]} s={[1.3, 0.25, 1.9]} />
      {[
        [-0.7, -0.9],
        [0.7, -0.9],
        [-0.7, 1.3],
        [0.7, 1.3],
      ].map(([x, z], i) => (
        <M key={i} g={CYL} c="#2b3634" p={[x, 0.26, z]} s={[0.52, 0.22, 0.52]} r={[0, 0, Math.PI / 2]} />
      ))}
    </group>
  )
}

/** A lot: building (with shop front, balconies, roof details) or a block wall + trees. */
export function LotView({ lot, half }: { lot: Lot; half: number }) {
  const sd = lot.side
  const front = half + SIDEWALK + 0.3
  const cu = lot.a + lot.len / 2
  const face = -sd // the road is on this side of the lot, along x
  const toward = (d: number) => sd * (front - d) // s just in front of the facade

  if (lot.kind === 'wall') {
    const trees = lot.len > 5 ? 2 : 1
    return (
      <group>
        <M g={BOX} m={facadeMats('#d5d8cf', '#c3c7bd', facadeTex('block'), 'block')} p={at(sd * (front + 0.2), 0.75, cu)} s={[0.35, 1.5, lot.len]} />
        {Array.from({ length: trees }, (_, i) => (
          <Tree key={i} s={sd * (front + 2.6 + lot.r * 1.5)} u={lot.a + (lot.len * (i + 0.5)) / trees} r={(lot.r2 + i * 0.37) % 1} />
        ))}
        {lot.vending && <Vending s={toward(0.5)} u={lot.a + 0.8} color={lot.vending} side={sd} />}
      </group>
    )
  }

  const H = lot.floors * FLOOR_H
  const sx = sd * (front + lot.depth / 2)
  const mats = facadeMats(lot.wall, lot.roof, facadeTex(lot.style), lot.style)
  return (
    <group>
      <M g={BOX} m={mats} p={at(sx, H / 2, cu)} s={[lot.depth, H, lot.len]} />
      {lot.kind === 'house' ? (
        <M g={PRISM} c={lot.roof} p={at(sx, H + 0.75, cu)} s={[lot.depth + 0.8, 1.5, lot.len + 0.6]} />
      ) : (
        <M c={lot.roof} p={at(sx, H + 0.2, cu)} s={[lot.depth + 0.2, 0.4, lot.len + 0.2]} />
      )}
      {lot.tank && (
        <group position={at(sx + sd * lot.depth * 0.2, H + 0.4, lot.a + lot.len * (0.3 + lot.r * 0.4))}>
          <M g={CYL} c="#9cc79a" p={[0, 1.4, 0]} s={[1.9, 1.5, 1.9]} />
          <M g={CYL} c="#7da87b" p={[0, 2.2, 0]} s={[1.5, 0.2, 1.5]} />
          <M c="#8e928c" p={[0, 0.4, 0]} s={[1.4, 0.8, 1.4]} />
        </group>
      )}
      {lot.kind === 'apt' &&
        Array.from({ length: lot.floors - 1 }, (_, f) => (
          <M key={f} c="#f4f1e8" p={at(toward(0.35), (f + 1) * FLOOR_H + 0.45, cu)} s={[0.7, 0.9, lot.len - 0.6]} />
        ))}
      {lot.kind === 'house' && lot.r > 0.4 && <M c="#e9ece6" p={at(toward(0.2), FLOOR_H + 1.0, lot.a + 0.9)} s={[0.4, 0.55, 0.8]} />}
      {lot.kind === 'shop' && lot.sign && (
        <>
          <M
            g={PANEL}
            m={decalMat(lot.r > 0.5 ? 'glass' : 'shutter', lot.r > 0.5 ? glassTex() : shutterTex())}
            p={at(toward(0.02), 1.25, cu)}
            s={[lot.len - 0.8, 2.5, 1]}
            r={[0, (face * Math.PI) / 2, 0]}
          />
          <M c={lot.sign.color} p={at(toward(0.6), 2.75, cu)} s={[1.2, 0.12, lot.len - 0.4]} r={[0, 0, sd * 0.28]} />
          {lot.sign.vertical ? (
            <M
              m={decalMat(`sign-v:${lot.sign.word}:${lot.sign.color}`, signTex(lot.sign.word, lot.sign.color, true))}
              p={at(toward(0.6), FLOOR_H + 1.6, lot.a + 0.5)}
              s={[0.8, 3, 0.12]}
            />
          ) : (
            <M
              g={PANEL}
              m={decalMat(`sign-h:${lot.sign.word}:${lot.sign.color}`, signTex(lot.sign.word, lot.sign.color, false))}
              p={at(toward(0.05), 3.4, cu)}
              s={[Math.min(lot.len - 1, 4.6), 1.1, 1]}
              r={[0, (face * Math.PI) / 2, 0]}
            />
          )}
        </>
      )}
      {lot.vending && <Vending s={toward(0.5)} u={lot.a + lot.len - 0.7} color={lot.vending} side={sd} />}
    </group>
  )
}
