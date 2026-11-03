// A virtual clock for recording the game (scripts/preview-media.mjs), run in the page before its
// own scripts. Until __vstart(), time is real. After it, time moves only on __vstep(ms):
// performance.now, Date.now, animation frames, timers set from then on, and CSS animations all
// follow it, so every frame is drawn at an exact time however slowly the machine renders it.
// __V.tick, if set, runs at each step before the frame (the recording's rider).
;(() => {
  const nRaf = window.requestAnimationFrame.bind(window)
  const nCaf = window.cancelAnimationFrame.bind(window)
  const nNow = performance.now.bind(performance)
  const nDate = Date.now
  const nST = window.setTimeout.bind(window)
  const nCT = window.clearTimeout.bind(window)
  const nSI = window.setInterval.bind(window)
  const nCI = window.clearInterval.bind(window)
  const V = { on: false, now: 0, base: 0, rafs: new Map(), nextRaf: 1e9, timers: new Map(), nextTimer: 2e9, tick: null }
  window.__V = V

  performance.now = () => (V.on ? V.now : nNow())
  Date.now = () => (V.on ? V.base + V.now : nDate())
  window.requestAnimationFrame = (cb) => {
    if (!V.on) return nRaf(cb)
    const id = V.nextRaf++
    V.rafs.set(id, cb)
    return id
  }
  window.cancelAnimationFrame = (id) => (V.rafs.has(id) ? V.rafs.delete(id) : nCaf(id))
  const add = (fn, ms, args, every) => {
    const id = V.nextTimer++
    V.timers.set(id, { due: V.now + Math.max(0, +ms || 0), fn, args, every })
    return id
  }
  window.setTimeout = (fn, ms, ...args) => (V.on && typeof fn === 'function' ? add(fn, ms, args, 0) : nST(fn, ms, ...args))
  window.setInterval = (fn, ms, ...args) =>
    V.on && typeof fn === 'function' ? add(fn, ms, args, Math.max(1, +ms || 1)) : nSI(fn, ms, ...args)
  window.clearTimeout = (id) => (V.timers.has(id) ? V.timers.delete(id) : nCT(id))
  window.clearInterval = (id) => (V.timers.has(id) ? V.timers.delete(id) : nCI(id))

  // a little past real time, so the frame already asked of the browser never draws after a step
  window.__vstart = () => {
    V.base = nDate() - nNow()
    V.now = nNow() + 100
    V.on = true
  }
  const settle = () =>
    new Promise((r) => {
      const ch = new MessageChannel()
      ch.port1.onmessage = () => r()
      ch.port2.postMessage(0)
    })
  window.__vstep = async (ms) => {
    V.now += ms
    for (;;) {
      let next = null
      for (const [id, t] of V.timers) if (t.due <= V.now && (!next || t.due < next[1].due)) next = [id, t]
      if (!next) break
      const [id, t] = next
      if (t.every) t.due += t.every
      else V.timers.delete(id)
      try {
        t.fn(...t.args)
      } catch (e) {
        console.error(e)
      }
    }
    if (V.tick) V.tick()
    const cbs = [...V.rafs.values()]
    V.rafs.clear()
    for (const cb of cbs) cb(V.now)
    await settle() // React commits what the frame changed
    for (const a of document.getAnimations()) {
      if (a.__v0 === undefined) {
        a.__v0 = V.now - (a.currentTime ?? 0)
        a.pause()
      }
      a.currentTime = V.now - a.__v0
    }
  }
})()
