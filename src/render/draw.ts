import { hash01 } from '../core/math'
import type { ViewFx } from '../fx/view'
import { crusherAmount, laserHot, laserWarm, platformRect, sweepX } from '../sim/geom'
import { chunkUnder } from '../sim/generator'
import type { BiomeId, Enemy, GhostSample, Platform, Sim } from '../sim/types'

export interface Cam {
  x: number
  y: number
  zoom: number
  anchor: number
  shakeX: number
  shakeY: number
  tilt: number
}

interface Palette {
  top: string
  mid: string
  horizon: string
  hill: string
  hill2: string
  fog: string
  lip: string
  body: string
  body2: string
  accent: string
}

const PAL: Record<BiomeId, Palette> = {
  meadow: { top: '#14182f', mid: '#5c3a4e', horizon: '#f0a15a', hill: '#1d3148', hill2: '#355543', fog: 'rgba(255,220,180,.2)', lip: '#e7ffd4', body: '#6e9464', body2: '#3c5640', accent: '#ffe08a' },
  industrial: { top: '#12151c', mid: '#3a4654', horizon: '#d08a55', hill: '#232830', hill2: '#3e4650', fog: 'rgba(180,190,200,.12)', lip: '#f2d2a2', body: '#6a6258', body2: '#3a342e', accent: '#ffb15a' },
  sky: { top: '#16324a', mid: '#6e88a8', horizon: '#f6d7a8', hill: '#8aa4c4', hill2: '#d5e4f2', fog: 'rgba(255,255,255,.28)', lip: '#ffffff', body: '#d5e7f4', body2: '#8eb0c8', accent: '#fff4cf' },
  neon: { top: '#120818', mid: '#3a1458', horizon: '#ff4f9a', hill: '#1a0e2a', hill2: '#2a1844', fog: 'rgba(255,80,160,.12)', lip: '#9af7ff', body: '#2a2348', body2: '#161228', accent: '#67f7ff' },
  cavern: { top: '#0c1014', mid: '#1c2830', horizon: '#6e8f7a', hill: '#12181c', hill2: '#243038', fog: 'rgba(120,160,140,.1)', lip: '#d5fff0', body: '#3d4e48', body2: '#24302c', accent: '#9ef0c4' },
  inferno: { top: '#1a0c0c', mid: '#6a2418', horizon: '#ff7a3c', hill: '#2a120e', hill2: '#4a2016', fog: 'rgba(255,120,40,.16)', lip: '#ffd0a4', body: '#7a4030', body2: '#3a1c14', accent: '#ffb703' },
  void: { top: '#070712', mid: '#1a1440', horizon: '#6a5cff', hill: '#100e22', hill2: '#221c44', fog: 'rgba(140,120,255,.14)', lip: '#ddd6ff', body: '#3a3470', body2: '#1a1638', accent: '#c4b5fd' },
  machine: { top: '#101216', mid: '#2c3438', horizon: '#8fd0c0', hill: '#1a1e22', hill2: '#2a3238', fog: 'rgba(160,220,210,.1)', lip: '#d8fff6', body: '#4e5c60', body2: '#2a3234', accent: '#7ee0c8' },
  cosmic: { top: '#0e1028', mid: '#2a2060', horizon: '#f0b0ff', hill: '#16142e', hill2: '#2e2858', fog: 'rgba(220,180,255,.14)', lip: '#ffe8ff', body: '#6a5a90', body2: '#2e2648', accent: '#ffd0f0' },
  infinite: { top: '#0a0a12', mid: '#242038', horizon: '#f2c14e', hill: '#16141e', hill2: '#2a2638', fog: 'rgba(255,210,120,.12)', lip: '#fff1c9', body: '#5c5870', body2: '#2a2838', accent: '#ffe08a' },
}

function round(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2))
  ctx.beginPath()
  if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, w, h, radius)
  else ctx.rect(x, y, w, h)
}

function sky(ctx: CanvasRenderingContext2D, w: number, h: number, pal: Palette, heat: number) {
  const g = ctx.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0, pal.top)
  g.addColorStop(0.55, pal.mid)
  g.addColorStop(1, pal.horizon)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
  if (heat > 0.05) {
    ctx.fillStyle = `rgba(255, 90, 40, ${heat * 0.16})`
    ctx.fillRect(0, 0, w, h)
  }
}

function hills(ctx: CanvasRenderingContext2D, w: number, h: number, cam: Cam, pal: Palette) {
  const layers = [
    { color: pal.hill, base: 0.62, amp: 46, freq: 0.0031, parallax: 0.25 },
    { color: pal.hill2, base: 0.74, amp: 28, freq: 0.006, parallax: 0.45 },
  ]
  for (const layer of layers) {
    ctx.beginPath()
    ctx.moveTo(0, h)
    for (let sx = 0; sx <= w; sx += 18) {
      const wx = (cam.x + (sx - cam.anchor) / cam.zoom) * layer.parallax
      const y = h * layer.base + Math.sin(wx * layer.freq) * layer.amp + Math.sin(wx * layer.freq * 2.3 + 1.2) * layer.amp * 0.4
      ctx.lineTo(sx, y)
    }
    ctx.lineTo(w, h)
    ctx.closePath()
    ctx.fillStyle = layer.color
    ctx.fill()
  }
  const sunX = w * 0.78
  const sunY = h * 0.34
  const sun = ctx.createRadialGradient(sunX, sunY, 4, sunX, sunY, 46)
  sun.addColorStop(0, 'rgba(255,236,200,.95)')
  sun.addColorStop(1, 'rgba(255,236,200,0)')
  ctx.fillStyle = sun
  ctx.beginPath()
  ctx.arc(sunX, sunY, 46, 0, Math.PI * 2)
  ctx.fill()
}

function drawPlatform(ctx: CanvasRenderingContext2D, p: Platform, rect: { x: number; y: number; w: number; h: number }, pal: Palette, time: number) {
  const { x, y, w, h } = rect
  round(ctx, x, y, w, h, 8)
  const g = ctx.createLinearGradient(x, y, x, y + h)
  g.addColorStop(0, pal.body)
  g.addColorStop(1, pal.body2)
  ctx.fillStyle = g
  ctx.fill()
  ctx.fillStyle = pal.lip
  ctx.globalAlpha = 0.9
  ctx.fillRect(x + 4, y, Math.max(0, w - 8), 4)
  ctx.globalAlpha = 1
  if (p.flash > 0) {
    ctx.globalAlpha = p.flash * 0.45
    ctx.fillStyle = '#fff'
    ctx.fillRect(x, y, w, h)
    ctx.globalAlpha = 1
  }
  if (p.route === 'expert') {
    ctx.strokeStyle = pal.accent
    ctx.lineWidth = 2
    round(ctx, x + 1, y + 1, w - 2, h - 2, 7)
    ctx.stroke()
  }
  ctx.save()
  ctx.beginPath()
  round(ctx, x, y, w, h, 8)
  ctx.clip()
  ctx.strokeStyle = 'rgba(255,255,255,.35)'
  ctx.lineWidth = 2
  if (p.kind === 'ice') {
    ctx.beginPath()
    ctx.moveTo(x + 8, y + 14)
    ctx.lineTo(x + w - 8, y + 10)
    ctx.stroke()
  } else if (p.kind === 'super' || p.kind === 'launch') {
    for (let i = 16; i < w - 8; i += 22) {
      ctx.beginPath()
      ctx.moveTo(x + i, y + 18)
      ctx.lineTo(x + i + 6, y + 8)
      ctx.lineTo(x + i + 12, y + 18)
      ctx.stroke()
    }
  } else if (p.kind === 'conveyor') {
    const shift = (time * (p.conveyor || 120)) % 18
    for (let i = -18 + shift; i < w; i += 18) {
      ctx.beginPath()
      ctx.moveTo(x + i, y + 16)
      ctx.lineTo(x + i + 8, y + 10)
      ctx.lineTo(x + i, y + 10)
      ctx.stroke()
    }
  } else if (p.kind === 'collapsing' && p.touchedAt > 0) {
    ctx.strokeStyle = 'rgba(40,20,10,.45)'
    ctx.beginPath()
    ctx.moveTo(x + w * 0.3, y + 4)
    ctx.lineTo(x + w * 0.5, y + h)
    ctx.moveTo(x + w * 0.7, y + 2)
    ctx.lineTo(x + w * 0.6, y + h)
    ctx.stroke()
  } else if (p.kind === 'bumper') {
    ctx.beginPath()
    ctx.arc(x + w / 2, y + h / 2, 7, 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.restore()
}

function drawEnemy(ctx: CanvasRenderingContext2D, e: Enemy, colorblind: boolean) {
  ctx.save()
  ctx.translate(e.x, e.y)
  if (e.kind === 'shard') {
    ctx.fillStyle = colorblind ? '#3d8bfd' : '#ff5d73'
    ctx.beginPath()
    ctx.moveTo(0, -e.r)
    ctx.lineTo(e.r, e.r * 0.8)
    ctx.lineTo(-e.r, e.r * 0.8)
    ctx.closePath()
    ctx.fill()
  } else if (e.kind === 'wisp') {
    ctx.fillStyle = e.flash > 0 ? '#fff' : '#ffd37a'
    ctx.beginPath()
    ctx.ellipse(0, 0, e.r * 0.8, e.r, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,.8)'
    ctx.beginPath()
    ctx.arc(-2, -2, 3, 0, Math.PI * 2)
    ctx.fill()
  } else {
    ctx.fillStyle = e.flash > 0 ? '#fff' : '#f2a3c7'
    round(ctx, -e.r, -e.r * 0.8, e.r * 2, e.r * 1.6, e.r)
    ctx.fill()
    ctx.fillStyle = '#1b1220'
    ctx.beginPath()
    ctx.arc(-4, -2, 2, 0, Math.PI * 2)
    ctx.arc(4, -2, 2, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

export function render(opts: {
  ctx: CanvasRenderingContext2D
  sim: Sim
  width: number
  height: number
  dpr: number
  cam: Cam
  fx: ViewFx
  ghost: GhostSample[] | null
  elapsed: number
  colorblind: boolean
  reduced: boolean
  debug: boolean
  flash: number
}) {
  const { ctx, sim, width, height, dpr, cam, fx, colorblind } = opts
  const here = chunkUnder(sim, sim.ball.x)
  const biome = here?.biome ?? sim.biome
  const pal = PAL[biome]
  const heat = Math.min(1, sim.flow / 80)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  sky(ctx, width, height, pal, opts.reduced ? 0 : heat)
  if (biome === 'neon' || biome === 'void' || biome === 'cosmic' || biome === 'infinite' || biome === 'cavern') {
    for (let i = 0; i < 40; i++) {
      const sx = hash01(i * 19.1) * width
      const sy = hash01(i * 7.7) * height * 0.7
      ctx.globalAlpha = 0.25 + hash01(i) * 0.6
      ctx.fillStyle = '#fff'
      ctx.fillRect(sx, sy, hash01(i + 3) > 0.8 ? 2 : 1, hash01(i + 3) > 0.8 ? 2 : 1)
    }
    ctx.globalAlpha = 1
  }
  hills(ctx, width, height, cam, pal)

  ctx.setTransform(dpr * cam.zoom, 0, 0, dpr * cam.zoom, dpr * (cam.anchor - cam.x * cam.zoom + cam.shakeX), dpr * (height * 0.58 - cam.y * cam.zoom + cam.shakeY))
  if (cam.tilt) {
    ctx.translate(cam.x, cam.y)
    ctx.rotate(cam.tilt)
    ctx.translate(-cam.x, -cam.y)
  }

  const danger = colorblind ? '#3d8bfd' : '#ff4d6a'

  for (const chunk of sim.chunks) {
    for (const z of chunk.zones) {
      ctx.fillStyle = z.kind === 'flipgrav' ? 'rgba(160,140,255,.13)' : z.kind === 'wind' ? 'rgba(255,255,255,.06)' : z.kind === 'updraft' ? 'rgba(180,230,255,.1)' : 'rgba(255,255,255,.05)'
      ctx.fillRect(z.x, z.y, z.w, z.h)
    }
    for (const h of chunk.hazards) {
      if (h.kind === 'spikes') {
        ctx.fillStyle = danger
        const n = Math.max(1, Math.floor(h.w / 14))
        for (let i = 0; i < n; i++) {
          const x = h.x + (i * h.w) / n
          ctx.beginPath()
          ctx.moveTo(x, h.y + h.h)
          ctx.lineTo(x + h.w / n / 2, h.y)
          ctx.lineTo(x + h.w / n, h.y + h.h)
          ctx.fill()
        }
      } else if (h.kind === 'laser') {
        const hot = laserHot(h, sim.time)
        const warm = laserWarm(h, sim.time)
        ctx.globalAlpha = hot ? 0.9 : warm ? 0.35 : 0.08
        ctx.fillStyle = hot ? danger : '#ffd0a8'
        ctx.fillRect(h.x, h.y, h.w, h.h)
        ctx.globalAlpha = 1
      } else if (h.kind === 'crusher') {
        const u = crusherAmount(h, sim.time)
        ctx.fillStyle = u > 0.62 ? danger : '#c8b8a4'
        ctx.fillRect(h.x, h.y + u * h.amp, h.w, h.h)
      } else if (h.kind === 'lava') {
        ctx.fillStyle = '#ff6a2a'
        ctx.fillRect(h.x, h.y, h.w, h.h)
      } else if (h.kind === 'sweep' && h.phase > 0) {
        const x = sweepX(h, sim.time)
        const grd = ctx.createLinearGradient(x - 80, 0, x, 0)
        grd.addColorStop(0, 'rgba(255,80,60,0)')
        grd.addColorStop(1, 'rgba(255,80,60,.45)')
        ctx.fillStyle = grd
        ctx.fillRect(x - 90, h.y, 90, h.h)
      }
    }
    for (const p of chunk.platforms) drawPlatform(ctx, p, platformRect(p, sim.time), pal, sim.time)
    for (const e of chunk.enemies) drawEnemy(ctx, e, colorblind)
    for (const item of chunk.pickups) {
      if (item.taken) continue
      const bob = Math.sin(sim.time * 3 + item.bob) * 4
      ctx.save()
      ctx.translate(item.x, item.y + bob)
      ctx.rotate(Math.PI / 4)
      ctx.fillStyle = item.kind === 'fragment' ? '#fff4c2' : item.kind === 'shield' ? '#9ee7ff' : item.kind === 'echo' ? pal.accent : '#fff'
      ctx.fillRect(-7, -7, 14, 14)
      ctx.restore()
    }
    ctx.fillStyle = 'rgba(255,248,236,.8)'
    ctx.font = '14px Outfit, sans-serif'
    ctx.textAlign = 'left'
    for (const s of chunk.signs) ctx.fillText(s.text, s.x, s.y)
    if (opts.debug) {
      ctx.fillStyle = 'rgba(255,255,255,.7)'
      ctx.fillText(`${chunk.moduleId} ${chunk.difficulty.toFixed(2)}`, chunk.x + 12, chunk.floorY - 48)
    }
  }

  if (opts.ghost && opts.ghost.length > 1) {
    const samples = opts.ghost
    ctx.strokeStyle = 'rgba(255,255,255,.25)'
    ctx.lineWidth = 2
    ctx.beginPath()
    let start = samples.findIndex((s) => s.t > sim.stats.time)
    if (start < 0) start = samples.length - 1
    start = Math.max(0, start)
    const from = Math.max(0, start - 8)
    const to = Math.min(samples.length, start + 40)
    for (let i = from; i < to; i++) {
      const s = samples[i]
      if (i === from) ctx.moveTo(s.x, s.y)
      else ctx.lineTo(s.x, s.y)
    }
    ctx.stroke()
    const g = samples[Math.max(0, start)]
    if (g) {
      ctx.globalAlpha = 0.35
      ctx.fillStyle = '#fff'
      ctx.beginPath()
      ctx.arc(g.x, g.y, sim.ball.r * 0.85, 0, Math.PI * 2)
      ctx.fill()
      ctx.globalAlpha = 1
    }
  }

  const b = sim.ball
  if (fx.trail.length > 1) {
    ctx.lineWidth = 4
    ctx.lineCap = 'round'
    ctx.strokeStyle = trailColor(sim)
    ctx.globalAlpha = 0.45
    ctx.beginPath()
    fx.trail.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
    ctx.stroke()
    ctx.globalAlpha = 1
  }

  for (const r of fx.rings) {
    const t = 1 - r.life / r.max
    ctx.globalAlpha = r.life / r.max
    ctx.strokeStyle = r.color
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(r.x, r.y, 10 + t * 36 * r.power, 0, Math.PI * 2)
    ctx.stroke()
    ctx.globalAlpha = 1
  }

  const speed = Math.hypot(b.vx, b.vy)
  const hot = heatColor(sim.flow, speed)
  const stretch = Math.min(0.18, speed / 3200)
  const squash = b.squash
  ctx.save()
  ctx.translate(b.x, b.y)
  ctx.rotate(Math.atan2(b.vy, b.vx || 1))
  ctx.scale(1 + stretch - squash * 0.15, 1 - stretch * 0.35 + squash * 0.22)
  ctx.rotate(b.spin)
  ctx.globalAlpha = 0.35
  ctx.fillStyle = hot
  ctx.beginPath()
  ctx.arc(0, 0, b.r + 7, 0, Math.PI * 2)
  ctx.fill()
  ctx.globalAlpha = 1
  ctx.fillStyle = hot
  ctx.beginPath()
  ctx.arc(0, 0, b.r, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = 'rgba(42, 24, 48, 0.88)'
  ctx.fillRect(-b.r * 0.12, -b.r, b.r * 0.24, b.r * 2)
  ctx.fillStyle = 'rgba(255,255,255,.9)'
  ctx.beginPath()
  ctx.arc(-4, -5, 3.2, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  ctx.globalAlpha = 0.18
  ctx.fillStyle = '#000'
  ctx.beginPath()
  ctx.ellipse(b.x, (here?.floorY ?? b.y) + 18, b.r * 0.9, 5, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.globalAlpha = 1

  for (const p of fx.particles) {
    if (!p.alive) continue
    ctx.globalAlpha = Math.max(0, p.life / p.max)
    ctx.fillStyle = p.color
    ctx.beginPath()
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1
  ctx.font = '700 15px Outfit, sans-serif'
  ctx.textAlign = 'center'
  for (const f of fx.floaters) {
    ctx.globalAlpha = Math.max(0, f.life / f.max)
    ctx.fillStyle = f.color
    ctx.fillText(f.text, f.x, f.y)
  }
  ctx.globalAlpha = 1

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  if (!opts.reduced && speed > 700) {
    ctx.strokeStyle = `rgba(255,255,255,${Math.min(0.25, (speed - 700) / 2000)})`
    ctx.lineWidth = 1
    for (let i = 0; i < 10; i++) {
      const y = ((i * 97 + opts.elapsed * 0.2) % height)
      ctx.beginPath()
      ctx.moveTo(width * 0.2, y)
      ctx.lineTo(width * 0.2 + 40 + (speed - 700) * 0.05, y)
      ctx.stroke()
    }
  }
  const vig = ctx.createRadialGradient(width / 2, height / 2, width * 0.3, width / 2, height / 2, width * 0.72)
  vig.addColorStop(0, 'rgba(0,0,0,0)')
  vig.addColorStop(1, 'rgba(0,0,0,.28)')
  ctx.fillStyle = vig
  ctx.fillRect(0, 0, width, height)
  if (opts.flash > 0.01) {
    ctx.globalAlpha = Math.min(0.45, opts.flash)
    ctx.fillStyle = '#fff8ee'
    ctx.fillRect(0, 0, width, height)
    ctx.globalAlpha = 1
  }
}

function trailColor(sim: Sim): string {
  switch (sim.config.trail) {
    case 'ember':
      return '#ff6b3d'
    case 'ion':
      return '#7ee0ff'
    case 'petal':
      return '#ff9ec8'
    case 'void':
      return '#c4b5fd'
    case 'none':
      return 'rgba(255,255,255,.2)'
    default:
      return '#ffb703'
  }
}

function heatColor(flow: number, speed: number): string {
  if (speed > 900 || flow > 70) return '#ffd0a8'
  if (speed > 640) return '#ffe7c2'
  return '#f7f4ff'
}
