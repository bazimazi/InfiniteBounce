import { damp, hash01 } from '../core/math'
import type { ViewFx } from '../fx/view'
import { crusherAmount, laserHot, laserWarm, platformRect, sweepX } from '../sim/geom'
import { chunkUnder } from '../sim/generator'
import type { BiomeId, CoreId, Enemy, GhostSample, Hazard, Pickup, Platform, Rect, Sim, TrailId, Zone } from '../sim/types'

export interface Cam {
  x: number
  y: number
  zoom: number
  anchor: number
  shakeX: number
  shakeY: number
  tilt: number
}

/* ------------------------------------------------------------------ colour */

type RGB = [number, number, number]

function rgb(hex: string): RGB {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.replace(/./g, (c) => c + c) : h, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function css(c: RGB, a = 1): string {
  return a >= 1 ? `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})` : `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a.toFixed(3)})`
}

function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

function alpha(hex: string, a: number): string {
  return css(rgb(hex), a)
}

/* ------------------------------------------------------------------- looks */

type LayerKind = 'soft' | 'jag' | 'city' | 'factory' | 'cloud' | 'cave' | 'islands'
type Deco = 'pines' | 'trees' | 'windows' | 'lights' | 'crystals' | null
type Celestial = 'sun' | 'synth' | 'planet' | 'eclipse' | 'shafts' | 'none'
type Weather = 'pollen' | 'ash' | 'wind' | 'rain' | 'dust' | 'embers' | 'motes' | 'sparks' | 'glitter' | 'gold'
type Cap = 'grass' | 'metal' | 'cloud' | 'neon' | 'crystal' | 'rock' | 'glow'

interface Layer {
  kind: LayerKind
  color: string
  base: number
  amp: number
  freq: number
  par: number
  seed: number
  deco: Deco
}

interface Look {
  top: string
  mid: string
  horizon: string
  celestial: Celestial
  sunX: number
  sunY: number
  sunR: number
  sun: string
  sunGlow: string
  stars: number
  nebula: boolean
  fog: string
  fogA: number
  layers: Layer[]
  weather: Weather
  cap: Cap
  body: string
  body2: string
  lip: string
  accent: string
  dust: string
}

const L = (kind: LayerKind, color: string, base: number, amp: number, freq: number, par: number, seed: number, deco: Deco = null): Layer => ({
  kind, color, base, amp, freq, par, seed, deco,
})

const LOOKS: Record<BiomeId, Look> = {
  meadow: {
    top: '#1b1d3a', mid: '#6b3f5c', horizon: '#f4a868',
    celestial: 'sun', sunX: 0.74, sunY: 0.5, sunR: 38, sun: '#fff1cf', sunGlow: '#ffa860',
    stars: 0.35, nebula: false, fog: '#ffc9a0', fogA: 0.32,
    layers: [
      L('soft', '#b77478', 0.6, 110, 0.0024, 0.06, 1),
      L('soft', '#6c4a6c', 0.68, 60, 0.004, 0.16, 2, 'pines'),
      L('soft', '#2f344d', 0.8, 34, 0.006, 0.34, 3, 'trees'),
    ],
    weather: 'pollen', cap: 'grass',
    body: '#6e9464', body2: '#33483a', lip: '#c3f08a', accent: '#ffe08a', dust: '#e8ffd0',
  },
  industrial: {
    top: '#14171f', mid: '#3d4552', horizon: '#d98c55',
    celestial: 'sun', sunX: 0.3, sunY: 0.54, sunR: 54, sun: '#ffd9a8', sunGlow: '#ff9a4a',
    stars: 0, nebula: false, fog: '#c9a08a', fogA: 0.3,
    layers: [
      L('factory', '#6b5a58', 0.62, 120, 0, 0.07, 4),
      L('factory', '#3c3a42', 0.7, 90, 0, 0.18, 5, 'lights'),
      L('jag', '#1e2027', 0.84, 40, 0.005, 0.4, 6),
    ],
    weather: 'ash', cap: 'metal',
    body: '#6a6258', body2: '#2e2a26', lip: '#f2d2a2', accent: '#ffb15a', dust: '#d8c8b0',
  },
  sky: {
    top: '#2a5a8a', mid: '#7fb0d8', horizon: '#ffe6bd',
    celestial: 'sun', sunX: 0.72, sunY: 0.22, sunR: 34, sun: '#fffdf0', sunGlow: '#fff2c0',
    stars: 0, nebula: false, fog: '#ffffff', fogA: 0.3,
    layers: [
      L('cloud', '#f6efff', 0.62, 70, 0, 0.05, 7),
      L('cloud', '#dce7f5', 0.74, 60, 0, 0.14, 8),
      L('cloud', '#bcd1ea', 0.87, 50, 0, 0.3, 9),
    ],
    weather: 'wind', cap: 'cloud',
    body: '#f2f8ff', body2: '#7896ba', lip: '#ffffff', accent: '#ffe08a', dust: '#ffffff',
  },
  neon: {
    top: '#0d0618', mid: '#3a1458', horizon: '#ff4f9a',
    celestial: 'synth', sunX: 0.5, sunY: 0.56, sunR: 96, sun: '#ffd35a', sunGlow: '#ff4f9a',
    stars: 0.7, nebula: false, fog: '#ff4fa0', fogA: 0.16,
    layers: [
      L('city', '#2b1548', 0.64, 150, 0, 0.06, 10, 'windows'),
      L('city', '#1a0c2e', 0.72, 120, 0, 0.16, 11, 'windows'),
      L('city', '#0c0716', 0.86, 70, 0, 0.36, 12),
    ],
    weather: 'rain', cap: 'neon',
    body: '#231b3d', body2: '#0f0b1d', lip: '#67f7ff', accent: '#ff4fd8', dust: '#9af7ff',
  },
  cavern: {
    top: '#06090b', mid: '#12201e', horizon: '#3d5e52',
    celestial: 'shafts', sunX: 0.6, sunY: 0, sunR: 0, sun: '#bfffe4', sunGlow: '#9ef0c4',
    stars: 0, nebula: false, fog: '#6e9f8a', fogA: 0.16,
    layers: [
      L('cave', '#1d2b29', 0.64, 60, 0.004, 0.08, 13),
      L('jag', '#131c1b', 0.74, 70, 0.005, 0.2, 14, 'crystals'),
      L('jag', '#0a1010', 0.86, 40, 0.008, 0.42, 15),
    ],
    weather: 'dust', cap: 'crystal',
    body: '#3d4e48', body2: '#1a2522', lip: '#9ef0c4', accent: '#9ef0c4', dust: '#bfe8d8',
  },
  inferno: {
    top: '#1a0808', mid: '#6a1f14', horizon: '#ff7a3c',
    celestial: 'sun', sunX: 0.66, sunY: 0.58, sunR: 80, sun: '#ff8a4a', sunGlow: '#ff3a1a',
    stars: 0, nebula: false, fog: '#ff7a3c', fogA: 0.24,
    layers: [
      L('jag', '#7a2a1c', 0.6, 140, 0.0022, 0.06, 16),
      L('jag', '#461610', 0.7, 90, 0.004, 0.17, 17),
      L('jag', '#1e0906', 0.84, 44, 0.007, 0.38, 18),
    ],
    weather: 'embers', cap: 'rock',
    body: '#5a3024', body2: '#240e09', lip: '#ffb070', accent: '#ffb703', dust: '#ffb28a',
  },
  void: {
    top: '#05050d', mid: '#151036', horizon: '#5a4ce0',
    celestial: 'planet', sunX: 0.72, sunY: 0.3, sunR: 64, sun: '#8a7cff', sunGlow: '#6a5cff',
    stars: 1, nebula: false, fog: '#7a6cff', fogA: 0.14,
    layers: [
      L('islands', '#2a2458', 0.58, 0, 0, 0.06, 19),
      L('islands', '#1b1740', 0.68, 0, 0, 0.16, 20),
      L('jag', '#0b0a1e', 0.86, 44, 0.006, 0.4, 21, 'crystals'),
    ],
    weather: 'motes', cap: 'glow',
    body: '#2e2a5e', body2: '#120f2a', lip: '#ddd6ff', accent: '#c4b5fd', dust: '#ddd6ff',
  },
  machine: {
    top: '#0b0e11', mid: '#22302f', horizon: '#6fbfae',
    celestial: 'none', sunX: 0.5, sunY: 0.5, sunR: 0, sun: '#d8fff6', sunGlow: '#7ee0c8',
    stars: 0.2, nebula: false, fog: '#8fd0c0', fogA: 0.14,
    layers: [
      L('factory', '#2c3a3a', 0.62, 140, 0, 0.07, 22, 'lights'),
      L('factory', '#1b2424', 0.72, 100, 0, 0.18, 23, 'lights'),
      L('jag', '#0d1313', 0.86, 40, 0.006, 0.4, 24),
    ],
    weather: 'sparks', cap: 'metal',
    body: '#4e5c60', body2: '#20282a', lip: '#d8fff6', accent: '#7ee0c8', dust: '#c8fff0',
  },
  cosmic: {
    top: '#0a0b24', mid: '#2a1f63', horizon: '#e9a6ff',
    celestial: 'planet', sunX: 0.28, sunY: 0.3, sunR: 46, sun: '#ffb8e8', sunGlow: '#ff8ad8',
    stars: 1, nebula: true, fog: '#f0b0ff', fogA: 0.16,
    layers: [
      L('islands', '#4a3a7a', 0.6, 0, 0, 0.06, 25),
      L('islands', '#2e2656', 0.7, 0, 0, 0.16, 26),
      L('soft', '#15122c', 0.86, 30, 0.006, 0.4, 27, 'crystals'),
    ],
    weather: 'glitter', cap: 'glow',
    body: '#6a5a90', body2: '#261f3e', lip: '#ffe8ff', accent: '#ffd0f0', dust: '#ffe8ff',
  },
  infinite: {
    top: '#07070c', mid: '#201c30', horizon: '#f2c14e',
    celestial: 'eclipse', sunX: 0.5, sunY: 0.4, sunR: 54, sun: '#07070c', sunGlow: '#f2c14e',
    stars: 0.8, nebula: false, fog: '#f2c14e', fogA: 0.12,
    layers: [
      L('jag', '#3a3448', 0.62, 120, 0.0024, 0.06, 28),
      L('jag', '#231f30', 0.72, 80, 0.004, 0.17, 29),
      L('soft', '#0f0d16', 0.86, 30, 0.006, 0.4, 30),
    ],
    weather: 'gold', cap: 'glow',
    body: '#5c5870', body2: '#22202b', lip: '#fff1c9', accent: '#ffe08a', dust: '#fff1c9',
  },
}

export function lookOf(biome: BiomeId) {
  const l = LOOKS[biome]
  return { lip: l.lip, accent: l.accent, dust: l.dust, horizon: l.horizon }
}

const TRAIL_COLOR: Record<TrailId, string> = {
  none: '#ffffff',
  dusk: '#ffb703',
  ember: '#ff6b3d',
  ion: '#7ee0ff',
  petal: '#ff9ec8',
  void: '#c4b5fd',
  aurora: '#5ef2b5',
  nova: '#ff4d6d',
  solar: '#fff27a',
  halo: '#f0e6ff',
}

export function trailColorOf(trail: TrailId): string {
  return TRAIL_COLOR[trail] ?? '#ffb703'
}

const CORE_TINT: Record<CoreId, string> = {
  balanced: '#f7f2ff',
  agile: '#e4fff2',
  heavy: '#dfe3ec',
  elastic: '#ffe6f2',
  magnetic: '#e2efff',
  volatile: '#fff0dc',
}

/* ----------------------------------------------------------------- helpers */

function round(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2))
  ctx.beginPath()
  if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, w, h, radius)
  else ctx.rect(x, y, w, h)
}

function noise(x: number, seed: number): number {
  const i = Math.floor(x)
  const f = x - i
  const a = hash01(i * 12.9898 + seed * 78.233)
  const b = hash01((i + 1) * 12.9898 + seed * 78.233)
  const u = f * f * (3 - 2 * f)
  return a + (b - a) * u
}

function fbm(x: number, seed: number): number {
  return noise(x, seed) * 0.58 + noise(x * 2.03, seed + 7) * 0.28 + noise(x * 4.1, seed + 13) * 0.14
}

function mod(a: number, n: number): number {
  return ((a % n) + n) % n
}

const glowCache = new Map<string, HTMLCanvasElement>()

/** A soft radial sprite, cached per colour; far cheaper than shadowBlur. */
function glowSprite(color: string): HTMLCanvasElement {
  let c = glowCache.get(color)
  if (c) return c
  c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  const base = rgb(color)
  grd.addColorStop(0, css(base, 1))
  grd.addColorStop(0.22, css(base, 0.55))
  grd.addColorStop(0.55, css(base, 0.14))
  grd.addColorStop(1, css(base, 0))
  g.fillStyle = grd
  g.fillRect(0, 0, 128, 128)
  glowCache.set(color, c)
  return c
}

function glow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, a: number) {
  if (a <= 0.003 || r <= 0) return
  const prevOp = ctx.globalCompositeOperation
  const prevA = ctx.globalAlpha
  ctx.globalCompositeOperation = 'lighter'
  ctx.globalAlpha = prevA * Math.min(1, a)
  ctx.drawImage(glowSprite(color), x - r, y - r, r * 2, r * 2)
  ctx.globalAlpha = prevA
  ctx.globalCompositeOperation = prevOp
}

function star4(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rot: number) {
  ctx.beginPath()
  for (let i = 0; i < 8; i++) {
    const a = rot + (i * Math.PI) / 4
    const rr = i % 2 === 0 ? r : r * 0.3
    const px = x + Math.cos(a) * rr
    const py = y + Math.sin(a) * rr
    if (i === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  }
  ctx.closePath()
}

function easeOutBack(t: number): number {
  const c1 = 1.9
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
}

/* -------------------------------------------------------------- background */

interface BgFrame {
  w: number
  h: number
  camX: number
  anchor: number
  lift: number
  time: number
  reduced: boolean
}

function layerY(layer: Layer, u: number, f: BgFrame): number {
  const base = f.h * layer.base + f.lift * layer.par * 2.2
  if (layer.kind === 'jag') {
    const n = fbm(u * layer.freq, layer.seed)
    const ridge = 1 - Math.abs(n * 2 - 1)
    return base - layer.amp * (0.25 + ridge * ridge * 0.95)
  }
  return base - layer.amp * fbm(u * layer.freq, layer.seed)
}

function drawLayer(ctx: CanvasRenderingContext2D, layer: Layer, look: Look, f: BgFrame) {
  const { w, h } = f
  const offset = f.camX * layer.par - f.anchor
  ctx.fillStyle = layer.color
  const base = h * layer.base + f.lift * layer.par * 2.2

  if (layer.kind === 'soft' || layer.kind === 'jag' || layer.kind === 'cave') {
    const step = layer.kind === 'jag' ? 12 : 8
    ctx.beginPath()
    ctx.moveTo(-10, h + 10)
    for (let sx = -step; sx <= w + step; sx += step) ctx.lineTo(sx, layerY(layer, sx + offset, f))
    ctx.lineTo(w + 10, h + 10)
    ctx.closePath()
    ctx.fill()
    if (layer.kind === 'cave') {
      // Stalactites hang from a ceiling that scrolls with the same layer.
      const cell = 34
      const k0 = Math.floor(offset / cell) - 1
      const k1 = Math.ceil((offset + w) / cell) + 1
      ctx.beginPath()
      ctx.moveTo(-10, -10)
      for (let k = k0; k <= k1; k++) {
        const sx = k * cell - offset
        const len = 20 + hash01(k * 3.3 + layer.seed) * 110 + f.lift * layer.par
        ctx.lineTo(sx, 18 + hash01(k * 1.7) * 14)
        ctx.lineTo(sx + cell * 0.5, len)
      }
      ctx.lineTo(w + 10, -10)
      ctx.closePath()
      ctx.fill()
    }
    if (layer.deco) decorate(ctx, layer, look, f, offset)
    return
  }

  if (layer.kind === 'city' || layer.kind === 'factory') {
    const cell = layer.kind === 'city' ? 64 : 92
    const k0 = Math.floor(offset / cell) - 1
    const k1 = Math.ceil((offset + w) / cell) + 1
    for (let k = k0; k <= k1; k++) {
      const hr = hash01(k * 5.31 + layer.seed)
      const wr = hash01(k * 2.17 + layer.seed * 3)
      const bw = cell * (0.55 + wr * 0.5)
      const bh = layer.amp * (0.3 + hr * 0.7)
      const sx = k * cell - offset
      const top = base - bh
      ctx.fillStyle = layer.color
      ctx.fillRect(sx, top, bw, h - top + 10)
      if (layer.kind === 'city' && hr > 0.55) {
        ctx.fillRect(sx + bw * 0.45, top - 18, 2, 18)
      }
      if (layer.kind === 'factory') {
        if (wr > 0.45) {
          const cx = sx + bw * 0.7
          ctx.fillRect(cx, top - 44 - hr * 30, 9, 50 + hr * 30)
          if (!f.reduced) {
            for (let s = 0; s < 4; s++) {
              const t = mod(f.time * 0.22 + s * 0.25 + wr, 1)
              ctx.globalAlpha = (1 - t) * 0.22
              ctx.fillStyle = look.fog
              ctx.beginPath()
              ctx.arc(cx + 4 + t * 26, top - 50 - hr * 30 - t * 70, 7 + t * 16, 0, Math.PI * 2)
              ctx.fill()
            }
            ctx.globalAlpha = 1
            ctx.fillStyle = layer.color
          }
        } else {
          // saw-tooth factory roof
          ctx.beginPath()
          const teeth = 3
          for (let t = 0; t < teeth; t++) {
            const x0 = sx + (t * bw) / teeth
            ctx.moveTo(x0, top)
            ctx.lineTo(x0 + bw / teeth, top - 14)
            ctx.lineTo(x0 + bw / teeth, top)
          }
          ctx.fill()
        }
      }
      if (layer.deco === 'windows') {
        // Batch each building's windows into two paths: far cheaper than a fill per window.
        const flick = f.reduced ? 1 : 0.75 + 0.25 * Math.sin(f.time * (0.8 + hr * 2) + k)
        const fade = layer.par < 0.1 ? 0.6 : 1
        const cool = new Path2D()
        const warm = new Path2D()
        for (let row = 0; top + 10 + row * 11 < h; row++) {
          for (let col = 0; col * 9 + 6 < bw - 4; col++) {
            const r = hash01(k * 31.1 + row * 7.3 + col * 1.9 + layer.seed)
            if (r < 0.7) continue
            ;(r > 0.9 ? warm : cool).rect(sx + 5 + col * 9, top + 8 + row * 11, 4, 5)
          }
        }
        ctx.globalAlpha = 0.35 * flick * fade
        ctx.fillStyle = look.accent
        ctx.fill(cool)
        ctx.fillStyle = look.sun
        ctx.fill(warm)
        ctx.globalAlpha = 1
      }
      if (layer.deco === 'lights' && hr > 0.5) {
        const on = f.reduced || Math.sin(f.time * 2.4 + k * 1.3) > 0
        if (on) glow(ctx, sx + bw * 0.5, top - 2, 9, '#ff5a4a', 0.8)
      }
    }
    return
  }

  if (layer.kind === 'cloud') {
    const cell = 110
    const k0 = Math.floor(offset / cell) - 2
    const k1 = Math.ceil((offset + w) / cell) + 2
    const drift = f.reduced ? 0 : f.time * 6 * layer.par * 10
    ctx.beginPath()
    for (let k = k0; k <= k1; k++) {
      const r = layer.amp * (0.55 + hash01(k * 4.1 + layer.seed) * 0.6)
      const sx = k * cell - offset - mod(drift, cell)
      const cy = base - hash01(k * 9.7 + layer.seed) * layer.amp * 0.5
      ctx.moveTo(sx + r, cy)
      ctx.arc(sx, cy, r, 0, Math.PI * 2)
      const r2 = r * 0.62
      ctx.moveTo(sx + cell * 0.5 + r2, cy + r * 0.2)
      ctx.arc(sx + cell * 0.5, cy + r * 0.2, r2, 0, Math.PI * 2)
    }
    ctx.rect(-10, base, w + 20, h - base + 10)
    ctx.fill()
    return
  }

  if (layer.kind === 'islands') {
    const cell = 240
    const k0 = Math.floor(offset / cell) - 1
    const k1 = Math.ceil((offset + w) / cell) + 1
    const rim = css(mix(rgb(layer.color), rgb(look.horizon), 0.35))
    for (let k = k0; k <= k1; k++) {
      if (hash01(k * 7.7 + layer.seed) < 0.3) continue
      const iw = 50 + hash01(k * 3.9 + layer.seed) * 110
      const sx = k * cell - offset + hash01(k * 1.3) * 80
      const bob = f.reduced ? 0 : Math.sin(f.time * 0.6 + k) * 5
      const iy = base - hash01(k * 2.9 + layer.seed) * h * 0.26 + bob
      const depth = iw * (0.5 + hash01(k * 6.1) * 0.5)
      ctx.fillStyle = layer.color
      ctx.beginPath()
      ctx.moveTo(sx, iy)
      ctx.lineTo(sx + iw, iy)
      ctx.lineTo(sx + iw * 0.78, iy + depth * 0.35)
      ctx.lineTo(sx + iw * 0.56, iy + depth)
      ctx.lineTo(sx + iw * 0.38, iy + depth * 0.5)
      ctx.lineTo(sx + iw * 0.16, iy + depth * 0.3)
      ctx.closePath()
      ctx.fill()
      ctx.fillStyle = rim
      ctx.fillRect(sx, iy - 2, iw, 3)
    }
  }
}

function decorate(ctx: CanvasRenderingContext2D, layer: Layer, look: Look, f: BgFrame, offset: number) {
  const cell = layer.deco === 'pines' ? 22 : layer.deco === 'trees' ? 48 : 60
  const k0 = Math.floor(offset / cell) - 1
  const k1 = Math.ceil((offset + f.w) / cell) + 1
  ctx.fillStyle = layer.color
  for (let k = k0; k <= k1; k++) {
    const r = hash01(k * 9.13 + layer.seed)
    if (r < (layer.deco === 'pines' ? 0.35 : 0.45)) continue
    const u = k * cell + hash01(k * 2.2) * cell * 0.6
    const sx = u - offset
    const gy = layerY(layer, u, f) + 3
    const s = 0.6 + r * 0.7
    if (layer.deco === 'pines') {
      ctx.beginPath()
      ctx.moveTo(sx - 7 * s, gy)
      ctx.lineTo(sx, gy - 28 * s)
      ctx.lineTo(sx + 7 * s, gy)
      ctx.closePath()
      ctx.fill()
    } else if (layer.deco === 'trees') {
      ctx.fillRect(sx - 1.5, gy - 16 * s, 3, 16 * s)
      ctx.beginPath()
      ctx.arc(sx, gy - 20 * s, 11 * s, 0, Math.PI * 2)
      ctx.arc(sx + 7 * s, gy - 14 * s, 8 * s, 0, Math.PI * 2)
      ctx.arc(sx - 7 * s, gy - 15 * s, 7 * s, 0, Math.PI * 2)
      ctx.fill()
    } else if (layer.deco === 'crystals') {
      const c = look.accent
      ctx.fillStyle = alpha(c, 0.28)
      ctx.beginPath()
      ctx.moveTo(sx - 5 * s, gy)
      ctx.lineTo(sx - 2 * s, gy - 26 * s)
      ctx.lineTo(sx + 3 * s, gy - 30 * s)
      ctx.lineTo(sx + 6 * s, gy)
      ctx.closePath()
      ctx.fill()
      if (!f.reduced) glow(ctx, sx, gy - 14 * s, 18 * s, c, 0.12 + 0.08 * Math.sin(f.time * 1.5 + k))
      ctx.fillStyle = layer.color
    }
  }
}

function celestial(ctx: CanvasRenderingContext2D, look: Look, f: BgFrame, skyFill: CanvasGradient) {
  const { w, h } = f
  const x = w * look.sunX
  const y = h * look.sunY + f.lift * 0.08
  const r = look.sunR * Math.min(1.2, Math.max(0.7, h / 720))
  switch (look.celestial) {
    case 'sun':
      glow(ctx, x, y, r * 7, look.sunGlow, 0.45)
      glow(ctx, x, y, r * 2.4, look.sun, 0.55)
      ctx.fillStyle = look.sun
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()
      break
    case 'synth': {
      glow(ctx, x, y, r * 4, look.sunGlow, 0.5)
      const g = ctx.createLinearGradient(0, y - r, 0, y + r)
      g.addColorStop(0, look.sun)
      g.addColorStop(1, look.sunGlow)
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()
      // Retro scan gaps, painted with the sky itself so they read as cut-outs.
      ctx.fillStyle = skyFill
      for (let i = 0; i < 7; i++) {
        const gy = y + r * 0.08 + i * r * 0.14
        const gh = 2 + i * 1.6
        ctx.fillRect(x - r - 2, gy, r * 2 + 4, gh)
      }
      break
    }
    case 'planet': {
      glow(ctx, x, y, r * 4, look.sunGlow, 0.35)
      const g = ctx.createRadialGradient(x - r * 0.4, y - r * 0.4, r * 0.1, x, y, r)
      g.addColorStop(0, css(mix(rgb(look.sun), [255, 255, 255], 0.5)))
      g.addColorStop(0.6, look.sun)
      g.addColorStop(1, css(mix(rgb(look.sun), rgb(look.top), 0.75)))
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = alpha(look.sun, 0.55)
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.ellipse(x, y, r * 1.8, r * 0.36, -0.28, 0, Math.PI * 2)
      ctx.stroke()
      break
    }
    case 'eclipse': {
      const pulse = f.reduced ? 1 : 0.85 + Math.sin(f.time * 0.8) * 0.15
      glow(ctx, x, y, r * 5, look.sunGlow, 0.4 * pulse)
      glow(ctx, x, y, r * 1.8, '#fff1c9', 0.7)
      ctx.fillStyle = look.sun
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = alpha('#fff1c9', 0.8)
      ctx.lineWidth = 1.5
      ctx.stroke()
      break
    }
    case 'shafts': {
      const prev = ctx.globalCompositeOperation
      ctx.globalCompositeOperation = 'lighter'
      for (let i = 0; i < 4; i++) {
        const sway = f.reduced ? 0 : Math.sin(f.time * 0.3 + i * 1.7) * 30
        const sx = w * (0.18 + i * 0.24) + sway - (f.camX * 0.04) % 80
        const g = ctx.createLinearGradient(0, 0, 0, h * 0.8)
        g.addColorStop(0, alpha(look.sun, 0.12))
        g.addColorStop(1, alpha(look.sun, 0))
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.moveTo(sx, 0)
        ctx.lineTo(sx + 40 + i * 10, 0)
        ctx.lineTo(sx + 160 + i * 20, h * 0.8)
        ctx.lineTo(sx + 60, h * 0.8)
        ctx.closePath()
        ctx.fill()
      }
      ctx.globalCompositeOperation = prev
      break
    }
    default:
      break
  }
}

function paintBackground(ctx: CanvasRenderingContext2D, biome: BiomeId, f: BgFrame, heat: number) {
  const look = LOOKS[biome]
  const { w, h } = f
  const g = ctx.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0, look.top)
  g.addColorStop(0.5, look.mid)
  g.addColorStop(0.78, look.horizon)
  g.addColorStop(1, look.horizon)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)

  if (look.nebula) {
    glow(ctx, w * 0.2, h * 0.25, w * 0.35, '#ff5ad0', 0.18)
    glow(ctx, w * 0.75, h * 0.18, w * 0.3, '#5ad0ff', 0.14)
  }

  if (look.stars > 0) {
    ctx.fillStyle = '#fff'
    for (let i = 0; i < 90; i++) {
      const sx = mod(hash01(i * 19.1) * w * 1.5 - f.camX * 0.01, w)
      const sy = hash01(i * 7.7) * h * 0.62
      const tw = f.reduced ? 1 : 0.55 + 0.45 * Math.sin(f.time * (1.2 + hash01(i * 3.1) * 2.4) + i)
      ctx.globalAlpha = look.stars * (0.2 + hash01(i) * 0.6) * tw * (1 - sy / (h * 0.7))
      const big = hash01(i + 3) > 0.86
      ctx.fillRect(sx, sy, big ? 2 : 1, big ? 2 : 1)
    }
    ctx.globalAlpha = 1
    // An occasional shooting star, borrowed from night skies in Alto.
    if (!f.reduced) {
      const cycle = mod(f.time, 9)
      if (cycle < 0.7) {
        const t = cycle / 0.7
        const seed = Math.floor(f.time / 9)
        const sx = w * (0.2 + hash01(seed) * 0.6) + t * 220
        const sy = h * (0.08 + hash01(seed + 1) * 0.2) + t * 90
        const grd = ctx.createLinearGradient(sx - 90, sy - 36, sx, sy)
        grd.addColorStop(0, 'rgba(255,255,255,0)')
        grd.addColorStop(1, `rgba(255,255,255,${(0.8 * (1 - t)).toFixed(3)})`)
        ctx.strokeStyle = grd
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(sx - 90, sy - 36)
        ctx.lineTo(sx, sy)
        ctx.stroke()
      }
    }
  }

  celestial(ctx, look, f, g)

  const [far, ...near] = look.layers
  drawLayer(ctx, far, look, f)
  // Atmospheric perspective: a band of haze sits in front of the far range.
  const fogTop = h * 0.4
  const fog = ctx.createLinearGradient(0, fogTop, 0, h)
  fog.addColorStop(0, alpha(look.fog, 0))
  fog.addColorStop(0.55, alpha(look.fog, look.fogA))
  fog.addColorStop(1, alpha(look.fog, look.fogA * 0.4))
  ctx.fillStyle = fog
  ctx.fillRect(0, fogTop, w, h - fogTop)
  for (const layer of near) drawLayer(ctx, layer, look, f)

  if (heat > 0.05 && !f.reduced) {
    ctx.fillStyle = `rgba(255, 110, 50, ${(heat * 0.1).toFixed(3)})`
    ctx.fillRect(0, 0, w, h)
  }
}

function paintWeather(ctx: CanvasRenderingContext2D, look: Look, f: BgFrame, camY: number, a: number) {
  if (f.reduced || a <= 0.01) return
  const { w, h } = f
  const n = look.weather === 'rain' ? 70 : look.weather === 'wind' ? 22 : 46
  const prevOp = ctx.globalCompositeOperation
  for (let i = 0; i < n; i++) {
    const r1 = hash01(i * 3.17)
    const r2 = hash01(i * 7.31)
    const r3 = hash01(i * 1.93)
    const par = 0.3 + r3 * 0.9
    const bx = r1 * (w + 80) - f.camX * par * 0.6
    const by = r2 * (h + 80) + camY * par * 0.15
    switch (look.weather) {
      case 'pollen':
      case 'ash': {
        const fall = look.weather === 'ash' ? 22 : -8
        const x = mod(bx - f.time * 14 + Math.sin(f.time * 0.9 + i) * 12, w + 80) - 40
        const y = mod(by + f.time * fall, h + 80) - 40
        ctx.globalAlpha = a * (0.25 + r3 * 0.45)
        ctx.fillStyle = look.weather === 'ash' ? '#d8d0c8' : '#fff2c8'
        ctx.beginPath()
        ctx.arc(x, y, 0.8 + r3 * 1.6, 0, Math.PI * 2)
        ctx.fill()
        break
      }
      case 'wind': {
        const x = mod(bx - f.time * (380 + r3 * 300), w + 400) - 200
        const y = mod(by, h)
        ctx.globalAlpha = a * (0.12 + r3 * 0.2)
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = 1 + r3
        ctx.beginPath()
        ctx.moveTo(x, y)
        ctx.quadraticCurveTo(x + 50, y - 6, x + 110 + r3 * 60, y + Math.sin(f.time + i) * 4)
        ctx.stroke()
        break
      }
      case 'rain': {
        const x = mod(bx - f.time * 120, w + 80) - 40
        const y = mod(by + f.time * (700 + r3 * 400), h + 80) - 40
        ctx.globalAlpha = a * (0.1 + r3 * 0.25)
        ctx.strokeStyle = r1 > 0.8 ? '#ff7ad8' : '#8af3ff'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(x, y)
        ctx.lineTo(x - 4, y + 14 + r3 * 10)
        ctx.stroke()
        break
      }
      case 'embers':
      case 'sparks':
      case 'gold': {
        const rise = look.weather === 'sparks' ? 30 : 46
        const x = mod(bx + Math.sin(f.time * 1.3 + i) * 18 - f.time * 10, w + 80) - 40
        const y = mod(by - f.time * rise * (0.5 + r3), h + 80) - 40
        const flick = 0.5 + 0.5 * Math.sin(f.time * 6 + i * 2.1)
        const c = look.weather === 'embers' ? (r1 > 0.5 ? '#ff9a3c' : '#ffd07a') : look.weather === 'sparks' ? '#9ff5e0' : '#ffe08a'
        ctx.globalAlpha = a
        glow(ctx, x, y, 4 + r3 * 5, c, (0.25 + r3 * 0.5) * (0.5 + flick * 0.5))
        break
      }
      case 'dust':
      case 'motes':
      case 'glitter': {
        const x = mod(bx + Math.sin(f.time * 0.4 + i) * 20 - f.time * 6, w + 80) - 40
        const y = mod(by + Math.cos(f.time * 0.3 + i) * 16 + f.time * 4, h + 80) - 40
        const tw = 0.5 + 0.5 * Math.sin(f.time * (2 + r3 * 3) + i)
        ctx.globalAlpha = a * (0.2 + tw * 0.5)
        if (look.weather === 'glitter' && r1 > 0.6) {
          ctx.fillStyle = '#ffe8ff'
          star4(ctx, x, y, 2 + tw * 3, f.time + i)
          ctx.fill()
        } else {
          ctx.fillStyle = look.weather === 'motes' ? '#c4b5fd' : look.dust
          ctx.fillRect(x, y, 1.5, 1.5)
        }
        break
      }
    }
  }
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = prevOp
}

/* ------------------------------------------------------------------- world */

function drawZone(ctx: CanvasRenderingContext2D, z: Zone, time: number, reduced: boolean) {
  ctx.save()
  ctx.beginPath()
  ctx.rect(z.x, z.y, z.w, z.h)
  ctx.clip()
  if (z.kind === 'flipgrav') {
    const g = ctx.createLinearGradient(0, z.y, 0, z.y + z.h)
    g.addColorStop(0, 'rgba(170,140,255,.2)')
    g.addColorStop(0.5, 'rgba(170,140,255,.07)')
    g.addColorStop(1, 'rgba(170,140,255,.2)')
    ctx.fillStyle = g
    ctx.fillRect(z.x, z.y, z.w, z.h)
    ctx.strokeStyle = 'rgba(200,180,255,.35)'
    ctx.lineWidth = 2
    for (let x = z.x + 20; x < z.x + z.w; x += 60) {
      const y = z.y + z.h - mod(time * 60 + x, z.h)
      ctx.beginPath()
      ctx.moveTo(x - 7, y + 7)
      ctx.lineTo(x, y)
      ctx.lineTo(x + 7, y + 7)
      ctx.stroke()
    }
  } else if (z.kind === 'wind' || z.kind === 'glide') {
    ctx.fillStyle = 'rgba(255,255,255,.04)'
    ctx.fillRect(z.x, z.y, z.w, z.h)
    const dir = z.kind === 'glide' ? 1 : Math.sign(z.vx || 1)
    ctx.strokeStyle = 'rgba(255,255,255,.22)'
    ctx.lineWidth = 1.5
    const n = Math.max(4, Math.floor((z.w * z.h) / 9000))
    for (let i = 0; i < n; i++) {
      const lx = z.x + mod(hash01(i * 3.3 + z.id) * z.w + (reduced ? 0 : time * 260 * dir), z.w + 60) - 30
      const ly = z.y + hash01(i * 5.1 + z.id) * z.h
      ctx.beginPath()
      ctx.moveTo(lx, ly)
      ctx.lineTo(lx + 36 * dir, ly)
      ctx.stroke()
    }
  } else if (z.kind === 'updraft') {
    const g = ctx.createLinearGradient(0, z.y + z.h, 0, z.y)
    g.addColorStop(0, 'rgba(180,230,255,.16)')
    g.addColorStop(1, 'rgba(180,230,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(z.x, z.y, z.w, z.h)
    ctx.strokeStyle = 'rgba(210,240,255,.3)'
    ctx.lineWidth = 1.5
    for (let i = 0; i < 10; i++) {
      const lx = z.x + hash01(i * 2.7 + z.id) * z.w
      const ly = z.y + z.h - mod(hash01(i * 8.1) * z.h + (reduced ? 0 : time * 200), z.h + 40)
      ctx.beginPath()
      ctx.moveTo(lx, ly)
      ctx.lineTo(lx, ly + 26)
      ctx.stroke()
    }
  } else {
    ctx.fillStyle = 'rgba(200,220,255,.06)'
    ctx.fillRect(z.x, z.y, z.w, z.h)
    ctx.strokeStyle = 'rgba(220,235,255,.3)'
    ctx.lineWidth = 1
    for (let i = 0; i < 8; i++) {
      const bx = z.x + hash01(i * 4.4 + z.id) * z.w
      const by = z.y + z.h - mod(hash01(i * 1.1) * z.h + (reduced ? 0 : time * 30), z.h)
      ctx.beginPath()
      ctx.arc(bx, by, 3 + hash01(i) * 4, 0, Math.PI * 2)
      ctx.stroke()
    }
  }
  ctx.restore()
}

function drawHazard(ctx: CanvasRenderingContext2D, h: Hazard, time: number, danger: string, reduced: boolean) {
  if (h.kind === 'spikes') {
    const n = Math.max(1, Math.floor(h.w / 14))
    const sw = h.w / n
    ctx.fillStyle = 'rgba(20,10,20,.55)'
    ctx.fillRect(h.x, h.y + h.h - 3, h.w, 4)
    const g = ctx.createLinearGradient(0, h.y, 0, h.y + h.h)
    g.addColorStop(0, css(mix(rgb(danger), [255, 255, 255], 0.35)))
    g.addColorStop(1, css(mix(rgb(danger), [30, 10, 30], 0.5)))
    for (let i = 0; i < n; i++) {
      const x = h.x + i * sw
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.moveTo(x, h.y + h.h)
      ctx.lineTo(x + sw / 2, h.y)
      ctx.lineTo(x + sw, h.y + h.h)
      ctx.closePath()
      ctx.fill()
      ctx.fillStyle = 'rgba(255,255,255,.35)'
      ctx.beginPath()
      ctx.moveTo(x + sw / 2, h.y)
      ctx.lineTo(x + sw * 0.32, h.y + h.h)
      ctx.lineTo(x + sw * 0.42, h.y + h.h)
      ctx.closePath()
      ctx.fill()
    }
    return
  }
  if (h.kind === 'laser') {
    const hot = laserHot(h, time)
    const warm = laserWarm(h, time)
    const vertical = h.h > h.w
    const cx = h.x + h.w / 2
    const cy = h.y + h.h / 2
    // emitters at both ends
    ctx.fillStyle = '#2a2436'
    if (vertical) {
      round(ctx, cx - 7, h.y - 8, 14, 10, 3)
      ctx.fill()
      round(ctx, cx - 7, h.y + h.h - 2, 14, 10, 3)
      ctx.fill()
    } else {
      round(ctx, h.x - 8, cy - 7, 10, 14, 3)
      ctx.fill()
      round(ctx, h.x + h.w - 2, cy - 7, 10, 14, 3)
      ctx.fill()
    }
    if (hot) {
      const flick = reduced ? 1 : 0.85 + Math.random() * 0.15
      ctx.globalCompositeOperation = 'lighter'
      ctx.fillStyle = alpha(danger, 0.28 * flick)
      if (vertical) ctx.fillRect(cx - 9, h.y, 18, h.h)
      else ctx.fillRect(h.x, cy - 9, h.w, 18)
      ctx.fillStyle = alpha(danger, 0.9)
      ctx.fillRect(h.x, h.y, h.w, h.h)
      ctx.fillStyle = 'rgba(255,255,255,.9)'
      if (vertical) ctx.fillRect(cx - 1, h.y, 2, h.h)
      else ctx.fillRect(h.x, cy - 1, h.w, 2)
      ctx.globalCompositeOperation = 'source-over'
      if (vertical) {
        glow(ctx, cx, h.y, 20, danger, 0.9)
        glow(ctx, cx, h.y + h.h, 20, danger, 0.9)
      } else {
        glow(ctx, h.x, cy, 20, danger, 0.9)
        glow(ctx, h.x + h.w, cy, 20, danger, 0.9)
      }
    } else {
      ctx.strokeStyle = warm ? alpha('#ffd0a8', 0.55 + 0.3 * Math.sin(time * 30)) : 'rgba(255,208,168,.14)'
      ctx.lineWidth = warm ? 2 : 1
      ctx.setLineDash(warm ? [6, 4] : [2, 8])
      ctx.beginPath()
      if (vertical) {
        ctx.moveTo(cx, h.y)
        ctx.lineTo(cx, h.y + h.h)
      } else {
        ctx.moveTo(h.x, cy)
        ctx.lineTo(h.x + h.w, cy)
      }
      ctx.stroke()
      ctx.setLineDash([])
      if (warm) {
        if (vertical) {
          glow(ctx, cx, h.y, 14, '#ffb080', 0.7)
          glow(ctx, cx, h.y + h.h, 14, '#ffb080', 0.7)
        } else {
          glow(ctx, h.x, cy, 14, '#ffb080', 0.7)
          glow(ctx, h.x + h.w, cy, 14, '#ffb080', 0.7)
        }
      }
    }
    return
  }
  if (h.kind === 'crusher') {
    const u = crusherAmount(h, time)
    const y = h.y + u * h.amp
    const hot = u > 0.62
    ctx.fillStyle = '#3a3440'
    ctx.fillRect(h.x + h.w / 2 - 6, y - 600, 12, 600)
    ctx.fillStyle = 'rgba(255,255,255,.12)'
    ctx.fillRect(h.x + h.w / 2 - 6, y - 600, 3, 600)
    const g = ctx.createLinearGradient(0, y, 0, y + h.h)
    g.addColorStop(0, '#8a8094')
    g.addColorStop(1, '#4a4452')
    ctx.fillStyle = g
    round(ctx, h.x, y, h.w, h.h, 4)
    ctx.fill()
    // hazard stripes along the striking face
    ctx.save()
    ctx.beginPath()
    ctx.rect(h.x, y + h.h - 12, h.w, 12)
    ctx.clip()
    ctx.fillStyle = hot ? danger : '#f2c14e'
    ctx.fillRect(h.x, y + h.h - 12, h.w, 12)
    ctx.fillStyle = '#1b1620'
    for (let sx = h.x - 12; sx < h.x + h.w + 12; sx += 16) {
      ctx.beginPath()
      ctx.moveTo(sx, y + h.h)
      ctx.lineTo(sx + 8, y + h.h - 12)
      ctx.lineTo(sx + 14, y + h.h - 12)
      ctx.lineTo(sx + 6, y + h.h)
      ctx.fill()
    }
    ctx.restore()
    if (u === 0) {
      // Telegraph: a warning glow that swells before the slam.
      const t = (((time * h.freq + h.phase) % 1) + 1) % 1
      if (t > 0.4 && t < 0.58) glow(ctx, h.x + h.w / 2, y + h.h, h.w * 0.7, '#ffb15a', (t - 0.4) / 0.18 * 0.6)
    }
    if (hot) glow(ctx, h.x + h.w / 2, y + h.h, h.w * 0.6, danger, 0.4)
    return
  }
  if (h.kind === 'lava') {
    const g = ctx.createLinearGradient(0, h.y, 0, h.y + h.h)
    g.addColorStop(0, '#ffd04a')
    g.addColorStop(0.18, '#ff6a2a')
    g.addColorStop(1, '#6a1408')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.moveTo(h.x, h.y + h.h)
    for (let x = h.x; x <= h.x + h.w; x += 8) {
      const wave = reduced ? 0 : Math.sin(x * 0.05 + time * 3) * 3 + Math.sin(x * 0.11 - time * 2) * 2
      ctx.lineTo(x, h.y + wave)
    }
    ctx.lineTo(h.x + h.w, h.y + h.h)
    ctx.closePath()
    ctx.fill()
    const heat = ctx.createLinearGradient(0, h.y - 60, 0, h.y)
    heat.addColorStop(0, 'rgba(255,110,40,0)')
    heat.addColorStop(1, 'rgba(255,110,40,.3)')
    ctx.fillStyle = heat
    ctx.fillRect(h.x, h.y - 60, h.w, 60)
    if (!reduced) {
      for (let i = 0; i < Math.ceil(h.w / 60); i++) {
        const t = mod(time * 0.8 + hash01(i + h.id), 1)
        const bx = h.x + hash01(i * 3.7 + h.id) * h.w
        ctx.fillStyle = `rgba(255,220,120,${(0.8 * (1 - t)).toFixed(3)})`
        ctx.beginPath()
        ctx.arc(bx, h.y + 4 - t * 10, 2 + t * 4, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    return
  }
  if (h.kind === 'sweep' && h.phase > 0) {
    const x = sweepX(h, time)
    const grd = ctx.createLinearGradient(x - 160, 0, x, 0)
    grd.addColorStop(0, alpha(danger, 0))
    grd.addColorStop(0.7, alpha(danger, 0.25))
    grd.addColorStop(1, alpha(danger, 0.6))
    ctx.fillStyle = grd
    ctx.fillRect(x - 160, h.y, 160, h.h)
    ctx.strokeStyle = 'rgba(255,230,220,.85)'
    ctx.lineWidth = 3
    ctx.beginPath()
    for (let y = h.y; y <= h.y + h.h; y += 14) {
      const jx = x + (reduced ? 0 : Math.sin(y * 0.2 + time * 18) * 5)
      if (y === h.y) ctx.moveTo(jx, y)
      else ctx.lineTo(jx, y)
    }
    ctx.stroke()
  }
}

function drawPlatform(ctx: CanvasRenderingContext2D, p: Platform, rect: Rect, look: Look, time: number, reduced: boolean) {
  let { x, y } = rect
  const { w, h } = rect
  const dip = p.flash > 0 && p.kind !== 'wall' ? p.flash * p.flash * 5 : 0
  y += dip
  if (p.kind === 'collapsing' && p.touchedAt > 0 && !p.collapsed && !reduced) {
    x += Math.sin(time * 70 + p.id) * 1.6
  }
  const collapsed = p.collapsed
  if (collapsed) ctx.globalAlpha = Math.max(0, 1 - (p.fallY - p.y) / 240)

  // moving platforms show their rail
  if (p.kind === 'moving' && !collapsed) {
    ctx.strokeStyle = 'rgba(255,255,255,.16)'
    ctx.lineWidth = 2
    ctx.setLineDash([3, 7])
    ctx.beginPath()
    if (p.axis === 'x') {
      ctx.moveTo(p.x - p.amp + w / 2, p.y + h / 2)
      ctx.lineTo(p.x + p.amp + w / 2, p.y + h / 2)
    } else {
      ctx.moveTo(p.x + w / 2, p.y - p.amp + h / 2)
      ctx.lineTo(p.x + w / 2, p.y + p.amp + h / 2)
    }
    ctx.stroke()
    ctx.setLineDash([])
  }

  // drop shadow for depth
  ctx.fillStyle = 'rgba(0,0,0,.22)'
  round(ctx, x + 5, y + 9, w, h, 9)
  ctx.fill()

  if (p.kind === 'cloud') {
    ctx.fillStyle = 'rgba(255,255,255,.88)'
    ctx.beginPath()
    const puffs = Math.max(3, Math.round(w / 26))
    for (let i = 0; i < puffs; i++) {
      const px = x + ((i + 0.5) * w) / puffs
      const r = h * 0.6 + hash01(p.id * 3 + i) * 7
      ctx.moveTo(px + r, y + h * 0.55)
      ctx.arc(px, y + h * 0.55, r, 0, Math.PI * 2)
    }
    ctx.fill()
    ctx.fillStyle = 'rgba(190,210,235,.5)'
    ctx.fillRect(x + 6, y + h * 0.8, w - 12, 4)
    ctx.globalAlpha = 1
    return
  }

  let body = look.body
  let body2 = look.body2
  let lip = look.lip
  if (p.kind === 'ice') {
    body = '#bfe8ff'
    body2 = '#5a9fcf'
    lip = '#f2fcff'
  } else if (p.kind === 'weak') {
    body = css(mix(rgb(look.body), [140, 130, 120], 0.55))
    body2 = css(mix(rgb(look.body2), [60, 55, 50], 0.5))
  } else if (p.kind === 'sticky') {
    lip = '#c77dff'
  } else if (p.kind === 'super') {
    lip = '#8cff9e'
  } else if (p.kind === 'launch') {
    lip = '#ffb15a'
  } else if (p.kind === 'bumper') {
    lip = '#ff7aa8'
  } else if (p.kind === 'magnetic') {
    lip = '#7ab8ff'
  }

  const thin = p.kind === 'oneway'
  const g = ctx.createLinearGradient(x, y, x, y + h)
  g.addColorStop(0, body)
  g.addColorStop(1, body2)
  ctx.fillStyle = g
  if (thin) ctx.globalAlpha *= 0.75
  round(ctx, x, y, w, h, p.kind === 'wall' ? 6 : 9)
  ctx.fill()
  if (thin) ctx.globalAlpha = collapsed ? ctx.globalAlpha / 0.75 : 1

  ctx.save()
  round(ctx, x, y, w, h, p.kind === 'wall' ? 6 : 9)
  ctx.clip()

  // bottom shade + side sheen
  ctx.fillStyle = 'rgba(0,0,0,.18)'
  ctx.fillRect(x, y + h - 4, w, 4)
  ctx.fillStyle = 'rgba(255,255,255,.07)'
  ctx.fillRect(x, y, 3, h)

  if (p.kind === 'wall') {
    ctx.strokeStyle = 'rgba(0,0,0,.18)'
    ctx.lineWidth = 1
    for (let by = y + 18; by < y + h; by += 18) {
      ctx.beginPath()
      ctx.moveTo(x, by)
      ctx.lineTo(x + w, by)
      ctx.stroke()
    }
    ctx.fillStyle = alpha(lip, 0.8)
    ctx.fillRect(x, y, 3, h)
    ctx.fillRect(x + w - 3, y, 3, h)
    ctx.fillRect(x, y, w, 4)
  } else {
    capPainter(ctx, look.cap, p, x, y, w, h, lip, look, time, reduced)
  }

  kindOverlay(ctx, p, x, y, w, h, time, reduced)

  if (p.flash > 0) {
    ctx.fillStyle = `rgba(255,255,255,${(p.flash * 0.3).toFixed(3)})`
    ctx.fillRect(x, y, w, h)
    ctx.fillStyle = `rgba(255,255,255,${(p.flash * 0.7).toFixed(3)})`
    ctx.fillRect(x, y, w, 4)
  }
  ctx.restore()

  if (p.route === 'expert') {
    ctx.strokeStyle = look.accent
    ctx.lineWidth = 2
    round(ctx, x + 1, y + 1, w - 2, h - 2, 8)
    ctx.stroke()
    if (!reduced) {
      const t = mod(time * 0.45 + p.id * 0.13, 1.6)
      if (t < 1) glow(ctx, x + t * w, y + 2, 16, look.accent, 0.5 * Math.sin(t * Math.PI))
    }
  }
  if (p.kind === 'super' || p.kind === 'launch') {
    const pulse = reduced ? 0.5 : 0.35 + 0.25 * Math.sin(time * 5 + p.id)
    glow(ctx, x + w / 2, y, Math.min(w * 0.6, 70), lip, pulse)
  }
  ctx.globalAlpha = 1
}

function capPainter(
  ctx: CanvasRenderingContext2D,
  cap: Cap,
  p: Platform,
  x: number,
  y: number,
  w: number,
  h: number,
  lip: string,
  look: Look,
  time: number,
  reduced: boolean,
) {
  switch (cap) {
    case 'grass': {
      ctx.fillStyle = lip
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x + w, y)
      ctx.lineTo(x + w, y + 5)
      for (let sx = x + w; sx > x; sx -= 9) {
        const d = 5 + hash01(p.id * 7 + sx * 0.37) * 4
        ctx.quadraticCurveTo(sx - 4.5, y + d + 3, sx - 9, y + 5)
      }
      ctx.closePath()
      ctx.fill()
      ctx.fillStyle = 'rgba(255,255,255,.35)'
      ctx.fillRect(x, y, w, 1.5)
      break
    }
    case 'metal': {
      ctx.fillStyle = lip
      ctx.fillRect(x, y, w, 4)
      ctx.fillStyle = 'rgba(0,0,0,.25)'
      ctx.fillRect(x, y + 4, w, 1.5)
      ctx.fillStyle = 'rgba(255,255,255,.28)'
      for (let rx = x + 12; rx < x + w - 6; rx += 26) {
        ctx.beginPath()
        ctx.arc(rx, y + h * 0.58, 1.8, 0, Math.PI * 2)
        ctx.fill()
      }
      break
    }
    case 'cloud': {
      ctx.fillStyle = lip
      ctx.fillRect(x, y, w, 5)
      ctx.fillStyle = 'rgba(255,255,255,.5)'
      for (let sx = x + 10; sx < x + w - 10; sx += 18) {
        ctx.beginPath()
        ctx.arc(sx, y + 5, 5, 0, Math.PI)
        ctx.fill()
      }
      break
    }
    case 'neon': {
      const pulse = reduced ? 1 : 0.8 + 0.2 * Math.sin(time * 3 + p.id)
      ctx.fillStyle = alpha(lip, 0.25 * pulse)
      ctx.fillRect(x, y, w, 8)
      ctx.fillStyle = lip
      ctx.fillRect(x, y, w, 2.5)
      ctx.strokeStyle = alpha(look.accent, 0.25)
      ctx.lineWidth = 1
      for (let gx = x + 16; gx < x + w; gx += 16) {
        ctx.beginPath()
        ctx.moveTo(gx, y + 6)
        ctx.lineTo(gx, y + h)
        ctx.stroke()
      }
      break
    }
    case 'crystal': {
      ctx.fillStyle = lip
      ctx.fillRect(x, y, w, 3)
      // slanted facets, deliberately not triangles so nothing reads as a spike
      ctx.fillStyle = alpha(lip, 0.07)
      for (let sx = x + 10 + hash01(p.id) * 30; sx < x + w - 6; sx += 44 + hash01(sx * 0.7) * 50) {
        const r = hash01(p.id * 5 + sx)
        ctx.beginPath()
        ctx.moveTo(sx, y + 4)
        ctx.lineTo(sx + 10 + r * 8, y + 4)
        ctx.lineTo(sx + 4 + r * 8, y + h)
        ctx.lineTo(sx - 6, y + h)
        ctx.closePath()
        ctx.fill()
      }
      if (!reduced) glow(ctx, x + w * (0.3 + 0.4 * hash01(p.id)), y + 2, 26, lip, 0.12 + 0.06 * Math.sin(time * 2 + p.id))
      break
    }
    case 'rock': {
      ctx.fillStyle = lip
      ctx.fillRect(x, y, w, 3)
      ctx.strokeStyle = alpha('#ff8a3c', reduced ? 0.6 : 0.4 + 0.25 * Math.sin(time * 2 + p.id))
      ctx.lineWidth = 1.5
      ctx.beginPath()
      for (let sx = x + 14 + hash01(p.id) * 20; sx < x + w - 14; sx += 50 + hash01(sx) * 40) {
        const r1 = hash01(p.id * 3 + sx)
        const r2 = hash01(p.id * 7 + sx * 1.3)
        ctx.moveTo(sx, y + h)
        ctx.lineTo(sx + (r1 - 0.5) * 14, y + h * (0.45 + r2 * 0.2))
        ctx.lineTo(sx + (r2 - 0.5) * 18, y + 5)
        ctx.moveTo(sx + (r1 - 0.5) * 14, y + h * (0.45 + r2 * 0.2))
        ctx.lineTo(sx + 10 + r1 * 8, y + h * 0.3)
      }
      ctx.stroke()
      break
    }
    case 'glow': {
      ctx.fillStyle = alpha(lip, 0.22)
      ctx.fillRect(x, y, w, 7)
      ctx.fillStyle = lip
      ctx.fillRect(x, y, w, 2.5)
      break
    }
  }
}

function kindOverlay(ctx: CanvasRenderingContext2D, p: Platform, x: number, y: number, w: number, h: number, time: number, reduced: boolean) {
  const t = reduced ? 0 : time
  switch (p.kind) {
    case 'super': {
      ctx.strokeStyle = 'rgba(200,255,210,.75)'
      ctx.lineWidth = 2
      for (let i = 16; i < w - 8; i += 22) {
        const lift = Math.sin(t * 6 + i) * 1.5
        ctx.beginPath()
        ctx.moveTo(x + i, y + 17 + lift)
        ctx.lineTo(x + i + 6, y + 9 + lift)
        ctx.lineTo(x + i + 12, y + 17 + lift)
        ctx.stroke()
      }
      break
    }
    case 'launch': {
      ctx.strokeStyle = 'rgba(255,230,190,.85)'
      ctx.lineWidth = 2.5
      const off = mod(t * 26, 12)
      for (let i = 14; i < w - 10; i += 26) {
        for (let k = 0; k < 2; k++) {
          const yy = y + h - 4 - off - k * 12
          if (yy < y + 4) continue
          ctx.beginPath()
          ctx.moveTo(x + i, yy + 6)
          ctx.lineTo(x + i + 6, yy)
          ctx.lineTo(x + i + 12, yy + 6)
          ctx.stroke()
        }
      }
      break
    }
    case 'ice': {
      ctx.strokeStyle = 'rgba(255,255,255,.6)'
      ctx.lineWidth = 2
      const sheen = mod(t * 60 + p.id * 40, w + 80) - 40
      ctx.beginPath()
      ctx.moveTo(x + sheen, y + h)
      ctx.lineTo(x + sheen + 14, y)
      ctx.moveTo(x + sheen + 10, y + h)
      ctx.lineTo(x + sheen + 18, y)
      ctx.stroke()
      break
    }
    case 'weak': {
      ctx.strokeStyle = 'rgba(30,20,10,.45)'
      ctx.lineWidth = 1.5
      ctx.setLineDash([4, 4])
      ctx.beginPath()
      ctx.moveTo(x + 6, y + h * 0.5)
      ctx.lineTo(x + w - 6, y + h * 0.5)
      ctx.stroke()
      ctx.setLineDash([])
      break
    }
    case 'sticky': {
      ctx.fillStyle = '#c77dff'
      ctx.fillRect(x, y, w, 6)
      for (let i = 8; i < w - 6; i += 17) {
        const len = 4 + (Math.sin(t * 1.6 + i) * 0.5 + 0.5) * 7
        ctx.beginPath()
        ctx.ellipse(x + i, y + 6 + len / 2, 3, len / 2 + 1, 0, 0, Math.PI * 2)
        ctx.fill()
      }
      break
    }
    case 'bumper': {
      ctx.fillStyle = '#ff7aa8'
      ctx.fillRect(x, y, w, 6)
      ctx.strokeStyle = 'rgba(255,255,255,.8)'
      ctx.lineWidth = 2
      const cx = x + w / 2
      const cy = y + h / 2 + 2
      ctx.beginPath()
      ctx.arc(cx, cy, 6, 0, Math.PI * 2)
      ctx.moveTo(cx, cy)
      ctx.lineTo(cx + Math.cos(p.bumperAngle) * 14, cy + Math.sin(p.bumperAngle) * 14)
      ctx.stroke()
      break
    }
    case 'collapsing': {
      ctx.strokeStyle = p.touchedAt > 0 ? 'rgba(30,15,5,.6)' : 'rgba(30,15,5,.22)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(x + w * 0.3, y + 3)
      ctx.lineTo(x + w * 0.36, y + h * 0.5)
      ctx.lineTo(x + w * 0.5, y + h)
      ctx.moveTo(x + w * 0.7, y + 2)
      ctx.lineTo(x + w * 0.62, y + h * 0.6)
      ctx.lineTo(x + w * 0.66, y + h)
      ctx.stroke()
      break
    }
    case 'conveyor': {
      const dir = Math.sign(p.conveyor || 1)
      const shift = mod(t * (p.conveyor || 120) * 0.4, 18)
      ctx.strokeStyle = 'rgba(255,255,255,.4)'
      ctx.lineWidth = 2
      for (let i = -18 + shift; i < w + 18; i += 18) {
        ctx.beginPath()
        ctx.moveTo(x + i, y + 7)
        ctx.lineTo(x + i + 5 * dir, y + 11)
        ctx.lineTo(x + i, y + 15)
        ctx.stroke()
      }
      ctx.fillStyle = 'rgba(0,0,0,.35)'
      for (const ex of [x + 8, x + w - 8]) {
        ctx.beginPath()
        ctx.arc(ex, y + h / 2 + 2, 5, 0, Math.PI * 2)
        ctx.fill()
      }
      break
    }
    case 'magnetic': {
      ctx.strokeStyle = 'rgba(140,190,255,.5)'
      ctx.lineWidth = 1.5
      const r = 10 + mod(t * 12, 10)
      ctx.beginPath()
      ctx.arc(x + w / 2, y, r, Math.PI, 0)
      ctx.arc(x + w / 2, y, r + 10, Math.PI, 0)
      ctx.stroke()
      break
    }
    case 'oneway': {
      ctx.strokeStyle = 'rgba(255,255,255,.55)'
      ctx.lineWidth = 2
      ctx.setLineDash([8, 6])
      ctx.beginPath()
      ctx.moveTo(x, y + 1)
      ctx.lineTo(x + w, y + 1)
      ctx.stroke()
      ctx.setLineDash([])
      break
    }
    default:
      break
  }
}

function drawEnemy(ctx: CanvasRenderingContext2D, e: Enemy, colorblind: boolean, ball: { x: number; y: number }, time: number, reduced: boolean) {
  ctx.save()
  ctx.translate(e.x, e.y)
  const look = Math.atan2(ball.y - e.y, ball.x - e.x)
  const px = Math.cos(look) * 1.6
  const py = Math.sin(look) * 1.6
  const blink = !reduced && mod(time + e.id * 1.37, 3.4) < 0.12
  if (e.kind === 'shard') {
    const c = colorblind ? '#3d8bfd' : '#ff5d73'
    glow(ctx, 0, 0, e.r * 2.6, c, 0.45)
    ctx.rotate(reduced ? 0 : time * 2.2 + e.id)
    ctx.fillStyle = c
    ctx.beginPath()
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3
      const rr = i % 2 === 0 ? e.r * 1.15 : e.r * 0.55
      ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr)
    }
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,.55)'
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(e.r * 1.15, 0)
    ctx.lineTo(Math.cos(Math.PI / 3) * e.r * 0.55, Math.sin(Math.PI / 3) * e.r * 0.55)
    ctx.fill()
  } else if (e.kind === 'wisp') {
    const flick = reduced ? 1 : 0.8 + Math.sin(time * 9 + e.id) * 0.2
    glow(ctx, 0, 0, e.r * 3, '#ffd37a', 0.55 * flick)
    ctx.fillStyle = e.flash > 0 ? '#fff' : '#ffd37a'
    ctx.beginPath()
    const tail = reduced ? 0 : Math.sin(time * 5 + e.id) * 4
    ctx.moveTo(0, -e.r)
    ctx.bezierCurveTo(e.r, -e.r, e.r, e.r * 0.6, 0, e.r * 0.9)
    ctx.quadraticCurveTo(-e.r * 0.4 + tail, e.r * 1.7, -e.r * 0.2 + tail, e.r * 1.2)
    ctx.bezierCurveTo(-e.r, e.r * 0.6, -e.r, -e.r, 0, -e.r)
    ctx.fill()
    ctx.fillStyle = '#5a3a10'
    if (!blink) {
      ctx.beginPath()
      ctx.arc(-3 + px, -2 + py, 1.8, 0, Math.PI * 2)
      ctx.arc(3 + px, -2 + py, 1.8, 0, Math.PI * 2)
      ctx.fill()
    }
  } else {
    const hop = reduced ? 0 : Math.abs(Math.sin(time * 6 + e.phase))
    const sq = 1 - (1 - hop) * 0.18
    ctx.scale(1 / sq, sq)
    const g = ctx.createRadialGradient(-e.r * 0.3, -e.r * 0.4, 1, 0, 0, e.r * 1.2)
    g.addColorStop(0, e.flash > 0 ? '#ffffff' : '#ffd0e4')
    g.addColorStop(1, e.flash > 0 ? '#ffe0ee' : '#d9709e')
    ctx.fillStyle = g
    round(ctx, -e.r, -e.r * 0.85, e.r * 2, e.r * 1.7, e.r * 0.85)
    ctx.fill()
    // feet
    ctx.fillStyle = '#b25480'
    ctx.beginPath()
    ctx.ellipse(-e.r * 0.5, e.r * 0.85, 4, 2.5, 0, 0, Math.PI * 2)
    ctx.ellipse(e.r * 0.5, e.r * 0.85, 4, 2.5, 0, 0, Math.PI * 2)
    ctx.fill()
    // eyes follow the ball
    ctx.fillStyle = '#fff'
    ctx.beginPath()
    ctx.ellipse(-4.5, -2, 3.6, blink ? 0.6 : 4, 0, 0, Math.PI * 2)
    ctx.ellipse(4.5, -2, 3.6, blink ? 0.6 : 4, 0, 0, Math.PI * 2)
    ctx.fill()
    if (!blink) {
      ctx.fillStyle = '#1b1220'
      ctx.beginPath()
      ctx.arc(-4.5 + px, -2 + py, 1.9, 0, Math.PI * 2)
      ctx.arc(4.5 + px, -2 + py, 1.9, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  ctx.restore()
}

function drawPickup(ctx: CanvasRenderingContext2D, item: Pickup, look: Look, time: number, reduced: boolean) {
  const t = reduced ? 0 : time
  const bob = Math.sin(t * 3 + item.bob) * 4
  const x = item.x
  const y = item.y + bob
  ctx.save()
  switch (item.kind) {
    case 'gem': {
      glow(ctx, x, y, 22, '#ffe08a', 0.4)
      const spin = Math.cos(t * 2.4 + item.bob)
      const hw = 2 + Math.abs(spin) * 7
      ctx.fillStyle = spin > 0 ? '#ffe7a0' : '#ffc94a'
      ctx.beginPath()
      ctx.moveTo(x, y - 10)
      ctx.lineTo(x + hw, y - 2)
      ctx.lineTo(x, y + 10)
      ctx.lineTo(x - hw, y - 2)
      ctx.closePath()
      ctx.fill()
      ctx.fillStyle = 'rgba(255,255,255,.75)'
      ctx.beginPath()
      ctx.moveTo(x, y - 10)
      ctx.lineTo(x + hw * 0.5 * Math.sign(spin || 1), y - 2)
      ctx.lineTo(x, y - 2)
      ctx.fill()
      if (!reduced && mod(t + item.bob, 2.2) < 0.25) {
        ctx.fillStyle = '#fff'
        star4(ctx, x + 6, y - 8, 4, t * 3)
        ctx.fill()
      }
      break
    }
    case 'echo': {
      const pulse = 0.5 + 0.5 * Math.sin(t * 4 + item.bob)
      glow(ctx, x, y, 22 + pulse * 6, look.accent, 0.45)
      ctx.strokeStyle = look.accent
      ctx.lineWidth = 2.5
      ctx.beginPath()
      ctx.arc(x, y, 8, 0, Math.PI * 2)
      ctx.stroke()
      ctx.globalAlpha = 0.5 * (1 - pulse)
      ctx.beginPath()
      ctx.arc(x, y, 8 + pulse * 8, 0, Math.PI * 2)
      ctx.stroke()
      ctx.globalAlpha = 1
      ctx.fillStyle = '#fff'
      ctx.beginPath()
      ctx.arc(x, y, 3, 0, Math.PI * 2)
      ctx.fill()
      break
    }
    case 'shield': {
      glow(ctx, x, y, 24, '#9ee7ff', 0.4)
      ctx.fillStyle = 'rgba(158,231,255,.22)'
      ctx.strokeStyle = '#bff0ff'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(x, y, 11, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = '#e8fbff'
      ctx.beginPath()
      ctx.moveTo(x, y - 6)
      ctx.lineTo(x + 5, y - 3.5)
      ctx.quadraticCurveTo(x + 5, y + 4, x, y + 6.5)
      ctx.quadraticCurveTo(x - 5, y + 4, x - 5, y - 3.5)
      ctx.closePath()
      ctx.fill()
      break
    }
    case 'dash': {
      glow(ctx, x, y, 22, '#ffb703', 0.45)
      ctx.fillStyle = '#ffb703'
      ctx.beginPath()
      ctx.arc(x, y, 10, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#2a1a06'
      ctx.beginPath()
      ctx.moveTo(x + 1.5, y - 7)
      ctx.lineTo(x - 4, y + 1)
      ctx.lineTo(x - 0.5, y + 1)
      ctx.lineTo(x - 1.5, y + 7)
      ctx.lineTo(x + 4, y - 1)
      ctx.lineTo(x + 0.5, y - 1)
      ctx.closePath()
      ctx.fill()
      break
    }
    case 'fragment': {
      glow(ctx, x, y, 34, '#fff4c2', 0.6)
      ctx.fillStyle = '#fff4c2'
      star4(ctx, x, y, 12, t * 0.8)
      ctx.fill()
      ctx.fillStyle = '#fff'
      star4(ctx, x, y, 6, -t * 1.2)
      ctx.fill()
      break
    }
    default: {
      glow(ctx, x, y, 20, '#ffffff', 0.35)
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 2.5
      ctx.beginPath()
      ctx.arc(x, y, 8, t * 3, t * 3 + Math.PI * 1.5)
      ctx.stroke()
    }
  }
  ctx.restore()
}

/* -------------------------------------------------------------------- ball */

/** Top of the nearest surface under the ball, for the contact shadow and camera framing. */
export function groundBelow(sim: Sim, x: number, y: number): number | null {
  let best: number | null = null
  for (const chunk of sim.chunks) {
    if (chunk.x > x + 400 || chunk.x + chunk.w < x - 400) continue
    for (const p of chunk.platforms) {
      if (p.collapsed || p.kind === 'wall') continue
      const r = platformRect(p, sim.time)
      if (x < r.x - 4 || x > r.x + r.w + 4 || r.y < y - 4) continue
      if (best === null || r.y < best) best = r.y
    }
  }
  return best
}

function drawBall(ctx: CanvasRenderingContext2D, sim: Sim, fx: ViewFx, look: Look, time: number, reduced: boolean) {
  const b = sim.ball
  const speed = Math.hypot(b.vx, b.vy)
  const heat = Math.min(1, Math.max(sim.flow / 90, (Math.abs(b.vx) - 600) / 500))
  const trail = trailColorOf(sim.config.trail)
  const tint = rgb(CORE_TINT[sim.config.core] ?? '#f7f2ff')
  const base = mix(tint, [255, 196, 140], Math.max(0, heat) * 0.55)
  const dashing = sim.dashTimer > 0

  // glow under the ball grows with flow
  glow(ctx, b.x, b.y, b.r * (2.6 + heat * 1.6), dashing ? '#ffffff' : heat > 0.4 ? '#ffb15a' : '#fff4dc', 0.25 + heat * 0.35)

  const flicker = sim.invuln > 0 && !reduced && Math.floor(time * 20) % 2 === 0
  ctx.save()
  if (flicker) ctx.globalAlpha = 0.45
  ctx.translate(b.x, b.y)

  // stretch along velocity (area preserving) ...
  const sinceBounce = sim.time - b.lastBounce
  const s = reduced ? 0 : Math.min(0.26, speed / 4400) * Math.min(1, sinceBounce * 8)
  const va = Math.atan2(b.vy, b.vx || 0.0001)
  ctx.rotate(va)
  ctx.scale(1 + s, 1 / (1 + s))
  ctx.rotate(-va)
  // ... and jelly squash along the last impact normal
  if (!reduced && fx.wobble !== 0) {
    ctx.rotate(fx.wobbleAngle)
    ctx.scale(1 - fx.wobble, 1 + fx.wobble * 0.85)
    ctx.rotate(-fx.wobbleAngle)
  }

  const r = b.r
  ctx.fillStyle = css(base)
  ctx.beginPath()
  ctx.arc(0, 0, r, 0, Math.PI * 2)
  ctx.fill()

  // rolling equator band: half an ellipse reads as a ring around a sphere
  ctx.save()
  ctx.beginPath()
  ctx.arc(0, 0, r, 0, Math.PI * 2)
  ctx.clip()
  ctx.rotate(b.spin)
  ctx.strokeStyle = sim.config.trail === 'none' ? 'rgba(60,40,80,.55)' : trail
  ctx.lineWidth = r * 0.3
  ctx.beginPath()
  ctx.ellipse(0, 0, r * 1.02, r * 0.34, 0, 0, Math.PI)
  ctx.stroke()
  ctx.lineWidth = r * 0.1
  ctx.globalAlpha *= 0.5
  ctx.beginPath()
  ctx.ellipse(0, 0, r * 1.02, r * 0.34, 0, Math.PI, Math.PI * 2)
  ctx.stroke()
  ctx.restore()

  // lighting: key light upper-left, sky-coloured shade and a rim light from the horizon
  const shade = ctx.createRadialGradient(-r * 0.38, -r * 0.42, r * 0.05, 0, 0, r * 1.05)
  shade.addColorStop(0, 'rgba(255,255,255,.75)')
  shade.addColorStop(0.28, 'rgba(255,255,255,0)')
  shade.addColorStop(0.8, css(rgb(look.top), 0.18))
  shade.addColorStop(1, css(rgb(look.top), 0.5))
  ctx.fillStyle = shade
  ctx.beginPath()
  ctx.arc(0, 0, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = alpha(look.horizon, 0.7)
  ctx.lineWidth = 1.6
  ctx.beginPath()
  ctx.arc(0, 0, r - 1, 0.1, Math.PI * 0.6)
  ctx.stroke()
  ctx.fillStyle = 'rgba(255,255,255,.95)'
  ctx.beginPath()
  ctx.ellipse(-r * 0.36, -r * 0.44, r * 0.2, r * 0.13, -0.6, 0, Math.PI * 2)
  ctx.fill()
  if (dashing) {
    ctx.fillStyle = 'rgba(255,255,255,.55)'
    ctx.beginPath()
    ctx.arc(0, 0, r, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()

  if (sim.shield > 0) {
    const pulse = reduced ? 0 : Math.sin(time * 4) * 1.5
    ctx.strokeStyle = 'rgba(158,231,255,.75)'
    ctx.fillStyle = 'rgba(158,231,255,.1)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(b.x, b.y, r + 8 + pulse, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    ctx.strokeStyle = 'rgba(255,255,255,.7)'
    ctx.beginPath()
    ctx.arc(b.x, b.y, r + 8 + pulse, -2.4, -1.6)
    ctx.stroke()
  }
}

const ADDITIVE_TRAILS = new Set<TrailId>(['ember', 'ion', 'void', 'aurora', 'nova', 'halo'])

function drawTrail(ctx: CanvasRenderingContext2D, sim: Sim, fx: ViewFx) {
  const pts = fx.trail
  if (pts.length < 2) return
  const color = trailColorOf(sim.config.trail)
  const additive = ADDITIVE_TRAILS.has(sim.config.trail)
  const base = rgb(color)
  const hot = mix(base, [255, 255, 255], 0.55)
  const r = sim.ball.r
  const n = pts.length
  // End the ribbon at the ball itself so it never detaches between frames.
  const path = [...pts.slice(0, -1), { x: sim.ball.x, y: sim.ball.y, speed: pts[n - 1].speed }]
  const prevOp = ctx.globalCompositeOperation
  if (additive) ctx.globalCompositeOperation = 'lighter'
  const faint = sim.config.trail === 'none'
  const fast = Math.min(1, path[n - 1].speed / 1100)
  const ribbon = (width: number, color: string | CanvasGradient) => {
    const left: { x: number; y: number }[] = []
    const right: { x: number; y: number }[] = []
    for (let i = 0; i < n; i++) {
      const a = path[Math.max(0, i - 1)]
      const b = path[Math.min(n - 1, i + 1)]
      let nx = -(b.y - a.y)
      let ny = b.x - a.x
      const len = Math.hypot(nx, ny) || 1
      nx /= len
      ny /= len
      const t = i / (n - 1)
      const half = width * Math.pow(t, 1.15)
      left.push({ x: path[i].x + nx * half, y: path[i].y + ny * half })
      right.push({ x: path[i].x - nx * half, y: path[i].y - ny * half })
    }
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.moveTo(left[0].x, left[0].y)
    for (let i = 1; i < n; i++) ctx.lineTo(left[i].x, left[i].y)
    for (let i = n - 1; i >= 0; i--) ctx.lineTo(right[i].x, right[i].y)
    ctx.closePath()
    ctx.fill()
  }
  const tail = path[0]
  const head = path[n - 1]
  const grd = ctx.createLinearGradient(tail.x, tail.y, head.x, head.y)
  grd.addColorStop(0, css(base, 0))
  grd.addColorStop(1, css(mix(base, hot, fast * 0.5), faint ? 0.12 : 0.5))
  ribbon(r * 0.85, grd)
  if (!faint) {
    const core = ctx.createLinearGradient(tail.x, tail.y, head.x, head.y)
    core.addColorStop(0.3, css(hot, 0))
    core.addColorStop(1, css(hot, 0.55))
    ribbon(r * 0.32, core)
  }
  ctx.globalCompositeOperation = prevOp
}

/* ------------------------------------------------------------------ render */

interface RenderState {
  biome: BiomeId
  prev: BiomeId
  mix: number
  lift: number
  ref: number | null
  bg: HTMLCanvasElement | null
}

const state: RenderState = { biome: 'meadow', prev: 'meadow', mix: 1, lift: 0, ref: null, bg: null }

export function resetRenderState() {
  state.ref = null
  state.lift = 0
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
  dt: number
  colorblind: boolean
  reduced: boolean
  debug: boolean
  flash: number
  dead: number
}) {
  const { ctx, sim, width, height, dpr, cam, fx, colorblind, reduced, dt } = opts
  const time = opts.elapsed / 1000
  const here = chunkUnder(sim, sim.ball.x)
  const biome = here?.biome ?? sim.biome
  if (biome !== state.biome) {
    state.prev = state.biome
    state.biome = biome
    // A fresh run cuts straight to its biome; crossing a border mid-run fades.
    state.mix = state.ref === null ? 1 : 0
  }
  state.mix = Math.min(1, state.mix + dt / 1.6)
  const look = LOOKS[biome]
  const heat = Math.min(1, sim.flow / 80)

  // vertical parallax: the backdrop sinks a little as the camera climbs
  const floor = here?.floorY ?? cam.y
  state.ref = state.ref === null ? floor : damp(state.ref, floor, 1.5, dt)
  const lift = Math.max(-90, Math.min(160, (state.ref - cam.y - 40) * 0.45))
  state.lift = damp(state.lift, lift, 3, dt)

  const f: BgFrame = { w: width, h: height, camX: cam.x, anchor: cam.anchor, lift: state.lift, time, reduced }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
  if (state.mix < 1 && state.prev !== biome) {
    paintBackground(ctx, state.prev, f, reduced ? 0 : heat)
    if (!state.bg) state.bg = document.createElement('canvas')
    const bg = state.bg
    if (bg.width !== ctx.canvas.width || bg.height !== ctx.canvas.height) {
      bg.width = ctx.canvas.width
      bg.height = ctx.canvas.height
    }
    const bctx = bg.getContext('2d')!
    bctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    paintBackground(bctx, biome, f, reduced ? 0 : heat)
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.globalAlpha = state.mix * state.mix * (3 - 2 * state.mix)
    ctx.drawImage(bg, 0, 0)
    ctx.globalAlpha = 1
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  } else {
    paintBackground(ctx, biome, f, reduced ? 0 : heat)
  }

  ctx.setTransform(dpr * cam.zoom, 0, 0, dpr * cam.zoom, dpr * (cam.anchor - cam.x * cam.zoom + cam.shakeX), dpr * (height * 0.58 - cam.y * cam.zoom + cam.shakeY))
  if (cam.tilt) {
    ctx.translate(cam.x, cam.y)
    ctx.rotate(cam.tilt)
    ctx.translate(-cam.x, -cam.y)
  }

  const danger = colorblind ? '#3d8bfd' : '#ff4d6a'
  const left = cam.x - cam.anchor / cam.zoom - 260
  const right = cam.x + (width - cam.anchor) / cam.zoom + 260
  const visible = sim.chunks.filter((c) => c.x + c.w > left && c.x < right)

  for (const chunk of visible) for (const z of chunk.zones) drawZone(ctx, z, sim.time, reduced)
  for (const chunk of visible) {
    for (const h of chunk.hazards) drawHazard(ctx, h, sim.time, danger, reduced)
  }
  for (const chunk of visible) {
    const clook = LOOKS[chunk.biome] ?? look
    for (const p of chunk.platforms) {
      const rect = platformRect(p, sim.time)
      if (rect.x > right || rect.x + rect.w < left) continue
      drawPlatform(ctx, p, rect, clook, sim.time, reduced)
    }
  }
  for (const chunk of visible) {
    for (const e of chunk.enemies) drawEnemy(ctx, e, colorblind, sim.ball, sim.time, reduced)
    for (const item of chunk.pickups) if (!item.taken) drawPickup(ctx, item, LOOKS[chunk.biome] ?? look, sim.time, reduced)
    if (chunk.signs.length) {
      ctx.font = '600 13px Outfit, sans-serif'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'alphabetic'
      for (const s of chunk.signs) {
        const tw = ctx.measureText(s.text).width
        ctx.fillStyle = 'rgba(12,10,20,.38)'
        round(ctx, s.x - 9, s.y - 15, tw + 18, 22, 11)
        ctx.fill()
        ctx.fillStyle = 'rgba(255,248,236,.92)'
        ctx.fillText(s.text, s.x, s.y)
      }
    }
    if (opts.debug) {
      ctx.font = '12px Outfit, sans-serif'
      ctx.fillStyle = 'rgba(255,255,255,.7)'
      ctx.fillText(`${chunk.moduleId} ${chunk.difficulty.toFixed(2)}`, chunk.x + 12, chunk.floorY - 48)
    }
  }

  if (opts.ghost && opts.ghost.length > 1) {
    const samples = opts.ghost
    let start = samples.findIndex((s) => s.t > sim.stats.time)
    if (start < 0) start = samples.length - 1
    const from = Math.max(0, start - 8)
    const to = Math.min(samples.length, start + 40)
    ctx.strokeStyle = 'rgba(255,255,255,.22)'
    ctx.lineWidth = 2
    ctx.setLineDash([4, 6])
    ctx.beginPath()
    for (let i = from; i < to; i++) {
      const s = samples[i]
      if (i === from) ctx.moveTo(s.x, s.y)
      else ctx.lineTo(s.x, s.y)
    }
    ctx.stroke()
    ctx.setLineDash([])
    const g = samples[start]
    if (g) {
      ctx.strokeStyle = 'rgba(255,255,255,.5)'
      ctx.fillStyle = 'rgba(255,255,255,.12)'
      ctx.beginPath()
      ctx.arc(g.x, g.y, sim.ball.r * 0.9, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      ctx.font = '700 10px Outfit, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillStyle = 'rgba(255,255,255,.6)'
      ctx.fillText('BEST', g.x, g.y - sim.ball.r - 6)
    }
  }

  const b = sim.ball
  // contact shadow on whatever the ball would land on
  if (!sim.dead) {
    const gy = groundBelow(sim, b.x, b.y)
    if (gy !== null) {
      const height = Math.max(0, gy - b.y - b.r)
      const k = Math.max(0, 1 - height / 420)
      if (k > 0) {
        ctx.fillStyle = `rgba(0,0,0,${(0.28 * k).toFixed(3)})`
        ctx.beginPath()
        ctx.ellipse(b.x, gy + 1, b.r * (0.5 + 0.6 * k), 3 + 2 * k, 0, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }

  drawTrail(ctx, sim, fx)

  for (const a of fx.afterimages) {
    ctx.globalAlpha = (a.life / a.max) * 0.35
    ctx.fillStyle = trailColorOf(sim.config.trail)
    ctx.beginPath()
    ctx.arc(a.x, a.y, b.r * (0.8 + 0.2 * (a.life / a.max)), 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1

  for (const r of fx.rings) {
    const t = 1 - r.life / r.max
    const e = 1 - Math.pow(1 - t, 3)
    const rad = 10 + e * 40 * r.power
    ctx.globalAlpha = (r.life / r.max) * 0.9
    ctx.strokeStyle = r.color
    ctx.lineWidth = r.width * (1 - t) + 0.5
    ctx.beginPath()
    ctx.ellipse(r.x, r.y, rad, rad * r.flat, 0, 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.globalAlpha = 1

  if (!sim.dead) drawBall(ctx, sim, fx, look, time, reduced)

  for (const p of fx.particles) {
    if (!p.alive) continue
    const life = Math.max(0, p.life / p.max)
    if (p.glow) ctx.globalCompositeOperation = 'lighter'
    ctx.globalAlpha = life
    ctx.fillStyle = p.color
    ctx.strokeStyle = p.color
    switch (p.shape) {
      case 'spark':
        ctx.lineWidth = p.size * life + 0.4
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.moveTo(p.x, p.y)
        ctx.lineTo(p.x - p.vx * 0.035, p.y - p.vy * 0.035)
        ctx.stroke()
        break
      case 'puff':
        ctx.globalAlpha = life * 0.5
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size * (1 + (1 - life) * 1.4), 0, Math.PI * 2)
        ctx.fill()
        break
      case 'shard':
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rot)
        ctx.beginPath()
        ctx.moveTo(-p.size, -p.size * 0.6)
        ctx.lineTo(p.size, 0)
        ctx.lineTo(-p.size * 0.4, p.size * 0.8)
        ctx.closePath()
        ctx.fill()
        ctx.restore()
        break
      case 'star':
        star4(ctx, p.x, p.y, p.size * (0.5 + life * 0.5), p.rot)
        ctx.fill()
        break
      default:
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size * (0.4 + life * 0.6), 0, Math.PI * 2)
        ctx.fill()
    }
    ctx.globalCompositeOperation = 'source-over'
  }
  ctx.globalAlpha = 1
  ctx.lineCap = 'butt'

  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'
  for (const fl of fx.floaters) {
    const age = 1 - fl.life / fl.max
    const pop = reduced ? 1 : age < 0.18 ? easeOutBack(age / 0.18) : 1
    const a = fl.life < 0.3 ? fl.life / 0.3 : 1
    ctx.save()
    ctx.translate(fl.x, fl.y)
    ctx.scale(pop, pop)
    ctx.globalAlpha = a
    ctx.font = `800 ${fl.size}px Outfit, sans-serif`
    ctx.strokeStyle = 'rgba(20,12,28,.7)'
    ctx.lineWidth = 4
    ctx.strokeText(fl.text, 0, 0)
    ctx.fillStyle = fl.color
    ctx.fillText(fl.text, 0, 0)
    ctx.restore()
  }
  ctx.globalAlpha = 1
  ctx.textBaseline = 'alphabetic'

  /* ---- screen space ---- */
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  paintWeather(ctx, look, f, cam.y, state.mix)

  const speed = Math.abs(b.vx)
  if (!reduced && speed > 640 && !sim.dead) {
    const k = Math.min(1, (speed - 640) / 500)
    ctx.strokeStyle = '#ffffff'
    ctx.lineCap = 'round'
    for (let i = 0; i < 18; i++) {
      const lane = hash01(i * 7.1)
      const y = lane * height
      const edge = Math.abs(lane - 0.5) * 2
      const len = 50 + k * 140 * (0.5 + hash01(i * 3.3))
      const x = width - mod(opts.elapsed * (1.2 + hash01(i) * 1.4) + hash01(i * 5.5) * width, width + len * 2) + len
      ctx.globalAlpha = k * 0.22 * (0.3 + edge * 0.7)
      ctx.lineWidth = 1 + hash01(i * 9.2) * 1.5
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x + len, y)
      ctx.stroke()
    }
    ctx.globalAlpha = 1
    ctx.lineCap = 'butt'
  }

  // flow aura: the frame edges warm up while a chain is alive
  if (!reduced && sim.chain >= 8 && !sim.dead) {
    const k = Math.min(1, (sim.chain - 6) / 20)
    const pulse = 0.75 + 0.25 * Math.sin(time * 6)
    const edge = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.45, width / 2, height / 2, Math.max(width, height) * 0.75)
    edge.addColorStop(0, alpha(look.accent, 0))
    edge.addColorStop(1, alpha(look.accent, 0.22 * k * pulse))
    ctx.globalCompositeOperation = 'lighter'
    ctx.fillStyle = edge
    ctx.fillRect(0, 0, width, height)
    ctx.globalCompositeOperation = 'source-over'
  }

  // falling past the floor: a red warning from below
  if (!sim.dead && here && b.y > here.floorY + 60 && b.vy > 0) {
    const k = Math.min(1, (b.y - here.floorY - 60) / 300)
    const warn = ctx.createLinearGradient(0, height, 0, height * 0.55)
    warn.addColorStop(0, alpha(danger, 0.35 * k))
    warn.addColorStop(1, alpha(danger, 0))
    ctx.fillStyle = warn
    ctx.fillRect(0, height * 0.55, width, height * 0.45)
  }

  const deadK = Math.min(1, opts.dead)
  const vig = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.35, width / 2, height / 2, Math.max(width, height) * 0.72)
  vig.addColorStop(0, 'rgba(0,0,0,0)')
  vig.addColorStop(1, `rgba(0,0,0,${(0.34 + deadK * 0.35).toFixed(3)})`)
  ctx.fillStyle = vig
  ctx.fillRect(0, 0, width, height)
  if (deadK > 0) {
    ctx.fillStyle = `rgba(20,8,16,${(deadK * 0.28).toFixed(3)})`
    ctx.fillRect(0, 0, width, height)
  }
  if (opts.flash > 0.01) {
    ctx.globalAlpha = Math.min(0.45, opts.flash)
    ctx.fillStyle = '#fff8ee'
    ctx.fillRect(0, 0, width, height)
    ctx.globalAlpha = 1
  }
}
