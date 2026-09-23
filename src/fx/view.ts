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
}

export interface Floater {
  x: number
  y: number
  text: string
  life: number
  max: number
  color: string
}

export interface Ring {
  x: number
  y: number
  life: number
  max: number
  color: string
  power: number
}

export class ViewFx {
  particles: Particle[] = Array.from({ length: 480 }, () => ({
    alive: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 2, color: '#fff', grav: 0,
  }))
  floaters: Floater[] = []
  rings: Ring[] = []
  trail: { x: number; y: number }[] = []
  private cursor = 0

  burst(x: number, y: number, color: string, n: number, speed: number, size = 3) {
    for (let i = 0; i < n; i++) {
      const p = this.particles[this.cursor]
      this.cursor = (this.cursor + 1) % this.particles.length
      const a = Math.random() * Math.PI * 2
      const s = speed * (0.35 + Math.random())
      p.alive = true
      p.x = x
      p.y = y
      p.vx = Math.cos(a) * s
      p.vy = Math.sin(a) * s - speed * 0.3
      p.life = 0.28 + Math.random() * 0.35
      p.max = p.life
      p.size = size * (0.6 + Math.random())
      p.color = color
      p.grav = 420
    }
  }

  mote(x: number, y: number, color: string) {
    const p = this.particles[this.cursor]
    this.cursor = (this.cursor + 1) % this.particles.length
    p.alive = true
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

  text(x: number, y: number, text: string, color: string) {
    this.floaters.push({ x, y, text, life: 0.9, max: 0.9, color })
    if (this.floaters.length > 14) this.floaters.shift()
  }

  ring(x: number, y: number, color: string, power = 1) {
    this.rings.push({ x, y, life: 0.38, max: 0.38, color, power })
    if (this.rings.length > 16) this.rings.shift()
  }

  update(dt: number) {
    for (const p of this.particles) {
      if (!p.alive) continue
      p.life -= dt
      if (p.life <= 0) {
        p.alive = false
        continue
      }
      p.vy += p.grav * dt
      p.x += p.vx * dt
      p.y += p.vy * dt
    }
    for (const f of this.floaters) {
      f.life -= dt
      f.y -= 28 * dt
    }
    this.floaters = this.floaters.filter((f) => f.life > 0)
    for (const r of this.rings) r.life -= dt
    this.rings = this.rings.filter((r) => r.life > 0)
  }

  pushTrail(x: number, y: number) {
    this.trail.push({ x, y })
    if (this.trail.length > 18) this.trail.shift()
  }

  clearTrail() {
    this.trail.length = 0
  }
}
