// OWNER: workstream 3 (Frontend). A small dependency-free confetti burst.
const COLOURS = ['#11937f', '#fbc95b', '#e5463b', '#8f7479', '#30b0a5', '#ffffff']

export function confetti(originX = 0.5, originY = 0.35, count = 140) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const canvas = document.createElement('canvas')
  Object.assign(canvas.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', pointerEvents: 'none', zIndex: '70' })
  document.body.appendChild(canvas)
  const dpr = window.devicePixelRatio || 1
  canvas.width = innerWidth * dpr
  canvas.height = innerHeight * dpr
  const ctx = canvas.getContext('2d')!
  ctx.scale(dpr, dpr)
  const parts = Array.from({ length: count }, () => {
    const a = Math.random() * Math.PI * 2, v = 6 + Math.random() * 9
    return {
      x: innerWidth * originX, y: innerHeight * originY,
      vx: Math.cos(a) * v, vy: Math.sin(a) * v - 6,
      w: 6 + Math.random() * 6, h: 8 + Math.random() * 8,
      r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.4,
      c: COLOURS[(Math.random() * COLOURS.length) | 0],
    }
  })
  const t0 = performance.now()
  const frame = (t: number) => {
    const life = (t - t0) / 2200
    ctx.clearRect(0, 0, innerWidth, innerHeight)
    for (const p of parts) {
      p.vy += 0.35; p.vx *= 0.985; p.x += p.vx; p.y += p.vy; p.r += p.vr
      ctx.save()
      ctx.globalAlpha = Math.max(0, 1 - life)
      ctx.translate(p.x, p.y); ctx.rotate(p.r)
      ctx.fillStyle = p.c
      ctx.strokeStyle = '#2b2226'
      ctx.lineWidth = 1.2
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h)
      ctx.strokeRect(-p.w / 2, -p.h / 2, p.w, p.h)
      ctx.restore()
    }
    if (life < 1) requestAnimationFrame(frame)
    else canvas.remove()
  }
  requestAnimationFrame(frame)
}
