/**
 * Presentation-only effects. Nothing here feeds back into the simulation,
 * so it is free to use Math.random and wall-clock time.
 */

export type ParticleShape = 'dot' | 'spark' | 'shard' | 'puff' | 'star'

export interface Particle {
  alive: boolean
  x: number
  y: number
  vx: number
  vy: number
  life: number
  max: number
  size: number
  color: string
  grav: number
  drag: number
  shape: ParticleShape
  rot: number
  vr: number
  /** Additive blending, for light rather than matter. */
  glow: boolean
}

export interface Floater {
  x: number
  y: number
  text: string
  life: number
  max: number
  color: string
  size: number
}

export interface Ring {
  x: number
  y: number
  life: number
  max: number
  color: string
  power: number
  /** 1 = circle, lower = flattened against a surface. */
  flat: number
  width: number
}

export interface TrailPoint {
  x: number
  y: number
  speed: number
}

export interface Afterimage {
  x: number
  y: number
  life: number
  max: number
}

export class ViewFx {
  particles: Particle[] = Array.from({ length: 640 }, () => ({
    alive: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 2, color: '#fff', grav: 0,
    drag: 0, shape: 'dot' as ParticleShape, rot: 0, vr: 0, glow: false,
  }))
  floaters: Floater[] = []
  rings: Ring[] = []
  trail: TrailPoint[] = []
  afterimages: Afterimage[] = []
  /** Jelly wobble of the ball: a damped spring along the last impact normal. */
  wobble = 0
  wobbleV = 0
  wobbleAngle = Math.PI / 2
  private cursor = 0

  private next(): Particle {
    const p = this.particles[this.cursor]
    this.cursor = (this.cursor + 1) % this.particles.length
    p.alive = true
    p.rot = 0
    p.vr = 0
    p.drag = 0
    p.glow = false
    p.shape = 'dot'
    return p
  }

  burst(x: number, y: number, color: string, n: number, speed: number, size = 3) {
    for (let i = 0; i < n; i++) {
      const p = this.next()
      const a = Math.random() * Math.PI * 2
      const s = speed * (0.35 + Math.random())
      p.x = x
      p.y = y
      p.vx = Math.cos(a) * s
      p.vy = Math.sin(a) * s - speed * 0.3
      p.life = 0.28 + Math.random() * 0.35
      p.max = p.life
      p.size = size * (0.6 + Math.random())
      p.color = color
      p.grav = 420
      p.drag = 1.5
    }
  }

  /** Streaks of light that fly out and fade, oriented along their velocity. */
  sparks(x: number, y: number, color: string, n: number, speed: number, spread = Math.PI * 2, dir = -Math.PI / 2) {
    for (let i = 0; i < n; i++) {
      const p = this.next()
      const a = dir + (Math.random() - 0.5) * spread
      const s = speed * (0.5 + Math.random() * 0.8)
      p.x = x
      p.y = y
      p.vx = Math.cos(a) * s
      p.vy = Math.sin(a) * s
      p.life = 0.22 + Math.random() * 0.3
      p.max = p.life
      p.size = 1.6 + Math.random() * 1.6
      p.color = color
      p.grav = 600
      p.drag = 3
      p.shape = 'spark'
      p.glow = true
    }
  }

  /** Puffs that skid along a surface in both directions, like dust off a landing. */
  dust(x: number, y: number, color: string, n: number, power: number, up = -1) {
    for (let i = 0; i < n; i++) {
      const p = this.next()
      const side = i % 2 === 0 ? 1 : -1
      p.x = x + side * (4 + Math.random() * 8)
      p.y = y + up * 2
      p.vx = side * (60 + Math.random() * 140) * power
      p.vy = up * (20 + Math.random() * 60) * power
      p.life = 0.35 + Math.random() * 0.3
      p.max = p.life
      p.size = 3 + Math.random() * 4 * power
      p.color = color
      p.grav = 0
      p.drag = 5
      p.shape = 'puff'
    }
  }

  /** Tumbling fragments, used when the ball breaks. */
  shatter(x: number, y: number, colors: string[], n: number, speed: number) {
    for (let i = 0; i < n; i++) {
      const p = this.next()
      const a = Math.random() * Math.PI * 2
      const s = speed * (0.3 + Math.random())
      p.x = x
      p.y = y
      p.vx = Math.cos(a) * s
      p.vy = Math.sin(a) * s - speed * 0.4
      p.life = 0.7 + Math.random() * 0.6
      p.max = p.life
      p.size = 3 + Math.random() * 5
      p.color = colors[i % colors.length]
      p.grav = 900
      p.drag = 0.8
      p.shape = 'shard'
      p.rot = Math.random() * Math.PI
      p.vr = (Math.random() - 0.5) * 18
    }
  }

  stars(x: number, y: number, color: string, n: number, speed: number) {
    for (let i = 0; i < n; i++) {
      const p = this.next()
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.3
      const s = speed * (0.7 + Math.random() * 0.5)
      p.x = x
      p.y = y
      p.vx = Math.cos(a) * s
      p.vy = Math.sin(a) * s
      p.life = 0.45 + Math.random() * 0.25
      p.max = p.life
      p.size = 3.5 + Math.random() * 2.5
      p.color = color
      p.grav = 200
      p.drag = 4
      p.shape = 'star'
      p.rot = Math.random() * Math.PI
      p.vr = (Math.random() - 0.5) * 8
      p.glow = true
    }
  }

  mote(x: number, y: number, color: string) {
    const p = this.next()
    p.x = x
    p.y = y
    p.vx = -18 + Math.random() * 10
    p.vy = -8 + Math.random() * 16
    p.life = 1.4
    p.max = 1.4
    p.size = 1.4
    p.color = color
    p.grav = 0
  }

  text(x: number, y: number, text: string, color: string, size = 15) {
    this.floaters.push({ x, y, text, life: 0.95, max: 0.95, color, size })
    if (this.floaters.length > 14) this.floaters.shift()
  }

  ring(x: number, y: number, color: string, power = 1, flat = 1, width = 2.5) {
    this.rings.push({ x, y, life: 0.42, max: 0.42, color, power, flat, width })
    if (this.rings.length > 16) this.rings.shift()
  }

  /** Kick the ball's jelly spring. `angle` is the impact normal. */
  impact(angle: number, strength: number) {
    this.wobbleAngle = angle
    this.wobble = Math.max(-0.4, Math.min(0.4, strength))
    this.wobbleV = 0
  }

  afterimage(x: number, y: number) {
    this.afterimages.push({ x, y, life: 0.22, max: 0.22 })
    if (this.afterimages.length > 10) this.afterimages.shift()
  }

  update(dt: number) {
    for (const p of this.particles) {
      if (!p.alive) continue
      p.life -= dt
      if (p.life <= 0) {
        p.alive = false
        continue
      }
      if (p.drag) {
        const k = Math.exp(-p.drag * dt)
        p.vx *= k
        p.vy *= k
      }
      p.vy += p.grav * dt
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.rot += p.vr * dt
    }
    for (const f of this.floaters) {
      f.life -= dt
      f.y -= 34 * dt * (f.life / f.max)
    }
    this.floaters = this.floaters.filter((f) => f.life > 0)
    for (const r of this.rings) r.life -= dt
    this.rings = this.rings.filter((r) => r.life > 0)
    for (const a of this.afterimages) a.life -= dt
    this.afterimages = this.afterimages.filter((a) => a.life > 0)
    // Under-damped spring: a squash that overshoots once or twice, then settles.
    const k = 420
    const c = 13
    this.wobbleV += (-k * this.wobble - c * this.wobbleV) * dt
    this.wobble += this.wobbleV * dt
    if (Math.abs(this.wobble) < 0.0005 && Math.abs(this.wobbleV) < 0.01) {
      this.wobble = 0
      this.wobbleV = 0
    }
  }

  pushTrail(x: number, y: number, speed: number) {
    this.trail.push({ x, y, speed })
    if (this.trail.length > 26) this.trail.shift()
  }

  /** Let the ribbon shrink from its tail instead of vanishing. */
  fadeTrail() {
    if (this.trail.length) this.trail.shift()
    if (this.trail.length) this.trail.shift()
  }

  clearTrail() {
    this.trail.length = 0
  }

  clearAll() {
    this.clearTrail()
    this.afterimages.length = 0
    this.floaters.length = 0
    this.rings.length = 0
    for (const p of this.particles) p.alive = false
    this.wobble = 0
    this.wobbleV = 0
  }
}
