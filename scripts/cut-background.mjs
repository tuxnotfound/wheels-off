// The background cut both importers share (import-art.mjs, import-vehicle.mjs). It runs in the
// page, passed in as source text, so it uses nothing from outside itself. `px` is an ImageData's
// pixels; returns bg, 1 where the background was found, and its median color.
export function cutBackground(px, W, H, tol) {
  // the background: the median of the border's colors, channel by channel
  const border = []
  for (let x = 0; x < W; x++) border.push(x, x + (H - 1) * W)
  for (let y = 0; y < H; y++) border.push(y * W, W - 1 + y * W)
  const med = [0, 1, 2].map((ch) => {
    const v = border.map((i) => px[i * 4 + ch]).sort((a, b) => a - b)
    return v[v.length >> 1]
  })
  const dist = (i) => Math.abs(px[i * 4] - med[0]) + Math.abs(px[i * 4 + 1] - med[1]) + Math.abs(px[i * 4 + 2] - med[2])
  const near = (i) => dist(i) <= tol * 3
  const around = (i) => {
    const x = i % W
    return [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W].filter((j) => j >= 0 && j < W * H)
  }

  // flood fill: background is what the fill reaches
  const bg = new Uint8Array(W * H)
  const flood = (stack) => {
    for (const i of stack) bg[i] = 1
    while (stack.length) {
      for (const j of around(stack.pop())) {
        if (!bg[j] && near(j)) {
          bg[j] = 1
          stack.push(j)
        }
      }
    }
  }
  // from the borders, then from pockets the building closes off (between a pipe and the
  // wall): patches of at least 16 pixels in the background's own color, closer than the
  // flood's tolerance, so a pink wall or awning near it never seeds one
  flood(border.filter(near))
  const seen = new Uint8Array(W * H)
  for (let i = 0; i < W * H; i++) {
    if (bg[i] || seen[i] || dist(i) > tol) continue
    const patch = [i]
    seen[i] = 1
    for (let k = 0; k < patch.length; k++) {
      for (const j of around(patch[k])) {
        if (!bg[j] && !seen[j] && dist(j) <= tol) {
          seen[j] = 1
          patch.push(j)
        }
      }
    }
    if (patch.length >= 16) flood(patch)
  }
  return { bg, med }
}
