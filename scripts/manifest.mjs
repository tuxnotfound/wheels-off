// Reading and writing public/art/manifest.json for the importers (import-art.mjs, import-vehicle.mjs).
import { readFileSync, writeFileSync } from 'node:fs'

export const MANIFEST = 'public/art/manifest.json'
export const readManifest = () => JSON.parse(readFileSync(MANIFEST, 'utf8'))

/**
 * Writes it back two-space indented, with every array of numbers, and every array of those, on
 * one line: a vehicle's outline of a hundred samples is one line, not a hundred.
 */
export function writeManifest(m) {
  const num = '-?\\d+(?:\\.\\d+)?(?:e[+-]?\\d+)?'
  const s = JSON.stringify(m, null, 2)
    .replace(new RegExp(`\\[\\s*(${num}(?:,\\s*${num})*)\\s*\\]`, 'g'), (_, a) => `[${a.split(/,\s*/).join(', ')}]`)
    .replace(/\[\s*(\[[^[\]]*\](?:,\s*\[[^[\]]*\])*)\s*\]/g, (_, a) => `[${a.split(/\],\s*\[/).join('], [')}]`)
  writeFileSync(MANIFEST, `${s}\n`)
}
