// Shrinks the PNG textures embedded in a VRM (a GLB container), in place. VRoid exports
// ship a 2048px normal map and a huge thumbnail the cel shader can never show; resampling
// them cuts the file by half or more. Only the binary chunk is rebuilt: the JSON (mesh,
// rig, every VRM extension) is untouched apart from buffer offsets, so the model loads
// exactly as before. Resampling uses sips, so macOS only.
// Usage: node scripts/shrink-vrm.mjs public/art/character.vrm
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const MAX = { color: 1024, normal: 512, thumbnail: 256 } // longest side, per texture kind

const file = process.argv[2]
if (!file) throw new Error('usage: node scripts/shrink-vrm.mjs <file.vrm>')
const glb = readFileSync(file)

// ---------- GLB container ----------
if (glb.readUInt32LE(0) !== 0x46546c67) throw new Error('not a GLB file')
const chunks = []
for (let at = 12; at < glb.readUInt32LE(8); ) {
  const len = glb.readUInt32LE(at)
  chunks.push({ type: glb.readUInt32LE(at + 4), body: glb.subarray(at + 8, at + 8 + len) })
  at += 8 + len
}
const json = JSON.parse(chunks.find((c) => c.type === 0x4e4f534a).body.toString())
const bin = chunks.find((c) => c.type === 0x004e4942).body

// ---------- resample each embedded PNG ----------
const tmp = mkdtempSync(join(tmpdir(), 'shrink-vrm-'))
const sips = (...args) => execFileSync('sips', args, { stdio: ['ignore', 'pipe', 'ignore'] }).toString()
const replaced = new Map() // bufferView index -> new bytes
for (const im of json.images ?? []) {
  if (im.mimeType !== 'image/png' || im.bufferView == null) continue
  const bv = json.bufferViews[im.bufferView]
  const name = im.name ?? `image-${im.bufferView}`
  const max = name === 'Thumbnail' ? MAX.thumbnail : name.endsWith('_nml') ? MAX.normal : MAX.color
  const src = join(tmp, `${im.bufferView}.png`)
  writeFileSync(src, bin.subarray(bv.byteOffset ?? 0, (bv.byteOffset ?? 0) + bv.byteLength))
  const side = Math.max(...[...sips('-g', 'pixelWidth', '-g', 'pixelHeight', src).matchAll(/: (\d+)/g)].map((m) => +m[1]))
  if (side <= max) continue // sips -Z would upscale a smaller image
  const out = join(tmp, `${im.bufferView}-out.png`)
  sips('-Z', String(max), src, '--out', out)
  const bytes = readFileSync(out)
  const note = `${name}: ${side}px ${(bv.byteLength / 1024).toFixed(0)}K -> ${max}px ${(bytes.length / 1024).toFixed(0)}K`
  if (bytes.length >= bv.byteLength) {
    console.log(`${note} (kept: no smaller)`)
    continue
  }
  console.log(note)
  replaced.set(im.bufferView, bytes)
}
rmSync(tmp, { recursive: true })

// ---------- rebuild the binary chunk around the new images ----------
const parts = []
let offset = 0
for (const [i, bv] of json.bufferViews.entries()) {
  const bytes = replaced.get(i) ?? bin.subarray(bv.byteOffset ?? 0, (bv.byteOffset ?? 0) + bv.byteLength)
  parts.push(bytes)
  bv.byteOffset = offset
  bv.byteLength = bytes.length
  offset += bytes.length
  if (offset % 4) parts.push(Buffer.alloc(4 - (offset % 4))), (offset += 4 - (offset % 4))
}
const newBin = Buffer.concat(parts)
json.buffers[0].byteLength = newBin.length

let jsonBody = Buffer.from(JSON.stringify(json))
if (jsonBody.length % 4) jsonBody = Buffer.concat([jsonBody, Buffer.alloc(4 - (jsonBody.length % 4), 0x20)])
const header = Buffer.alloc(12 + 8), binHeader = Buffer.alloc(8)
header.writeUInt32LE(0x46546c67, 0)
header.writeUInt32LE(2, 4)
header.writeUInt32LE(12 + 8 + jsonBody.length + 8 + newBin.length, 8)
header.writeUInt32LE(jsonBody.length, 12)
header.writeUInt32LE(0x4e4f534a, 16)
binHeader.writeUInt32LE(newBin.length, 0)
binHeader.writeUInt32LE(0x004e4942, 4)
writeFileSync(file, Buffer.concat([header, jsonBody, binHeader, newBin]))
console.log(`${file}: ${(glb.length / 1e6).toFixed(1)} MB -> ${((12 + 8 + jsonBody.length + 8 + newBin.length) / 1e6).toFixed(1)} MB`)
